import { useState, useEffect } from 'react';
import { Bug, Circle, CheckCircle, XCircle, Copy, Check, Terminal, Activity, Eye, Code, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ApiService, DebugData, logApiError } from '@/services/api';
import { debug } from '@/utils/debug';
import TaskStateBadge from './TaskStateBadge';

interface DebugPageProps {
  taskId: string | null;
  onBack: () => void;
}

export function DebugPage({ taskId, onBack }: DebugPageProps) {
  const [debugData, setDebugData] = useState<DebugData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState('quick');

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

    // Poll every 2 seconds
    const interval = setInterval(fetchDebugData, 2000);
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
            onClick={() => setActiveTab('quick')}
            className={cn(
              "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all gap-2 cursor-pointer",
              activeTab === 'quick' 
                ? "bg-bg-primary text-text-primary shadow-sm" 
                : "hover:bg-bg-hover hover:text-text-primary"
            )}
          >
            <Activity size={16} />
            Quick View
          </button>
          <button
            onClick={() => setActiveTab('patterns')}
            className={cn(
              "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all gap-2 cursor-pointer",
              activeTab === 'patterns' 
                ? "bg-bg-primary text-text-primary shadow-sm" 
                : "hover:bg-bg-hover hover:text-text-primary"
            )}
          >
            <Code size={16} />
            Patterns
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={cn(
              "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all gap-2 cursor-pointer",
              activeTab === 'logs' 
                ? "bg-bg-primary text-text-primary shadow-sm" 
                : "hover:bg-bg-hover hover:text-text-primary"
            )}
          >
            <Terminal size={16} />
            Logs
          </button>
          <button
            onClick={() => setActiveTab('raw')}
            className={cn(
              "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all gap-2 cursor-pointer",
              activeTab === 'raw' 
                ? "bg-bg-primary text-text-primary shadow-sm" 
                : "hover:bg-bg-hover hover:text-text-primary"
            )}
          >
            <Eye size={16} />
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
            {/* Quick View Tab */}
            {activeTab === 'quick' && (
              <div className="space-y-6 mt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-bg-card p-6 rounded-lg border border-border-primary">
                    <h3 className="font-semibold text-text-primary mb-4">Current State</h3>
                    <div className="flex items-center gap-3 mb-2">
                      <TaskStateBadge state={debugData.currentState} className="px-3 py-2" />
                      <span className="text-sm text-text-secondary">({debugData.confidence})</span>
                    </div>
                    <div className={cn(
                      "text-sm mt-2",
                      debugData.isActive ? "text-green-600" : "text-red-600"
                    )}>
                      {debugData.isActive ? '● Active Session' : '○ Inactive Session'}
                    </div>
                  </div>
                  
                  <div className="bg-bg-card p-6 rounded-lg border border-border-primary">
                    <h3 className="font-semibold text-text-primary mb-4">Session Info</h3>
                    <div className="space-y-2 text-sm">
                      <div><span className="text-text-secondary">Task ID:</span> <code className="ml-2">{debugData.taskId}</code></div>
                      <div><span className="text-text-secondary">Buffer Size:</span> <span className="ml-2">{debugData.currentBuffer.length} chars</span></div>
                      <div><span className="text-text-secondary">Pattern Tests:</span> <span className="ml-2">{debugData.patternTests.length}</span></div>
                    </div>
                  </div>
                  
                  <div className="bg-bg-card p-6 rounded-lg border border-border-primary">
                    <h3 className="font-semibold text-text-primary mb-4">Quick Stats</h3>
                    <div className="space-y-2 text-sm">
                      <div><span className="text-text-secondary">Matching Patterns:</span> <span className="ml-2 text-green-600">{debugData.patternTests.filter(p => p.matches).length}</span></div>
                      <div><span className="text-text-secondary">State Changes:</span> <span className="ml-2">{debugData.detectionHistory.length}</span></div>
                      <div><span className="text-text-secondary">Last Update:</span> <span className="ml-2">{new Date().toLocaleTimeString()}</span></div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-bg-card p-6 rounded-lg border border-border-primary">
                  <h3 className="font-semibold text-text-primary mb-4">Recent Activity</h3>
                  <div className="space-y-2">
                    {debugData.detectionHistory.slice(-5).map((entry, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-bg-secondary rounded border">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm">{entry.from} → {entry.to}</span>
                          <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">{entry.confidence}</span>
                        </div>
                        <span className="text-sm text-text-secondary">{new Date(entry.timestamp * 1000).toLocaleTimeString()}</span>
                      </div>
                    ))}
                    {debugData.detectionHistory.length === 0 && (
                      <div className="text-center py-8 text-text-secondary">No state changes yet</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Patterns Tab */}
            {activeTab === 'patterns' && (
              <div className="space-y-6 mt-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-text-primary">Pattern Matching Results</h3>
                  <CopyButton onClick={copyPatternTests} copyKey="patterns" />
                </div>
                <div className="grid gap-4">
                  {debugData.patternTests.map((test, index) => (
                    <div key={index} className={cn(
                      "p-4 border rounded-lg",
                      test.matches ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"
                    )}>
                      <div className="flex items-center gap-3 mb-2">
                        {test.matches ? 
                          <CheckCircle size={20} className="text-green-600" /> : 
                          <XCircle size={20} className="text-gray-400" />
                        }
                        <code className="text-lg font-mono bg-bg-secondary px-3 py-1 rounded">{test.pattern}</code>
                        <span className="text-sm text-text-secondary">→ {test.expectedState}</span>
                      </div>
                      <div className="text-sm text-text-secondary ml-8">{test.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Logs Tab */}
            {activeTab === 'logs' && (
              <div className="space-y-6 mt-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-text-primary">State Change History</h3>
                  <CopyButton onClick={copyHistory} copyKey="history" />
                </div>
                <div className="space-y-4">
                  {debugData.detectionHistory.length === 0 ? (
                    <div className="text-center py-12 text-text-secondary">No state changes detected yet</div>
                  ) : (
                    debugData.detectionHistory.map((entry, index) => (
                      <div key={index} className="p-4 bg-bg-card border border-border-primary rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                          <div className="font-mono text-sm text-text-secondary">
                            {new Date(entry.timestamp * 1000).toLocaleString()}
                          </div>
                          <div className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">({entry.confidence})</div>
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                          <span className="px-3 py-1 rounded text-sm font-medium bg-gray-100 text-gray-800">{entry.from}</span>
                          <span className="text-text-secondary">→</span>
                          <span className="px-3 py-1 rounded text-sm font-medium bg-gray-100 text-gray-800">{entry.to}</span>
                        </div>
                        <div className="text-sm text-text-primary bg-bg-secondary p-3 rounded border font-mono whitespace-pre-wrap">
                          {entry.details}
                        </div>
                      </div>
                    ))
                  )}
                </div>
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