import {
  ApplyMode,
  ApplyPreview,
  ApplyResult,
  BrowseResult,
  GenParams,
  ModelInfo,
  ModelStatus,
  Profile,
  ProfileDraft,
  ScanResult,
} from '../types';

const API = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`;
    try {
      const body = await response.json();
      if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/** Payload shape shared by every item we send to the caption-writing endpoints. */
export interface ApplyItemPayload {
  id: string;
  name: string;
  path?: string;
  relPath?: string;
  caption: string;
}

export const api = {
  health: () => request<Record<string, unknown>>('/health'),

  // -- models ------------------------------------------------------------
  listModels: () => request<{ models: ModelInfo[]; status: ModelStatus }>('/models'),
  modelStatus: () => request<ModelStatus>('/models/status'),
  loadModel: (modelId: string) =>
    request<ModelStatus>('/models/load', {
      method: 'POST',
      body: JSON.stringify({ modelId }),
    }),
  unloadModel: () => request<ModelStatus>('/models/unload', { method: 'POST' }),

  // -- captioning --------------------------------------------------------
  caption: (
    payload: {
      modelId: string;
      prompt: string;
      systemPrompt?: string;
      florenceTask?: string | null;
      params: GenParams;
      path?: string;
      imageBase64?: string;
    },
    signal?: AbortSignal,
  ) =>
    request<{ caption: string; modelId: string }>('/caption', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal,
    }),

  // -- profiles ----------------------------------------------------------
  listProfiles: () =>
    request<{ profiles: Profile[]; defaultPrompt: string; defaultParams: GenParams }>('/profiles'),
  createProfile: (payload: ProfileDraft & { name: string }) =>
    request<Profile>('/profiles', { method: 'POST', body: JSON.stringify(payload) }),
  updateProfile: (id: string, payload: Partial<ProfileDraft> & { name?: string }) =>
    request<Profile>(`/profiles/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteProfile: (id: string) => request<{ ok: boolean }>(`/profiles/${id}`, { method: 'DELETE' }),

  getSettings: () => request<Record<string, unknown>>('/settings'),
  patchSettings: (patch: Record<string, unknown>) =>
    request<Record<string, unknown>>('/settings', { method: 'PATCH', body: JSON.stringify(patch) }),

  // -- local library -----------------------------------------------------
  browse: (path?: string) =>
    request<BrowseResult>(`/library/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`),
  scan: (path: string, recursive: boolean, captionExt: string) =>
    request<ScanResult>('/library/scan', {
      method: 'POST',
      body: JSON.stringify({ path, recursive, captionExt }),
    }),
  thumbUrl: (path: string, w = 384) =>
    `${API}/library/thumb?path=${encodeURIComponent(path)}&w=${w}`,
  fileUrl: (path: string) => `${API}/library/file?path=${encodeURIComponent(path)}`,

  previewApply: (items: ApplyItemPayload[], outputDir: string | null, captionExt: string) =>
    request<ApplyPreview>('/captions/preview', {
      method: 'POST',
      body: JSON.stringify({ items, outputDir, captionExt, mode: 'backup' }),
    }),
  applyCaptions: (
    items: ApplyItemPayload[],
    mode: ApplyMode,
    outputDir: string | null,
    captionExt: string,
  ) =>
    request<ApplyResult>('/captions/apply', {
      method: 'POST',
      body: JSON.stringify({ items, mode, outputDir, captionExt }),
    }),
};
