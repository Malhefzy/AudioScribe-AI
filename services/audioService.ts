import { AudioChunk } from '../types';

// Maximum segment duration enforced in the editor (15 minutes)
export const MAX_SEGMENT_SECONDS = 15 * 60;

// ─────────────────────────────────────────────────────────────────────────────
// Audio decoding
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decodes an audio File into an AudioBuffer.
 * The returned context is closed to free resources; only the buffer is kept.
 */
export const decodeAudioFile = async (file: File): Promise<AudioBuffer> => {
  const arrayBuffer = await file.arrayBuffer();
  const ctx = new AudioContext();
  try {
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    await ctx.close();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Waveform extraction for visualisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Condenses an AudioBuffer down to `numPoints` peak-amplitude values (0–1).
 * Uses only the first channel; suitable for waveform display.
 */
export const extractWaveform = (buffer: AudioBuffer, numPoints: number): Float32Array => {
  const data = buffer.getChannelData(0);
  const samplesPerPoint = Math.floor(data.length / numPoints);
  const waveform = new Float32Array(numPoints);

  for (let i = 0; i < numPoints; i++) {
    let peak = 0;
    const start = i * samplesPerPoint;
    const end = Math.min(start + samplesPerPoint, data.length);
    for (let j = start; j < end; j++) {
      const abs = Math.abs(data[j]);
      if (abs > peak) peak = abs;
    }
    waveform[i] = peak;
  }

  // Normalise to 0–1
  let max = 0;
  for (let i = 0; i < waveform.length; i++) if (waveform[i] > max) max = waveform[i];
  if (max > 0) for (let i = 0; i < waveform.length; i++) waveform[i] /= max;

  return waveform;
};

// ─────────────────────────────────────────────────────────────────────────────
// WAV encoding
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encodes a (mono) AudioBuffer as a PCM WAV Blob.
 * Input must already be downsampled to the desired target rate.
 */
const encodeWAV = (buffer: AudioBuffer): Blob => {
  const sampleRate = buffer.sampleRate;
  const numChannels = 1;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const data = buffer.getChannelData(0);
  const numSamples = data.length;
  const dataSize = numSamples * bytesPerSample;

  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);

  const str = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  str(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);                          // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bitDepth, true);
  str(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(offset, s < 0 ? s * 32768 : s * 32767, true);
    offset += 2;
  }

  return new Blob([ab], { type: 'audio/wav' });
};

// ─────────────────────────────────────────────────────────────────────────────
// Chunk splitting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Splits a decoded AudioBuffer at the given marker timestamps and returns one
 * AudioChunk per segment. Each chunk is re-encoded as 16 kHz mono WAV to keep
 * upload sizes small (≈1.9 MB/min) while preserving speech quality.
 *
 * @param audioBuffer  The full decoded audio (from decodeAudioFile)
 * @param markerTimes  Sorted split-point timestamps in seconds
 * @param onProgress   Optional callback with 0–100 progress percentage
 */
export const splitAudioIntoChunks = async (
  audioBuffer: AudioBuffer,
  markerTimes: number[],
  onProgress?: (pct: number) => void,
): Promise<AudioChunk[]> => {
  const TARGET_SR = 16_000; // 16 kHz is standard for speech recognition
  const sorted = [...markerTimes].sort((a, b) => a - b);
  const boundaries = [0, ...sorted, audioBuffer.duration];
  const chunks: AudioChunk[] = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const startTime = boundaries[i];
    const endTime = boundaries[i + 1];

    // Slice the raw sample range from the source buffer
    const startSample = Math.floor(startTime * audioBuffer.sampleRate);
    const endSample = Math.min(
      Math.ceil(endTime * audioBuffer.sampleRate),
      audioBuffer.length,
    );
    const chunkLen = endSample - startSample;

    // Build a temporary AudioBuffer at the source sample rate
    const srcBuf = new AudioBuffer({
      length: chunkLen,
      numberOfChannels: audioBuffer.numberOfChannels,
      sampleRate: audioBuffer.sampleRate,
    });
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      srcBuf.copyToChannel(
        audioBuffer.getChannelData(ch).slice(startSample, endSample),
        ch,
      );
    }

    // Resample to 16 kHz mono via OfflineAudioContext
    const resampledLen = Math.ceil(chunkLen * (TARGET_SR / audioBuffer.sampleRate));
    const offCtx = new OfflineAudioContext(1, resampledLen, TARGET_SR);
    const src = offCtx.createBufferSource();
    src.buffer = srcBuf;
    src.connect(offCtx.destination);
    src.start(0);
    const resampled = await offCtx.startRendering();

    // Encode to WAV
    const wavBlob = encodeWAV(resampled);
    const chunkFile = new File(
      [wavBlob],
      `chunk_${i + 1}_of_${boundaries.length - 1}.wav`,
      { type: 'audio/wav' },
    );

    chunks.push({ file: chunkFile, startTime, endTime, index: i });
    onProgress?.(Math.round(((i + 1) / (boundaries.length - 1)) * 100));
  }

  return chunks;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Formats seconds as M:SS or H:MM:SS */
