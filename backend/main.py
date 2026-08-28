"""FastAPI backend for the local image annotator.

Serves both the JSON API under /api and the built React bundle, so the whole
tool is one process: `python -m backend.main`.
"""
from __future__ import annotations

import base64
import binascii
import io
import logging
from typing import Any, Literal

from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from . import config, library, profiles
from .adapters.base import GenParams
from .registry import MANAGER, MODEL_SPECS, SPECS_BY_ID, vram_info

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
log = logging.getLogger("annotator")

app = FastAPI(title="Local Image Annotator", version="1.0.0")

# The Vite dev server runs on a different port and proxies /api, but keep CORS
# open for loopback so a directly-opened dev bundle also works.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------
# Schemas
# --------------------------------------------------------------------------
class GenParamsIn(BaseModel):
    maxNewTokens: int = 400
    temperature: float = 0.6
    topP: float | None = 0.9
    topK: int | None = 50
    repetitionPenalty: float | None = 1.05
    greedy: bool = False

    def to_params(self, task: str | None, system_prompt: str | None) -> GenParams:
        return GenParams(
            max_new_tokens=max(16, min(int(self.maxNewTokens), 4096)),
            temperature=float(self.temperature),
            top_p=self.topP if self.topP is not None else 0.9,
            top_k=self.topK or 0,
            repetition_penalty=self.repetitionPenalty or 1.0,
            greedy=bool(self.greedy),
            task=task,
            extra={"system_prompt": system_prompt or ""},
        )


class CaptionRequest(BaseModel):
    modelId: str
    prompt: str = ""
    systemPrompt: str | None = None
    florenceTask: str | None = None
    params: GenParamsIn = Field(default_factory=GenParamsIn)
    # Exactly one source:
    path: str | None = None          # folder mode: read straight off disk
    imageBase64: str | None = None   # upload mode: bytes from the browser


class LoadRequest(BaseModel):
    modelId: str


class ScanRequest(BaseModel):
    path: str
    recursive: bool = False
    captionExt: str = ".txt"


class CaptionItem(BaseModel):
    id: str | None = None
    name: str | None = None
    path: str | None = None
    relPath: str | None = None
    caption: str = ""


class ApplyRequest(BaseModel):
    items: list[CaptionItem]
    mode: Literal["overwrite", "skip", "backup"] = "backup"
    outputDir: str | None = None
    captionExt: str = ".txt"


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def _decode_image(data_b64: str, max_side: int = 1536) -> Image.Image:
    raw = data_b64.split(",", 1)[-1]
    try:
        blob = base64.b64decode(raw, validate=False)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Bad base64 image: {exc}") from exc
    try:
        with Image.open(io.BytesIO(blob)) as img:
            img = ImageOps.exif_transpose(img).convert("RGB")
            if max(img.size) > max_side:
                img.thumbnail((max_side, max_side), Image.LANCZOS)
            return img.copy()
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=400, detail=f"Unreadable image: {exc}") from exc


def _path_error(exc: Exception) -> HTTPException:
    if isinstance(exc, library.PathNotAllowed):
        return HTTPException(status_code=403, detail=str(exc))
    if isinstance(exc, (FileNotFoundError, NotADirectoryError)):
        return HTTPException(status_code=404, detail=str(exc))
    return HTTPException(status_code=400, detail=str(exc))


# --------------------------------------------------------------------------
# Models
# --------------------------------------------------------------------------
@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "modelsDir": str(config.MODELS_DIR),
        "hubDir": str(config.HF_HUB_DIR),
        "stateDir": str(config.STATE_DIR),
        "allowDownload": config.ALLOW_DOWNLOAD,
        "vram": vram_info(),
    }


@app.get("/api/models")
def list_models() -> dict[str, Any]:
    return {
        "models": [spec.to_json(config.HF_HUB_DIR) for spec in MODEL_SPECS],
        "status": MANAGER.status(),
    }


@app.get("/api/models/status")
def model_status() -> dict[str, Any]:
    return MANAGER.status()


@app.post("/api/models/load")
async def load_model(req: LoadRequest) -> dict[str, Any]:
    if req.modelId not in SPECS_BY_ID:
        raise HTTPException(status_code=404, detail=f"Unknown model: {req.modelId}")
    try:
        return await run_in_threadpool(MANAGER.load, req.modelId)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}") from exc


@app.post("/api/models/unload")
async def unload_model() -> dict[str, Any]:
    return await run_in_threadpool(MANAGER.unload)


