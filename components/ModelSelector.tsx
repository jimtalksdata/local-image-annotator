import React from 'react';
import { Cpu, Download, Loader2, Power, Zap, AlertTriangle } from 'lucide-react';
import { ModelInfo, ModelStatus } from '../types';
import { Button } from './Button';

interface ModelSelectorProps {
  models: ModelInfo[];
  status: ModelStatus | null;
  selectedId: string;
  onSelect: (id: string) => void;
  onLoad: () => void;
  onUnload: () => void;
  disabled?: boolean;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  models,
  status,
  selectedId,
  onSelect,
  onLoad,
  onUnload,
  disabled,
}) => {
  const selected = models.find((m) => m.id === selectedId);
  const isLoaded = status?.loadedModelId === selectedId;
  const isLoading = !!status?.loadingModelId;
  const otherLoaded =
    status?.loadedModelId && status.loadedModelId !== selectedId
      ? models.find((m) => m.id === status.loadedModelId)
      : undefined;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <Cpu className="w-4 h-4 text-blue-600" />
        <h3 className="text-sm font-semibold text-slate-800">Captioning model</h3>
        {status?.vram?.available && (
          <span className="ml-auto text-xs text-slate-500 tabular-nums">
            VRAM {status.vram.usedGb?.toFixed(1)} / {status.vram.totalGb?.toFixed(1)} GB
          </span>
        )}
      </div>

      <select
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
        disabled={disabled || isLoading}
        className="block w-full text-sm border border-slate-300 rounded-lg bg-slate-50 py-2 pl-3 pr-8 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-60"
      >
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label} · ~{model.approxVramGb} GB
            {model.downloaded ? '' : ' (not downloaded)'}
          </option>
        ))}
      </select>

      {selected && <p className="mt-2 text-xs text-slate-500">{selected.blurb}</p>}

      {selected && !selected.downloaded && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
          <Download className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Weights not found under <code className="font-mono">models/vlm/hub</code>. Run{' '}
            <code className="font-mono">scripts/copy_models.ps1</code>, or start the backend with{' '}
            <code className="font-mono">ANNOTATOR_ALLOW_DOWNLOAD=1</code>.
          </span>
        </p>
      )}

      {otherLoaded && (
        <p className="mt-2 text-xs text-slate-500">
          <span className="font-medium text-slate-700">{otherLoaded.label}</span> is currently
          resident. Generating will swap it out — one model fits on the card at a time.
        </p>
      )}

      {status?.error && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span className="break-words">{status.error}</span>
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button
          variant={isLoaded ? 'secondary' : 'primary'}
          onClick={onLoad}
          disabled={disabled || isLoading || isLoaded}
          className="text-xs py-2"
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
          ) : (
            <Zap className="w-3.5 h-3.5 mr-2" />
          )}
          {isLoading
            ? `Loading ${models.find((m) => m.id === status?.loadingModelId)?.label ?? ''}…`
            : isLoaded
              ? 'Loaded'
              : 'Preload model'}
        </Button>
        <Button
          variant="ghost"
          onClick={onUnload}
          disabled={disabled || isLoading || !status?.loadedModelId}
          className="text-xs py-2 text-slate-500"
          title="Free the GPU without stopping the server"
        >
          <Power className="w-3.5 h-3.5 mr-2" />
          Free VRAM
        </Button>
      </div>
    </div>
  );
};
