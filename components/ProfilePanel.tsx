import React from 'react';
import {
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Save,
  Settings2,
  SlidersHorizontal,
  Trash2,
  Undo2,
} from 'lucide-react';
import { Button } from './Button';
import { GenParams, ModelInfo, Profile, ProfileDraft } from '../types';
import { DEFAULT_PROMPT } from '../constants';

interface ProfilePanelProps {
  isOpen: boolean;
  onToggle: () => void;
  draft: ProfileDraft;
  onDraftChange: (patch: Partial<ProfileDraft>) => void;
  profiles: Profile[];
  activeProfileId: string | null;
  isDirty: boolean;
  onSelectProfile: (id: string) => void;
  onSaveProfile: () => void;
  onSaveAsProfile: () => void;
  onDeleteProfile: () => void;
  onRevertProfile: () => void;
  models: ModelInfo[];
  modelSlot: React.ReactNode;
  disabled?: boolean;
}

const NUMERIC_FIELDS: Array<{
  key: keyof GenParams;
  label: string;
  min: number;
  max: number;
  step: number;
  hint: string;
}> = [
  { key: 'maxNewTokens', label: 'Max new tokens', min: 16, max: 4096, step: 16, hint: 'Caption length ceiling' },
  { key: 'temperature', label: 'Temperature', min: 0, max: 2, step: 0.05, hint: 'Higher = more varied' },
  { key: 'topP', label: 'Top-p', min: 0, max: 1, step: 0.05, hint: 'Nucleus sampling' },
  { key: 'topK', label: 'Top-k', min: 0, max: 200, step: 1, hint: '0 disables' },
  { key: 'repetitionPenalty', label: 'Repetition penalty', min: 1, max: 2, step: 0.01, hint: '1.0 = off' },
];

