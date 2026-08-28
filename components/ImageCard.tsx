import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  FileText,
  Loader2,
  Maximize2,
  RefreshCw,
  RotateCcw,
  X,
} from 'lucide-react';
import { AnnotationItem } from '../types';
import { formatBytes } from '../utils/helpers';

interface ImageCardProps {
  item: AnnotationItem;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onUpdateCaption: (id: string, caption: string) => void;
  onPreview: (item: AnnotationItem) => void;
  sizeBytes?: number;
}

export const ImageCard: React.FC<ImageCardProps> = ({
  item,
  onRemove,
  onRetry,
  onUpdateCaption,
  onPreview,
  sizeBytes,
}) => {
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState(item.caption ?? '');
  const [showExisting, setShowExisting] = useState(false);

  // Generation replaces the caption; adopt the new text unless the user is mid-edit.
  useEffect(() => {
    setDraft(item.caption ?? '');
  }, [item.caption]);

  const dirty = draft !== (item.caption ?? '');

  const handleCopy = () => {
    if (!draft) return;
    void navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full transition-all hover:shadow-md">
      <div
        className="relative h-48 bg-slate-100 border-b border-slate-100 group cursor-zoom-in"
        onClick={() => onPreview(item)}
      >
        <img
          src={item.previewUrl}
          alt={item.name}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
          <Maximize2 className="w-8 h-8 text-white drop-shadow-md" />
        </div>

        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(item.id);
            }}
            className="p-1.5 bg-white/90 text-slate-600 rounded-full hover:text-red-500 hover:bg-white shadow-sm"
            title="Remove from this batch"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="absolute bottom-2 left-2 flex gap-1.5 pointer-events-none">
          {item.status === 'loading' && (
            <span className="inline-flex items-center px-2 py-1 rounded-md bg-blue-50/90 text-blue-700 text-xs font-medium border border-blue-100 shadow-sm">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Captioning…
            </span>
          )}
          {item.status === 'success' && (
            <span className="inline-flex items-center px-2 py-1 rounded-md bg-green-50/90 text-green-700 text-xs font-medium border border-green-100 shadow-sm">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Done
            </span>
          )}
          {item.status === 'error' && (
            <span className="inline-flex items-center px-2 py-1 rounded-md bg-red-50/90 text-red-700 text-xs font-medium border border-red-100 shadow-sm">
              <AlertCircle className="w-3 h-3 mr-1" />
              Failed
            </span>
          )}
          {item.hasExistingCaption && (
            <span
              className="inline-flex items-center px-2 py-1 rounded-md bg-amber-50/90 text-amber-700 text-xs font-medium border border-amber-100 shadow-sm"
              title="A caption file already exists next to this image"
            >
              <FileText className="w-3 h-3 mr-1" />
              Has caption
            </span>
          )}
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-2 gap-2">
          <h3
            className="text-sm font-semibold text-slate-800 truncate"
            title={item.path ?? item.name}
          >
            {item.relPath ?? item.name}
          </h3>
          {sizeBytes ? (
            <span className="text-xs text-slate-400 shrink-0 tabular-nums">
              {formatBytes(sizeBytes)}
            </span>
          ) : null}
        </div>

        <div className="flex-1 min-h-[120px] bg-slate-50 rounded-lg p-1 text-sm text-slate-600 border border-slate-100">
          {item.status === 'idle' && !draft && (
            <div className="h-full flex items-center justify-center text-slate-400 italic p-2 text-center">
              {item.hasExistingCaption
                ? 'Existing caption on disk — generate to replace'
                : 'Waiting to process…'}
            </div>
          )}
          {item.status === 'loading' && (
            <div className="space-y-2 animate-pulse p-2">
              <div className="h-2 bg-slate-200 rounded w-3/4" />
              <div className="h-2 bg-slate-200 rounded w-full" />
              <div className="h-2 bg-slate-200 rounded w-5/6" />
              <div className="h-2 bg-slate-200 rounded w-4/5" />
            </div>
          )}
          {item.status === 'error' && (
            <div className="h-full flex flex-col items-center justify-center text-center p-2">
              <p className="text-red-500 mb-2 text-xs break-words">{item.error || 'Unknown error'}</p>
              <button
                onClick={() => onRetry(item.id)}
                className="text-blue-600 hover:text-blue-700 font-medium text-xs flex items-center"
              >
                <RefreshCw className="w-3 h-3 mr-1" /> Try again
              </button>
            </div>
          )}
          {(item.status === 'success' || (item.status === 'idle' && draft)) && (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                if (dirty) onUpdateCaption(item.id, draft);
              }}
              className="w-full h-full min-h-[140px] resize-none bg-transparent border-0 focus:ring-0 p-2 text-sm leading-relaxed"
              placeholder="Caption will appear here…"
            />
          )}
        </div>

        {item.existingCaption && (
          <div className="mt-2">
            <button
              onClick={() => setShowExisting((v) => !v)}
              className="text-xs text-amber-700 hover:text-amber-900 font-medium"
            >
              {showExisting ? 'Hide' : 'Show'} caption already on disk
            </button>
            {showExisting && (
              <div className="mt-1 p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-slate-700 max-h-32 overflow-y-auto whitespace-pre-wrap">
                {item.existingCaption}
              </div>
            )}
          </div>
        )}

        {(draft || item.status === 'success') && (
          <div className="mt-3 flex justify-between gap-2 items-center">
            <div className="flex gap-2">
              {dirty && (
                <button
                  onClick={() => onUpdateCaption(item.id, draft)}
                  className="text-xs text-white bg-blue-600 hover:bg-blue-700 flex items-center transition-colors px-3 py-1.5 rounded shadow-sm"
                >
                  Keep edit
                </button>
              )}
              {item.status === 'success' && (
                <button
                  onClick={() => onRetry(item.id)}
                  className="text-xs text-slate-500 hover:text-blue-600 flex items-center px-2 py-1 rounded hover:bg-slate-100"
                  title="Queue this image again"
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Redo
                </button>
              )}
            </div>
            <button
              onClick={handleCopy}
              className="text-xs text-slate-500 hover:text-blue-600 flex items-center transition-colors px-2 py-1 rounded hover:bg-slate-100"
            >
              {copied ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