export const formatTime = (secs: number): string => {
  const s = Math.floor(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${m}:${String(ss).padStart(2, '0')}`;
};

/** Formats seconds as a human-readable duration string (e.g. "14m 32s") */
export const formatDuration = (secs: number): string => {
  const s = Math.floor(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}h ${m}m ${ss}s`;
  if (m > 0) return `${m}m ${ss}s`;
  return `${ss}s`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Silence detection & automatic split-point detection
// ─────────────────────────────────────────────────────────────────────────────

export interface SilenceRegion {
  start: number;    // seconds
  end: number;      // seconds
  duration: number; // seconds
  center: number;   // midpoint — ideal cut position
}

/**
 * Scans an AudioBuffer for regions of near-silence.
 * Uses RMS energy measured over 50 ms windows.
 *
 * @param threshold  RMS amplitude below which audio is considered silent (0–1).
 *                   Typical speech is 0.05–0.3; background hum ≈ 0.005–0.02.
 * @param minDuration  Minimum silence length in seconds to be returned as a region.
 */
export const detectSilenceRegions = (
  buffer: AudioBuffer,
  options: { threshold?: number; minDuration?: number; windowMs?: number } = {},
): SilenceRegion[] => {
  const { threshold = 0.015, minDuration = 0.3, windowMs = 50 } = options;
  const sr = buffer.sampleRate;
  const winSamples = Math.floor(sr * windowMs / 1000);

  // Mix all channels to mono
  const numCh = buffer.numberOfChannels;
  const mixed = new Float32Array(buffer.length);
  for (let ch = 0; ch < numCh; ch++) {
    const ch_data = buffer.getChannelData(ch);
    for (let i = 0; i < buffer.length; i++) mixed[i] += ch_data[i] / numCh;
  }

  const regions: SilenceRegion[] = [];
  let silStart: number | null = null;
  const totalWindows = Math.floor(mixed.length / winSamples);

  for (let w = 0; w < totalWindows; w++) {
    let sum = 0;
    const s0 = w * winSamples;
    const s1 = Math.min(s0 + winSamples, mixed.length);
    for (let j = s0; j < s1; j++) sum += mixed[j] * mixed[j];
    const rms = Math.sqrt(sum / (s1 - s0));
    const tSec = s0 / sr;

    if (rms < threshold) {
      if (silStart === null) silStart = tSec;
    } else {
      if (silStart !== null) {
        const dur = tSec - silStart;
        if (dur >= minDuration) {
          regions.push({ start: silStart, end: tSec, duration: dur, center: (silStart + tSec) / 2 });
        }
        silStart = null;
      }
    }
  }

  // Handle trailing silence
  if (silStart !== null) {
    const dur = buffer.duration - silStart;
    if (dur >= minDuration) {
      regions.push({ start: silStart, end: buffer.duration, duration: dur, center: (silStart + buffer.duration) / 2 });
    }
  }

  return regions;
};

/**
 * Automatically finds the best split points for an AudioBuffer so that every
 * resulting segment is ≤ maxSegmentSeconds.
 *
 * Strategy per segment:
 *   1. Look for silence regions in the last `lookback` seconds before the limit.
 *   2. Among candidates, pick the LONGEST silence (most natural pause).
 *   3. Cut at the silence's centre point.
 *   4. If no silence found, fall back to a hard cut at the limit.
 *
 * Tries progressively more lenient amplitude thresholds so that even noisy
 * audio (with background music, AC hum, etc.) can be split cleanly.
 *
 * Returns [] if the audio is already ≤ maxSegmentSeconds.
 */
export const autoDetectSplitPoints = (
  buffer: AudioBuffer,
  maxSegmentSeconds: number = MAX_SEGMENT_SECONDS,
): number[] => {
  if (buffer.duration <= maxSegmentSeconds) return [];

  const lookback = Math.min(3 * 60, maxSegmentSeconds * 0.35); // look back up to 3 min

  const trySplit = (threshold: number): number[] | null => {
    const silences = detectSilenceRegions(buffer, { threshold, minDuration: 0.25 });
    const markers: number[] = [];
    let segStart = 0;

    while (segStart + maxSegmentSeconds < buffer.duration) {
      const limit = segStart + maxSegmentSeconds;
      const from = Math.max(segStart + 30, limit - lookback);
      const candidates = silences.filter(s => s.center > from && s.center < limit);

      if (candidates.length > 0) {
        const best = candidates.reduce((a, b) => (a.duration > b.duration ? a : b));
        markers.push(best.center);
        segStart = best.center;
      } else {
        return null; // need higher threshold
      }
    }
    return markers;
  };

  for (const thr of [0.01, 0.02, 0.04, 0.08, 0.15]) {
    const result = trySplit(thr);
    if (result !== null) {
      console.log(`[AudioScribe] Auto-split: ${result.length} marker(s) at threshold=${thr}`);
      return result;
    }
  }

  // Hard fallback — evenly spaced (no silence found at any threshold)
  console.warn('[AudioScribe] Auto-split: no silences detected — using forced even splits');
  const markers: number[] = [];
  let t = maxSegmentSeconds;
  while (t < buffer.duration) { markers.push(t); t += maxSegmentSeconds; }
  return markers;
};
