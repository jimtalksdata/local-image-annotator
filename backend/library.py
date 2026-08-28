"""Local folder browsing, thumbnails, and writing caption sidecars to disk."""
from __future__ import annotations

import hashlib
import io
import os
from pathlib import Path
from typing import Any, Iterable, Literal

from PIL import Image, ImageOps

from .config import ALLOWED_ROOTS, IMAGE_EXTENSIONS, THUMB_CACHE_DIR

ApplyMode = Literal["overwrite", "skip", "backup"]
MAX_SCAN = 20000


class PathNotAllowed(PermissionError):
    pass


def resolve_path(raw: str) -> Path:
    """Resolve a user-supplied path, enforcing the allowlist when configured."""
    if not raw or not raw.strip():
        raise ValueError("Path is empty")
    path = Path(os.path.expandvars(raw.strip().strip('"'))).expanduser()
    try:
        path = path.resolve()
    except OSError as exc:
        raise ValueError(f"Cannot resolve path: {exc}") from exc
    if ALLOWED_ROOTS and not any(
        path == root or root in path.parents for root in ALLOWED_ROOTS
    ):
        raise PathNotAllowed(f"Path is outside the configured allowed roots: {path}")
    return path


def caption_path_for(image_path: Path, extension: str = ".txt") -> Path:
    return image_path.with_suffix(extension)


