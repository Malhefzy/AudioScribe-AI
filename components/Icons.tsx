// Helper to extract approx font size from tailwind width classes to maintain consistency
// without needing to rewrite every usage site in the app.
const getFontSize = (className: string = '') => {
  if (className.includes('w-3')) return '12px';
  if (className.includes('w-4')) return '16px';
  if (className.includes('w-5')) return '20px';
  if (className.includes('w-6')) return '24px';
  if (className.includes('w-8')) return '32px';
  if (className.includes('w-10')) return '40px';
  if (className.includes('w-12')) return '48px';
  return '24px'; // Default material icon size
};

const MaterialIcon = ({ name, className }: { name: string, className?: string }) => {
  const fontSize = getFontSize(className);
  
  return (
    <span 
      className={`material-icons ${className || ''}`} 
      style={{ 
        fontSize, 
        width: fontSize, 
        height: fontSize, 
        overflow: 'hidden', 
        display: 'inline-flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        verticalAlign: 'middle',
        userSelect: 'none'
      }}
    >
      {name}
    </span>
  );
};

export const UploadIcon = ({ className }: { className?: string }) => (
  <MaterialIcon name="cloud_upload" className={className} />
);

export const DownloadIcon = ({ className }: { className?: string }) => (
  <MaterialIcon name="download" className={className} />
);

export const FileAudioIcon = ({ className }: { className?: string }) => (
  <MaterialIcon name="audio_file" className={className} />
);

export const LoaderIcon = ({ className }: { className?: string }) => (
  <MaterialIcon name="sync" className={className} />
);

export const CheckIcon = ({ className }: { className?: string }) => (
  <MaterialIcon name="check" className={className} />
);

export const CopyIcon = ({ className }: { className?: string }) => (
  <MaterialIcon name="content_copy" className={className} />
);

export const SparklesIcon = ({ className }: { className?: string }) => (
  <MaterialIcon name="auto_awesome" className={className} />
);

export const UsersIcon = ({ className }: { className?: string }) => (
  <MaterialIcon name="group" className={className} />
);

export const PencilIcon = ({ className }: { className?: string }) => (
  <MaterialIcon name="edit" className={className} />
);

export const CloseIcon = ({ className }: { className?: string }) => (
  <MaterialIcon name="close" className={className} />
);

export const PlayIcon = ({ className }: { className?: string }) => (
  <MaterialIcon name="play_arrow" className={className} />
);

export const PauseIcon = ({ className }: { className?: string }) => (
  <MaterialIcon name="pause" className={className} />
);

export const StopIcon = ({ className }: { className?: string }) => (
  <MaterialIcon name="stop" className={className} />
);

export const SkipBackIcon = ({ className }: { className?: string }) => (
  <MaterialIcon name="replay_10" className={className} />
);

export const SkipForwardIcon = ({ className }: { className?: string }) => (
  <MaterialIcon name="forward_10" className={className} />
);

export const MarkerIcon = ({ className }: { className?: string }) => (
  <MaterialIcon name="push_pin" className={className} />
);

export const DeleteIcon = ({ className }: { className?: string }) => (
  <MaterialIcon name="delete" className={className} />
);

export const ScissorsIcon = ({ className }: { className?: string }) => (
  <MaterialIcon name="content_cut" className={className} />
);
