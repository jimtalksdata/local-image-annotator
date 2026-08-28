import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileWarning, Loader2, X } from 'lucide-react';
import { Button } from './Button';
import { ApplyMode, ApplyPreview, ApplyResult } from '../types';

interface ApplyCaptionsModalProps {
  isOpen: boolean;
  preview: ApplyPreview | null;
  previewError: string | null;
  isLoadingPreview: boolean;
  isApplying: boolean;
  result: ApplyResult | null;
  needsOutputDir: boolean;
  outputDir: string;
  onOutputDirChange: (value: string) => void;
  onConfirm: (mode: ApplyMode) => void;
  onClose: () => void;
}

const MODE_OPTIONS: Array<{ value: ApplyMode; label: string; blurb: string }> = [
  {
    value: 'backup',
    label: 'Back up, then overwrite',
    blurb: 'Copies each existing file to <name>.txt.bak before writing. Safest.',
  },
  {
    value: 'skip',
    label: 'Keep existing, skip those images',
    blurb: 'Only images without a caption file get written.',
  },
  {
    value: 'overwrite',
    label: 'Overwrite, no backup',
    blurb: 'Existing caption files are replaced and cannot be recovered.',
  },
];

export const ApplyCaptionsModal: React.FC<ApplyCaptionsModalProps> = ({
  isOpen,
  preview,
  previewError,
  isLoadingPreview,
  isApplying,
  result,
  needsOutputDir,
  outputDir,
  onOutputDirChange,
  onConfirm,
  onClose,
}) => {
  const [mode, setMode] = useState<ApplyMode>('backup');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMode('backup');
      setExpanded(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isApplying) onClose();
    };
    if (isOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isApplying, onClose]);

  if (!isOpen) return null;

  const conflicts = preview?.conflicts ?? [];
  const hasConflicts = conflicts.length > 0;
  const shown = expanded ? conflicts : conflicts.slice(0, 8);
  const blockedForOutputDir = needsOutputDir && !outputDir.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${hasConflicts ? 'bg-amber-100' : 'bg-blue-100'}`}>
              {hasConflicts ? (
                <FileWarning className="w-5 h-5 text-amber-600" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-blue-600" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {result ? 'Captions applied' : 'Write captions to disk'}
              </h2>
              <p className="text-sm text-slate-500">
                {result
                  ? 'Files were written on the machine running the backend.'
                  : 'Caption files are written next to each image as sidecars.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isApplying}
            className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          {isLoadingPreview && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Checking the target folder…
            </div>
          )}

          {previewError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 break-words">
              {previewError}
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                  <div className="text-2xl font-semibold text-green-700 tabular-nums">
                    {result.writtenCount}
                  </div>
                  <div className="text-xs text-green-700">written</div>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                  <div className="text-2xl font-semibold text-slate-700 tabular-nums">
                    {result.skippedCount}
                  </div>
                  <div className="text-xs text-slate-600">skipped</div>
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                  <div className="text-2xl font-semibold text-blue-700 tabular-nums">
                    {result.backedUpCount}
                  </div>
                  <div className="text-xs text-blue-700">backed up</div>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                  <p className="text-sm font-medium text-red-800 mb-1">
                    {result.errors.length} file(s) failed
                  </p>
                  <ul className="text-xs text-red-700 font-mono space-y-0.5 max-h-32 overflow-y-auto">
                    {result.errors.map((err, i) => (
                      <li key={i}>
                        {err.name}: {err.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {!result && preview && !isLoadingPreview && (
            <div className="space-y-4">
              {needsOutputDir && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
                    Output folder (required for uploaded files)
                  </label>
                  <input
                    type="text"
                    value={outputDir}
                    onChange={(e) => onOutputDirChange(e.target.value)}
                    spellCheck={false}
                    placeholder="F:\Projects\stable_diffusion\images\training_samples"
                    className="w-full text-sm font-mono border border-slate-300 rounded-lg bg-slate-50 py-2 px-3 focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              )}

              <div className="text-sm text-slate-700">
                <span className="font-semibold tabular-nums">{preview.total}</span> caption file
                {preview.total === 1 ? '' : 's'} to write
                {preview.outputDir && (
                  <>
                    {' '}
                    into <code className="font-mono text-xs break-all">{preview.outputDir}</code>
                  </>
                )}
                . <span className="tabular-nums">{preview.newCount}</span> new,{' '}
                <span className="tabular-nums">{preview.conflictCount}</span> already exist.
              </div>

              {hasConflicts && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
                  <div className="flex items-start gap-2 mb-3">
                    <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-sm text-amber-900">
                      <p className="font-semibold">
                        {preview.conflictCount} image
                        {preview.conflictCount === 1 ? '' : 's'} already {preview.conflictCount === 1 ? 'has' : 'have'} a
                        caption file.
                      </p>
                      <p className="text-amber-800">
                        {preview.identicalCount > 0 && (
                          <>
                            {preview.identicalCount} of them are byte-identical to the new caption.{' '}
                          </>
                        )}
                        Choose what happens to the rest.
                      </p>
                    </div>
                  </div>

                  <ul className="mb-3 max-h-40 overflow-y-auto rounded-md bg-white border border-amber-200 divide-y divide-amber-100">
                    {shown.map((conflict) => (
                      <li key={conflict.targetPath} className="px-3 py-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-slate-700 truncate">{conflict.name}</span>
                          {conflict.identical ? (
                            <span className="text-slate-400 shrink-0">identical</span>
                          ) : (
                            <span className="text-amber-700 shrink-0">will change</span>
                          )}
                        </div>
                        {!conflict.identical && conflict.existing && (
                          <p className="mt-0.5 text-slate-500 line-clamp-2">
                            current: {conflict.existing.slice(0, 160)}
                            {conflict.existing.length > 160 ? '…' : ''}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                  {conflicts.length > 8 && (
                    <button
                      onClick={() => setExpanded((v) => !v)}
                      className="text-xs font-medium text-amber-800 hover:text-amber-900"
                    >
                      {expanded ? 'Show fewer' : `Show all ${conflicts.length}`}
                    </button>
                  )}

                  <div className="mt-3 space-y-2">
                    {MODE_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className={`flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer transition-colors ${
                          mode === option.value
                            ? 'border-amber-500 bg-white'
                            : 'border-transparent hover:bg-white/60'
                        }`}
                      >
                        <input
                          type="radio"
                          name="apply-mode"
                          value={option.value}
                          checked={mode === option.value}
                          onChange={() => setMode(option.value)}
                          className="mt-0.5 text-amber-600 focus:ring-amber-500"
                        />
                        <span className="text-sm">
                          <span className="font-medium text-slate-800">{option.label}</span>
                          <span className="block text-xs text-slate-500">{option.blurb}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {preview.invalid.length > 0 && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
                  <p className="font-medium mb-1">
                    {preview.invalid.length} item(s) cannot be written:
                  </p>
                  <ul className="space-y-0.5 font-mono max-h-24 overflow-y-auto">
                    {preview.invalid.map((item, i) => (
                      <li key={i}>
                        {item.name}: {item.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200">
          {result ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose} disabled={isApplying}>
                Cancel
              </Button>
              <Button
                onClick={() => onConfirm(hasConflicts ? mode : 'overwrite')}
                isLoading={isApplying}
                disabled={
                  isApplying ||
                  isLoadingPreview ||
                  !!previewError ||
                  blockedForOutputDir ||
                  !preview ||
                  preview.total === 0
                }
                className={mode === 'overwrite' && hasConflicts ? 'bg-amber-600 hover:bg-amber-700' : ''}
              >
                {hasConflicts && mode === 'overwrite'
                  ? 'Overwrite without backup'
                  : `Write ${preview?.total ?? 0} file${preview?.total === 1 ? '' : 's'}`}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
