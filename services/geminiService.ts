import { GoogleGenAI } from "@google/genai";
import { AudioChunk, ChunkProgress, ChunkStatus } from "../types";

const getAiClient = () => {
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  return new GoogleGenAI({ apiKey });
};

export const DEFAULT_MODEL = 'gemini-3-flash-preview';
const MAX_OUTPUT_TOKENS_PER_CALL = 65536;

const SYSTEM_INSTRUCTION =
  'You are a world-class transcriptionist for long-form audio. ' +
  'COMPLETENESS is your primary directive. Every output line MUST follow ' +
  '[MM:SS] **Speaker X**: <text> — no exceptions, from the very first line ' +
  'to the very last. Never summarise, skip, or truncate any section.';

// ─────────────────────────────────────────────────────────────────────────────
// Retry helper
// ─────────────────────────────────────────────────────────────────────────────

const withRetry = async <T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 4,
): Promise<T> => {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const msg: string = e?.message ?? '';
      const isTransient =
        msg.includes('500') || msg.includes('INTERNAL') ||
        msg.includes('503') || msg.includes('UNAVAILABLE') ||
        msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');

      if (!isTransient || attempt === maxAttempts) throw e;

      const delaySec = 3 * Math.pow(2, attempt - 1);
      console.warn(`[AudioScribe] ${label} — attempt ${attempt} failed. Retrying in ${delaySec}s…`);
      await new Promise(r => setTimeout(r, delaySec * 1000));
    }
  }
  throw lastErr;
};

// ─────────────────────────────────────────────────────────────────────────────
// Text helpers
// ─────────────────────────────────────────────────────────────────────────────

const offsetTimestamps = (text: string, offsetSeconds: number): string => {
  if (offsetSeconds === 0) return text;
  return text.replace(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g, (_, a, b, c) => {
    const total = (c !== undefined
      ? parseInt(a) * 3600 + parseInt(b) * 60 + parseInt(c)
      : parseInt(a) * 60 + parseInt(b)) + offsetSeconds;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const ss = Math.floor(total % 60);
    if (h > 0 || offsetSeconds >= 3600)
      return `[${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}]`;
    return `[${m}:${String(ss).padStart(2, '0')}]`;
  });
};

const lastFormattedLines = (text: string, n = 15): string =>
  text.split('\n').filter(l => /\[\d{1,2}:\d{2}(?::\d{2})?\]/.test(l)).slice(-n).join('\n');

const firstFormattedLines = (text: string, n = 15): string =>
  text.split('\n').filter(l => /\[\d{1,2}:\d{2}(?::\d{2})?\]/.test(l)).slice(0, n).join('\n');

const buildSpeakerRoster = (transcripts: string[]): string[] => {
  const nums = new Set<number>();
  for (const text of transcripts)
    for (const m of text.matchAll(/\*\*Speaker (\d+)\*\*/g))
      nums.add(parseInt(m[1], 10));
  return [...nums].sort((a, b) => a - b).map(n => `Speaker ${n}`);
};

/** Atomically remaps speaker labels using temp placeholders to avoid swap collisions. */
const applySpeakerMapping = (text: string, mapping: Record<string, string>): string => {
  const entries = Object.entries(mapping);
  if (!entries.length) return text;
  let result = text;
  entries.forEach(([from], i) => {
    result = result.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), `__SPKR_${i}__`);
  });
  entries.forEach(([, to], i) => {
    result = result.replace(new RegExp(`__SPKR_${i}__`, 'g'), to);
  });
  return result;
};

// ─────────────────────────────────────────────────────────────────────────────
// File API helpers
// ─────────────────────────────────────────────────────────────────────────────

export const uploadAudioFile = async (file: File): Promise<string> => {
  const ai = getAiClient();
  const result = await ai.files.upload({
    file,
    config: { displayName: file.name, mimeType: file.type },
  });
  if (!result.uri) throw new Error('Upload failed: no URI returned.');
  return result.uri;
};

