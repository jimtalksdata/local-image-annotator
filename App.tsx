import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Cpu,
  Download,
  FolderInput,
  Play,
  Square,
  Trash2,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

import {
  AnnotationItem,
  ApplyMode,
  ApplyPreview,
  ApplyResult,
  GenerationStats,
  ModelInfo,
  ModelStatus,
  Profile,
  ProfileDraft,
  SourceMode,
} from './types';
import {
  DEFAULT_DRAFT,
  LS_DRAFT_KEY,
  LS_FOLDER_KEY,
  LS_PROFILE_KEY,
} from './constants';
import { api, ApplyItemPayload } from './services/api';
import { downloadCaptionsAsZip, fileToBase64 } from './utils/helpers';
import { Button } from './components/Button';
import { ImageCard } from './components/ImageCard';
import { ImagePreviewModal } from './components/ImagePreviewModal';
import { ModelSelector } from './components/ModelSelector';
import { ProfilePanel } from './components/ProfilePanel';
import { SourcePanel } from './components/SourcePanel';
import { ApplyCaptionsModal } from './components/ApplyCaptionsModal';

const readLocal = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const draftFromProfile = (profile: Profile): ProfileDraft => ({
  prompt: profile.prompt,
  modelId: profile.modelId,
  systemPrompt: profile.systemPrompt ?? '',
  florenceTask: profile.florenceTask ?? null,
  params: profile.params,
});

const sameDraft = (a: ProfileDraft, b: ProfileDraft): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