def _read_caption(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None


def scan_folder(
    raw_path: str,
    recursive: bool = False,
    caption_ext: str = ".txt",
) -> dict[str, Any]:
    root = resolve_path(raw_path)
    if not root.is_dir():
        raise NotADirectoryError(f"Not a folder: {root}")

    walker: Iterable[Path] = root.rglob("*") if recursive else root.glob("*")
    items: list[dict[str, Any]] = []
    truncated = False
    for entry in sorted(walker):
        if not entry.is_file() or entry.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        if len(items) >= MAX_SCAN:
            truncated = True
            break
        cap_path = caption_path_for(entry, caption_ext)
        existing = _read_caption(cap_path) if cap_path.exists() else None
        stat = entry.stat()
        items.append(
            {
                "path": str(entry),
                "relPath": str(entry.relative_to(root)),
                "name": entry.name,
                "sizeBytes": stat.st_size,
                "mtime": stat.st_mtime,
                "captionPath": str(cap_path),
                "existingCaption": existing,
                "hasExistingCaption": existing is not None,
            }
        )
    return {
        "root": str(root),
        "recursive": recursive,
        "captionExt": caption_ext,
        "count": len(items),
        "truncated": truncated,
        "withExistingCaptions": sum(1 for i in items if i["hasExistingCaption"]),
        "items": items,
    }


def list_subfolders(raw_path: str | None) -> dict[str, Any]:
    """Cheap folder browser so the user does not have to type long paths."""
    if not raw_path or not raw_path.strip():
        drives = []
        for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
            candidate = Path(letter + ":/")
            if candidate.exists():
                drives.append({"name": letter + ":", "path": str(candidate)})
        return {"path": "", "parent": None, "folders": drives}

    root = resolve_path(raw_path)
    if not root.is_dir():
        raise NotADirectoryError(f"Not a folder: {root}")
    folders = []
    try:
        for entry in sorted(root.iterdir()):
            if entry.is_dir() and not entry.name.startswith("."):
                folders.append({"name": entry.name, "path": str(entry)})
    except PermissionError:
        pass
    parent = str(root.parent) if root.parent != root else None
    return {"path": str(root), "parent": parent, "folders": folders}


# -- thumbnails ------------------------------------------------------------
def thumbnail_bytes(raw_path: str, width: int = 384) -> tuple[bytes, str]:
    path = resolve_path(raw_path)
    if not path.is_file():
        raise FileNotFoundError(path)
    stat = path.stat()
    key = hashlib.sha1(
        "{}|{}|{}|{}".format(path, stat.st_mtime_ns, stat.st_size, width).encode("utf-8")
    ).hexdigest()
    cached = THUMB_CACHE_DIR / (key + ".webp")
    if cached.exists():
        return cached.read_bytes(), "image/webp"

    with Image.open(path) as img:
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
        img.thumbnail((width, width * 2), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=82, method=4)
    data = buf.getvalue()
    try:
        cached.write_bytes(data)
    except OSError:
        pass
    return data, "image/webp"


def load_image(raw_path: str, max_side: int = 1536) -> Image.Image:
    path = resolve_path(raw_path)
    with Image.open(path) as img:
        img = ImageOps.exif_transpose(img).convert("RGB")
        if max(img.size) > max_side:
            img.thumbnail((max_side, max_side), Image.LANCZOS)
        return img.copy()


# -- applying captions -----------------------------------------------------
def _target_for(item: dict[str, Any], output_dir: Path | None, caption_ext: str) -> Path:
    """Where the sidecar for one item goes.

    Folder-mode items carry an absolute source path and write in place.
    Upload-mode items carry only a filename and need an explicit output folder.
    """
    src = item.get("path")
    if src:
        image_path = resolve_path(src)
        if output_dir is None:
            return caption_path_for(image_path, caption_ext)
        rel = Path(item.get("relPath") or image_path.name)
        return output_dir / rel.with_suffix(caption_ext)
    name = item.get("name")
    if not name:
        raise ValueError("Item has neither a source path nor a file name")
    if output_dir is None:
        raise ValueError("Uploaded images need an output folder")
    return output_dir / Path(name).with_suffix(caption_ext)


def preview_apply(
    items: list[dict[str, Any]],
    output_dir: str | None = None,
    caption_ext: str = ".txt",
) -> dict[str, Any]:
    out = resolve_path(output_dir) if output_dir else None
    conflicts: list[dict[str, Any]] = []
    writable: list[dict[str, Any]] = []
    invalid: list[dict[str, Any]] = []
    for item in items:
        if not (item.get("caption") or "").strip():
            continue
        try:
            target = _target_for(item, out, caption_ext)
        except (ValueError, PathNotAllowed) as exc:
            invalid.append({"name": item.get("name"), "reason": str(exc)})
            continue
        record: dict[str, Any] = {
            "id": item.get("id"),
            "name": item.get("name") or target.stem,
            "targetPath": str(target),
        }
        if target.exists():
            existing = _read_caption(target) or ""
            record["existing"] = existing[:2000]
            record["identical"] = existing.strip() == item["caption"].strip()
            conflicts.append(record)
        else:
            writable.append(record)
    return {
        "outputDir": str(out) if out else None,
        "captionExt": caption_ext,
        "total": len(conflicts) + len(writable),
        "newCount": len(writable),
        "conflictCount": len(conflicts),
        "identicalCount": sum(1 for c in conflicts if c.get("identical")),
        "conflicts": conflicts,
        "invalid": invalid,
    }


def apply_captions(
    items: list[dict[str, Any]],
    mode: ApplyMode = "backup",
    output_dir: str | None = None,
    caption_ext: str = ".txt",
) -> dict[str, Any]:
    if mode not in ("overwrite", "skip", "backup"):
        raise ValueError("Unknown apply mode: " + str(mode))
    out = resolve_path(output_dir) if output_dir else None
    if out is not None:
        out.mkdir(parents=True, exist_ok=True)

    written: list[str] = []
    skipped: list[str] = []
    backed_up: list[str] = []
    errors: list[dict[str, Any]] = []
    for item in items:
        caption = (item.get("caption") or "").strip()
        if not caption:
            continue
        try:
            target = _target_for(item, out, caption_ext)
            if target.exists():
                if mode == "skip":
                    skipped.append(str(target))
                    continue
                if mode == "backup":
                    backup = target.with_suffix(target.suffix + ".bak")
                    counter = 1
                    while backup.exists():
                        backup = target.with_suffix(target.suffix + ".bak" + str(counter))
                        counter += 1
                    backup.write_bytes(target.read_bytes())
                    backed_up.append(str(backup))
            target.parent.mkdir(parents=True, exist_ok=True)
            with open(target, "w", encoding="utf-8", newline="\n") as fh:
                fh.write(caption + "\n")
            written.append(str(target))
        except (OSError, ValueError, PathNotAllowed) as exc:
            errors.append({"name": item.get("name"), "error": str(exc)})

    return {
        "mode": mode,
        "writtenCount": len(written),
        "skippedCount": len(skipped),
        "backedUpCount": len(backed_up),
        "written": written,
        "skipped": skipped,
        "backedUp": backed_up,
        "errors": errors,
    }
