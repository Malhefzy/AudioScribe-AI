import React, { useState, useEffect } from 'react';
import { UsersIcon, FileAudioIcon, SparklesIcon, LoaderIcon } from './Icons';
import { TranscriptionConfig } from '../types';

interface ConfigurationFormProps {
  file: File;
  onStart: (config: TranscriptionConfig) => void;
  onCancel: () => void;
}

const ConfigurationForm: React.FC<ConfigurationFormProps> = ({ file, onStart, onCancel }) => {
  const [speakerCount, setSpeakerCount] = useState<number | 'auto'>('auto');
  const [analyzing, setAnalyzing] = useState(false);
  const [duration, setDuration] = useState<number>(0);
  
  // Token estimates
  const [inputTokens, setInputTokens] = useState<number>(0);
  const [outputTokens, setOutputTokens] = useState<number>(0);

  useEffect(() => {
    if (!file) return;

    const analyzeFile = async () => {
      setAnalyzing(true);
      try {
        const objectUrl = URL.createObjectURL(file);
        const audio = new Audio(objectUrl);
        
        await new Promise((resolve, reject) => {
          audio.onloadedmetadata = () => resolve(true);
          audio.onerror = () => reject(new Error("Invalid audio file"));
        });
        
        const dur = audio.duration;
        setDuration(dur);
        
        // ESTIMATION LOGIC
        // Input: Gemini Audio is ~25 tokens per second.
        const estimatedInput = Math.ceil(dur * 25);
        
        // Output: Average speech is ~150 words/min. 
        // 1 word approx 1.3 tokens. 
        // 150 * 1.3 = 195 tokens/min => ~3.25 tokens/sec.
        // We add a buffer for formatting/timestamps.
        const estimatedOutput = Math.ceil(dur * 4);

        setInputTokens(estimatedInput);
        setOutputTokens(estimatedOutput);
        
        URL.revokeObjectURL(objectUrl);
      } catch (e) {
        console.error("Could not analyze audio file", e);
        setDuration(0);
        setInputTokens(0);
        setOutputTokens(0);
      } finally {
        setAnalyzing(false);
      }
    };

    analyzeFile();
  }, [file]);

  const handleStart = () => {
    onStart({
      speakerCount,
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens: outputTokens
    });
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    if (h > 0) {
      return `${h}h ${m}m ${s}s`;
    }
    return `${m}m ${s}s`;
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in zoom-in-95 duration-300">
      
      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">Review & Configure</h3>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
           <span className="sr-only">Close</span>
           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>

      <div className="p-6 space-y-6">
        
        {/* File Analysis Card */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
           <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-white border border-blue-100 flex items-center justify-center text-blue-600 shadow-sm flex-shrink-0">
                 <FileAudioIcon className="w-6 h-6" />
              </div>
              <div className="flex-grow space-y-1">
                 <h4 className="font-semibold text-slate-900 truncate pr-4">{file.name}</h4>
                 <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
                    <span className="bg-blue-100/50 px-2 py-0.5 rounded text-blue-800 font-medium">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                    
                    {analyzing ? (
                      <span className="flex items-center gap-1.5">
                        <LoaderIcon className="w-3 h-3 animate-spin" />
                        Analyzing...
                      </span>
                    ) : duration > 0 ? (
                      <>
                        <span className="flex items-center gap-1.5" title="Audio Duration">
                           <span className="w-1 h-1 rounded-full bg-slate-400"></span>
                           {formatDuration(duration)}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-400 italic">Duration unavailable</span>
                    )}
                 </div>
                 
                 {/* Token Estimate Breakdown */}
                 {!analyzing && duration > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-2 bg-white/60 rounded-lg p-2 border border-blue-100">
                        <div className="flex flex-col">
                            <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">Est. Input Tokens</span>
                            <span className="text-sm font-semibold text-slate-700 flex items-center gap-1">
                                <SparklesIcon className="w-3 h-3 text-purple-400" />
                                {inputTokens.toLocaleString()}
                            </span>
                        </div>
                        <div className="flex flex-col border-l border-blue-100 pl-2">
                            <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">Est. Output Tokens</span>
                            <span className="text-sm font-semibold text-slate-700 flex items-center gap-1">
                                <SparklesIcon className="w-3 h-3 text-emerald-400" />
                                {outputTokens.toLocaleString()}
                            </span>
                        </div>
                    </div>
                 )}
              </div>
           </div>
        </div>

        {/* Configuration */}
        <div className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Number of Speakers
          </label>
          <div className="relative">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <UsersIcon className="w-5 h-5" />
             </div>
             <select
                value={speakerCount}
                onChange={(e) => setSpeakerCount(e.target.value === 'auto' ? 'auto' : parseInt(e.target.value))}
                className="block w-full pl-10 pr-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
             >
                <option value="auto">Auto Detect</option>
                <option value={1}>1 Speaker</option>
                <option value={2}>2 Speakers</option>
                <option value={3}>3 Speakers</option>
                <option value={4}>4 Speakers</option>
                <option value={5}>5 Speakers</option>
                <option value={6}>6 Speakers</option>
                <option value={7}>7 Speakers</option>
                <option value={8}>8 Speakers</option>
                <option value={9}>9 Speakers</option>
                <option value={10}>10 Speakers</option>
             </select>
          </div>
          <p className="text-xs text-slate-500">
            Identifying speakers helps Gemini organize the transcript. Leave as "Auto Detect" if unsure.
          </p>
        </div>

        {/* Actions */}
        <div className="pt-4 flex gap-3">
          <button
            onClick={handleStart}
            className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium py-2.5 px-4 rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Start Transcription
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2.5 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
          >
            Cancel
          </button>
        </div>

      </div>
    </div>
  );
};

export default ConfigurationForm;