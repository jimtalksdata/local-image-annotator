"""Model catalogue + the single-slot GPU model manager."""
from __future__ import annotations

import importlib
import logging
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from PIL import Image

from . import config  # noqa: F401  (sets HF_HOME before transformers is imported)

log = logging.getLogger(__name__)


@dataclass
class ModelSpec:
    id: str
    label: str
    repo_id: str
    adapter_path: str  # "module:ClassName"
    blurb: str
    approx_vram_gb: float
    free_prompt: bool = True
    default_prompt_key: str = "detailed"
    tasks: list[str] = field(default_factory=list)
    default_task: str | None = None
    default_max_new_tokens: int = 320

    def to_json(self, models_root: Path) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "repoId": self.repo_id,
            "blurb": self.blurb,
            "approxVramGb": self.approx_vram_gb,
            "freePrompt": self.free_prompt,
            "tasks": self.tasks,
            "defaultTask": self.default_task,
            "defaultMaxNewTokens": self.default_max_new_tokens,
            "downloaded": is_downloaded(self.repo_id, models_root),
        }


MODEL_SPECS: list[ModelSpec] = [
    ModelSpec(
        id="qwen35-9b",
        label="Qwen3.5-9B",
        repo_id="Qwen/Qwen3.5-9B",
        adapter_path="backend.adapters.qwen35:Qwen35Adapter",
        blurb="Natively multimodal, follows long structured prompts. Best default.",
        approx_vram_gb=19.0,
        default_max_new_tokens=400,
    ),
    ModelSpec(
        id="joycaption-alpha2",
        label="JoyCaption Alpha Two",
        repo_id="fancyfeast/llama-joycaption-alpha-two-hf-llava",
        adapter_path="backend.adapters.joycaption:JoyCaptionAdapter",
        blurb="Uncensored booru/SD-training captioner. Good tag and NSFW coverage.",
        approx_vram_gb=17.0,
        default_max_new_tokens=320,
    ),
    ModelSpec(
        id="florence2-large",
        label="Florence-2 Large",
        repo_id="florence-community/Florence-2-large",
        adapter_path="backend.adapters.florence2:Florence2Adapter",
        blurb="Tiny and fast (~1GB). Task-token driven — the prompt text is ignored.",
        approx_vram_gb=1.5,
        free_prompt=False,
        default_max_new_tokens=256,
    ),
]

SPECS_BY_ID = {s.id: s for s in MODEL_SPECS}


def _hydrate_florence_tasks() -> None:
    from .adapters.florence2 import DEFAULT_TASK, FLORENCE_TASKS

    spec = SPECS_BY_ID["florence2-large"]
    spec.tasks = list(FLORENCE_TASKS)
    spec.default_task = DEFAULT_TASK


def is_downloaded(repo_id: str, models_root: Path) -> bool:
    folder = models_root / ("models--" + repo_id.replace("/", "--"))
    if not folder.is_dir():
        return False
    snapshots = folder / "snapshots"
    if not snapshots.is_dir():
        return False
    return any(any(s.iterdir()) for s in snapshots.iterdir() if s.is_dir())


def vram_info() -> dict[str, Any]:
    try:
        import torch
    except Exception:
        return {"available": False}
    if not torch.cuda.is_available():
        return {"available": False}
    free, total = torch.cuda.mem_get_info()
    return {
        "available": True,
        "device": torch.cuda.get_device_name(0),
        "freeGb": round(free / 1024**3, 2),
        "totalGb": round(total / 1024**3, 2),
        "usedGb": round((total - free) / 1024**3, 2),
    }


class ModelBusy(RuntimeError):
    pass


