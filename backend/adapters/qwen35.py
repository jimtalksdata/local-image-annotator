from __future__ import annotations

import torch
from PIL import Image

from .base import BaseAdapter, GenParams, strip_thinking

DEFAULT_SYSTEM = (
    "You are a precise image captioner. Answer with the caption text only. "
    "Do not add preamble, headings, or commentary."
)


class Qwen35Adapter(BaseAdapter):
    """Qwen3.5-9B (natively multimodal, `Qwen3_5ForConditionalGeneration`)."""

    def load(self) -> None:
        from transformers import AutoProcessor, Qwen3_5ForConditionalGeneration

        self.processor = AutoProcessor.from_pretrained(self.repo_id)
        self.model = Qwen3_5ForConditionalGeneration.from_pretrained(
            self.repo_id,
            dtype=torch.bfloat16,
            device_map="cuda:0" if torch.cuda.is_available() else "cpu",
        )
        self.model.eval()

    def _build_inputs(self, image: Image.Image, prompt: str, system: str):
        messages = [
            {"role": "system", "content": [{"type": "text", "text": system}]},
            {
                "role": "user",
                "content": [{"type": "image", "image": image}, {"type": "text", "text": prompt}],
            },
        ]
        template_kwargs = dict(
            add_generation_prompt=True,
            tokenize=True,
            return_dict=True,
            return_tensors="pt",
        )
        try:
            # Qwen3.5 is reasoning-capable; the chat template accepts this switch.
            return self.processor.apply_chat_template(
                messages, enable_thinking=False, **template_kwargs
            )
        except TypeError:
            pass
        try:
            return self.processor.apply_chat_template(messages, **template_kwargs)
        except (TypeError, ValueError):
            # Fallback for processor builds that will not embed PIL images in the template.
            text = self.processor.apply_chat_template(
                messages, add_generation_prompt=True, tokenize=False
            )
            return self.processor(text=[text], images=[image], return_tensors="pt")

    @torch.inference_mode()
    def caption(self, image: Image.Image, prompt: str, params: GenParams) -> str:
        system = params.extra.get("system_prompt") or DEFAULT_SYSTEM
        inputs = self._build_inputs(image, prompt, system)
        inputs = inputs.to(self.model.device)

        generated = self.model.generate(
            **inputs,
            max_new_tokens=params.max_new_tokens,
            **params.sampling_kwargs(),
        )
        trimmed = generated[:, inputs["input_ids"].shape[1]:]
        text = self.processor.batch_decode(trimmed, skip_special_tokens=True)[0]
        return strip_thinking(text)
