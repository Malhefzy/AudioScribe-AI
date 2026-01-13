export enum AppStatus {
  IDLE = 'IDLE',
  CONFIGURING = 'CONFIGURING',
  UPLOADING = 'UPLOADING',
  PROCESSING = 'PROCESSING', // Waiting for file to be ACTIVE
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

export interface TranscriptionConfig {
  speakerCount: number | 'auto';
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
}