const App: React.FC = () => {
  // -- config ------------------------------------------------------------
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(() =>
    readLocal<string | null>(LS_PROFILE_KEY, null),
  );
  const [draft, setDraft] = useState<ProfileDraft>(() => readLocal(LS_DRAFT_KEY, DEFAULT_DRAFT));
  const [panelOpen, setPanelOpen] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  // -- source ------------------------------------------------------------
  const folderState = readLocal(LS_FOLDER_KEY, { path: '', recursive: false, captionExt: '.txt' });
  const [sourceMode, setSourceMode] = useState<SourceMode>('folder');
  const [folderPath, setFolderPath] = useState(folderState.path);
  const [recursive, setRecursive] = useState(folderState.recursive);
  const [captionExt, setCaptionExt] = useState(folderState.captionExt);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanSummary, setScanSummary] = useState<string | null>(null);
  const [sizeByItemId, setSizeByItemId] = useState<Record<string, number>>({});

  // -- work --------------------------------------------------------------
  const [items, setItems] = useState<AnnotationItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const itemsRef = useRef<AnnotationItem[]>([]);
  itemsRef.current = items;

  // -- apply -------------------------------------------------------------
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyPreview, setApplyPreview] = useState<ApplyPreview | null>(null);
  const [applyPreviewError, setApplyPreviewError] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [outputDir, setOutputDir] = useState('');

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null;
  const isDirty = activeProfile ? !sameDraft(draft, draftFromProfile(activeProfile)) : false;

  // -- boot --------------------------------------------------------------
  const refreshModels = useCallback(async () => {
    const data = await api.listModels();
    setModels(data.models);
    setModelStatus(data.status);
    return data;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [modelData, profileData] = await Promise.all([refreshModels(), api.listProfiles()]);
        setProfiles(profileData.profiles);
        setDraft((current) => {
          const known = modelData.models.some((m) => m.id === current.modelId);
          return known ? current : { ...current, modelId: modelData.models[0]?.id ?? current.modelId };
        });
      } catch (e) {
        setBootError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [refreshModels]);

  // Poll only while a load is in flight — no idle polling.
  useEffect(() => {
    if (!modelStatus?.loadingModelId) return;
    const timer = setInterval(() => {
      api.modelStatus().then(setModelStatus).catch(() => undefined);
    }, 1500);
    return () => clearInterval(timer);
  }, [modelStatus?.loadingModelId]);

  useEffect(() => {
    localStorage.setItem(LS_DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  useEffect(() => {
    localStorage.setItem(LS_PROFILE_KEY, JSON.stringify(activeProfileId));
  }, [activeProfileId]);

  useEffect(() => {
    localStorage.setItem(LS_FOLDER_KEY, JSON.stringify({ path: folderPath, recursive, captionExt }));
  }, [folderPath, recursive, captionExt]);

  // -- derived -----------------------------------------------------------
  const stats: GenerationStats = useMemo(
    () => ({
      total: items.length,
      completed: items.filter((i) => i.status === 'success').length,
      failed: items.filter((i) => i.status === 'error').length,
    }),
    [items],
  );
  const pendingCount = items.filter((i) => i.status === 'idle' || i.status === 'error').length;
  const captionedCount = items.filter((i) => (i.caption ?? '').trim().length > 0).length;
  const activeModel = models.find((m) => m.id === draft.modelId);

  const patchDraft = useCallback((patch: Partial<ProfileDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const patchItem = useCallback((id: string, patch: Partial<AnnotationItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  // -- source handling ---------------------------------------------------
  const releaseObjectUrls = (list: AnnotationItem[]) => {
    list.forEach((item) => {
      if (item.source === 'upload') URL.revokeObjectURL(item.previewUrl);
    });
  };

  const handleUpload = useCallback((files: File[]) => {
    const added: AnnotationItem[] = files.map((file) => ({
      id: uuidv4(),
      name: file.name,
      source: 'upload',
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'idle',
    }));
    setItems((current) => [...current, ...added]);
    setSizeByItemId((current) => {
      const next = { ...current };
      added.forEach((item, i) => {
        next[item.id] = files[i].size;
      });
      return next;
    });
  }, []);

  const handleScan = useCallback(async () => {
    setIsScanning(true);
    setScanError(null);
    setScanSummary(null);
    try {
      const result = await api.scan(folderPath, recursive, captionExt);
      const scanned: AnnotationItem[] = result.items.map((entry) => ({
        id: uuidv4(),
        name: entry.name,
        source: 'folder',
        path: entry.path,
        relPath: entry.relPath,
        previewUrl: api.thumbUrl(entry.path),
        status: 'idle',
        existingCaption: entry.existingCaption,
        hasExistingCaption: entry.hasExistingCaption,
      }));
      setItems((current) => {
        releaseObjectUrls(current);
        return scanned;
      });
      setSizeByItemId(
        Object.fromEntries(scanned.map((item, i) => [item.id, result.items[i].sizeBytes])),
      );
      setFolderPath(result.root);
      setScanSummary(
        `${result.count} image${result.count === 1 ? '' : 's'} · ${result.withExistingCaptions} already have a ${result.captionExt} file${
          result.truncated ? ' · list truncated' : ''
        }`,
      );
      void api.patchSettings({ lastFolder: result.root });
    } catch (e) {
      setScanError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsScanning(false);
    }
  }, [folderPath, recursive, captionExt]);

  const handleRemove = useCallback((id: string) => {
    setItems((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.source === 'upload') URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }, []);

  const handleClearAll = useCallback(() => {
    if (!window.confirm('Remove all images from this batch? Files on disk are untouched.')) return;
    setItems((current) => {
      releaseObjectUrls(current);
      return [];
    });
    setSizeByItemId({});
    setScanSummary(null);
  }, []);

  const handleRetry = useCallback(
    (id: string) => patchItem(id, { status: 'idle', error: undefined }),
    [patchItem],
  );

  const handleUpdateCaption = useCallback(
    (id: string, caption: string) => patchItem(id, { caption, status: 'success' }),
    [patchItem],
  );

  // -- generation --------------------------------------------------------
  const runGeneration = useCallback(async () => {
    if (isProcessing) return;
    const queue = itemsRef.current.filter((i) => i.status === 'idle' || i.status === 'error');
    if (queue.length === 0) return;

    cancelRef.current = false;
    setIsProcessing(true);
    setProgress({ done: 0, total: queue.length });

    // One model, one GPU: the backend serialises anyway, so keep the client
    // sequential and give honest per-image progress.
    for (let index = 0; index < queue.length; index += 1) {
      if (cancelRef.current) break;
      const item = queue[index];
      patchItem(item.id, { status: 'loading', error: undefined });

      try {
        const payload = {
          modelId: draft.modelId,
          prompt: draft.prompt,
          systemPrompt: draft.systemPrompt || undefined,
          florenceTask: draft.florenceTask,
          params: draft.params,
          ...(item.source === 'folder'
            ? { path: item.path }
            : { imageBase64: await fileToBase64(item.file as File) }),
        };
        const response = await api.caption(payload);
        patchItem(item.id, { status: 'success', caption: response.caption });
      } catch (e) {
        patchItem(item.id, {
          status: 'error',
          error: e instanceof Error ? e.message : String(e),
        });
      }
      setProgress({ done: index + 1, total: queue.length });
      api.modelStatus().then(setModelStatus).catch(() => undefined);
    }

    setIsProcessing(false);
    setProgress(null);
    cancelRef.current = false;
  }, [draft, isProcessing, patchItem]);

  const stopGeneration = useCallback(() => {
    cancelRef.current = true;
  }, []);

  // -- model actions -----------------------------------------------------
  const handleLoadModel = useCallback(async () => {
    setModelStatus((s) => (s ? { ...s, loadingModelId: draft.modelId, error: null } : s));
    try {
      setModelStatus(await api.loadModel(draft.modelId));
    } catch (e) {
      setModelStatus((s) =>
        s ? { ...s, loadingModelId: null, error: e instanceof Error ? e.message : String(e) } : s,
      );
    }
  }, [draft.modelId]);

  const handleUnloadModel = useCallback(async () => {
    try {
      setModelStatus(await api.unloadModel());
    } catch {
      /* status poll will correct this */
    }
  }, []);

  // -- profile actions ---------------------------------------------------
  const handleSelectProfile = useCallback(
    (id: string) => {
      if (!id) {
        setActiveProfileId(null);
        return;
      }
      const profile = profiles.find((p) => p.id === id);
      if (!profile) return;
      if (isDirty && !window.confirm('Discard unsaved changes to the current profile?')) return;
      setActiveProfileId(id);
      setDraft(draftFromProfile(profile));
    },
    [profiles, isDirty],
  );

  const handleSaveProfile = useCallback(async () => {
    if (!activeProfileId) return;
    const saved = await api.updateProfile(activeProfileId, draft);
    setProfiles((current) => current.map((p) => (p.id === saved.id ? saved : p)));
  }, [activeProfileId, draft]);

  const handleSaveAsProfile = useCallback(async () => {
    const name = window.prompt('Name for this profile:', activeProfile ? `${activeProfile.name} copy` : '');
    if (!name?.trim()) return;
    const saved = await api.createProfile({ ...draft, name: name.trim() });
    setProfiles((current) => [...current, saved]);
    setActiveProfileId(saved.id);
  }, [draft, activeProfile]);

  const handleDeleteProfile = useCallback(async () => {
    if (!activeProfileId || !activeProfile) return;
    if (!window.confirm(`Delete profile "${activeProfile.name}"?`)) return;
    await api.deleteProfile(activeProfileId);
    setProfiles((current) => current.filter((p) => p.id !== activeProfileId));
    setActiveProfileId(null);
  }, [activeProfileId, activeProfile]);

  const handleRevertProfile = useCallback(() => {
    if (activeProfile) setDraft(draftFromProfile(activeProfile));
  }, [activeProfile]);

  // -- applying captions -------------------------------------------------
  const applyPayload = (): ApplyItemPayload[] =>
    itemsRef.current
      .filter((item) => (item.caption ?? '').trim().length > 0)
      .map((item) => ({
        id: item.id,
        name: item.name,
        path: item.path,
        relPath: item.relPath,
        caption: item.caption as string,
      }));

  const needsOutputDir = sourceMode === 'upload';

  const loadApplyPreview = useCallback(
    async (dir: string) => {
      setIsLoadingPreview(true);
      setApplyPreviewError(null);
      try {
        setApplyPreview(await api.previewApply(applyPayload(), dir.trim() || null, captionExt));
      } catch (e) {
        setApplyPreview(null);
        setApplyPreviewError(e instanceof Error ? e.message : String(e));
      } finally {
        setIsLoadingPreview(false);
      }
    },
    [captionExt],
  );

  const openApplyModal = useCallback(() => {
    const dir = needsOutputDir ? outputDir : '';
    setApplyResult(null);
    setApplyPreview(null);
    setApplyPreviewError(null);
    setApplyOpen(true);
    if (!needsOutputDir || dir.trim()) void loadApplyPreview(dir);
    else setApplyPreviewError('Choose an output folder for uploaded files.');
  }, [needsOutputDir, outputDir, loadApplyPreview]);

  // Re-check the target folder as the user types it (upload mode only).
  useEffect(() => {
    if (!applyOpen || !needsOutputDir || applyResult) return;
    if (!outputDir.trim()) return;
    const timer = setTimeout(() => void loadApplyPreview(outputDir), 400);
    return () => clearTimeout(timer);
  }, [applyOpen, needsOutputDir, outputDir, applyResult, loadApplyPreview]);

  const handleConfirmApply = useCallback(
    async (mode: ApplyMode) => {
      setIsApplying(true);
      try {
        const result = await api.applyCaptions(
          applyPayload(),
          mode,
          needsOutputDir ? outputDir.trim() : null,
          captionExt,
        );
        setApplyResult(result);
        // Written files are now the on-disk truth for these images.
        const writtenSet = new Set(result.written);
        setItems((current) =>
          current.map((item) => {
            const target = item.path
              ? item.path.replace(/\.[^.\\/]+$/, captionExt)
              : null;
            if (target && writtenSet.has(target)) {
              return { ...item, hasExistingCaption: true, existingCaption: item.caption ?? null };
            }
            return item;
          }),
        );
      } catch (e) {
        setApplyPreviewError(e instanceof Error ? e.message : String(e));
      } finally {
        setIsApplying(false);
      }
    },
    [needsOutputDir, outputDir, captionExt],
  );

  const handleDownloadZip = useCallback(async () => {
    const count = await downloadCaptionsAsZip(items, captionExt);
    if (count === 0) window.alert('No captions generated yet.');
  }, [items, captionExt]);

  // -- render ------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Local Image Annotator</h1>
              <p className="text-xs text-slate-500 hidden sm:block">
                {activeModel
                  ? `${activeModel.label} · running on this machine`
                  : 'Local VLM captioning'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {captionedCount > 0 && (
              <>
                <Button variant="secondary" onClick={handleDownloadZip} className="hidden sm:flex text-sm">
                  <Download className="w-4 h-4 mr-2" />
                  Download ZIP
                </Button>
                <Button onClick={openApplyModal} className="text-sm">
                  <FolderInput className="w-4 h-4 mr-2" />
                  Apply to disk
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {bootError && (
        <div className="bg-red-50 border-b border-red-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-start gap-2 text-sm text-red-800">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Cannot reach the backend: {bootError}. Start it with{' '}
              <code className="font-mono">venv\Scripts\python.exe -m backend.main</code>.
            </span>
          </div>
        </div>
      )}

      <ProfilePanel
        isOpen={panelOpen}
        onToggle={() => setPanelOpen((v) => !v)}
        draft={draft}
        onDraftChange={patchDraft}
        profiles={profiles}
        activeProfileId={activeProfileId}
        isDirty={isDirty}
        onSelectProfile={handleSelectProfile}
        onSaveProfile={handleSaveProfile}
        onSaveAsProfile={handleSaveAsProfile}
        onDeleteProfile={handleDeleteProfile}
        onRevertProfile={handleRevertProfile}
        models={models}
        disabled={isProcessing}
        modelSlot={
          <ModelSelector
            models={models}
            status={modelStatus}
            selectedId={draft.modelId}
            onSelect={(id) => {
              const model = models.find((m) => m.id === id);
              patchDraft({
                modelId: id,
                florenceTask: model?.defaultTask ?? null,
              });
            }}
            onLoad={handleLoadModel}
            onUnload={handleUnloadModel}
            disabled={isProcessing}
          />
        }
      />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <SourcePanel
              mode={sourceMode}
              onModeChange={setSourceMode}
              folderPath={folderPath}
              onFolderPathChange={setFolderPath}
              recursive={recursive}
              onRecursiveChange={setRecursive}
              captionExt={captionExt}
              onCaptionExtChange={setCaptionExt}
              onScan={handleScan}
              onUpload={handleUpload}
              isScanning={isScanning}
              scanError={scanError}
              scanSummary={scanSummary}
              disabled={isProcessing}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Batch</h3>
            <dl className="grid grid-cols-3 gap-2 text-center mb-4">
              {[
                { label: 'Loaded', value: stats.total },
                { label: 'Captioned', value: stats.completed },
                { label: 'Failed', value: stats.failed },
              ].map((cell) => (
                <div key={cell.label} className="rounded-lg bg-slate-50 border border-slate-100 py-2">
                  <dd className="text-xl font-semibold text-slate-800 tabular-nums">{cell.value}</dd>
                  <dt className="text-xs text-slate-500">{cell.label}</dt>
                </div>
              ))}
            </dl>

            {progress && (
              <div className="mb-3">
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all"
                    style={{ width: `${(progress.done / progress.total) * 100}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500 tabular-nums">
                  {progress.done} / {progress.total}
                </p>
              </div>
            )}

            <div className="mt-auto flex flex-col gap-2">
              <Button
                onClick={runGeneration}
                disabled={isProcessing || pendingCount === 0}
                isLoading={isProcessing}
              >
                {!isProcessing && <Play className="w-4 h-4 mr-2" />}
                {isProcessing
                  ? 'Captioning…'
                  : `Generate ${pendingCount || ''} caption${pendingCount === 1 ? '' : 's'}`}
              </Button>
              {isProcessing && (
                <Button variant="secondary" onClick={stopGeneration}>
                  <Square className="w-4 h-4 mr-2" />
                  Stop after current image
                </Button>
              )}
              {items.length > 0 && !isProcessing && (
                <Button
                  variant="ghost"
                  onClick={handleClearAll}
                  className="text-red-500 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear batch
                </Button>
              )}
            </div>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
              <Cpu className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-1">No images loaded</h3>
            <p className="text-slate-500 max-w-md mx-auto">
              Point the tool at a folder on this machine, or upload files. Captions are generated by
              a local model — nothing leaves the box.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {items.map((item) => (
              <ImageCard
                key={item.id}
                item={item}
                sizeBytes={sizeByItemId[item.id]}
                onRemove={handleRemove}
                onRetry={handleRetry}
                onUpdateCaption={handleUpdateCaption}
                onPreview={(target) =>
                  setPreviewUrl(target.path ? api.fileUrl(target.path) : target.previewUrl)
                }
              />
            ))}
          </div>
        )}
      </main>

      <ImagePreviewModal
        isOpen={!!previewUrl}
        imageUrl={previewUrl}
        onClose={() => setPreviewUrl(null)}
      />

      <ApplyCaptionsModal
        isOpen={applyOpen}
        preview={applyPreview}
        previewError={applyPreviewError}
        isLoadingPreview={isLoadingPreview}
        isApplying={isApplying}
        result={applyResult}
        needsOutputDir={needsOutputDir}
        outputDir={outputDir}
        onOutputDirChange={setOutputDir}
        onConfirm={handleConfirmApply}
        onClose={() => setApplyOpen(false)}
      />
    </div>
  );
};

export default App;
