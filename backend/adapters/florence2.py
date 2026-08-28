from __future__ import annotations

import re

import torch
from PIL import Image

from .base import BaseAdapter, GenParams

# Florence-2 is task-token driven, not free-prompt. These are the caption-shaped tasks.
FLORENCE_TASKS = [
    "<CAPTION>",
    "<DETAILED_CAPTION>",
    "<MORE_DETAILED_CAPTION>",
    "<OCR>",
    "<DENSE_REGION_CAPTION>",
    "<REGION_PROPOSAL>",
    "<OD>",
]
DEFAULT_TASK = "<MORE_DETAILED_CAPTION>"
_TASK_RE = re.compile(r"^\s*(<[A-Z_]+>)")


def resolve_task(prompt: str, params_task: str | None) -> tuple[str, str]:
    """Return (task_token, trailing_text).

    Prefers an explicit task from the profile; otherwise honours a leading
    ``<TASK>`` token in the prompt; otherwise falls back to the default.
    """
    text = (prompt or "").strip()
    match = _TASK_RE.match(text)
    if params_task and params_task in FLORENCE_TASKS:
        task = params_task
        if match:
            text = text[match.end():].strip()
    elif match and match.group(1) in FLORENCE_TASKS:
        task = match.group(1)
        text = text[match.end():].strip()
    else:
        task = DEFAULT_TASK
    return task, text


class Florence2Adapter(BaseAdapter):
    """Florence-2-large. Ignores free-form prompt text except for grounding tasks."""

    def load(self) -> None:
        from transformers import AutoProcessor, Florence2ForConditionalGeneration

        self.processor = AutoProcessor.from_pretrained(self.repo_id)
        self.model = Florence2ForConditionalGeneration.from_pretrained(
            self.repo_id,
            dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
        )
        self.model.to("cuda:0" if torch.cuda.is_available() else "cpu")
        self.model.eval()

    @torch.inference_mode()
    def caption(self, image: Image.Image, prompt: str, params: GenParams) -> str:
        task, trailing = resolve_task(prompt, params.task)
        # Only the grounding tasks consume trailing text; caption tasks must be bare.
        text_input = task + trailing if trailing and task in {"<OD>", "<REGION_PROPOSAL>"} else task

        inputs = self.processor(text=text_input, images=image, return_tensors="pt")
        inputs = {
            k: (v.to(self.model.device, self.model.dtype) if k == "pixel_values" else v.to(self.model.device))
            for k, v in inputs.items()
        }
        generated = self.model.generate(
            **inputs,
            max_new_tokens=max(params.max_new_tokens, 256),
            num_beams=3,
            do_sample=False,
        )
        raw = self.processor.batch_decode(generated, skip_special_tokens=False)[0]
        parsed = self.processor.post_process_generation(raw, task=task, image_size=image.size)
        value = parsed.get(task, raw)
        if isinstance(value, str):
            return value.strip()
        return str(value)
