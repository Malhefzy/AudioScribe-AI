import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { CopyIcon, CheckIcon, SparklesIcon, UsersIcon, DownloadIcon } from './Icons';

interface TranscriptionViewProps {
  markdown: string;
  fileName: string;
  inputTokens?: number;
  outputTokens?: number;
}

const TranscriptionView: React.FC<TranscriptionViewProps> = ({ 
  markdown: initialMarkdown, 
  fileName, 
  inputTokens,
  outputTokens 
}) => {
  const [copied, setCopied] = useState(false);
  const [speakerMap, setSpeakerMap] = useState<Record<string, string>>({});
  const [isConfiguring, setIsConfiguring] = useState(true);
  
  // Extract unique speakers from the initial markdown
  // Matches: **Speaker 1** OR Speaker 1:
  const speakers = useMemo(() => {
    // Regex explanation:
    // (?:\*\*|__)?   -> Optional opening bold/italic marker (non-capturing)
    // (Speaker \d+)  -> Capture "Speaker N"
    // (?:\*\*|__)?   -> Optional closing bold/italic marker (non-capturing)
    // :?             -> Optional colon
    const regex = /(?:\*\*|__)?(Speaker \d+)(?:\*\*|__)?/g;

    const found = new Set<string>();
    let match;
    while ((match = regex.exec(initialMarkdown)) !== null) {
      // Filter out false positives like "Speaker 1" in the middle of a sentence
      // We assume labels are likely at start of line or followed by colon/newline
      // But for the list, we just collect unique distinct numbers found.
      found.add(match[1]);
    }

    return Array.from(found).sort((a, b) => {
        const numA = parseInt(a.replace('Speaker ', '')) || 0;
        const numB = parseInt(b.replace('Speaker ', '')) || 0;
        return numA - numB;
    });
  }, [initialMarkdown]);

  // Compute the markdown for export/display
  const exportMarkdown = useMemo(() => {
    let result = initialMarkdown;

    // 1. Fix formatting: Ensure double newlines before speaker labels if missing.
    // Handles various formats:
    // - **Speaker 1** [00:00]:
    // - [00:00] **Speaker 1**: (in case model ignores instructions)
    // - Speaker 1:
    const formatRegex = /([^\n])\s*((?:\[\d{2}:\d{2}(?::\d{2})?\]\s*)?(?:\*\*|__)?Speaker \d+(?:\*\*|__)?)/g;
    result = result.replace(formatRegex, '$1\n\n$2');

    // 2. Apply Renaming
    Object.entries(speakerMap).forEach(([original, newName]) => {
      if ((newName as string).trim()) {
        // Replace strict patterns to avoid replacing text in content
        // We look for the speaker label optionally surrounded by formatting
        // We do NOT consume the colon or timestamp following it, just the name.
        const replaceRegex = new RegExp(`(?:\\*\\*|__)?${original}(?:\\*\\*|__)?`, 'g');
        result = result.replace(replaceRegex, `**${newName}**`);
      }
    });
    return result;
  }, [initialMarkdown, speakerMap]);

  // Detect RTL (Arabic characters)
  const isRTL = useMemo(() => {
    const arabicPattern = /[\u0600-\u06FF]/;
    return arabicPattern.test(exportMarkdown);
  }, [exportMarkdown]);

  const handleCopy = () => {
    navigator.clipboard.writeText(exportMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([exportMarkdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Construct filename: Transcript - OriginalName.md
    const originalNameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
    a.download = `Transcript - ${originalNameWithoutExt}.md`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const updateSpeakerName = (original: string, newName: string) => {
    setSpeakerMap(prev => ({ ...prev, [original]: newName }));
  };

  return (
    <div className="flex flex-col gap-4 relative">
      
      {/* Speaker Configuration Panel (Overview) */}
      {speakers.length > 0 && (
        <div className={`bg-white rounded-xl border transition-all duration-300
          ${isConfiguring ? 'border-blue-200 shadow-md ring-1 ring-blue-50' : 'border-slate-200 shadow-sm'}
        `}>
          <div 
            className="flex items-center justify-between px-6 py-4 cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors group rounded-xl"
            onClick={() => setIsConfiguring(!isConfiguring)}
          >
            <div className="flex items-center gap-2 text-slate-700 font-medium">
              <UsersIcon className="w-5 h-5 text-blue-600" />
              <span>Speaker List</span>
              <span className="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-full ml-2">
                {speakers.length} found
              </span>
            </div>
            <div className="flex items-center gap-3 text-slate-400">
               <div className={`transform transition-transform duration-200 ${isConfiguring ? 'rotate-180' : ''}`}>
                 ▼
               </div>
            </div>
          </div>
          
          {isConfiguring && (
             <div className="p-6 bg-white border-t border-slate-100 rounded-b-xl animate-in slide-in-from-top-2">
                <p className="text-sm text-slate-500 mb-4">
                  Rename speakers below to update the transcript automatically.
                </p>
                {/* Responsive Grid for speakers */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {speakers.map(speaker => (
                    <div key={speaker} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100 hover:border-blue-200 transition-colors">
                      <div className="flex-shrink-0 flex items-center gap-2 px-2">
                        <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{speaker}</span>
                      </div>
                      <div className="text-slate-300 text-xs">→</div>
                      <div className="relative flex-grow min-w-0">
                        <input
                          type="text"
                          placeholder="Name..."
                          value={speakerMap[speaker] || ''}
                          onChange={(e) => updateSpeakerName(speaker, e.target.value)}
                          className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 transition-all placeholder-slate-300"
                        />
                      </div>
                    </div>
                  ))}
                </div>
             </div>
          )}
        </div>
      )}

      {/* Transcription View */}
      <div className="w-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[600px]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-slate-700 font-semibold mr-2">
              <SparklesIcon className="w-5 h-5 text-purple-600" />
              <h3>Transcription</h3>
            </div>
            
            {/* Input Tokens Badge */}
            {(inputTokens !== undefined && inputTokens > 0) && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-purple-50 border border-purple-100 text-xs font-medium text-purple-700" title="Input Tokens">
                <span className="opacity-75 uppercase text-[10px]">In</span>
                <span>{inputTokens.toLocaleString()}</span>
              </div>
            )}
            
            {/* Output Tokens Badge */}
            {(outputTokens !== undefined && outputTokens > 0) && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-xs font-medium text-emerald-700" title="Output Tokens">
                <span className="opacity-75 uppercase text-[10px]">Out</span>
                <span>{outputTokens.toLocaleString()}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm"
              title="Download Markdown"
            >
              <DownloadIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Download</span>
            </button>
            <button
              onClick={handleCopy}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all shadow-sm
                ${copied 
                  ? 'bg-green-100 text-green-700 border border-green-200' 
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                }
              `}
            >
              {copied ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
        
        <div className="p-6 overflow-y-auto prose-content flex-grow" dir={isRTL ? 'rtl' : 'ltr'}>
          <div className={`prose prose-slate max-w-none prose-headings:font-semibold prose-headings:text-slate-800 prose-p:text-slate-600 prose-strong:text-slate-800 ${isRTL ? 'text-right' : 'text-left'}`}>
             <ReactMarkdown>
               {exportMarkdown}
             </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TranscriptionView;