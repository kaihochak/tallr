import { DebugData } from '@/services/api';
import { CopyButton } from './CopyButton';

interface RawBufferProps {
  debugData: DebugData;
  onCopy: () => void;
  copiedStates: Record<string, boolean>;
}

export function RawBuffer({ debugData, onCopy, copiedStates }: RawBufferProps) {
  const buffer = debugData?.cleanedBuffer || '';
  const fullLength = (debugData as any)?.fullBufferLength || buffer.length;
  
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h3 className="text-xl font-semibold text-text-primary">
          Detection Window (Last 5 Lines)
          {fullLength > buffer.length && (
            <span className="text-sm text-text-secondary ml-2">
              [{buffer.length} of {fullLength} total chars]
            </span>
          )}
        </h3>
        <CopyButton onClick={onCopy} copyKey="buffer" copiedStates={copiedStates} />
      </div>
      <pre
        className="flex-1 min-h-0 p-4 bg-bg-card border border-border-primary rounded-lg text-sm font-mono whitespace-pre-wrap cursor-pointer hover:bg-bg-secondary transition-colors overflow-auto"
        onClick={onCopy}
      >
        {buffer || '(empty)'}
      </pre>
    </div>
  );
}
