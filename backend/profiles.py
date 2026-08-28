"""Server-side profile store.

A *profile* bundles everything that defines a captioning run: the prompt, the
model, and the generation parameters. Stored on disk (not localStorage) so it
survives a browser wipe and can be diffed/committed alongside a dataset.
"""
from __future__ import annotations

import json
import threading
import time
import uuid
from typing import Any

from .config import PROFILES_FILE, SETTINGS_FILE

_lock = threading.Lock()

DEFAULT_PROMPT = """You are a professional image captioner to annotate the given image in high fidelity while being concise. Please annotate images using 6 sentences of the following categories:

Goal: a one sentence description of the most important elements of the scene.
Subject: a detailed description of the primary subject, including any unique features such as wings, horns, sharp nails, claws, or a tail. Comment on the body type and posture. Comment on any accessories or items the subject is wearing.
Scene: a detailed description of the scene, including important background elements, motion, and any secondary subjects.
Style: a description of the art style (-isms), including the color palette, shading, and line art style. Comment on detail, texturing, influences.
Camera: for realistic images, a description of the camera settings, including the angle, focal length (mm), and perspective.
Lighting/mood: for realistic images, a description of the lighting conditions, including the direction, intensity, and color of the light. For anime, manga, or other non-realistic images, comment on the mood and atmosphere."""

DEFAULT_PARAMS: dict[str, Any] = {
    "maxNewTokens": 400,
    "temperature": 0.6,
    "topP": 0.9,
    "topK": 50,
    "repetitionPenalty": 1.05,
    "greedy": False,
}


def _now() -> float:
    return time.time()


def _blank_store() -> dict[str, Any]:
    return {"version": 1, "profiles": []}


def _read() -> dict[str, Any]:
    if not PROFILES_FILE.exists():
        return _blank_store()
    try:
        data = json.loads(PROFILES_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return _blank_store()
    if not isinstance(data, dict) or not isinstance(data.get("profiles"), list):
        return _blank_store()
    return data


def _write(data: dict[str, Any]) -> None:
    tmp = PROFILES_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(PROFILES_FILE)


def normalise(payload: dict[str, Any], existing: dict[str, Any] | None = None) -> dict[str, Any]:
    base = dict(existing or {})
    params = {**DEFAULT_PARAMS, **(base.get("params") or {}), **(payload.get("params") or {})}
    return {
        "id": base.get("id") or payload.get("id") or str(uuid.uuid4()),
        "name": (payload.get("name") or base.get("name") or "Untitled profile").strip(),
        "prompt": payload.get("prompt", base.get("prompt", DEFAULT_PROMPT)),
        "modelId": payload.get("modelId", base.get("modelId", "qwen35-9b")),
        "systemPrompt": payload.get("systemPrompt", base.get("systemPrompt", "")),
        "florenceTask": payload.get("florenceTask", base.get("florenceTask")),
        "params": params,
        "createdAt": base.get("createdAt", _now()),
        "updatedAt": _now(),
    }


def list_profiles() -> list[dict[str, Any]]:
    with _lock:
        return _read()["profiles"]


def get_profile(profile_id: str) -> dict[str, Any] | None:
    return next((p for p in list_profiles() if p["id"] == profile_id), None)


def create_profile(payload: dict[str, Any]) -> dict[str, Any]:
    with _lock:
        data = _read()
        profile = normalise(payload)
        data["profiles"].append(profile)
        _write(data)
        return profile


def update_profile(profile_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    with _lock:
        data = _read()
        for i, existing in enumerate(data["profiles"]):
            if existing["id"] == profile_id:
                merged = normalise(payload, existing)
                merged["id"] = profile_id
                data["profiles"][i] = merged
                _write(data)
                return merged
    raise KeyError(profile_id)


def delete_profile(profile_id: str) -> None:
    with _lock:
        data = _read()
        before = len(data["profiles"])
        data["profiles"] = [p for p in data["profiles"] if p["id"] != profile_id]
        if len(data["profiles"]) == before:
            raise KeyError(profile_id)
        _write(data)
    settings = get_settings()
    if settings.get("lastProfileId") == profile_id:
        save_settings({"lastProfileId": None})


# -- loose session settings (last used prompt/model, last folder) ----------
def get_settings() -> dict[str, Any]:
    if not SETTINGS_FILE.exists():
        return {}
    try:
        data = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def save_settings(patch: dict[str, Any]) -> dict[str, Any]:
    with _lock:
        merged = {**get_settings(), **patch}
        tmp = SETTINGS_FILE.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")
        tmp.replace(SETTINGS_FILE)
        return merged
