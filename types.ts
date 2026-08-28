export type SourceMode = 'upload' | 'folder';

export type ItemStatus = 'idle' | 'loading' | 'success' | 'error';

export interface AnnotationItem {
  id: string;
  name: string;
  source: SourceMode;
  /** Upload mode only — the browser File handle. */
  file?: File;
  /** Folder mode only — absolute path on the machine running the backend. */
  path?: string;
  relPath?: string;
  previewUrl: string;
  status: ItemStatus;
  caption?: string;
  error?: string;
  /** Caption sidecar that already exists on disk (folder mode). */
  existingCaption?: string | null;
  hasExistingCaption?: boolean;
}

export interface GenParams {
  maxNewTokens: number;
  temperature: number;
  topP: number;
  topK: number;
  repetitionPenalty: number;
  greedy: boolean;
}

export interface ModelInfo {
  id: string;
  label: string;
  repoId: string;
  blurb: string;
  approxVramGb: number;
  freePrompt: boolean;
  tasks: string[];
  defaultTask: string | null;
  defaultMaxNewTokens: number;
  downloaded: boolean;
}

export interface VramInfo {
  available: boolean;
  device?: string;
  freeGb?: number;
  totalGb?: number;
  usedGb?: number;
}

export interface ModelStatus {
  loadedModelId: string | null;
  loadingModelId: string | null;
  error: string | null;
  loadedAt: number | null;
  vram: VramInfo;
}

/**
 * A profile is the whole reproducible captioning configuration: prompt, model,
 * and generation parameters. Stored server-side in state/profiles.json.
 */
export interface Profile {
  id: string;
  name: string;
  prompt: string;
  modelId: string;
  systemPrompt: string;
  florenceTask: string | null;
  params: GenParams;
  createdAt: number;
  updatedAt: number;
}

/** The editable copy of a profile that the panel binds to. */
export interface ProfileDraft {
  prompt: string;
  modelId: string;
  systemPrompt: string;
  florenceTask: string | null;
  params: GenParams;
}

export interface ScanResult {
  root: string;
  recursive: boolean;
  captionExt: string;
  count: number;
  truncated: boolean;
  withExistingCaptions: number;
  items: Array<{
    path: string;
    relPath: string;
    name: string;
    sizeBytes: number;
    mtime: number;
    captionPath: string;
    existingCaption: string | null;
    hasExistingCaption: boolean;
  }>;
}

export interface ApplyConflict {
  id: string | null;
  name: string;
  targetPath: string;
  existing?: string;
  identical?: boolean;
}

export interface ApplyPreview {
  outputDir: string | null;
  captionExt: string;
  total: number;
  newCount: number;
  conflictCount: number;
  identicalCount: number;
  conflicts: ApplyConflict[];
  invalid: Array<{ name: string | null; reason: string }>;
}

export type ApplyMode = 'overwrite' | 'skip' | 'backup';

export interface ApplyResult {
  mode: ApplyMode;
  writtenCount: number;
  skippedCount: number;
  backedUpCount: number;
  written: string[];
  skipped: string[];
  backedUp: string[];
  errors: Array<{ name: string | null; error: string }>;
}

export interface GenerationStats {
  total: number;
  completed: number;
  failed: number;
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  folders: Array<{ name: string; path: string }>;
}
