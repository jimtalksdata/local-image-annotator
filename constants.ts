import { GenParams, ProfileDraft } from './types';

export const DEFAULT_PROMPT = `You are a professional image captioner to annotate the given image in high fidelity while being concise. Please annotate images using 6 sentences of the following categories:

Goal: a one sentence description of the most important elements of the scene.
Subject: a detailed description of the primary subject, including any unique features such as wings, horns, sharp nails, claws, or a tail. Comment on the body type and posture. Comment on any accessories or items the subject is wearing.
Scene: a detailed description of the scene, including important background elements, motion, and any secondary subjects.
Style: a description of the art style (-isms), including the color palette, shading, and line art style. Comment on detail, texturing, influences.
Camera: for realistic images, a description of the camera settings, including the angle, focal length (mm), and perspective.
Lighting/mood: for realistic images, a description of the lighting conditions, including the direction, intensity, and color of the light. For anime, manga, or other non-realistic images, comment on the mood and atmosphere.`;

export const DEFAULT_SYSTEM_PROMPT =
  'You are a precise image captioner. Answer with the caption text only. Do not add preamble, headings, or commentary.';

export const DEFAULT_PARAMS: GenParams = {
  maxNewTokens: 400,
  temperature: 0.6,
  topP: 0.9,
  topK: 50,
  repetitionPenalty: 1.05,
  greedy: false,
};

export const DEFAULT_MODEL_ID = 'qwen35-9b';

export const DEFAULT_DRAFT: ProfileDraft = {
  prompt: DEFAULT_PROMPT,
  modelId: DEFAULT_MODEL_ID,
  systemPrompt: '',
  florenceTask: null,
  params: DEFAULT_PARAMS,
};

export const CAPTION_EXTENSIONS = ['.txt', '.caption', '.tags'];

/** Only the last-used draft is cached in the browser; profiles live server-side. */
export const LS_DRAFT_KEY = 'local-annotator-draft';
export const LS_PROFILE_KEY = 'local-annotator-active-profile';
export const LS_FOLDER_KEY = 'local-annotator-folder';
