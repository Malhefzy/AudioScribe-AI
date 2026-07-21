import React, { useState } from 'react';
import { DeleteIcon, FileAudioIcon, PencilIcon } from './Icons';
import { SavedTranscriptionRun } from '../types';

interface SavedRunsSidebarProps {
  runs: SavedTranscriptionRun[];
  activeRunId: string | null;
  onSelectRun: (run: SavedTranscriptionRun) => void;
  onRenameRun: (id: string, title: string) => void;
  onDeleteRun: (id: string) => void;
}

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

const SavedRunsSidebar: React.FC<SavedRunsSidebarProps> = ({
  runs,
  activeRunId,
  onSelectRun,
  onRenameRun,
  onDeleteRun,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

  const startEditing = (run: SavedTranscriptionRun) => {
    setEditingId(run.id);
    setDraftTitle(run.title);
  };

  const finishEditing = () => {
    if (!editingId) return;
    onRenameRun(editingId, draftTitle);
    setEditingId(null);
    setDraftTitle('');
  };

  return (
    <aside className="bg-white border-r border-slate-200 lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] overflow-hidden flex flex-col">
      <div className="px-4 py-5 border-b border-slate-100">
        <div className="flex items-center gap-2 text-slate-900 font-semibold">
          <FileAudioIcon className="w-5 h-5 text-blue-600" />
          <h2>Previous Runs</h2>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Saved in this browser. Only markdown output is stored; split audio and audio chunks are not saved.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {runs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
            <p className="text-sm font-medium text-slate-600">No saved runs yet</p>
            <p className="mt-1 text-xs text-slate-500">
              Completed transcripts will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map(run => {
              const isActive = run.id === activeRunId;
              const isEditing = run.id === editingId;

              return (
                <div
                  key={run.id}
                  className={`rounded-xl border transition-all ${
                    isActive
                      ? 'border-blue-200 bg-blue-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {isEditing ? (
                    <div className="p-3 space-y-2">
                      <input
                        value={draftTitle}
                        onChange={(event) => setDraftTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') finishEditing();
                          if (event.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                        className="w-full rounded-lg border border-blue-200 px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={finishEditing}
                          className="flex-1 rounded-lg bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => onSelectRun(run)}
                      className="w-full text-left p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold text-slate-800">{run.title}</h3>
                          <p className="mt-1 text-xs text-slate-500">{formatDate(run.updatedAt)}</p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                          Markdown
                        </span>
                      </div>
                    </button>
                  )}

                  {!isEditing && (
                    <div className="flex items-center justify-between border-t border-slate-100 px-2 py-1.5">
                      <button
                        onClick={() => startEditing(run)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-800"
                      >
                        <PencilIcon className="w-3 h-3" />
                        Rename
                      </button>
                      <button
                        onClick={() => onDeleteRun(run.id)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-700"
                      >
                        <DeleteIcon className="w-3 h-3" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};

export default SavedRunsSidebar;
