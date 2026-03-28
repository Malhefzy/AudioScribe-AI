export enum AppStatus {
  IDLE = 'IDLE',
  CONFIGURING = 'CONFIGURING',
  EDITING = 'EDITING',          // User places markers in the audio editor
  UPLOADING = 'UPLOADING',
  PROCESSING = 'PROCESSING',    // Waiting for file to be ACTIVE
  TRANSCRIBING = 'TRANSCRIBING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface TranscriptionResult {
  text: string;
  fileUri?: string;
  fileName?: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export type SplitMode = 'none' | 'auto' | 'manual';

export interface TranscriptionConfig {
  speakerCount: number | 'auto';
  model: string;
  splitMode: SplitMode;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
}

export interface ModelOption {
  id: string;
  label: string;
  badge?: string;
  badgeColor?: string;
  audioSupport: 'confirmed' | 'limited' | 'unknown';
}

export interface AudioChunk {
  file: File;
  startTime: number; // seconds in the original audio
  endTime: number;
  index: number;
}

/** Lifecycle state of a single audio chunk through the pipeline. */
export type ChunkStatus =
  | 'pending'       // not yet started
  | 'uploading'     // file upload in progress
  | 'processing'    // uploaded, waiting for Gemini to mark it ACTIVE
  | 'transcribing'  // transcription API call in progress
  | 'reconciling'   // post-processing speaker-label reconciliation
  | 'done'          // fully complete
  | 'failed';       // unrecoverable error on this chunk

/** Per-chunk progress record — persisted in App state for resume. */
export interface ChunkProgress {
  index: number;
  startTime: number;
  endTime: number;
  status: ChunkStatus;
  error?: string;
  /** Raw transcript (relative timestamps). Set when status === 'done'. Used for resume. */
  transcript?: string;
}

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}
