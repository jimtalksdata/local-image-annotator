"""Central paths + environment setup.

IMPORTANT: this module must be imported before `transformers` / `huggingface_hub`
anywhere in the process, because it sets HF_HOME. Weights live inside the
project's models/ folder, never in the user profile cache.
"""
from __future__ import annotations

import os
from pathlib import Path

# .../training/local-image-annotator/backend/config.py
APP_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = Path(__file__).resolve().parents[3]

# All model weights live under the project's models/ folder.
MODELS_DIR = Path(os.environ.get("ANNOTATOR_MODELS_DIR") or (PROJECT_ROOT / "models" / "vlm")).resolve()
HF_HUB_DIR = MODELS_DIR / "hub"

os.environ.setdefault("HF_HOME", str(MODELS_DIR))
os.environ.setdefault("HF_HUB_CACHE", str(HF_HUB_DIR))
# Windows: symlinks in the HF cache require admin/dev-mode. Always disable.
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS", "1")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

# Runtime state that is not weights.
STATE_DIR = Path(os.environ.get("ANNOTATOR_STATE_DIR") or (APP_DIR / "state")).resolve()
THUMB_CACHE_DIR = STATE_DIR / "thumbs"
PROFILES_FILE = STATE_DIR / "profiles.json"
SETTINGS_FILE = STATE_DIR / "settings.json"

STATE_DIR.mkdir(parents=True, exist_ok=True)
THUMB_CACHE_DIR.mkdir(parents=True, exist_ok=True)
MODELS_DIR.mkdir(parents=True, exist_ok=True)
HF_HUB_DIR.mkdir(parents=True, exist_ok=True)

DIST_DIR = APP_DIR / "dist"

HOST = os.environ.get("ANNOTATOR_HOST", "127.0.0.1")
PORT = int(os.environ.get("ANNOTATOR_PORT", "8077"))

# Drop the resident model after this many seconds with no captioning activity.
# On Windows/WDDM a live CUDA allocation also charges the host process the same
# number of bytes of system commit, so an idle model costs ~22GB of commit as
# well as the VRAM. 0 disables the reaper.
IDLE_UNLOAD_SECONDS = int(os.environ.get("ANNOTATOR_IDLE_UNLOAD_SECONDS", "3600"))
IDLE_CHECK_SECONDS = 60

# Offline by default once weights are local; set ANNOTATOR_ALLOW_DOWNLOAD=1 to fetch.
ALLOW_DOWNLOAD = os.environ.get("ANNOTATOR_ALLOW_DOWNLOAD", "0") == "1"
if not ALLOW_DOWNLOAD:
    os.environ.setdefault("HF_HUB_OFFLINE", "1")

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".tiff", ".tif", ".webp", ".avif"}

# Loopback-only by default, so no path allowlist is enforced; the user needs to be
# able to point the tool at any dataset folder on any drive. If you bind this to
# 0.0.0.0, set ANNOTATOR_ALLOWED_ROOTS to a ';'-separated list of roots.
_roots = os.environ.get("ANNOTATOR_ALLOWED_ROOTS", "").strip()
ALLOWED_ROOTS = [Path(p).resolve() for p in _roots.split(";") if p.strip()] if _roots else []