# --------------------------------------------------------------------------
# Captioning
# --------------------------------------------------------------------------
@app.post("/api/caption")
async def caption(req: CaptionRequest) -> dict[str, Any]:
    spec = SPECS_BY_ID.get(req.modelId)
    if spec is None:
        raise HTTPException(status_code=404, detail=f"Unknown model: {req.modelId}")
    if not req.path and not req.imageBase64:
        raise HTTPException(status_code=400, detail="Provide either 'path' or 'imageBase64'")

    if req.path:
        try:
            image = await run_in_threadpool(library.load_image, req.path)
        except Exception as exc:
            raise _path_error(exc) from exc
    else:
        image = _decode_image(req.imageBase64 or "")

    params = req.params.to_params(req.florenceTask or spec.default_task, req.systemPrompt)
    try:
        text = await run_in_threadpool(
            MANAGER.caption, req.modelId, image, req.prompt, params
        )
    except Exception as exc:
        log.exception("Caption failed")
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}") from exc
    return {"caption": (text or "").strip(), "modelId": req.modelId}


# --------------------------------------------------------------------------
# Profiles + settings
# --------------------------------------------------------------------------
@app.get("/api/profiles")
def get_profiles() -> dict[str, Any]:
    return {
        "profiles": profiles.list_profiles(),
        "defaultPrompt": profiles.DEFAULT_PROMPT,
        "defaultParams": profiles.DEFAULT_PARAMS,
    }


@app.post("/api/profiles")
def post_profile(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return profiles.create_profile(payload)


@app.put("/api/profiles/{profile_id}")
def put_profile(profile_id: str, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    try:
        return profiles.update_profile(profile_id, payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="No such profile") from exc


@app.delete("/api/profiles/{profile_id}")
def remove_profile(profile_id: str) -> dict[str, Any]:
    try:
        profiles.delete_profile(profile_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="No such profile") from exc
    return {"ok": True}


@app.get("/api/settings")
def read_settings() -> dict[str, Any]:
    return profiles.get_settings()


@app.patch("/api/settings")
def patch_settings(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    return profiles.save_settings(payload)


# --------------------------------------------------------------------------
# Local library
# --------------------------------------------------------------------------
@app.get("/api/library/browse")
def browse(path: str | None = Query(default=None)) -> dict[str, Any]:
    try:
        return library.list_subfolders(path)
    except Exception as exc:
        raise _path_error(exc) from exc


@app.post("/api/library/scan")
async def scan(req: ScanRequest) -> dict[str, Any]:
    try:
        return await run_in_threadpool(
            library.scan_folder, req.path, req.recursive, req.captionExt
        )
    except Exception as exc:
        raise _path_error(exc) from exc


@app.get("/api/library/thumb")
async def thumb(path: str = Query(...), w: int = Query(default=384, ge=64, le=2048)):
    try:
        data, mime = await run_in_threadpool(library.thumbnail_bytes, path, w)
    except Exception as exc:
        raise _path_error(exc) from exc
    return Response(content=data, media_type=mime, headers={"Cache-Control": "max-age=3600"})


@app.get("/api/library/file")
def full_file(path: str = Query(...)):
    try:
        resolved = library.resolve_path(path)
    except Exception as exc:
        raise _path_error(exc) from exc
    if not resolved.is_file():
        raise HTTPException(status_code=404, detail="No such file")
    return FileResponse(resolved)


@app.post("/api/captions/preview")
async def captions_preview(req: ApplyRequest) -> dict[str, Any]:
    try:
        return await run_in_threadpool(
            library.preview_apply,
            [i.model_dump() for i in req.items],
            req.outputDir,
            req.captionExt,
        )
    except Exception as exc:
        raise _path_error(exc) from exc


@app.post("/api/captions/apply")
async def captions_apply(req: ApplyRequest) -> dict[str, Any]:
    try:
        return await run_in_threadpool(
            library.apply_captions,
            [i.model_dump() for i in req.items],
            req.mode,
            req.outputDir,
            req.captionExt,
        )
    except Exception as exc:
        raise _path_error(exc) from exc


# --------------------------------------------------------------------------
# Static frontend (production build). In dev, Vite serves the UI instead.
# --------------------------------------------------------------------------
@app.exception_handler(404)
async def spa_fallback(request, exc):  # type: ignore[no-untyped-def]
    if request.url.path.startswith("/api/"):
        return JSONResponse({"detail": getattr(exc, "detail", "Not found")}, status_code=404)
    index = config.DIST_DIR / "index.html"
    if index.exists():
        return FileResponse(index)
    return JSONResponse(
        {"detail": "Frontend not built. Run `npm run build`, or use `npm run dev`."},
        status_code=404,
    )


if config.DIST_DIR.exists():
    app.mount("/", StaticFiles(directory=str(config.DIST_DIR), html=True), name="static")


def main() -> None:
    import uvicorn

    log.info("Models dir : %s", config.MODELS_DIR)
    log.info("State dir  : %s", config.STATE_DIR)
    log.info("Listening  : http://%s:%s", config.HOST, config.PORT)
    uvicorn.run(app, host=config.HOST, port=config.PORT, log_level="info")


if __name__ == "__main__":
    main()
