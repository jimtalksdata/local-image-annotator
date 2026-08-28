# Local Image Annotator

A locally deployable fork of `gemini-image-annotator`. Same batch-captioning UI, but the
Gemini API call is replaced by a local VLM running on this machine's GPU, and captions can
be written straight back onto the dataset folder.

Nothing leaves the box: no API keys, no network calls at runtime (the frontend bundles its
own CSS and fonts), and the backend binds to loopback only.

## What changed vs. the Gemini version

| | gemini-image-annotator | local-image-annotator |
|---|---|---|
| Backend | Node/Express calling `@google/genai` | Python/FastAPI driving `transformers` |
| Model | `gemini-3.5-flash` | Qwen3.5-9B / JoyCaption Alpha Two / Florence-2 Large, selectable |
| Saved config | prompt presets in `localStorage` | **profiles** on disk — prompt **+ model + generation params** |
| Image source | browser upload only | local folder scan (server-side) or browser upload |
| Output | ZIP download | ZIP download **or** write `.txt` sidecars in place, with a conflict warning |

## Models

| Model | VRAM | Notes |
|---|---|---|
| `Qwen3.5-9B` | ~19 GB | Default. Natively multimodal, follows long structured prompts. Reasoning is explicitly disabled (`enable_thinking=False`) and any stray `<think>` block is stripped. |
| `JoyCaption Alpha Two` | ~17 GB | Uncensored SD-training captioner. Free-form prompt. |
| `Florence-2 Large` | ~1.5 GB | Fast. **Task-token driven** — the prompt text is ignored; pick a task (`<MORE_DETAILED_CAPTION>`, `<CAPTION>`, `<OCR>`, …) instead. |

Only one model is resident at a time — a 24 GB card cannot hold two 9B-class models. Switching
models unloads the previous one automatically; **Free VRAM** unloads without stopping the server.
Requests are serialised behind a lock, so the client captions one image at a time and reports
honest per-image progress.

Weights live in the project's model store, **not** the user-profile cache:

```
F:\Projects\stable_diffusion\models\vlm\hub\models--<org>--<name>\
```

The backend sets `HF_HOME` there on import and runs offline by default.

## Setup

```powershell
cd F:\Projects\stable_diffusion\training\local-image-annotator

.\scripts\setup_venv.ps1      # own venv: torch cu130 + torchvision + transformers + fastapi
.\scripts\copy_models.ps1     # copy the three repos from the user HF cache into models\vlm\hub
npm install
```

`copy_models.ps1` **copies** by default (safe while another process is using the C: cache).
Pass `-Move` to relocate instead. It is re-runnable — robocopy skips identical files.

If a model is missing locally, start the backend with `ANNOTATOR_ALLOW_DOWNLOAD=1` to let it
pull from Hugging Face into `models\vlm`.

## Running

```powershell
.\run.ps1            # builds the frontend, serves UI + API on http://127.0.0.1:8077
.\run.ps1 -Dev       # backend on :8077 + Vite dev server on :3000 (proxies /api)
.\run.ps1 -SkipBuild # skip the vite build, serve the existing dist/
```

Or by hand:

```powershell
.\venv\Scripts\python.exe -m backend.main    # must run from the app dir, -m puts it on sys.path
npm run dev
```

## Using it

1. **Local folder** tab → type or *Browse* to a dataset folder → **Scan**. Images with an
   existing caption file are flagged `Has caption`, and the count is shown under the path.
2. Open **Profile & instructions** → pick a model, edit the prompt and generation params →
   **Save as new** to keep the whole combination as a profile.
3. **Generate captions**. Progress is per-image; **Stop after current image** halts the queue.
   Captions are editable in place before writing.
4. **Apply to disk** → a modal reports how many sidecars are new and how many already exist,
   lists each conflict with its current text, and requires a choice:
   - **Back up, then overwrite** (default) — existing file copied to `<name>.txt.bak` first
   - **Keep existing, skip those images**
   - **Overwrite, no backup**

   *Upload files* mode has no source path on disk, so it asks for an explicit output folder.

Caption extension is selectable (`.txt`, `.caption`, `.tags`). Files are written UTF-8 with
`\n` newlines.

## Layout

```
backend/
  config.py        paths + HF_HOME setup (import this before transformers)
  registry.py      model catalogue + single-slot GPU manager
  adapters/        one file per model: qwen35, joycaption, florence2
  library.py       folder scan, thumbnails, sidecar writing + conflict preview
  profiles.py      profile + settings store (state/profiles.json)
  main.py          FastAPI app; also serves dist/ in production
components/        React UI (ModelSelector, ProfilePanel, SourcePanel, ApplyCaptionsModal, …)
services/api.ts    typed client for every /api route
scripts/           setup_venv.ps1, copy_models.ps1
state/             profiles.json, settings.json, thumbnail cache (gitignored)
```

### Adding a model

Add a `ModelSpec` to `MODEL_SPECS` in `backend/registry.py` and a `BaseAdapter` subclass in
`backend/adapters/`. The dropdown, profile storage, and VRAM accounting pick it up with no
frontend change.

## Notes and gotchas

- **JoyCaption ships no processor config.** The published repo has weights and tokenizer only,
  so `AutoProcessor` fails on it. `adapters/joycaption.py` therefore preprocesses by hand
  (384×384 LANCZOS, scale to [0,1], normalise at 0.5/0.5) and expands the image placeholder to
  729 tokens, matching `captioning/joy-caption-batch/batch-alpha2.py`.
- **No auth.** The API reads and writes arbitrary paths on this machine. Keep it on
  `127.0.0.1`. If you must bind wider, set `ANNOTATOR_ALLOWED_ROOTS` to restrict path access.
- Images are downscaled to 1536px on the long edge before being fed to a model.
- See `.env.example` for every environment override.
