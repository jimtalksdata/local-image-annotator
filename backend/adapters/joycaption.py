from __future__ import annotations

import numpy as np
import torch
from PIL import Image

from .base import BaseAdapter, GenParams

DEFAULT_SYSTEM = "You are a helpful image captioner."

# The published repo ships weights + tokenizer only — no preprocessor_config.json,
# so AutoProcessor cannot build a processor for it. Preprocessing is therefore done
# by hand, matching captioning/joy-caption-batch/batch-alpha2.py: a hard 384x384
# LANCZOS resize, scale to [0,1], then normalise with mean/std 0.5 (SigLIP).
IMAGE_SIZE = 384


class JoyCaptionAdapter(BaseAdapter):
    """JoyCaption Alpha Two (`llama-joycaption-alpha-two-hf-llava`, a LLaVA build)."""

    def load(self) -> None:
        from transformers import AutoTokenizer, LlavaForConditionalGeneration

        self.processor = AutoTokenizer.from_pretrained(self.repo_id, use_fast=True)
        self.model = LlavaForConditionalGeneration.from_pretrained(
            self.repo_id,
            dtype=torch.bfloat16,
            device_map="cuda:0" if torch.cuda.is_available() else "cpu",
        )
        self.model.eval()

        config = self.model.config
        self.image_token_id = getattr(config, "image_token_index", None)
        if self.image_token_id is None:
            self.image_token_id = config.image_token_id
        # SigLIP so400m/14 at 384px with the "full" strategy => 27*27 = 729 tokens.
        self.image_seq_length = getattr(config, "image_seq_length", 729)
        self.vision_dtype = self._find_vision_dtype()

    def _find_vision_dtype(self) -> torch.dtype:
        """Locate the vision tower's dtype.

        Transformers moved the tower from `model.vision_tower` to
        `model.model.vision_tower` in v5, so probe both before giving up and
        using the model-wide dtype.
        """
        for holder in (self.model, getattr(self.model, "model", None)):
            tower = getattr(holder, "vision_tower", None) if holder is not None else None
            if tower is not None:
                try:
                    return next(tower.parameters()).dtype
                except StopIteration:
                    break
        return self.model.dtype

    @property
    def tokenizer(self):
        return self.processor

    def _pixel_values(self, image: Image.Image) -> torch.Tensor:
        if image.size != (IMAGE_SIZE, IMAGE_SIZE):
            image = image.resize((IMAGE_SIZE, IMAGE_SIZE), Image.LANCZOS)
        array = np.asarray(image.convert("RGB"), dtype=np.uint8)
        tensor = torch.from_numpy(array).permute(2, 0, 1).contiguous().float()
        tensor = tensor / 255.0
        tensor = (tensor - 0.5) / 0.5
        return tensor.unsqueeze(0)

    def _input_ids(self, prompt: str, system: str) -> torch.Tensor:
        convo = [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt.strip()},
        ]
        text = self.tokenizer.apply_chat_template(
            convo, tokenize=False, add_generation_prompt=True
        )
        tokens = self.tokenizer.encode(text, add_special_tokens=False, truncation=False)

        # Transformers >= 4.44 wants the image placeholder already expanded to the
        # exact number of patch tokens the vision tower will produce.
        expanded: list[int] = []
        for token in tokens:
            if token == self.image_token_id:
                expanded.extend([self.image_token_id] * self.image_seq_length)
            else:
                expanded.append(token)
        return torch.tensor([expanded], dtype=torch.long)

    @torch.inference_mode()
    def caption(self, image: Image.Image, prompt: str, params: GenParams) -> str:
        system = params.extra.get("system_prompt") or DEFAULT_SYSTEM
        pixel_values = self._pixel_values(image).to(self.model.device, self.vision_dtype)
        input_ids = self._input_ids(prompt, system).to(self.model.device)
        attention_mask = torch.ones_like(input_ids)

        generated = self.model.generate(
            input_ids=input_ids,
            pixel_values=pixel_values,
            attention_mask=attention_mask,
            max_new_tokens=params.max_new_tokens,
            suppress_tokens=None,
            use_cache=True,
            **params.sampling_kwargs(),
        )
        trimmed = generated[0][input_ids.shape[1]:]
        return self.tokenizer.decode(
            trimmed, skip_special_tokens=True, clean_up_tokenization_spaces=False
        ).strip()