class ModelManager:
    """Holds at most one model on the GPU. All GPU work is serialised."""

    def __init__(self) -> None:
        self._lock = threading.RLock()          # guards load/unload/generate
        self._state_lock = threading.Lock()     # guards the status fields
        self._adapter = None
        self._current_id: str | None = None
        self._loading_id: str | None = None
        self._error: str | None = None
        self._loaded_at: float | None = None
        self._last_used: float | None = None
        self._reaper: threading.Thread | None = None
        self._reaper_started = False

    # -- status -----------------------------------------------------------
    def status(self) -> dict[str, Any]:
        with self._state_lock:
            return {
                "loadedModelId": self._current_id,
                "loadingModelId": self._loading_id,
                "error": self._error,
                "loadedAt": self._loaded_at,
                "lastUsedAt": self._last_used,
                "idleSeconds": None if self._last_used is None else round(time.time() - self._last_used, 1),
                "idleUnloadSeconds": config.IDLE_UNLOAD_SECONDS or None,
                "vram": vram_info(),
            }

    # -- lifecycle --------------------------------------------------------
    def load(self, model_id: str) -> dict[str, Any]:
        spec = SPECS_BY_ID.get(model_id)
        if spec is None:
            raise KeyError(f"Unknown model id: {model_id}")

        already_loaded = False
        with self._state_lock:
            if self._current_id == model_id and self._adapter is not None:
                # Already resident: refresh the idle clock and skip the reload.
                self._last_used = time.time()
                already_loaded = True
            else:
                self._loading_id = model_id
                self._error = None
        if already_loaded:
            # status() takes _state_lock, which is not reentrant, so call it
            # only after the block above has released it.
            return self.status()

        try:
            with self._lock:
                if self._current_id != model_id:
                    self._unload_locked()
                    module_name, class_name = spec.adapter_path.split(":")
                    adapter_cls = getattr(importlib.import_module(module_name), class_name)
                    adapter = adapter_cls(spec.repo_id)
                    t0 = time.time()
                    log.info("Loading %s (%s)...", spec.label, spec.repo_id)
                    adapter.load()
                    log.info("Loaded %s in %.1fs", spec.label, time.time() - t0)
                    self._adapter = adapter
                    with self._state_lock:
                        self._current_id = model_id
                        self._loaded_at = time.time()
                        self._last_used = self._loaded_at
            self._ensure_reaper()
        except Exception as exc:  # surface the failure to the UI, keep serving
            log.exception("Failed to load %s", model_id)
            with self._state_lock:
                self._error = f"{type(exc).__name__}: {exc}"
                self._current_id = None
            self._adapter = None
            raise
        finally:
            with self._state_lock:
                self._loading_id = None
        return self.status()

    def _unload_locked(self) -> None:
        if self._adapter is not None:
            log.info("Unloading %s", self._current_id)
            self._adapter.unload()
        self._adapter = None
        with self._state_lock:
            self._current_id = None
            self._loaded_at = None
            self._last_used = None

    def unload(self) -> dict[str, Any]:
        with self._lock:
            self._unload_locked()
        return self.status()

    # -- inference --------------------------------------------------------
    def caption(self, model_id: str, image: Image.Image, prompt: str, params) -> str:
        if self._current_id != model_id or self._adapter is None:
            self.load(model_id)
        with self._lock:
            if self._adapter is None:
                raise RuntimeError("Model is not loaded")
            with self._state_lock:
                self._last_used = time.time()
            try:
                return self._adapter.caption(image, prompt, params)
            finally:
                # Stamp again on the way out: a long batch item must not let the
                # reaper count the generation itself as idle time.
                with self._state_lock:
                    self._last_used = time.time()

    # -- idle reaper ------------------------------------------------------
    def _ensure_reaper(self) -> None:
        """Start the idle-unload thread once, lazily, after the first load."""
        if config.IDLE_UNLOAD_SECONDS <= 0:
            return
        with self._state_lock:
            if self._reaper_started:
                return
            self._reaper_started = True
        self._reaper = threading.Thread(
            target=self._reap_loop, name="model-idle-reaper", daemon=True
        )
        self._reaper.start()
        log.info("Idle reaper started: unload after %ds idle", config.IDLE_UNLOAD_SECONDS)

    def _reap_loop(self) -> None:
        while True:
            time.sleep(config.IDLE_CHECK_SECONDS)
            try:
                self._reap_once()
            except Exception:  # never let the reaper die
                log.exception("Idle reaper iteration failed")

    def _reap_once(self) -> None:
        limit = config.IDLE_UNLOAD_SECONDS
        if limit <= 0:
            return
        with self._state_lock:
            if self._current_id is None or self._last_used is None:
                return
            idle = time.time() - self._last_used
        if idle < limit:
            return
        # Non-blocking: if a caption is in flight the lock is held, so skip this
        # tick rather than queueing behind it.
        if not self._lock.acquire(blocking=False):
            return
        try:
            with self._state_lock:
                if self._current_id is None or self._last_used is None:
                    return
                idle = time.time() - self._last_used
                model_id = self._current_id
            if idle < limit:  # re-check under the lock
                return
            log.info("Unloading %s after %.0fs idle", model_id, idle)
            self._unload_locked()
        finally:
            self._lock.release()


MANAGER = ModelManager()
_hydrate_florence_tasks()
