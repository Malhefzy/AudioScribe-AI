import { SavedTranscriptionRun } from '../types';

const STORAGE_KEY = 'audioscribe:saved-runs:v1';
const MAX_SAVED_RUNS = 50;

const sortRuns = (runs: SavedTranscriptionRun[]) =>
  [...runs].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

const canUseLocalStorage = () => {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
};

export const loadSavedRuns = (): SavedTranscriptionRun[] => {
  if (!canUseLocalStorage()) return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return sortRuns(
      parsed.filter((run): run is SavedTranscriptionRun =>
        typeof run?.id === 'string' &&
        typeof run?.title === 'string' &&
        typeof run?.fileName === 'string' &&
        typeof run?.markdown === 'string' &&
        typeof run?.createdAt === 'string' &&
        typeof run?.updatedAt === 'string'
      ).map(run => ({ ...run, storesAudio: false as const })),
    );
  } catch (error) {
    console.warn('[AudioScribe] Could not load saved runs:', error);
    return [];
  }
};

export const persistSavedRuns = (runs: SavedTranscriptionRun[]) => {
  if (!canUseLocalStorage()) return;

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(sortRuns(runs).slice(0, MAX_SAVED_RUNS)),
    );
  } catch (error) {
    console.warn('[AudioScribe] Could not save run history:', error);
  }
};

export const createSavedRun = (input: {
  fileName: string;
  markdown: string;
  inputTokens?: number;
  outputTokens?: number;
}): SavedTranscriptionRun => {
  const now = new Date().toISOString();
  const title = input.fileName.trim() || 'Untitled transcript';

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    title,
    fileName: title,
    markdown: input.markdown,
    createdAt: now,
    updatedAt: now,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    storesAudio: false,
  };
};
