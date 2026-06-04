import React, { useMemo, useState } from 'react';
import {
  buildSegmentPreview,
  buildSpeakerRoster,
  extractSpeakersFromTranscript,
  normalizeSpeakerMapping,
} from '../services/transcriptUtils';

interface SegmentSpeakerEditorProps {
  chunkIndex: number;
  startTime: number;
  endTime: number;
  transcript: string;
  allTranscripts: string[];
  mergedTranscription?: string;
  onApply: (index: number, mapping: Record<string, string>) => void;
  onCancel: () => void;
  isApplying?: boolean;
}

const formatTime = (secs: number): string => {
  const s = Math.floor(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${m}:${String(ss).padStart(2, '0')}`;
};

const SegmentSpeakerEditor: React.FC<SegmentSpeakerEditorProps> = ({
  chunkIndex,
  startTime,
  endTime,
  transcript,
  allTranscripts,
  mergedTranscription,
  onApply,
  onCancel,
  isApplying = false,
}) => {
  const segmentSpeakers = useMemo(() => extractSpeakersFromTranscript(transcript), [transcript]);
  const roster = useMemo(() => buildSpeakerRoster(allTranscripts), [allTranscripts]);

  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(segmentSpeakers.map(s => [s, s])),
  );

  const activeMapping = normalizeSpeakerMapping(draft);
  const hasChanges = Object.keys(activeMapping).length > 0;
  const preview = useMemo(
    () => buildSegmentPreview(transcript, startTime, endTime, {
      mergedTranscription: hasChanges ? undefined : mergedTranscription,
      mapping: hasChanges ? activeMapping : undefined,
    }),
    [transcript, startTime, endTime, mergedTranscription, activeMapping, hasChanges],
  );

  if (segmentSpeakers.length === 0) {
    return (
      <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 text-sm text-slate-500">
        No speaker labels found in this segment.
      </div>
    );
  }

  return (
    <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 space-y-4">
      <div>
        <p className="text-sm font-medium text-slate-800">Fix speaker labels</p>
        <p className="text-xs text-slate-500 mt-1">
          Remap speakers in segment {chunkIndex + 1} ({formatTime(startTime)} – {formatTime(endTime)}).
          Use this when automatic alignment picked the wrong voice.
        </p>
      </div>

      <div className="space-y-2">
        {segmentSpeakers.map(speaker => (
          <div key={speaker} className="flex items-center gap-3">
            <span className="w-24 text-sm font-medium text-slate-700 flex-shrink-0">{speaker}</span>
            <span className="text-slate-400 text-sm">→</span>
            <select
              value={draft[speaker] ?? speaker}
              onChange={e => setDraft(prev => ({ ...prev, [speaker]: e.target.value }))}
              disabled={isApplying}
              className="flex-1 text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {roster.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {preview.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
            Preview · {formatTime(startTime)} – {formatTime(endTime)}
            {hasChanges && <span className="normal-case text-violet-600 ml-1">(with your changes)</span>}
          </p>
          <div className="space-y-1">
            {preview.map((line, i) => (
              <p key={i} className="text-xs text-slate-600 font-mono truncate">{line}</p>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={isApplying}
          className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onApply(chunkIndex, activeMapping)}
          disabled={!hasChanges || isApplying}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isApplying ? 'Applying…' : 'Apply to segment'}
        </button>
      </div>
    </div>
  );
};

export default SegmentSpeakerEditor;
