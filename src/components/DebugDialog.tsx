import { useState, useEffect } from 'react';
import { Bug, Circle, CheckCircle, XCircle, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ApiService, DebugData, logApiError } from '@/services/api';


interface DebugDialogProps {
  isOpen: boolean;
  onClose: () => void;
  taskId?: string;
}

export function DebugDialog({ isOpen, onClose, taskId }: DebugDialogProps) {
  const [debugData, setDebugData] = useState<DebugData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});

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

  const copyBuffer = (buffer: string, type: 'raw' | 'cleaned') => {
    copyToClipboard(buffer, `buffer-${type}`);
  };

  const copyPatternTests = () => {
    if (!debugData) return;
    const patterns = debugData.patternTests.map(test => 
      `${test.matches ? '✓' : '✗'} ${test.pattern} → ${test.expectedState} (${test.description})`
    ).join('\n');
    copyToClipboard(patterns, 'patterns');
  };

  const copyHistory = () => {
    if (!debugData) return;
    const history = debugData.detectionHistory.map(entry => 
      `${new Date(entry.timestamp * 1000).toLocaleTimeString()} | ${entry.from} → ${entry.to} | ${entry.confidence} | ${entry.details}`
    ).join('\n');
    copyToClipboard(history, 'history');
  };

  useEffect(() => {
    if (!isOpen) return;

    const fetchDebugData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await ApiService.getDebugData(taskId);
        setDebugData(data);
      } catch (err) {
        const apiError = err instanceof Error ? err : new Error('Failed to fetch debug data');
        logApiError('/v1/debug/patterns', apiError);
        setError(apiError.message);
        setDebugData(null);
      } finally {
        setIsLoading(false);
      }
    };

    // Initial fetch
    fetchDebugData();

    // Poll every 500ms for real-time updates
    const interval = setInterval(fetchDebugData, 500);
    return () => clearInterval(interval);
  }, [isOpen, taskId]);

  if (!isOpen) return null;

  // Copy button component
  const CopyButton = ({ onClick, copyKey, className = "", size = 16 }: { 
    onClick: () => void; 
    copyKey: string; 
    className?: string;
    size?: number;
  }) => (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className={cn("h-8 w-8 text-text-secondary hover:text-text-primary", className)}
      title="Copy to clipboard"
    >
      {copiedStates[copyKey] ? <Check size={size} /> : <Copy size={size} />}
    </Button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <DialogTitle className="flex items-center gap-3 text-lg font-semibold">
            <Bug size={20} className="text-text-primary" />
            Pattern Detection Debug
          </DialogTitle>
          <div className="flex items-center gap-2">
            <CopyButton 
              onClick={copyAllDebugData} 
              copyKey="all" 
              className="h-8 w-8"
              size={16}
            />
          </div>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[calc(90vh-120px)] space-y-6 pr-2">
          {isLoading && !debugData && (
            <div className="flex items-center justify-center gap-3 py-8 text-text-secondary">
              <Circle className="animate-spin" size={20} />
              Loading debug data...
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
              <XCircle size={16} />
              {error}
            </div>
          )}

          {debugData && (
            <>
              {/* Current State */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-text-primary">Current State</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "px-3 py-1.5 rounded-lg font-medium text-sm",
                      debugData.currentState.toLowerCase() === 'pending' && "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300",
                      debugData.currentState.toLowerCase() === 'working' && "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300",
                      debugData.currentState.toLowerCase() === 'idle' && "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300"
                    )}>
                      {debugData.currentState}
                    </span>
                    <span className="text-text-secondary text-sm">({debugData.confidence} confidence)</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-text-primary"><strong>Task ID:</strong> {debugData.taskId}</span>
                    <span className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium",
                      debugData.isActive ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300" : "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300"
                    )}>
                      {debugData.isActive ? '🟢 Active' : '🔴 Inactive'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Buffer Content */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-text-primary">Buffer Analysis</h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-text-primary">Raw Buffer ({debugData.currentBuffer.length} chars)</label>
                      <CopyButton 
                        onClick={() => copyBuffer(debugData.currentBuffer, 'raw')} 
                        copyKey="buffer-raw"
                        size={14}
                      />
                    </div>
                    <pre 
                      className="p-3 bg-bg-secondary border border-border-primary rounded-lg text-xs text-text-primary font-mono whitespace-pre-wrap cursor-pointer hover:bg-bg-tertiary transition-colors max-h-32 overflow-y-auto" 
                      onClick={() => copyBuffer(debugData.currentBuffer, 'raw')}
                    >
                      {debugData.currentBuffer || '(empty)'}
                    </pre>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-text-primary">Cleaned Buffer ({debugData.cleanedBuffer.length} chars)</label>
                      <CopyButton 
                        onClick={() => copyBuffer(debugData.cleanedBuffer, 'cleaned')} 
                        copyKey="buffer-cleaned"
                        size={14}
                      />
                    </div>
                    <pre 
                      className="p-3 bg-bg-secondary border border-border-primary rounded-lg text-xs text-text-primary font-mono whitespace-pre-wrap cursor-pointer hover:bg-bg-tertiary transition-colors max-h-32 overflow-y-auto"
                      onClick={() => copyBuffer(debugData.cleanedBuffer, 'cleaned')}
                    >
                      {debugData.cleanedBuffer || '(empty)'}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Pattern Tests */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-text-primary">Pattern Matching</h3>
                  <CopyButton 
                    onClick={copyPatternTests} 
                    copyKey="patterns"
                    size={14}
                  />
                </div>
                <div className="space-y-2">
                  {debugData.patternTests.map((test, index) => (
                    <div key={index} className={cn(
                      "p-3 border rounded-lg",
                      test.matches 
                        ? "bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800" 
                        : "bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-800"
                    )}>
                      <div className="flex items-center gap-3 mb-2">
                        {test.matches ? 
                          <CheckCircle size={16} className="text-green-600 dark:text-green-400" /> : 
                          <XCircle size={16} className="text-red-600 dark:text-red-400" />
                        }
                        <code className="bg-bg-secondary px-2 py-1 rounded text-sm font-mono text-text-primary">"{test.pattern}"</code>
                        <span className="text-text-secondary text-sm">→ {test.expectedState}</span>
                      </div>
                      <div className="text-sm text-text-secondary ml-7">{test.description}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Detection History */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-text-primary">Recent History</h3>
                  <CopyButton 
                    onClick={copyHistory} 
                    copyKey="history"
                    size={14}
                  />
                </div>
                <div className="space-y-2">
                  {debugData.detectionHistory.length === 0 ? (
                    <div className="text-center py-8 text-text-secondary">No state changes detected yet</div>
                  ) : (
                    debugData.detectionHistory.map((entry, index) => (
                      <div key={index} className="p-3 bg-bg-secondary border border-border-primary rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-mono text-text-secondary">
                            {new Date(entry.timestamp * 1000).toLocaleTimeString()}
                          </div>
                          <div className="text-xs text-text-tertiary">({entry.confidence})</div>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={cn(
                            "px-2 py-1 rounded text-xs font-medium",
                            entry.from.toLowerCase() === 'pending' && "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300",
                            entry.from.toLowerCase() === 'working' && "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300",
                            entry.from.toLowerCase() === 'idle' && "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300"
                          )}>{entry.from}</span>
                          <span className="text-text-secondary">→</span>
                          <span className={cn(
                            "px-2 py-1 rounded text-xs font-medium",
                            entry.to.toLowerCase() === 'pending' && "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300",
                            entry.to.toLowerCase() === 'working' && "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300",
                            entry.to.toLowerCase() === 'idle' && "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300"
                          )}>{entry.to}</span>
                        </div>
                        <div className="text-sm text-text-primary">{entry.details}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}