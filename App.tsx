import React, { useState } from 'react';
import FileUpload from './components/FileUpload';
import ConfigurationForm from './components/ConfigurationForm';
import TranscriptionView from './components/TranscriptionView';
import { LoaderIcon, FileAudioIcon } from './components/Icons';
import { uploadAudioFile, waitForFileActive, transcribeAudio } from './services/geminiService';
import { AppStatus, TranscriptionConfig } from './types';

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [file, setFile] = useState<File | null>(null);
  const [transcription, setTranscription] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Transcription metadata
  const [inputTokens, setInputTokens] = useState<number>(0);
  const [outputTokens, setOutputTokens] = useState<number>(0);

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setErrorMsg(null);
    setInputTokens(0);
    setOutputTokens(0);
    // Move to configuring state to show tokens/options before uploading
    setStatus(AppStatus.CONFIGURING);
  };

  const handleStartTranscription = async (config: TranscriptionConfig) => {
    if (!file) return;

    // Set estimates initially
    if (config.estimatedInputTokens) setInputTokens(config.estimatedInputTokens);
    if (config.estimatedOutputTokens) setOutputTokens(config.estimatedOutputTokens);
    
    setStatus(AppStatus.UPLOADING);

    try {
      // 1. Upload
      const fileUri = await uploadAudioFile(file);
      
      // 2. Wait for processing
      setStatus(AppStatus.PROCESSING);
      await waitForFileActive(fileUri);

      // 3. Transcribe
      setStatus(AppStatus.TRANSCRIBING);
      
      const speakerCountVal = config.speakerCount === 'auto' ? undefined : config.speakerCount;
      const result = await transcribeAudio(fileUri, file.type, speakerCountVal);

      setTranscription(result.text);
      
      // Update with actuals if available
      if (result.usageMetadata) {
        setInputTokens(result.usageMetadata.promptTokenCount || 0);
        setOutputTokens(result.usageMetadata.candidatesTokenCount || 0);
      }
      
      setStatus(AppStatus.COMPLETED);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An unexpected error occurred.");
      setStatus(AppStatus.ERROR);
    }
  };

  const handleReset = () => {
    setFile(null);
    setTranscription("");
    setStatus(AppStatus.IDLE);
    setErrorMsg(null);
    setInputTokens(0);
    setOutputTokens(0);
  };

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
            Powered by Gemini 3 Pro
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        
        {/* Intro */}
        {status === AppStatus.IDLE && (
          <div className="text-center mb-10 space-y-3 animate-in fade-in duration-500">
            <h2 className="text-3xl font-bold text-slate-900">
              Transcribe long-form audio in seconds
            </h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">
              Upload meetings, interviews, or voice notes. We'll generate a speaker-labeled markdown transcript for you.
            </p>
          </div>
        )}

        {/* Dynamic Status View */}
        <div className="space-y-8">
          
          {/* 1. Upload Area */}
          {status === AppStatus.IDLE && (
            <FileUpload onFileSelect={handleFileSelect} />
          )}

          {/* 2. Configuration / Review */}
          {status === AppStatus.CONFIGURING && file && (
            <ConfigurationForm 
              file={file}
              onStart={handleStartTranscription}
              onCancel={handleReset}
            />
          )}

          {/* 3. Processing State */}
          {(status === AppStatus.UPLOADING || status === AppStatus.PROCESSING || status === AppStatus.TRANSCRIBING) && (
             <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm flex flex-col items-center text-center space-y-6 animate-in fade-in duration-500">
                <div className="relative">
                   <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-75"></div>
                   <div className="relative bg-white p-4 rounded-full border-2 border-blue-100 shadow-sm">
                      <LoaderIcon className="w-8 h-8 text-blue-600 animate-spin" />
                   </div>
                </div>
                
                <div className="space-y-2 max-w-md">
                   <h3 className="text-xl font-semibold text-slate-800">
                      {status === AppStatus.UPLOADING && "Uploading Audio..."}
                      {status === AppStatus.PROCESSING && "Processing Audio File..."}
                      {status === AppStatus.TRANSCRIBING && "Transcribing Conversation..."}
                   </h3>
                   <p className="text-slate-500">
                      {status === AppStatus.UPLOADING && "Sending your file to secure storage. Large files may take a moment."}
                      {status === AppStatus.PROCESSING && "Waiting for the file to be ready for AI analysis."}
                      {status === AppStatus.TRANSCRIBING && "Gemini is listening to the audio and identifying speakers."}
                   </p>
                </div>

                {file && (
                  <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-lg border border-slate-100 text-sm text-slate-600">
                    <FileAudioIcon className="w-4 h-4" />
                    <span className="truncate max-w-[200px]">{file.name}</span>
                    <span className="text-slate-400">|</span>
                    <span className="text-slate-400">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                  </div>
                )}
             </div>
          )}

          {/* 4. Error State */}
          {status === AppStatus.ERROR && (
             <div className="bg-red-50 rounded-xl border border-red-100 p-6 flex flex-col items-center text-center space-y-4 animate-in fade-in duration-300">
                <div className="text-red-600 font-semibold">Processing Failed</div>
                <p className="text-red-500 text-sm">{errorMsg}</p>
                <button 
                  onClick={handleReset}
                  className="px-4 py-2 bg-white border border-red-200 text-red-700 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors shadow-sm"
                >
                  Try Again
                </button>
             </div>
          )}

          {/* 5. Success/Result State */}
          {status === AppStatus.COMPLETED && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
               <div className="flex justify-between items-center">
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                      <FileAudioIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-slate-900 font-medium">{file?.name}</h3>
                      <p className="text-slate-500 text-xs">Transcribed successfully</p>
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
                 fileName={file?.name || "Audio"} 
                 inputTokens={inputTokens}
                 outputTokens={outputTokens}
               />
            </div>
          )}

        </div>
      </main>

    </div>
  );
};

export default App;