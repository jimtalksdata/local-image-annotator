import React, { useCallback, useEffect, useState } from 'react';
import {
  ChevronRight,
  CornerLeftUp,
  Folder,
  FolderOpen,
  HardDrive,
  Loader2,
  Search,
  UploadCloud,
} from 'lucide-react';
import { Button } from './Button';
import { api } from '../services/api';
import { BrowseResult, SourceMode } from '../types';
import { CAPTION_EXTENSIONS } from '../constants';

interface SourcePanelProps {
  mode: SourceMode;
  onModeChange: (mode: SourceMode) => void;
  folderPath: string;
  onFolderPathChange: (path: string) => void;
  recursive: boolean;
  onRecursiveChange: (value: boolean) => void;
  captionExt: string;
  onCaptionExtChange: (value: string) => void;
  onScan: () => void;
  onUpload: (files: File[]) => void;
  isScanning: boolean;
  scanError: string | null;
  scanSummary: string | null;
  disabled?: boolean;
}

const FolderBrowser: React.FC<{
  current: string;
  onPick: (path: string) => void;
  onClose: () => void;
}> = ({ current, onPick, onClose }) => {
  const [result, setResult] = useState<BrowseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (path?: string) => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.browse(path));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(current || undefined);
  }, [load, current]);

  return (
    <div className="mt-2 rounded-lg border border-slate-300 bg-white shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 text-xs text-slate-600">
        <HardDrive className="w-3.5 h-3.5 shrink-0" />
        <span className="font-mono truncate flex-1">{result?.path || 'This PC'}</span>
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
          Close
        </button>
      </div>

      {error && <p className="px-3 py-2 text-xs text-red-600">{error}</p>}

      <div className="max-h-56 overflow-y-auto">
        <button
          onClick={() => void load(result?.parent ?? undefined)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          <CornerLeftUp className="w-3.5 h-3.5" />
          Up one level
        </button>
        {result?.folders.map((folder) => (
          <div key={folder.path} className="flex items-center hover:bg-slate-50">
            <button
              onClick={() => void load(folder.path)}
              className="flex-1 flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 text-left"
            >
              <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="truncate">{folder.name}</span>
            </button>
            <button
              onClick={() => {
                onPick(folder.path);
                onClose();
              }}
              className="px-3 py-1.5 text-xs text-blue-600 hover:text-blue-800 shrink-0"
            >
              Use
            </button>
          </div>
        ))}
        {result && result.folders.length === 0 && (
          <p className="px-3 py-2 text-xs text-slate-400">No subfolders.</p>
        )}
      </div>

      {result?.path && (
        <div className="border-t border-slate-200 px-3 py-2">
          <button
            onClick={() => {
              onPick(result.path);
              onClose();
            }}
            className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            <ChevronRight className="w-3.5 h-3.5" />
            Use this folder
          </button>
        </div>
      )}
    </div>
  );
};

export const SourcePanel: React.FC<SourcePanelProps> = ({
  mode,
  onModeChange,
  folderPath,
  onFolderPathChange,
  recursive,
  onRecursiveChange,
  captionExt,
  onCaptionExtChange,
  onScan,
  onUpload,
  isScanning,
  scanError,
  scanSummary,
  disabled,
}) => {
  const [browserOpen, setBrowserOpen] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100 mb-4">
        {(['folder', 'upload'] as SourceMode[]).map((value) => (
          <button
            key={value}
            onClick={() => onModeChange(value)}
            disabled={disabled}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === value ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {value === 'folder' ? 'Local folder' : 'Upload files'}
          </button>
        ))}
      </div>

      {mode === 'folder' ? (
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
            Dataset folder on this machine
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={folderPath}
              onChange={(e) => onFolderPathChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !disabled) onScan();
              }}
              disabled={disabled}
              spellCheck={false}
              placeholder="F:\Projects\stable_diffusion\images\training_samples"
              className="flex-1 text-sm font-mono border border-slate-300 rounded-lg bg-slate-50 py-2 px-3 focus:border-blue-500 focus:ring-blue-500"
            />
            <Button
              variant="secondary"
              onClick={() => setBrowserOpen((v) => !v)}
              disabled={disabled}
              className="text-xs py-2"
            >
              <FolderOpen className="w-3.5 h-3.5 mr-2" />
              Browse
            </Button>
            <Button onClick={onScan} disabled={disabled || !folderPath.trim()} isLoading={isScanning} className="text-xs py-2">
              {!isScanning && <Search className="w-3.5 h-3.5 mr-2" />}
              Scan
            </Button>
          </div>

          {browserOpen && (
            <FolderBrowser
              current={folderPath}
              onPick={onFolderPathChange}
              onClose={() => setBrowserOpen(false)}
            />
          )}

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={recursive}
                onChange={(e) => onRecursiveChange(e.target.checked)}
                disabled={disabled}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Include subfolders
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              Caption extension
              <select
                value={captionExt}
                onChange={(e) => onCaptionExtChange(e.target.value)}
                disabled={disabled}
                className="text-sm font-mono border border-slate-300 rounded-lg bg-slate-50 py-1 pl-2 pr-7 focus:border-blue-500 focus:ring-blue-500"
              >
                {CAPTION_EXTENSIONS.map((ext) => (
                  <option key={ext} value={ext}>
                    {ext}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {scanError && <p className="mt-2 text-xs text-red-600 break-words">{scanError}</p>}
          {scanSummary && !scanError && <p className="mt-2 text-xs text-slate-500">{scanSummary}</p>}
        </div>
      ) : (
        <div>
          <label
            htmlFor="image-upload"
            className="group flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-xl cursor-pointer hover:bg-slate-50 hover:border-blue-400 transition-all"
          >
            <div className="p-3 rounded-full bg-slate-100 mb-2 group-hover:bg-blue-50 transition-colors">
              <UploadCloud className="w-5 h-5 text-slate-500 group-hover:text-blue-500" />
            </div>
            <p className="text-sm font-medium text-slate-700">
              <span className="font-semibold text-blue-600">Click to upload</span> or drag and drop
            </p>
            <p className="text-xs text-slate-500">JPG, PNG, GIF, WEBP — multiple files</p>
            <input
              id="image-upload"
              type="file"
              className="hidden"
              multiple
              disabled={disabled}
              accept="image/png, image/jpeg, image/gif, image/webp, image/bmp, image/tiff"
              onChange={(e) => {
                if (e.target.files?.length) onUpload(Array.from(e.target.files));
                e.target.value = '';
              }}
            />
          </label>
          <p className="mt-2 text-xs text-slate-500">
            Uploaded files have no path on disk, so applying captions locally needs an explicit
            output folder. Use <span className="font-medium">Local folder</span> mode to write
            sidecars next to the images.
          </p>
        </div>
      )}
    </div>
  );
};
