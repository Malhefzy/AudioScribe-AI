import React, { useState, useEffect, useRef } from 'react';
import FileUpload from './components/FileUpload';
import ConfigurationForm from './components/ConfigurationForm';
import AudioEditor from './components/AudioEditor';
import TranscriptionView from './components/TranscriptionView';
import TranscriptionProgress from './components/TranscriptionProgress';
import { FileAudioIcon } from './components/Icons';
import { transcribeChunks, retranscribeChunk, reconcileTranscripts } from './services/geminiService';
import { splitAudioIntoChunks, decodeAudioFile } from './services/audioService';
import { AppStatus, TranscriptionConfig, AudioChunk, ChunkProgress } from './types';

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [file, setFile] = useState<File | null>(null);
  const [config, setConfig] = useState<TranscriptionConfig | null>(null);
  const [transcription, setTranscription] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [prepMsg, setPrepMsg] = useState<string>('');

  const [inputTokens, setInputTokens] = useState<number>(0);
  const [outputTokens, setOutputTokens] = useState<number>(0);

  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [isCheckingKey, setIsCheckingKey] = useState<boolean>(true);

  // ── Per-chunk progress (persists through failures for resume) ──────────────
  const [chunks, setChunks] = useState<AudioChunk[] | null>(null);
  const [chunkProgress, setChunkProgress] = useState<ChunkProgress[]>([]);
  const [retryingChunkIndex, setRetryingChunkIndex] = useState<number | null>(null);

  // Keep a ref so the transcription callback always reads fresh state
  const chunkProgressRef = useRef<ChunkProgress[]>([]);
  const updateChunkProgress = (updated: ChunkProgress[]) => {
    chunkProgressRef.current = updated;
    setChunkProgress(updated);
  };

  // ── API key check ──────────────────────────────────────────────────────────

  useEffect(() => {
    const checkKey = async () => {
      try {
        if (window.aistudio?.hasSelectedApiKey) {
          setHasApiKey(await window.aistudio.hasSelectedApiKey());
        } else {
          setHasApiKey(true);
        }
      } catch {
        setHasApiKey(true);
      } finally {
        setIsCheckingKey(false);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    try {
      if (window.aistudio?.openSelectKey) {
        await window.aistudio.openSelectKey();
        setHasApiKey(true);
      }
    } catch (e) {
      console.error('Error opening key selector:', e);
    }
  };

  // ── Step 1: file selected ──────────────────────────────────────────────────

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setErrorMsg(null);
    setInputTokens(0);
    setOutputTokens(0);
    setChunks(null);
    setChunkProgress([]);
    setStatus(AppStatus.CONFIGURING);
  };

  // ── Step 2: configured ────────────────────────────────────────────────────

  const handleConfigure = (cfg: TranscriptionConfig) => {
    if (cfg.estimatedInputTokens) setInputTokens(cfg.estimatedInputTokens);
    if (cfg.estimatedOutputTokens) setOutputTokens(cfg.estimatedOutputTokens);
    setConfig(cfg);
    if (cfg.splitMode === 'none') {
      handleConfirmMarkers([], cfg);
    } else {
      setStatus(AppStatus.EDITING);
    }
  };

  // ── Step 3: markers confirmed → decode + split + transcribe ──────────────

  const runTranscription = async (
    activeChunks: AudioChunk[],
    activeConfig: TranscriptionConfig,
    existingProgress: ChunkProgress[],
  ) => {
    setStatus(AppStatus.TRANSCRIBING);
    const speakerCountVal =
      activeConfig.speakerCount === 'auto' ? undefined : activeConfig.speakerCount;

    try {
      const result = await transcribeChunks(
        activeChunks,
        activeConfig.model,
        speakerCountVal,
        existingProgress,
        updateChunkProgress,
      );

      setTranscription(result.text);
      if (result.usageMetadata) {
        setInputTokens(result.usageMetadata.promptTokenCount || 0);
        setOutputTokens(result.usageMetadata.candidatesTokenCount || 0);
      }
      setStatus(AppStatus.COMPLETED);
    } catch (err: any) {
      console.error(err);
      // chunkProgress is already up-to-date via updateChunkProgress callback
      let msg: string = err.message || 'An unexpected error occurred.';
      try {
        const parsed = JSON.parse(msg);
        const inner = parsed?.error;
        if (inner?.code === 500 || inner?.status === 'INTERNAL') {
          msg = `Gemini returned a server error (500) — this is usually transient. You can resume without losing progress. (${inner.message})`;
        } else if (inner?.code === 429 || inner?.status === 'RESOURCE_EXHAUSTED') {
          msg = `API rate limit reached. Wait a moment then resume — your progress is saved.`;
        } else if (inner?.message) {
          msg = inner.message;
        }
      } catch { /* not JSON */ }
      setErrorMsg(msg);
      setStatus(AppStatus.ERROR);
    }
  };

  const handleConfirmMarkers = async (
    markerTimes: number[],
    cfgOverride?: TranscriptionConfig,
  ) => {
    const activeConfig = cfgOverride ?? config;
    if (!file || !activeConfig) return;

    setStatus(AppStatus.UPLOADING);
    setPrepMsg('Decoding audio…');

    try {
      const audioBuffer = await decodeAudioFile(file);
      setPrepMsg('Preparing audio segments…');
      const newChunks = await splitAudioIntoChunks(
        audioBuffer,
        markerTimes,
        (pct) => setPrepMsg(`Preparing audio segments (${pct}%)…`),
      );
      setPrepMsg('');

      // Store chunks for potential resume later
      setChunks(newChunks);
      const initialProgress: ChunkProgress[] = newChunks.map((c) => ({
        index: c.index,
        startTime: c.startTime,
        endTime: c.endTime,
        status: 'pending',
      }));
      updateChunkProgress(initialProgress);

      await runTranscription(newChunks, activeConfig, initialProgress);
    } catch (err: any) {
      if (status !== AppStatus.TRANSCRIBING) {
        // Error during decode/split phase (before transcription started)
        setErrorMsg(err.message || 'Failed to prepare audio chunks.');
        setStatus(AppStatus.ERROR);
        setPrepMsg('');
      }
    }
  };

  // ── Retry a single chunk (post-completion) ────────────────────────────────

  const handleRetryChunk = async (index: number) => {
    if (!chunks || !config || retryingChunkIndex !== null) return;

    setRetryingChunkIndex(index);
    const speakerCountVal = config.speakerCount === 'auto' ? undefined : config.speakerCount;

    // Collect raw transcripts from chunks preceding this one (for speaker context)
    const prevRawTranscripts = chunkProgressRef.current
      .filter(p => p.index < index)
      .map(p => p.transcript ?? '');

    try {
      const rawText = await retranscribeChunk(
        chunks[index],
        chunks.length,
        config.model,
        speakerCountVal,
        prevRawTranscripts,
        (chunkStatus, error) => {
          const updated = [...chunkProgressRef.current];
          updated[index] = { ...updated[index], status: chunkStatus, ...(error ? { error } : {}) };
          updateChunkProgress(updated);
        },
      );

      // Persist new raw transcript
      const updated = [...chunkProgressRef.current];
      updated[index] = { ...updated[index], status: 'done', transcript: rawText, error: undefined };
      updateChunkProgress(updated);

      // Re-run full reconciliation with updated raw transcripts
      const allRaw = updated.map(p => p.transcript ?? '');
      const merged = await reconcileTranscripts(
        allRaw,
        chunks,
        config.model,
        (i, s) => {
          const prog = [...chunkProgressRef.current];
          prog[i] = { ...prog[i], status: s };
          updateChunkProgress(prog);
        },
      );

      setTranscription(merged);
    } catch (err: any) {
      console.error('[AudioScribe] Chunk retry failed:', err);
    } finally {
      setRetryingChunkIndex(null);
    }
  };

  // ── Resume from failure ────────────────────────────────────────────────────

  const handleResume = () => {
    if (!chunks || !config) return;
    setErrorMsg(null);
    runTranscription(chunks, config, chunkProgressRef.current);
  };

  // ── Reset ──────────────────────────────────────────────────────────────────

  const handleReset = () => {
    setFile(null);
    setConfig(null);
    setTranscription('');
    setStatus(AppStatus.IDLE);
    setErrorMsg(null);
    setPrepMsg('');
    setInputTokens(0);
    setOutputTokens(0);
    setChunks(null);
    setChunkProgress([]);
    setRetryingChunkIndex(null);
    chunkProgressRef.current = [];
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const isPreparing = status === AppStatus.UPLOADING || status === AppStatus.PROCESSING;
  const isTranscribing = status === AppStatus.TRANSCRIBING;
  const completedCount = chunkProgress.filter(p => p.status === 'done').length;
  const failedChunk = chunkProgress.find(p => p.status === 'failed');
  const resumableCount = chunkProgress.filter(p => p.status === 'done' && p.transcript).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900">

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-md">
              A
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-600">
              AudioScribe AI
            </h1>
          </div>
          <div className="text-sm text-slate-500 font-medium hidden sm:block">
            Powered by Gemini
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">

        {/* API Key */}
        {!isCheckingKey && !hasApiKey && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8 text-center animate-in fade-in duration-500">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">API Key Required</h3>
            <p className="text-blue-700 mb-4">Select your AI Studio API key to use Gemini for transcription.</p>
            <button onClick={handleSelectKey}
              className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
              Select API Key
            </button>
          </div>
        )}

        {/* Intro */}
        {status === AppStatus.IDLE && hasApiKey && (
          <div className="text-center mb-10 space-y-3 animate-in fade-in duration-500">
            <h2 className="text-3xl font-bold text-slate-900">Transcribe long-form audio</h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">
              Upload meetings, interviews, or voice notes. AudioScribe splits at natural silences,
              transcribes each segment, and merges everything into a speaker-labelled markdown transcript.
            </p>
          </div>
        )}

        {hasApiKey && (
          <div className="space-y-8">

            {/* 1. Upload */}
            {status === AppStatus.IDLE && (
              <FileUpload onFileSelect={handleFileSelect} />
            )}

            {/* 2. Configure */}
            {status === AppStatus.CONFIGURING && file && (
              <ConfigurationForm file={file} onStart={handleConfigure} onCancel={handleReset} />
            )}

            {/* 3. Audio Editor */}
            {status === AppStatus.EDITING && file && config && (
              <AudioEditor
                file={file}
                config={config}
                onConfirm={handleConfirmMarkers}
                onCancel={() => setStatus(AppStatus.CONFIGURING)}
              />
            )}

            {/* 4a. Preparing (decode + split) */}
            {isPreparing && (
              <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm flex flex-col items-center text-center space-y-4 animate-in fade-in duration-300">
                <div className="relative">
                  <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-60" />
                  <div className="relative bg-white p-4 rounded-full border-2 border-blue-100 shadow-sm">
                    <svg className="w-8 h-8 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-slate-800">Preparing…</h3>
                  <p className="text-slate-500 text-sm">{prepMsg || 'Please wait…'}</p>
                </div>
              </div>
            )}

            {/* 4b. Transcribing — detailed per-chunk panel */}
            {isTranscribing && chunkProgress.length > 0 && (
              <TranscriptionProgress
                progress={chunkProgress}
                fileName={file?.name}
              />
            )}

            {/* 5. Error — with Resume option */}
            {status === AppStatus.ERROR && (
              <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden animate-in fade-in duration-300">
                <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                  </span>
                  <h3 className="font-semibold text-red-800">Processing Failed</h3>
                </div>

                <div className="p-6 space-y-4">
                  <p className="text-sm text-slate-600">{errorMsg}</p>

                  {/* Show saved progress summary when resumable */}
                  {resumableCount > 0 && chunks && (
                    <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                      <p className="text-sm text-green-800">
                        <strong>{resumableCount} of {chunks.length} segment{chunks.length > 1 ? 's' : ''}</strong> successfully
                        transcribed — progress is saved. Resuming will pick up from segment {(failedChunk?.index ?? resumableCount) + 1}.
                      </p>
                    </div>
                  )}

                  {/* Progress snapshot */}
                  {chunkProgress.length > 0 && (
                    <div className="rounded-lg border border-slate-200 overflow-hidden">
                      <TranscriptionProgress progress={chunkProgress} />
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    {/* Resume button — shown when we have partial progress AND the chunks are available */}
                    {resumableCount > 0 && chunks && config && (
                      <button
                        onClick={handleResume}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium text-sm rounded-lg shadow-sm transition-all"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Resume from segment {(failedChunk?.index ?? resumableCount) + 1}
                      </button>
                    )}
                    <button
                      onClick={handleReset}
                      className="px-4 py-2.5 bg-white border border-slate-300 text-slate-700 font-medium text-sm rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      Start Over
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 6. Completed */}
            {status === AppStatus.COMPLETED && (
              <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                      <FileAudioIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-slate-900 font-medium">{file?.name}</h3>
                      <p className="text-slate-500 text-xs">
                        Transcribed successfully
                        {completedCount > 1 ? ` · ${completedCount} segments merged` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleReset}
                    className="text-sm text-slate-500 hover:text-slate-800 font-medium underline decoration-slate-300 underline-offset-4"
                  >
                    Transcribe Another
                  </button>
                </div>

                <TranscriptionView
                  markdown={transcription}
                  fileName={file?.name || 'Audio'}
                  inputTokens={inputTokens}
                  outputTokens={outputTokens}
                />

                {/* Per-segment retry panel (only when multi-chunk) */}
                {chunks && chunkProgress.length > 1 && (
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <TranscriptionProgress
                      progress={chunkProgress}
                      title="Segments"
                      onRetry={handleRetryChunk}
                      retryingIndex={retryingChunkIndex}
                    />
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </main>
    </div>
  );
};

export default App;
