const SPEAKER_NUM_PATTERN = '(\\d+)';

/** Parse [MM:SS] or [H:MM:SS] timestamp from a transcript line. Returns seconds, or null. */
export const parseLineTimestamp = (line: string): number | null => {
  const m = line.match(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/);
  if (!m) return null;
  return m[3] !== undefined
    ? parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10)
    : parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};

/** Shift relative chunk timestamps to absolute positions in the full recording. */
export const offsetTimestamps = (text: string, offsetSeconds: number): string => {
  if (offsetSeconds === 0) return text;
  return text.replace(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g, (_, a, b, c) => {
    const total = (c !== undefined
      ? parseInt(a, 10) * 3600 + parseInt(b, 10) * 60 + parseInt(c, 10)
      : parseInt(a, 10) * 60 + parseInt(b, 10)) + offsetSeconds;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const ss = Math.floor(total % 60);
    if (h > 0 || offsetSeconds >= 3600)
      return `[${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}]`;
    return `[${m}:${String(ss).padStart(2, '0')}]`;
  });
};

/** Lines from a merged transcript that fall within a segment's time window. */
export const extractLinesInTimeRange = (
  text: string,
  startSec: number,
  endSec: number,
  maxLines = 4,
): string[] =>
  text.split('\n')
    .filter(l => {
      const ts = parseLineTimestamp(l);
      return ts !== null && ts >= startSec && ts < endSec;
    })
    .slice(0, maxLines);

/** Preview lines for a segment editor — uses absolute timestamps matching the main transcript. */
export const buildSegmentPreview = (
  rawTranscript: string,
  startTime: number,
  endTime: number,
  options?: { mergedTranscription?: string; mapping?: Record<string, string>; maxLines?: number },
): string[] => {
  const maxLines = options?.maxLines ?? 4;
  const mapping = options?.mapping ? normalizeSpeakerMapping(options.mapping) : {};

  const linesWithTimestamps = (text: string) =>
    text.split('\n').filter(l => parseLineTimestamp(l) !== null).slice(0, maxLines);

  if (Object.keys(mapping).length > 0) {
    const absolute = offsetTimestamps(applySpeakerMapping(rawTranscript, mapping), startTime);
    const inRange = extractLinesInTimeRange(absolute, startTime, endTime, maxLines);
    return inRange.length > 0 ? inRange : linesWithTimestamps(absolute);
  }

  if (options?.mergedTranscription) {
    const fromMerged = extractLinesInTimeRange(options.mergedTranscription, startTime, endTime, maxLines);
    if (fromMerged.length > 0) return fromMerged;
  }

  const absolute = offsetTimestamps(rawTranscript, startTime);
  const inRange = extractLinesInTimeRange(absolute, startTime, endTime, maxLines);
  return inRange.length > 0 ? inRange : linesWithTimestamps(absolute);
};

/** Collect unique speaker labels from one or more transcript strings. */
export const extractSpeakersFromTranscript = (text: string): string[] => {
  const nums = new Set<number>();
  for (const m of text.matchAll(new RegExp(`\\*\\*Speaker ${SPEAKER_NUM_PATTERN}\\*\\*`, 'g')))
    nums.add(parseInt(m[1], 10));
  for (const m of text.matchAll(new RegExp(`(?<![0-9])Speaker ${SPEAKER_NUM_PATTERN}(?=\\s*:)`, 'g')))
    nums.add(parseInt(m[1], 10));
  return [...nums].sort((a, b) => a - b).map(n => `Speaker ${n}`);
};

/** Collect unique speaker labels across multiple transcript strings. */
export const buildSpeakerRoster = (transcripts: string[]): string[] => {
  const nums = new Set<number>();
  for (const text of transcripts) {
    for (const speaker of extractSpeakersFromTranscript(text))
      nums.add(parseInt(speaker.replace('Speaker ', ''), 10));
  }
  return [...nums].sort((a, b) => a - b).map(n => `Speaker ${n}`);
};

/** Atomically remaps speaker labels using temp placeholders to avoid swap collisions. */
export const applySpeakerMapping = (text: string, mapping: Record<string, string>): string => {
  const entries = Object.entries(mapping).filter(([from, to]) => from !== to);
  if (!entries.length) return text;

  let result = text;
  entries.forEach(([from], i) => {
    const num = from.replace(/^Speaker /, '');
    result = result.replace(new RegExp(`\\*\\*Speaker ${num}\\*\\*`, 'g'), `__SPKR_${i}__`);
    result = result.replace(new RegExp(`(?<![0-9])Speaker ${num}(?=\\s*:)`, 'g'), `__SPKR_${i}__`);
  });
  entries.forEach(([, to], i) => {
    result = result.replace(new RegExp(`__SPKR_${i}__`, 'g'), `**${to}**`);
  });
  return result;
};

/**
 * Compose two mappings so that applying the result once equals applying
 * `first` then `second`. Used to layer a new manual fix on top of a segment's
 * existing mapping.
 */
export const composeSpeakerMappings = (
  first: Record<string, string>,
  second: Record<string, string>,
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [from, to] of Object.entries(first)) out[from] = second[to] ?? to;
  for (const [from, to] of Object.entries(second)) if (!(from in out)) out[from] = to;
  return normalizeSpeakerMapping(out);
};

/** Keep only remappings where the label actually changes. */
export const normalizeSpeakerMapping = (mapping: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(mapping).filter(([from, to]) => from !== to));
