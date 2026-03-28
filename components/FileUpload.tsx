import React, { useRef, useState } from 'react';
import { UploadIcon } from './Icons';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      validateAndSelect(file);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSelect(e.target.files[0]);
    }
  };

  const validateAndSelect = (file: File) => {
    // Basic validation for audio types
    if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
       onFileSelect(file);
    } else {
      alert("Please upload a valid audio or video file.");
    }
  };

  return (
    <div
      className={`relative border-2 border-dashed rounded-xl p-10 transition-all duration-200 ease-in-out
        ${isDragging 
          ? 'border-blue-500 bg-blue-50' 
          : 'border-slate-300 hover:border-slate-400 bg-white'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      <input
        type="file"
        ref={inputRef}
        onChange={handleChange}
        accept="audio/*,video/*"
        className="hidden"
        disabled={disabled}
      />
      
      <div className="flex flex-col items-center justify-center text-center space-y-4">
        <div className={`p-4 rounded-full ${isDragging ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
          <UploadIcon className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <p className="text-lg font-medium text-slate-700">
            {isDragging ? "Drop audio file here" : "Click to upload or drag and drop"}
          </p>
          <p className="text-sm text-slate-500">
            MP3, WAV, M4A, AAC (Max 2GB)
          </p>
        </div>
      </div>
    </div>
  );
};

export default FileUpload;
