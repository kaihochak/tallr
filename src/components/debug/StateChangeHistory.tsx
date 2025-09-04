import { DebugData, StateChangeDetails } from '@/services/api';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import TaskStateBadge from '../TaskStateBadge';
import { CopyButton } from './CopyButton';
import { Check, X } from 'lucide-react';

interface StateChangeHistoryProps {
  debugData: DebugData;
  onCopy: () => void;
  copiedStates: Record<string, boolean>;
}

export function StateChangeHistory({ debugData, onCopy, copiedStates }: StateChangeHistoryProps) {
  const renderDetails = (details: string | StateChangeDetails) => {
    if (typeof details === 'string') {
      // Legacy format - just show the string
      return (
        <div className="text-sm text-text-primary bg-bg-tertiary p-3 rounded border font-mono whitespace-pre-wrap mt-2">
          {details}
        </div>
      );
    }
    
    // New enhanced format with detection window and pattern tests
    return (
      <div className="space-y-3 mt-2">
        {details.detectionWindow && (
          <div>
            <div className="text-xs text-text-secondary mb-1">Detection Window (5 lines):</div>
            <div className="text-sm text-text-primary bg-bg-tertiary p-3 rounded border font-mono whitespace-pre-wrap">
              {details.detectionWindow}
            </div>
          </div>
        )}
        
        {details.patternTests && details.patternTests.length > 0 && (
          <div>
            <div className="text-xs text-text-secondary mb-1">Pattern Tests:</div>
            <div className="bg-bg-tertiary p-3 rounded border space-y-1">
              {details.patternTests.map((test, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  <div className="w-4">
                    {test.matches ? (
                      <Check className="text-green-500" size={14} />
                    ) : (
                      <X className="text-gray-400" size={14} />
                    )}
                  </div>
                  <span className={`font-mono ${test.matches ? 'text-green-600' : 'text-gray-500'}`}>
                    {test.pattern}
                  </span>
                  <span className="text-xs text-text-secondary">→ {test.expectedState}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };
  
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
          {debugData.detectionHistory.slice().reverse().map((entry, index) => (
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
                  <div className="flex items-center gap-2">
                    <div className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">({entry.confidence})</div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {renderDetails(entry.details)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
