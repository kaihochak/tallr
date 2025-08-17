import { useState, useEffect } from 'react';
import { Bug, Circle, XCircle, Copy, Check, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ApiService, DebugData, logApiError } from '@/services/api';
import { debug } from '@/utils/debug';
import TaskStateBadge from './TaskStateBadge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface DebugPageProps {
  taskId: string | null;
  onBack: () => void;
}

export function DebugPage({ taskId, onBack }: DebugPageProps) {
  const [debugData, setDebugData] = useState<DebugData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState('state-change');

  // Copy functionality
  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStates(prev => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setCopiedStates(prev => ({ ...prev, [key]: false }));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const copyAllDebugData = () => {
    if (!debugData) return;
    const allData = JSON.stringify(debugData, null, 2);
    copyToClipboard(allData, 'all');
  };

  const copyBuffer = (buffer: string) => {
    copyToClipboard(buffer, 'buffer');
  };


  const copyHistory = () => {
    if (!debugData) return;
    const history = debugData.detectionHistory.map(entry => 
      `${new Date(entry.timestamp * 1000).toLocaleTimeString()} | ${entry.from} → ${entry.to} | ${entry.confidence} | ${entry.details}`
    ).join('\n');
    copyToClipboard(history, 'history');
  };

  useEffect(() => {
    debug.ui('Debug page opened');

    const fetchDebugData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await ApiService.getDebugData(taskId || undefined);
        setDebugData(data);
        debug.ui('Debug data fetched', { taskId: data.taskId, state: data.currentState });
      } catch (err) {
        const apiError = err instanceof Error ? err : new Error('Failed to fetch debug data');
        debug.ui('Debug data fetch failed', { error: apiError.message });
        logApiError('/v1/debug/patterns', apiError);
        setError(apiError.message);
        setDebugData(null);
      } finally {
        setIsLoading(false);
      }
    };

    // Initial fetch
    fetchDebugData();

    // Poll every 250ms for responsive updates
    const interval = setInterval(fetchDebugData, 250);
    return () => {
      clearInterval(interval);
      debug.ui('Debug page closed');
    };
  }, [taskId]);

  // Copy button component
  const CopyButton = ({ onClick, copyKey, className = "", size = 16 }: { 
    onClick: () => void; 
    copyKey: string; 
    className?: string;
    size?: number;
  }) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn("h-8 w-8 text-text-secondary hover:text-text-primary", className)}
      title="Copy to clipboard"
    >
      {copiedStates[copyKey] ? <Check size={size} /> : <Copy size={size} />}
    </Button>
  );

  return (
    <div className="h-screen bg-bg-primary flex flex-col">
      {/* Header */}
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
            {taskId && (
              <span className="px-2 py-1 bg-bg-secondary text-text-secondary text-sm rounded font-mono">
                Task: {taskId}
              </span>
            )}
            {debugData && (
              <TaskStateBadge state={debugData.currentState} />
            )}
          </div>
        </div>
        <CopyButton onClick={copyAllDebugData} copyKey="all" />
      </div>

      {/* Tab Navigation */}
      <div className="mx-6">
        <div className="inline-flex h-10 items-center justify-center rounded-md bg-bg-secondary p-1 text-text-secondary">
          <button
            onClick={() => setActiveTab('state-change')}
            className={cn(
              "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all cursor-pointer",
              activeTab === 'state-change' 
                ? "bg-bg-primary text-text-primary shadow-sm" 
                : "hover:bg-bg-hover hover:text-text-primary"
            )}
          >
            State Change
          </button>
          <button
            onClick={() => setActiveTab('raw')}
            className={cn(
              "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all cursor-pointer",
              activeTab === 'raw' 
                ? "bg-bg-primary text-text-primary shadow-sm" 
                : "hover:bg-bg-hover hover:text-text-primary"
            )}
          >
            Raw Data
          </button>
        </div>
      </div>

      {/* Content */}
      <div className={cn(
        "px-6 py-4",
        activeTab === 'raw' ? "flex-1 flex flex-col" : "overflow-y-auto"
      )}>
        {isLoading && !debugData && (
          <div className="flex items-center justify-center gap-3 py-12 text-text-secondary">
            <Circle className="animate-spin" size={24} />
            <span className="text-lg">Loading debug data...</span>
          </div>
        )}

        {!taskId && (
          <div className="flex items-center gap-3 p-6 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 mb-6">
            <Bug size={20} />
            <span>No task selected for debugging. Please select a task from the dropdown menu.</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 p-6 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive mb-6">
            <XCircle size={20} />
            <span>{error}</span>
          </div>
        )}

        {taskId && debugData && (
          <>
            {/* State Change Tab */}
            {activeTab === 'state-change' && (
              <div className="bg-bg-card p-6 rounded-lg border border-border-primary">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-text-primary">State Change History</h3>
                  <CopyButton onClick={copyHistory} copyKey="history" />
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
            )}

            {/* Raw Tab */}
            {activeTab === 'raw' && (
              <div className="flex flex-col h-full min-h-0">
                <div className="flex items-center justify-between mb-4 flex-shrink-0">
                  <h3 className="text-xl font-semibold text-text-primary">Buffer ({debugData.cleanedBuffer.length} chars)</h3>
                  <CopyButton onClick={() => copyBuffer(debugData.cleanedBuffer)} copyKey="buffer" />
                </div>
                <pre 
                  className="flex-1 min-h-0 p-4 bg-bg-card border border-border-primary rounded-lg text-sm font-mono whitespace-pre-wrap cursor-pointer hover:bg-bg-secondary transition-colors overflow-auto"
                  onClick={() => copyBuffer(debugData.cleanedBuffer)}
                >
                  {debugData.cleanedBuffer || '(empty)'}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}