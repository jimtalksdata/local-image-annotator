from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from PIL import Image

_THINK_RE = re.compile(r"<think>.*?</think>\s*", re.DOTALL | re.IGNORECASE)
_DANGLING_THINK_RE = re.compile(r"^.*?</think>\s*", re.DOTALL | re.IGNORECASE)


def strip_thinking(text: str) -> str:
    """Remove <think> blocks emitted by reasoning-capable VLMs."""
    out = _THINK_RE.sub("", text)
    if "</think>" in out:
        out = _DANGLING_THINK_RE.sub("", out)
    return out.strip()


@dataclass
class GenParams:
    max_new_tokens: int = 320
    temperature: float = 0.6
    top_p: float = 0.9
    top_k: int = 50
    repetition_penalty: float = 1.05
    greedy: bool = False
    # Florence-2 only; ignored elsewhere.
    task: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    def sampling_kwargs(self) -> dict[str, Any]:
        if self.greedy:
            return {"do_sample": False}
        kw: dict[str, Any] = {"do_sample": True, "temperature": float(self.temperature)}
        if self.top_p is not None:
            kw["top_p"] = float(self.top_p)
        if self.top_k:
            kw["top_k"] = int(self.top_k)
        if self.repetition_penalty:
            kw["repetition_penalty"] = float(self.repetition_penalty)
        return kw


class BaseAdapter:
    """One loaded model. Adapters are created, loaded, used, then unloaded.

    Only one adapter is resident at a time (24GB card, 9B-class bf16 weights).
    """

    repo_id: str = ""

    def __init__(self, repo_id: str, **kwargs: Any) -> None:
        self.repo_id = repo_id
        self.options = kwargs
        self.model = None
        self.processor = None

    def load(self) -> None:  # pragma: no cover - subclass duty
        raise NotImplementedError

    def caption(self, image: Image.Image, prompt: str, params: GenParams) -> str:  # pragma: no cover
        raise NotImplementedError

    def unload(self) -> None:
        import gc

        import torch

        self.model = None
        self.processor = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