export const waitForFileActive = async (fileUri: string): Promise<void> => {
  const ai = getAiClient();
  const nameMatch = fileUri.match(/files\/([a-z0-9]+)$/i);
  const name = nameMatch ? `files/${nameMatch[1]}` : fileUri;
  for (let attempt = 0; attempt < 60; attempt++) {
    const status = await ai.files.get({ name });
    if (status.state === 'ACTIVE') return;
    if (status.state === 'FAILED') throw new Error('File processing failed on Gemini servers.');
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('File processing timed out.');
};

const deleteFile = async (fileUri: string): Promise<void> => {
  try {
    const ai = getAiClient();
    const m = fileUri.match(/files\/([a-zA-Z0-9]+)$/);
    if (m) await ai.files.delete({ name: `files/${m[1]}` });
  } catch (e) {
    console.warn('[AudioScribe] Could not delete file:', e);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Single-chunk transcription
// ─────────────────────────────────────────────────────────────────────────────

const transcribeSingleChunk = async (
  modelName: string,
  fileUri: string,
  mimeType: string,
  chunkNum: number,
  totalChunks: number,
  prevTranscripts: string[],
  speakerCount?: number,
): Promise<string> => {
  const ai = getAiClient();

  const speakerLine = speakerCount
    ? `There are exactly ${speakerCount} distinct speakers in the full recording. Use one of the ${speakerCount} **Speaker X** labels for every turn.`
    : `Identify every unique voice. Assign a consistent **Speaker X** label to each distinct person.`;

  let contextBlock = '';
  if (prevTranscripts.length > 0) {
    const roster = buildSpeakerRoster(prevTranscripts);
    const tailLines = lastFormattedLines(prevTranscripts[prevTranscripts.length - 1], 15);
    contextBlock = `
── SPEAKER ROSTER (LOCKED — do NOT reassign these numbers) ──
Established speakers: ${roster.join(', ')}
These labels refer to specific physical voices already identified.

── LAST LINES OF PREVIOUS SEGMENT ──
${tailLines}
─────────────────────────────────────
`;
  }

  const prompt = `
This is audio chunk ${chunkNum} of ${totalChunks}.
${contextBlock}
Transcribe verbatim from start to finish. Do NOT skip or summarise.

Rules (every single line):
• FORMAT: [MM:SS] **Speaker X**: [transcript]
• Timestamps start from 00:00 for THIS chunk.
• New speaker turn → new line.
• Language: auto-detect, transcribe as-is, DO NOT translate.
• Non-speech: *[laughter]*, *[long pause]*, etc.
• ${speakerLine}
${prevTranscripts.length > 0 ? '• CRITICAL: Speaker numbers above are FIXED — never reassign them.' : ''}
`.trim();

  const response = await withRetry(
    () => ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ fileData: { mimeType, fileUri } }, { text: prompt }] }],
      config: { temperature: 0.1, maxOutputTokens: MAX_OUTPUT_TOKENS_PER_CALL, systemInstruction: SYSTEM_INSTRUCTION },
    }),
    `transcribe chunk ${chunkNum}/${totalChunks}`,
  );
  return response.text ?? '';
};

// ─────────────────────────────────────────────────────────────────────────────
// Speaker reconciliation (text-only, cheap)
// ─────────────────────────────────────────────────────────────────────────────

