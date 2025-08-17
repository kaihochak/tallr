import { DebugData } from '@/services/api';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import TaskStateBadge from '../TaskStateBadge';
import { CopyButton } from './CopyButton';

interface StateChangeHistoryProps {
  debugData: DebugData;
  onCopy: () => void;
  copiedStates: Record<string, boolean>;
}

export function StateChangeHistory({ debugData, onCopy, copiedStates }: StateChangeHistoryProps) {
  return (
    <div className="bg-bg-card p-6 rounded-lg border border-border-primary">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-text-primary">State Change History</h3>
        <CopyButton onClick={onCopy} copyKey="history" copiedStates={copiedStates} />
      </div>
      {debugData.detectionHistory.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">No state changes detected yet</div>
      ) : (
        <Accordion type="single" collapsible className="w-full">
          {debugData.detectionHistory.map((entry, index) => (
            <AccordionItem key={index} value={`item-${index}`}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-3">
                    <div className="font-mono text-sm text-text-secondary">
                      {new Date(entry.timestamp * 1000).toLocaleTimeString()}
                    </div>
                    <TaskStateBadge state={entry.from} />
                    <span className="text-text-secondary">→</span>
                    <TaskStateBadge state={entry.to} />
                  </div>
                  <div className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">({entry.confidence})</div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="text-sm text-text-primary bg-bg-tertiary p-3 rounded border font-mono whitespace-pre-wrap mt-2">
                  {entry.details}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
