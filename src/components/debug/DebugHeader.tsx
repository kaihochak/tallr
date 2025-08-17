import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TaskStateBadge from '../TaskStateBadge';
import { CopyButton } from './CopyButton';
import { DebugData } from '@/services/api';

interface DebugHeaderProps {
  taskId: string | null;
  debugData: DebugData | null;
  onBack: () => void;
  onCopyAll: () => void;
  copiedStates: Record<string, boolean>;
}

export function DebugHeader({ taskId, debugData, onBack, onCopyAll, copiedStates }: DebugHeaderProps) {
  return (
    <div className="flex items-center justify-between px-6 py-8">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft size={18} />
        </Button>
        <div className="flex items-center gap-3">
          {(taskId || debugData?.taskId) && (
            <span className="px-2 py-1 bg-bg-secondary text-text-secondary text-sm rounded font-mono">
              Task: {taskId || debugData?.taskId}
            </span>
          )}
          {debugData && (
            <TaskStateBadge state={debugData.currentState} />
          )}
        </div>
      </div>
      <CopyButton onClick={onCopyAll} copyKey="all" copiedStates={copiedStates} />
    </div>
  );
}
