import { useState } from 'react';
import { Bug, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Task } from '@/types';
import { useDebugData } from '@/hooks/useDebugData';
import { DebugHeader } from './debug/DebugHeader';
import { StateChangeHistory } from './debug/StateChangeHistory';
import { RawBuffer } from './debug/RawBuffer';
import { ErrorDisplay } from './debug/ErrorDisplay';

interface DebugPageProps {
  taskId: string | null;
  task: Task | null;
  onBack: () => void;
}

export function DebugPage({ taskId, onBack }: DebugPageProps) {
  const { debugData, isLoading, error } = useDebugData(taskId);
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState('state-change');

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

  const copyBuffer = () => {
    if (!debugData) return;
    copyToClipboard(debugData.cleanedBuffer || '', 'buffer');
  };

  const copyHistory = () => {
    if (!debugData) return;
    const history = debugData.detectionHistory.map(entry => 
      `${new Date(entry.timestamp * 1000).toLocaleTimeString()} | ${entry.from} → ${entry.to} | ${entry.confidence} | ${entry.details}`
    ).join('\n');
    copyToClipboard(history, 'history');
  };

  return (
    <div className="h-screen bg-bg-primary flex flex-col">
      <DebugHeader 
        taskId={taskId}
        debugData={debugData}
        onBack={onBack}
        onCopyAll={copyAllDebugData}
        copiedStates={copiedStates}
      />

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
        {isLoading && (
          <div className="flex items-center justify-center gap-3 py-12 text-text-secondary">
            <Circle className="animate-spin" size={24} />
            <span className="text-lg">Loading debug data... (TaskID: {taskId || 'latest'})</span>
          </div>
        )}

        {!taskId && (
          <div className="flex items-center gap-3 p-6 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 mb-6">
            <Bug size={20} />
            <span>No task selected for debugging. Please select a task from the dropdown menu.</span>
          </div>
        )}

        {error && <ErrorDisplay error={error} />}

        {debugData && (
          <>
            {activeTab === 'state-change' && (
              <StateChangeHistory 
                debugData={debugData} 
                onCopy={copyHistory} 
                copiedStates={copiedStates} 
              />
            )}

            {activeTab === 'raw' && (
              <RawBuffer 
                debugData={debugData} 
                onCopy={copyBuffer} 
                copiedStates={copiedStates} 
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
