import React, { useState, useEffect } from 'react';
import { UsersIcon, FileAudioIcon, SparklesIcon, LoaderIcon } from './Icons';
import { TranscriptionConfig, ModelOption, SplitMode } from '../types';

interface ConfigurationFormProps {
  file: File;
  onStart: (config: TranscriptionConfig) => void;
  onCancel: () => void;
}

// ── Models ────────────────────────────────────────────────────────────────────
// Source: https://ai.google.dev/gemini-api/docs/audio  (gemini-3-flash-preview
// is the model used in all official audio transcription code examples.)

const MODELS: ModelOption[] = [
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash Preview',
    badge: 'Recommended for Audio',
    badgeColor: 'green',
    audioSupport: 'confirmed',
  },
  {
    id: 'gemini-2.5-pro-preview-03-25',
    label: 'Gemini 2.5 Pro Preview',
    badge: 'High Quality',
    badgeColor: 'blue',
    audioSupport: 'confirmed',
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    badge: 'Fast & Cheap',
    badgeColor: 'slate',
    audioSupport: 'confirmed',
  },
  {
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro Preview',
    badge: '⚠ May not support audio',
    badgeColor: 'amber',
    audioSupport: 'unknown',
  },
];

const DEFAULT_MODEL = 'gemini-3-flash-preview';

const badgeClass = (color: string) => {
  switch (color) {
    case 'green':  return 'bg-green-100 text-green-700';
    case 'blue':   return 'bg-blue-100 text-blue-700';
    case 'amber':  return 'bg-amber-100 text-amber-700';
    default:       return 'bg-slate-100 text-slate-600';
  }
};

// ── Component ─────────────────────────────────────────────────────────────────

const ConfigurationForm: React.FC<ConfigurationFormProps> = ({ file, onStart, onCancel }) => {
  const [speakerCount, setSpeakerCount] = useState<number | 'auto'>('auto');
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL);
  const [splitMode, setSplitMode] = useState<SplitMode>('auto');
  const [analyzing, setAnalyzing] = useState(false);
  const [duration, setDuration] = useState<number>(0);
  const [inputTokens, setInputTokens] = useState<number>(0);
  const [outputTokens, setOutputTokens] = useState<number>(0);

  useEffect(() => {
    if (!file) return;
    const analyzeFile = async () => {
      setAnalyzing(true);
      try {
        const url = URL.createObjectURL(file);
        const audio = new Audio(url);
        await new Promise<void>((res, rej) => {
          audio.onloadedmetadata = () => res();
          audio.onerror = () => rej(new Error('Invalid audio file'));
        });
        const dur = audio.duration;
        setDuration(dur);
        setInputTokens(Math.ceil(dur * 25));
        setOutputTokens(Math.ceil(dur * 4));
        // Default to 'none' for short audio
        if (dur <= 15 * 60) setSplitMode('none');
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error('Could not analyze audio', e);
      } finally {
        setAnalyzing(false);
      }
    };
    analyzeFile();
  }, [file]);

  const isLongAudio = duration > 15 * 60;

  const handleStart = () => {
    onStart({
      speakerCount,
      model: selectedModel,
      splitMode: isLongAudio ? splitMode : 'none',
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens: outputTokens,
    });
  };

  const formatDur = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  const splitOptions: { id: SplitMode; label: string; desc: string; icon: string }[] = [
    {
      id: 'auto',
      label: 'Auto-detect',
      desc: 'Finds natural silence gaps and places split points automatically.',
      icon: '✦',
    },
    {
      id: 'manual',
      label: 'Manual Editor',
      desc: 'Open the waveform editor to place markers yourself.',
      icon: '✂',
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in zoom-in-95 duration-300">
      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">Review & Configure</h3>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-6 space-y-6">

        {/* File card */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-white border border-blue-100 flex items-center justify-center text-blue-600 shadow-sm flex-shrink-0">
              <FileAudioIcon className="w-6 h-6" />
            </div>
            <div className="flex-grow space-y-1 min-w-0">
              <h4 className="font-semibold text-slate-900 truncate">{file.name}</h4>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                <span className="bg-blue-100/50 px-2 py-0.5 rounded text-blue-800 font-medium">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </span>
                {analyzing ? (
                  <span className="flex items-center gap-1.5">
                    <LoaderIcon className="w-3 h-3 animate-spin" />Analyzing…
                  </span>
                ) : duration > 0 ? (
                  <>
                    <span>{formatDur(duration)}</span>
                    {isLongAudio && (
                      <span className="text-amber-600 font-medium">Long audio — splitting required</span>
                    )}
                  </>
                ) : null}
              </div>

              {!analyzing && duration > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2 bg-white/60 rounded-lg p-2 border border-blue-100">
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">Est. Input Tokens</span>
                    <span className="text-sm font-semibold text-slate-700 flex items-center gap-1">
                      <SparklesIcon className="w-3 h-3 text-purple-400" />{inputTokens.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex flex-col border-l border-blue-100 pl-2">
                    <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">Est. Output Tokens</span>
                    <span className="text-sm font-semibold text-slate-700 flex items-center gap-1">
                      <SparklesIcon className="w-3 h-3 text-emerald-400" />{outputTokens.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Splitting mode — only shown for long audio */}
        {!analyzing && isLongAudio && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">Splitting Mode</label>
            <div className="grid grid-cols-2 gap-2">
              {splitOptions.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setSplitMode(opt.id)}
                  className={`text-left px-4 py-3 rounded-lg border-2 transition-all ${
                    splitMode === opt.id
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">{opt.icon}</span>
                    <span className={`text-sm font-semibold ${splitMode === opt.id ? 'text-indigo-900' : 'text-slate-700'}`}>
                      {opt.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-snug">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Model selector */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">Transcription Model</label>
          <div className="grid gap-2">
            {MODELS.map(model => (
              <button
                key={model.id}
                onClick={() => setSelectedModel(model.id)}
                className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${
                  selectedModel === model.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${
                      selectedModel === model.id ? 'border-blue-500 bg-blue-500' : 'border-slate-300'
                    }`} />
                    <span className={`text-sm font-medium ${selectedModel === model.id ? 'text-blue-900' : 'text-slate-700'}`}>
                      {model.label}
                    </span>
                  </div>
                  {model.badge && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${badgeClass(model.badgeColor ?? 'slate')}`}>
                      {model.badge}
                    </span>
                  )}
                </div>
                {selectedModel === model.id && model.audioSupport === 'unknown' && (
                  <p className="mt-1.5 ml-6 text-xs text-amber-700">
                    This model may not support audio transcription. Prefer Gemini 3 Flash Preview.
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Speaker count */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">Number of Speakers</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
              <UsersIcon className="w-5 h-5" />
            </div>
            <select
              value={speakerCount}
              onChange={e => setSpeakerCount(e.target.value === 'auto' ? 'auto' : parseInt(e.target.value))}
              className="block w-full pl-10 pr-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            >
              <option value="auto">Auto Detect</option>
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <option key={n} value={n}>{n} Speaker{n > 1 ? 's' : ''}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="pt-2 flex gap-3">
          <button
            onClick={handleStart}
            disabled={analyzing}
            className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium py-2.5 px-4 rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {!isLongAudio
              ? 'Start Transcription →'
              : splitMode === 'auto'
              ? 'Auto-detect & Review →'
              : 'Open Audio Editor →'}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2.5 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
          >
            Cancel
          </button>
        </div>

      </div>
    </div>
  );
};

export default ConfigurationForm;
