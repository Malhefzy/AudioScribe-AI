import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  LoaderIcon,
  PlayIcon,
  PauseIcon,
  StopIcon,
  SkipBackIcon,
  SkipForwardIcon,
  MarkerIcon,
  DeleteIcon,
  ScissorsIcon,
} from './Icons';
import {
  decodeAudioFile,
  extractWaveform,
  autoDetectSplitPoints,
  formatTime,
  formatDuration,
  MAX_SEGMENT_SECONDS,
} from '../services/audioService';
import { TranscriptionConfig } from '../types';

interface Segment {
  startTime: number;
  endTime: number;
  duration: number;
  isValid: boolean;
}

interface AudioEditorProps {
  file: File;
  config: TranscriptionConfig;
  onConfirm: (markerTimes: number[]) => void;
  onCancel: () => void;
}

const CANVAS_W = 1200;
const CANVAS_H = 120;
const WAVEFORM_POINTS = CANVAS_W;

const AudioEditor: React.FC<AudioEditorProps> = ({ file, config, onConfirm, onCancel }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [waveform, setWaveform] = useState<Float32Array | null>(null);
  const [duration, setDuration] = useState(0);
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  const [autoSource, setAutoSource] = useState(false); // true = markers came from auto-detect

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playingSegment, setPlayingSegment] = useState<number | null>(null);

  const [markers, setMarkers] = useState<number[]>([]);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioUrlRef = useRef<string | null>(null);
  const segmentStopRef = useRef<number | null>(null);
  const audioBufRef = useRef<AudioBuffer | null>(null);

  const segments: Segment[] = useMemo(() => {
    const boundaries = [0, ...markers, duration];
    return boundaries.slice(0, -1).map((start, i) => {
      const end = boundaries[i + 1];
      return { startTime: start, endTime: end, duration: end - start, isValid: (end - start) <= MAX_SEGMENT_SECONDS };
    });
  }, [markers, duration]);

  const invalidCount = segments.filter(s => !s.isValid).length;
  const canConfirm = !isLoading && !loadError && invalidCount === 0 && duration > 0;

  // ── Load audio + optionally auto-detect on mount ───────────────────────────

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const url = URL.createObjectURL(file);
        audioUrlRef.current = url;
        const audio = new Audio(url);
        audio.preload = 'auto';
        audioRef.current = audio;

        audio.onended = () => { setIsPlaying(false); setPlayingSegment(null); segmentStopRef.current = null; };
        audio.ontimeupdate = () => {
          if (cancelled) return;
          setCurrentTime(audio.currentTime);
          if (segmentStopRef.current !== null && audio.currentTime >= segmentStopRef.current) {
            audio.pause();
            audio.currentTime = segmentStopRef.current;
            setIsPlaying(false);
            setPlayingSegment(null);
            segmentStopRef.current = null;
          }
        };
        audio.onplay = () => setIsPlaying(true);
        audio.onpause = () => setIsPlaying(false);

        await new Promise<void>((res, rej) => {
          audio.onloadedmetadata = () => res();
          audio.onerror = () => rej(new Error('Could not load audio file.'));
        });
        if (cancelled) return;
        setDuration(audio.duration);

        const buf = await decodeAudioFile(file);
        if (cancelled) return;
        audioBufRef.current = buf;
        setWaveform(extractWaveform(buf, WAVEFORM_POINTS));

        // If mode is 'auto', run detection immediately after decode
        if (config.splitMode === 'auto') {
          setIsAutoDetecting(true);
          const pts = autoDetectSplitPoints(buf, MAX_SEGMENT_SECONDS);
          if (!cancelled) {
            setMarkers(pts);
            setAutoSource(true);
          }
          setIsAutoDetecting(false);
        }
      } catch (e: any) {
        if (!cancelled) setLoadError(e.message ?? 'Failed to load audio.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
      audioRef.current?.pause();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, [file, config.splitMode]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  // ── Re-run auto-detect on demand ───────────────────────────────────────────

  const runAutoDetect = useCallback(async () => {
    const buf = audioBufRef.current;
    if (!buf) return;
    setIsAutoDetecting(true);
    try {
      const pts = autoDetectSplitPoints(buf, MAX_SEGMENT_SECONDS);
      setMarkers(pts);
      setAutoSource(true);
    } finally {
      setIsAutoDetecting(false);
    }
  }, []);

  // ── Canvas drawing ─────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = CANVAS_W, H = CANVAS_H;
    ctx.clearRect(0, 0, W, H);

    if (!waveform || duration === 0) {
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(0, 0, W, H);
      return;
    }

    const boundaries = [0, ...markers, duration];

    // Segment regions
    for (let i = 0; i < boundaries.length - 1; i++) {
      const x1 = (boundaries[i] / duration) * W;
      const x2 = (boundaries[i + 1] / duration) * W;
      const valid = (boundaries[i + 1] - boundaries[i]) <= MAX_SEGMENT_SECONDS;
      ctx.fillStyle = valid ? 'rgba(219,234,254,0.45)' : 'rgba(254,226,226,0.55)';
      ctx.fillRect(x1, 0, x2 - x1, H);
    }

    // Waveform bars
    const barW = W / waveform.length;
    for (let i = 0; i < waveform.length; i++) {
      const t = (i / waveform.length) * duration;
      let valid = true;
      for (let s = 0; s < boundaries.length - 1; s++) {
        if (t >= boundaries[s] && t < boundaries[s + 1]) {
          valid = (boundaries[s + 1] - boundaries[s]) <= MAX_SEGMENT_SECONDS;
          break;
        }
      }
      const barH = Math.max(2, waveform[i] * H * 0.88);
      ctx.fillStyle = valid ? '#93c5fd' : '#fca5a5';
      ctx.fillRect(i * barW, (H - barH) / 2, Math.max(0.8, barW - 0.5), barH);
    }

    // Markers
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    for (const m of markers) {
      const x = Math.round((m / duration) * W);
      ctx.strokeStyle = '#dc2626';
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#dc2626';
      ctx.beginPath(); ctx.moveTo(x - 7, 0); ctx.lineTo(x + 7, 0); ctx.lineTo(x, 10); ctx.closePath(); ctx.fill();
      ctx.setLineDash([5, 4]);
    }
    ctx.setLineDash([]);

    // Playing segment highlight
    if (playingSegment !== null && segments[playingSegment]) {
      const seg = segments[playingSegment];
      ctx.fillStyle = 'rgba(59,130,246,0.18)';
      ctx.fillRect((seg.startTime / duration) * W, 0, ((seg.endTime - seg.startTime) / duration) * W, H);
    }

    // Playhead
    const px = Math.round((currentTime / duration) * W);
    ctx.lineWidth = 2; ctx.strokeStyle = '#1d4ed8';
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
    ctx.fillStyle = '#1d4ed8';
    ctx.beginPath(); ctx.moveTo(px - 6, 0); ctx.lineTo(px + 6, 0); ctx.lineTo(px, 9); ctx.closePath(); ctx.fill();
  }, [waveform, markers, currentTime, duration, segments, playingSegment]);

  useEffect(() => { draw(); }, [draw]);

  // ── Canvas interaction ─────────────────────────────────────────────────────

  const timeFromEvent = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(duration, ((e.clientX - rect.left) / rect.width) * duration));
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!audioRef.current || duration === 0) return;
    const t = timeFromEvent(e);
    audioRef.current.currentTime = t;
    setCurrentTime(t);
    segmentStopRef.current = null;
    setPlayingSegment(null);
  };

  // ── Playback ───────────────────────────────────────────────────────────────

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) { segmentStopRef.current = null; setPlayingSegment(null); audio.play(); }
    else audio.pause();
  };

  const skip = (delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + delta));
    segmentStopRef.current = null; setPlayingSegment(null);
  };

  const playSegment = (idx: number) => {
    const audio = audioRef.current;
    const seg = segments[idx];
    if (!audio || !seg) return;
    if (playingSegment === idx && !audio.paused) {
      audio.pause(); setPlayingSegment(null); segmentStopRef.current = null; return;
    }
    segmentStopRef.current = seg.endTime;
    audio.currentTime = seg.startTime;
    setPlayingSegment(idx);
    audio.play();
  };

  // ── Marker management ──────────────────────────────────────────────────────

  const addMarker = useCallback(() => {
    const t = audioRef.current?.currentTime ?? 0;
    setMarkers(prev => {
      if (prev.some(m => Math.abs(m - t) < 1)) return prev;
      return [...prev, t].sort((a, b) => a - b);
    });
    setAutoSource(false);
  }, []);

  const removeMarker = (i: number) => { setMarkers(prev => prev.filter((_, idx) => idx !== i)); setAutoSource(false); };
  const clearMarkers = () => { setMarkers([]); setAutoSource(false); };

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'm' || e.key === 'M') { e.preventDefault(); addMarker(); }
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); skip(-5); }
      if (e.key === 'ArrowRight') { e.preventDefault(); skip(5); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addMarker]);

  const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 2];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in zoom-in-95 duration-300">

      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
            <ScissorsIcon className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800">Audio Editor</h3>
            <p className="text-xs text-slate-500 truncate max-w-xs">{file.name}</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full">
          <MarkerIcon className="w-3 h-3" />
          <kbd className="font-mono bg-white border border-slate-200 px-1 rounded">M</kbd> add marker ·
          <kbd className="font-mono bg-white border border-slate-200 px-1 rounded">Space</kbd> play/pause
        </div>
      </div>

      <div className="p-6 space-y-5">

        {/* Auto-detect status banner */}
        {!isLoading && autoSource && markers.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg">
            <span className="text-indigo-500 text-lg">✦</span>
            <p className="text-sm text-indigo-800 flex-1">
              <strong>{markers.length} split point{markers.length !== 1 ? 's' : ''}</strong> detected automatically at natural silence gaps.
              Review below, adjust if needed, then start transcription.
            </p>
          </div>
        )}

        {/* Waveform */}
        <div className="space-y-1">
          {isLoading || isAutoDetecting ? (
            <div className="h-[120px] bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center justify-center gap-2 text-slate-400">
              <LoaderIcon className="w-6 h-6 animate-spin" />
              <span className="text-sm">{isAutoDetecting ? 'Detecting silence gaps…' : 'Decoding waveform…'}</span>
            </div>
          ) : loadError ? (
            <div className="h-[120px] bg-red-50 rounded-xl border border-red-100 flex items-center justify-center text-red-500 text-sm">{loadError}</div>
          ) : (
            <div className="relative">
              <canvas
                ref={canvasRef}
                width={CANVAS_W}
                height={CANVAS_H}
                className="w-full rounded-xl border border-slate-200 cursor-crosshair"
                onClick={handleCanvasClick}
                onMouseMove={e => setHoverTime(timeFromEvent(e))}
                onMouseLeave={() => setHoverTime(null)}
              />
              {hoverTime !== null && (
                <div className="absolute top-2 left-2 bg-slate-800/80 text-white text-xs font-mono px-2 py-1 rounded pointer-events-none">
                  {formatTime(hoverTime)}
                </div>
              )}
              <p className="text-xs text-slate-400 text-center mt-1">
                Click anywhere to seek · Blue = valid segment · Red = exceeds 15 min
              </p>
            </div>
          )}
        </div>

        {/* Playback controls */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1">
            <button onClick={() => skip(-10)} title="Back 10 s" disabled={isLoading}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 disabled:opacity-40">
              <SkipBackIcon className="w-5 h-5" />
            </button>
            <button onClick={togglePlay} disabled={isLoading}
              className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-sm disabled:opacity-40">
              {isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
            </button>
            <button onClick={() => skip(10)} title="Forward 10 s" disabled={isLoading}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 disabled:opacity-40">
              <SkipForwardIcon className="w-5 h-5" />
            </button>
          </div>
          <span className="font-mono text-sm text-slate-600 tabular-nums">
            {formatTime(currentTime)}<span className="text-slate-300 mx-1">/</span>{formatTime(duration)}
          </span>
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-xs text-slate-400 mr-1">Speed</span>
            {speedOptions.map(r => (
              <button key={r} onClick={() => setPlaybackRate(r)}
                className={`px-2 py-1 text-xs rounded-md font-medium transition-colors ${
                  playbackRate === r ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-100'
                }`}>{r}×</button>
            ))}
          </div>
        </div>

        {/* Marker controls */}
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={runAutoDetect} disabled={isLoading || isAutoDetecting || !audioBufRef.current}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm disabled:opacity-40">
            {isAutoDetecting
              ? <><LoaderIcon className="w-4 h-4 animate-spin" />Detecting…</>
              : <><span>✦</span>Auto-detect Split Points</>}
          </button>
          <button onClick={addMarker} disabled={isLoading || duration === 0}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium rounded-lg shadow-sm disabled:opacity-40">
            <MarkerIcon className="w-4 h-4" />
            Add Marker at {formatTime(currentTime)}
          </button>
          {markers.length > 0 && (
            <button onClick={clearMarkers}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-500 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg">
              <DeleteIcon className="w-4 h-4" />Clear All
            </button>
          )}
        </div>

        {/* Segment table */}
        {!isLoading && duration > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-slate-700">
              Segments
              <span className="ml-2 text-slate-400 font-normal">({segments.length})</span>
            </h4>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left text-xs font-medium text-slate-500 px-4 py-2.5">#</th>
                    <th className="text-left text-xs font-medium text-slate-500 px-4 py-2.5">Start</th>
                    <th className="text-left text-xs font-medium text-slate-500 px-4 py-2.5">End</th>
                    <th className="text-left text-xs font-medium text-slate-500 px-4 py-2.5">Duration</th>
                    <th className="text-left text-xs font-medium text-slate-500 px-4 py-2.5">Status</th>
                    <th className="text-center text-xs font-medium text-slate-500 px-4 py-2.5">Listen</th>
                    <th className="text-center text-xs font-medium text-slate-500 px-4 py-2.5">Remove marker</th>
                  </tr>
                </thead>
                <tbody>
                  {segments.map((seg, i) => (
                    <tr key={i} className={`border-b border-slate-100 last:border-0 ${
                      playingSegment === i ? 'bg-blue-50' : seg.isValid ? '' : 'bg-red-50/60'
                    }`}>
                      <td className="px-4 py-2.5 font-medium text-slate-700">{i + 1}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-600">{formatTime(seg.startTime)}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-600">{formatTime(seg.endTime)}</td>
                      <td className="px-4 py-2.5 text-slate-600">{formatDuration(seg.duration)}</td>
                      <td className="px-4 py-2.5">
                        {seg.isValid
                          ? <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium"><span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>OK</span>
                          : <span className="inline-flex items-center gap-1 text-red-600 text-xs font-medium"><span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>Too long</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button onClick={() => playSegment(i)}
                          className={`inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
                            playingSegment === i ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-700'
                          }`}>
                          {playingSegment === i ? <StopIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {i < segments.length - 1
                          ? <button onClick={() => removeMarker(i)}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50">
                              <DeleteIcon className="w-4 h-4" />
                            </button>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {invalidCount > 0 && (
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <span className="text-amber-500 mt-0.5">⚠</span>
                <p className="text-sm text-amber-800">
                  <strong>{invalidCount} segment{invalidCount > 1 ? 's' : ''}</strong> exceed the 15-minute limit.
                  Click <strong>Auto-detect Split Points</strong> or add markers manually inside {invalidCount > 1 ? 'them' : 'it'}.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <button onClick={onCancel} className="px-4 py-2.5 text-sm text-slate-600 hover:text-slate-900 font-medium">
            ← Back to Configure
          </button>
          <button
            onClick={() => onConfirm(markers)}
            disabled={!canConfirm}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium text-sm rounded-lg shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ScissorsIcon className="w-4 h-4" />
            Start Transcription
            <span className="bg-white/20 text-white text-xs px-1.5 py-0.5 rounded">
              {segments.length} chunk{segments.length !== 1 ? 's' : ''}
            </span>
          </button>
        </div>

      </div>
    </div>
  );
};

export default AudioEditor;