export const ProfilePanel: React.FC<ProfilePanelProps> = ({
  isOpen,
  onToggle,
  draft,
  onDraftChange,
  profiles,
  activeProfileId,
  isDirty,
  onSelectProfile,
  onSaveProfile,
  onSaveAsProfile,
  onDeleteProfile,
  onRevertProfile,
  models,
  modelSlot,
  disabled,
}) => {
  const activeModel = models.find((m) => m.id === draft.modelId);
  const supportsFreePrompt = activeModel?.freePrompt !== false;

  const setParam = (key: keyof GenParams, value: number | boolean) =>
    onDraftChange({ params: { ...draft.params, [key]: value } as GenParams });

  return (
    <div className="bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <button
          onClick={onToggle}
          className="w-full py-3 flex items-center justify-between text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            <span>Profile &amp; instructions</span>
            <span className="text-xs text-slate-400">
              {profiles.find((p) => p.id === activeProfileId)?.name ?? 'Unsaved'}
              {isDirty && <span className="text-amber-600"> · unsaved changes</span>}
            </span>
          </div>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {isOpen && (
          <div className="pb-6">
            {/* Profile toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4 sm:items-end justify-between">
              <div className="w-full sm:max-w-sm">
                <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
                  Profile
                </label>
                <select
                  value={activeProfileId ?? ''}
                  onChange={(e) => onSelectProfile(e.target.value)}
                  disabled={disabled}
                  className="block w-full text-sm border border-slate-300 rounded-lg bg-slate-50 py-2 pl-3 pr-8 focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">— unsaved draft —</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={onSaveProfile}
                  disabled={disabled || !activeProfileId || !isDirty}
                  className="text-xs py-2"
                  title="Overwrite the selected profile"
                >
                  <Save className="w-3 h-3 mr-2" />
                  Save
                </Button>
                <Button variant="secondary" onClick={onSaveAsProfile} disabled={disabled} className="text-xs py-2">
                  <Save className="w-3 h-3 mr-2" />
                  Save as new
                </Button>
                <Button
                  variant="ghost"
                  onClick={onRevertProfile}
                  disabled={disabled || !activeProfileId || !isDirty}
                  className="text-xs py-2 text-slate-500"
                >
                  <Undo2 className="w-3 h-3 mr-2" />
                  Revert
                </Button>
                <Button
                  variant="ghost"
                  onClick={onDeleteProfile}
                  disabled={disabled || !activeProfileId}
                  className="text-xs py-2 text-red-500 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="w-3 h-3 mr-2" />
                  Delete
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Prompt */}
              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
                  Instruction prompt
                </label>
                <div className="relative">
                  <textarea
                    value={draft.prompt}
                    onChange={(e) => onDraftChange({ prompt: e.target.value })}
                    disabled={disabled || !supportsFreePrompt}
                    className="w-full h-64 p-4 text-sm text-slate-700 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono leading-relaxed disabled:opacity-50"
                    placeholder="Instructions for the captioner…"
                  />
                  <div className="absolute bottom-3 right-3">
                    <Button
                      variant="secondary"
                      onClick={() => onDraftChange({ prompt: DEFAULT_PROMPT })}
                      disabled={disabled || !supportsFreePrompt}
                      className="text-xs h-8 bg-white/90 backdrop-blur-sm"
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Reset default
                    </Button>
                  </div>
                </div>

                {!supportsFreePrompt && (
                  <p className="mt-2 text-xs text-slate-500">
                    {activeModel?.label} is task-token driven — the prompt above is ignored. Pick a
                    task instead.
                  </p>
                )}

                {activeModel && activeModel.tasks.length > 0 && (
                  <div className="mt-3">
                    <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
                      {activeModel.label} task
                    </label>
                    <select
                      value={draft.florenceTask ?? activeModel.defaultTask ?? ''}
                      onChange={(e) => onDraftChange({ florenceTask: e.target.value })}
                      disabled={disabled}
                      className="block w-full sm:w-72 text-sm font-mono border border-slate-300 rounded-lg bg-slate-50 py-2 pl-3 pr-8 focus:border-blue-500 focus:ring-blue-500"
                    >
                      {activeModel.tasks.map((task) => (
                        <option key={task} value={task}>
                          {task}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="mt-3">
                  <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
                    System prompt <span className="normal-case font-normal">(optional override)</span>
                  </label>
                  <textarea
                    value={draft.systemPrompt}
                    onChange={(e) => onDraftChange({ systemPrompt: e.target.value })}
                    disabled={disabled || !supportsFreePrompt}
                    rows={2}
                    className="w-full p-3 text-sm text-slate-700 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono disabled:opacity-50"
                    placeholder="Leave blank to use the model's default system prompt."
                  />
                </div>
              </div>

              {/* Model + params */}
              <div className="space-y-4">
                {modelSlot}

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                    <h3 className="text-sm font-semibold text-slate-800">Generation</h3>
                  </div>

                  <label className="flex items-center gap-2 mb-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={draft.params.greedy}
                      onChange={(e) => setParam('greedy', e.target.checked)}
                      disabled={disabled}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    Greedy decoding
                    <span className="text-xs text-slate-400">(deterministic, ignores sampling)</span>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    {NUMERIC_FIELDS.map((field) => {
                      const isSampling = field.key !== 'maxNewTokens';
                      return (
                        <div key={field.key}>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            {field.label}
                          </label>
                          <input
                            type="number"
                            value={draft.params[field.key] as number}
                            min={field.min}
                            max={field.max}
                            step={field.step}
                            disabled={disabled || (isSampling && draft.params.greedy)}
                            onChange={(e) => setParam(field.key, Number(e.target.value))}
                            className="w-full text-sm border border-slate-300 rounded-lg bg-slate-50 py-1.5 px-2 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 tabular-nums"
                            title={field.hint}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-400">
              Profiles — prompt, model, and generation settings together — are stored on this machine
              in <code className="font-mono">state/profiles.json</code>, not in browser storage.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
