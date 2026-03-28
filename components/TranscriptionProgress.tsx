import React from 'react';
import { ChunkProgress, ChunkStatus } from '../types';

interface TranscriptionProgressProps {
  progress: ChunkProgress[];
  fileName?: string;
  title?: string;
  onRetry?: (index: number) => void;
  retryingIndex?: number | null;
}

const statusConfig: Record<ChunkStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending: {
    label: 'Pending',
    color: 'text-slate-400',
    icon: (
      <span className="w-5 h-5 flex items-center justify-center rounded-full border-2 border-slate-200">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
      </span>
    ),
  },
  uploading: {
    label: 'Uploading',
    color: 'text-blue-600',
    icon: (
      <span className="w-5 h-5 flex items-center justify-center text-blue-500">
        <svg className="w-4 h-4 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 0L8 8m4-4l4 4" />
        </svg>
      </span>
    ),
  },
  processing: {
    label: 'Processing',
    color: 'text-blue-500',
    icon: (
      <span className="w-5 h-5 flex items-center justify-center">
        <svg className="w-4 h-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
        </svg>
      </span>
    ),
  },
  transcribing: {
    label: 'Transcribing',
    color: 'text-indigo-600',
    icon: (
      <span className="w-5 h-5 flex items-center justify-center">
        <svg className="w-4 h-4 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </span>
    ),
  },
  reconciling: {
    label: 'Aligning speakers',
    color: 'text-violet-600',
    icon: (
      <span className="w-5 h-5 flex items-center justify-center">
        <svg className="w-4 h-4 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </span>
    ),
  },
  done: {
    label: 'Done',
    color: 'text-green-600',
    icon: (
      <span className="w-5 h-5 flex items-center justify-center rounded-full bg-green-100">
        <svg className="w-3 h-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
    ),
  },
  failed: {
    label: 'Failed',
    color: 'text-red-600',
    icon: (
      <span className="w-5 h-5 flex items-center justify-center rounded-full bg-red-100">
        <svg className="w-3 h-3 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </span>
    ),
  },
};

const formatTime = (secs: number): string => {
  const s = Math.floor(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${m}:${String(ss).padStart(2, '0')}`;
};

const formatDuration = (secs: number): string => {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
};

const firstTranscriptLine = (text: string): string => {
  const line = text.split('\n').find(l => /\[\d{1,2}:\d{2}(?::\d{2})?\]/.test(l));
  if (!line) return '';
  return line.replace(/^\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/, '').trim();
};

const TranscriptionProgress: React.FC<TranscriptionProgressProps> = ({
  progress, fileName, title, onRetry, retryingIndex,
}) => {
  const total = progress.length;
  const done = progress.filter(p => p.status === 'done').length;
  const failed = progress.filter(p => p.status === 'failed');
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const activeChunk = progress.find(p =>
    p.status === 'transcribing' || p.status === 'reconciling'
  );
  const uploadingChunk = progress.find(p =>
    p.status === 'uploading' || p.status === 'processing'
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-300">

      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-800">{title ?? 'Transcribing Audio'}</h3>
            {fileName && (
              <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{fileName}</p>
            )}
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-slate-800">{pct}%</span>
            <p className="text-xs text-slate-400">{done} / {total} segments</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Active operation pill */}
        {(activeChunk || uploadingChunk) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {activeChunk && (
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                activeChunk.status === 'reconciling'
                  ? 'bg-violet-50 text-violet-700 border border-violet-100'
                  : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
              }`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                {activeChunk.status === 'reconciling' ? 'Aligning speaker labels' : `Transcribing segment ${activeChunk.index + 1}`}
              </span>
            )}
            {uploadingChunk && uploadingChunk.index !== activeChunk?.index && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                Pre-loading segment {uploadingChunk.index + 1}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Chunk table */}
      <div className="divide-y divide-slate-50">
        {progress.map((chunk) => {
          const cfg = statusConfig[chunk.status];
          const isActive = chunk.status === 'transcribing' || chunk.status === 'reconciling';
          const isPreloading = chunk.status === 'uploading' || chunk.status === 'processing';

          return (
            <div
              key={chunk.index}
              className={`flex items-center gap-4 px-6 py-3 transition-colors ${
                isActive ? 'bg-indigo-50/60' :
                isPreloading ? 'bg-blue-50/40' :
                chunk.status === 'failed' ? 'bg-red-50/60' :
                chunk.status === 'done' ? '' : ''
              }`}
            >
              {/* Status icon */}
              <div className="flex-shrink-0">{cfg.icon}</div>

              {/* Segment info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">
                    Segment {chunk.index + 1}
                  </span>
                  {isPreloading && (
                    <span className="text-xs text-blue-500 font-medium">↑ pre-loading</span>
                  )}
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5">
                  {formatTime(chunk.startTime)} – {formatTime(chunk.endTime)}
                  <span className="ml-2 text-slate-300">·</span>
                  <span className="ml-2">{formatDuration(chunk.endTime - chunk.startTime)}</span>
                </div>
                {chunk.status === 'done' && chunk.transcript && onRetry && (
                  <p className="text-xs text-slate-400 mt-0.5 truncate max-w-sm">
                    {firstTranscriptLine(chunk.transcript)}
                  </p>
                )}
                {chunk.status === 'failed' && chunk.error && (
                  <p className="text-xs text-red-500 mt-1 truncate">{chunk.error}</p>
                )}
              </div>

              {/* Status label / retry button */}
              <div className="flex-shrink-0">
                {onRetry && chunk.status === 'done' ? (
                  <button
                    onClick={() => onRetry(chunk.index)}
                    disabled={retryingIndex !== null}
                    title="Re-run this segment"
                    className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Re-run
                  </button>
                ) : (
                  <div className={`text-xs font-medium ${cfg.color}`}>
                    {cfg.label}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Failed summary */}
      {failed.length > 0 && (
        <div className="px-6 py-4 bg-red-50 border-t border-red-100">
          <p className="text-sm text-red-700 font-medium">
            {failed.length} segment{failed.length > 1 ? 's' : ''} failed.
            {done > 0 && ` ${done} segment${done > 1 ? 's' : ''} completed — progress is saved.`}
          </p>
        </div>
      )}
    </div>
  );
};

export default TranscriptionProgress;