const reconcileChunkSpeakers = async (
  modelName: string,
  prevTail: string,
  nextText: string,
): Promise<string> => {
  const ai = getAiClient();
  const nextHead = firstFormattedLines(nextText, 20);
  const prompt = `
Two consecutive transcript segments. Check speaker-label consistency at the boundary.

SEGMENT A — final lines (reference):
${prevTail}

SEGMENT B — first lines (may need relabelling):
${nextHead}

If labels in B are inconsistent with A (e.g. same person labelled differently), output a JSON
remapping for B only: {"Speaker 1": "Speaker 2", "Speaker 2": "Speaker 1"}
If already consistent output: {}
Output ONLY the raw JSON on one line. No explanation.
`.trim();

  try {
    const resp = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0, maxOutputTokens: 256 },
    });
    const raw = (resp.text ?? '{}').trim();
    const match = raw.match(/\{[^}]*\}/);
    if (!match) return nextText;
    const mapping: Record<string, string> = JSON.parse(match[0]);
    if (!Object.keys(mapping).length) return nextText;
    console.log('[AudioScribe] Reconciliation mapping:', mapping);
    return applySpeakerMapping(nextText, mapping);
  } catch (e) {
    console.warn('[AudioScribe] Reconciliation skipped:', e);
    return nextText;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Exported building blocks (used by retry flow in App.tsx)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Applies timestamp offsets + runs the speaker-reconciliation pass across all
 * raw (relative-timestamp) chunk transcripts. Returns the merged string.
 *
 * `onChunkStatus` is called with ('reconciling' | 'done') for each chunk so
 * the caller can update UI progress state.
 */
export const reconcileTranscripts = async (
  rawTranscripts: string[],
  chunks: AudioChunk[],
  modelName: string,
  onChunkStatus: (index: number, status: ChunkStatus) => void,
): Promise<string> => {
  if (rawTranscripts.length === 1) {
    return offsetTimestamps(rawTranscripts[0], chunks[0].startTime);
  }

  const absolute = rawTranscripts.map((t, i) => offsetTimestamps(t, chunks[i].startTime));

  for (let i = 1; i < chunks.length; i++) onChunkStatus(i, 'reconciling');

  const reconciled: string[] = [absolute[0]];
  for (let i = 1; i < absolute.length; i++) {
    const prevTail = lastFormattedLines(reconciled[i - 1], 15);
    const corrected = await reconcileChunkSpeakers(modelName, prevTail, absolute[i]);
    reconciled.push(corrected);
    onChunkStatus(i, 'done');
  }

  return reconciled.join('\n\n');
};

/**
 * Re-transcribes a single chunk: upload → wait for ACTIVE → transcribe → delete.
 * `onStatus` is called at each lifecycle stage so the caller can update the UI.
 * Returns the raw (relative-timestamp) transcript text on success.
 */
export const retranscribeChunk = async (
  chunk: AudioChunk,
  totalChunks: number,
  modelName: string,
  speakerCount: number | undefined,
  prevRawTranscripts: string[],
  onStatus: (status: ChunkStatus, error?: string) => void,
): Promise<string> => {
  onStatus('uploading');
  let fileUri: string;
  try {
    fileUri = await withRetry(() => uploadAudioFile(chunk.file), `upload chunk ${chunk.index + 1}`);
  } catch (err: any) {
    onStatus('failed', err?.message ?? 'Upload failed');
    throw err;
  }

  onStatus('processing');
  try {
    await waitForFileActive(fileUri);
  } catch (err: any) {
    onStatus('failed', err?.message ?? 'File processing failed');
    await deleteFile(fileUri);
    throw err;
  }

  onStatus('transcribing');
  let rawText: string;
  try {
    rawText = await transcribeSingleChunk(
      modelName, fileUri, 'audio/wav',
      chunk.index + 1, totalChunks,
      prevRawTranscripts,
      speakerCount,
    );
  } catch (err: any) {
    onStatus('failed', err?.message ?? 'Transcription failed');
    await deleteFile(fileUri);
    throw err;
  }

  await deleteFile(fileUri);
  return rawText;
};

// ─────────────────────────────────────────────────────────────────────────────
// Chunked transcription pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transcribes chunks with two key improvements over a naive sequential loop:
 *
 * PIPELINE  — While chunk N is being transcribed, chunk N+1 is already uploading
 *   in the background. By the time N finishes, N+1 is usually ready to transcribe
 *   immediately with no waiting. Upload dead-time is eliminated.
 *
 * RESUME    — Each chunk's raw transcript is saved to `savedProgress` via the
 *   `onChunkUpdate` callback as soon as it completes. If the session fails mid-way,
 *   the caller can pass the same progress array back in and only the failed/pending
 *   chunks will be re-processed.
 */
export const transcribeChunks = async (
  chunks: AudioChunk[],
  modelName: string = DEFAULT_MODEL,
  speakerCount: number | undefined,
  savedProgress: ChunkProgress[],
  onChunkUpdate: (progress: ChunkProgress[]) => void,
): Promise<{ text: string; usageMetadata: any }> => {

  console.log(`[AudioScribe] model=${modelName} | chunks=${chunks.length}`);

  // ── Initialise progress state from any saved progress ─────────────────────
  const progress: ChunkProgress[] = chunks.map((chunk, i) => {
    const saved = savedProgress.find(p => p.index === i);
    if (saved?.status === 'done' && saved.transcript) return { ...saved };
    return { index: i, startTime: chunk.startTime, endTime: chunk.endTime, status: 'pending' };
  });

  const push = (i: number, patch: Partial<ChunkProgress>) => {
    progress[i] = { ...progress[i], ...patch };
    onChunkUpdate([...progress]);
  };

  // Raw transcripts (relative timestamps) — restored from saved progress where available
  const rawResults: (string | null)[] = progress.map(p =>
    p.status === 'done' && p.transcript ? p.transcript : null
  );

  const firstIncomplete = rawResults.findIndex(r => r === null);
  if (firstIncomplete === -1) {
    // All chunks already done — skip straight to reconciliation
    console.log('[AudioScribe] All chunks already transcribed — resuming at reconciliation.');
  }

  // ── Pipeline upload pool ───────────────────────────────────────────────────
  // Maps chunk index → Promise<fileUri> (already active on Gemini when resolved).
  // Uploads start early so they overlap with transcription of the previous chunk.
  const uploadPool = new Map<number, Promise<string>>();
  // Track uploaded URIs for cleanup on failure
  const uploadedUris = new Map<number, string>();

  const startUpload = (i: number): Promise<string> => {
    if (uploadPool.has(i)) return uploadPool.get(i)!;
    const p = (async () => {
      push(i, { status: 'uploading' });
      const uri = await withRetry(() => uploadAudioFile(chunks[i].file), `upload chunk ${i + 1}`);
      uploadedUris.set(i, uri);
      push(i, { status: 'processing' });
      await waitForFileActive(uri);
      return uri;
    })();
    uploadPool.set(i, p);
    return p;
  };

  // Pre-warm: start uploading the first two pending chunks right away
  if (firstIncomplete >= 0) {
    startUpload(firstIncomplete);
    if (firstIncomplete + 1 < chunks.length && rawResults[firstIncomplete + 1] === null) {
      startUpload(firstIncomplete + 1);
    }
  }

  // ── Phase 1: Transcription loop ───────────────────────────────────────────
  try {
    for (let i = 0; i < chunks.length; i++) {
      if (rawResults[i] !== null) {
        // Already done (from saved progress) — restore status so UI reflects it
        push(i, { status: 'done', transcript: rawResults[i]! });
        continue;
      }

      // Ensure this chunk's upload is in flight
      const fileUriPromise = startUpload(i);

      // While waiting for the upload, pre-warm the NEXT chunk's upload
      const nextIdx = i + 1;
      if (nextIdx < chunks.length && rawResults[nextIdx] === null) {
        startUpload(nextIdx);
      }

      // Wait for upload + ACTIVE
      let fileUri: string;
      try {
        fileUri = await fileUriPromise;
      } catch (uploadErr: any) {
        push(i, { status: 'failed', error: uploadErr?.message ?? 'Upload failed' });
        throw uploadErr;
      }

      // Transcribe
      push(i, { status: 'transcribing' });
      let rawText: string;
      try {
        rawText = await transcribeSingleChunk(
          modelName, fileUri, 'audio/wav', i + 1, chunks.length,
          rawResults.slice(0, i).filter((r): r is string => r !== null),
          speakerCount,
        );
      } catch (txErr: any) {
        push(i, { status: 'failed', error: txErr?.message ?? 'Transcription failed' });
        await deleteFile(fileUri);
        throw txErr;
      }

      rawResults[i] = rawText;
      // Save raw transcript immediately so resume can use it
      push(i, { status: 'done', transcript: rawText });
      await deleteFile(fileUri);
    }
  } catch (err) {
    // Cleanup any uploaded-but-not-yet-transcribed files
    for (const [idx, uri] of uploadedUris.entries()) {
      if (rawResults[idx] === null) deleteFile(uri).catch(() => {});
    }
    throw err;
  }

  // ── Phase 2: Speaker reconciliation (text-only) ───────────────────────────
  return {
    text: await reconcileTranscripts(
      rawResults as string[],
      chunks,
      modelName,
      (i, s) => push(i, { status: s }),
    ),
    usageMetadata: {},
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Legacy single-file path (short audio, no splitting)
// ─────────────────────────────────────────────────────────────────────────────

export const transcribeAudio = async (
  fileUri: string,
  mimeType: string,
  modelName: string = DEFAULT_MODEL,
  speakerCount?: number,
  onProgress?: (msg: string) => void,
) => {
  const ai = getAiClient();
  const speakerLine = speakerCount
    ? `There are exactly ${speakerCount} distinct speakers.`
    : `Identify every unique voice and assign a consistent Speaker label.`;

  onProgress?.('Transcribing audio…');
  const response = await ai.models.generateContent({
    model: modelName,
    contents: [{ role: 'user', parts: [{ fileData: { mimeType, fileUri } }, { text: `
      Transcribe the audio verbatim with speaker diarisation. ENTIRE audio, first to last second.
      • FORMAT: [MM:SS] **Speaker X**: [content]
      • New speaker turn → new line.
      • Language: auto-detect, DO NOT translate.
      • ${speakerLine}
      Begin at 00:00.
    `.trim() }] }],
    config: { temperature: 0.1, maxOutputTokens: MAX_OUTPUT_TOKENS_PER_CALL, systemInstruction: SYSTEM_INSTRUCTION },
  });
  return { text: response.text ?? 'No transcription generated.', usageMetadata: response.usageMetadata };
};
