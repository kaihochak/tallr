import { DebugData } from '@/services/api';
import { CopyButton } from './CopyButton';

interface RawBufferProps {
  debugData: DebugData;
  onCopy: () => void;
  copiedStates: Record<string, boolean>;
}

export function RawBuffer({ debugData, onCopy, copiedStates }: RawBufferProps) {
  const buffer = debugData?.cleanedBuffer || '';
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h3 className="text-xl font-semibold text-text-primary">Buffer ({buffer.length} chars)</h3>
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
