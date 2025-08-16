import { useState, useEffect } from 'react';
import { X, Bug, Circle, CheckCircle, XCircle } from 'lucide-react';

interface DebugData {
  currentBuffer: string;
  cleanedBuffer: string;
  patternTests: Array<{
    pattern: string;
    description: string;
    matches: boolean;
    expectedState: string;
  }>;
  currentState: string;
  confidence: string;
  detectionHistory: Array<{
    timestamp: number;
    from: string;
    to: string;
    details: string;
    confidence: string;
  }>;
  taskId: string;
  isActive: boolean;
}

interface DebugDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DebugDialog({ isOpen, onClose }: DebugDialogProps) {
  const [debugData, setDebugData] = useState<DebugData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchDebugData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch('http://127.0.0.1:4317/v1/debug/patterns');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        setDebugData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch debug data');
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
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="debug-dialog-overlay">
      <div className="debug-dialog">
        <div className="debug-header">
          <div className="debug-title">
            <Bug size={20} />
            <h2>Pattern Detection Debug</h2>
          </div>
          <button className="debug-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="debug-content">
          {isLoading && !debugData && (
            <div className="debug-loading">
              <Circle className="loading-spinner" size={20} />
              Loading debug data...
            </div>
          )}

          {error && (
            <div className="debug-error">
              <XCircle size={16} />
              {error}
            </div>
          )}

          {debugData && (
            <>
              {/* Current State */}
              <div className="debug-section">
                <h3>Current State</h3>
                <div className="debug-state-info">
                  <div className="state-badge">
                    <span className={`state-indicator state-${debugData.currentState.toLowerCase()}`}>
                      {debugData.currentState}
                    </span>
                    <span className="confidence">({debugData.confidence} confidence)</span>
                  </div>
                  <div className="task-info">
                    <strong>Task ID:</strong> {debugData.taskId}
                    <span className={`status ${debugData.isActive ? 'active' : 'inactive'}`}>
                      {debugData.isActive ? '🟢 Active' : '🔴 Inactive'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Buffer Content */}
              <div className="debug-section">
                <h3>Buffer Analysis</h3>
                <div className="buffer-content">
                  <div className="buffer-item">
                    <label>Raw Buffer ({debugData.currentBuffer.length} chars):</label>
                    <pre className="buffer-text raw">{debugData.currentBuffer || '(empty)'}</pre>
                  </div>
                  <div className="buffer-item">
                    <label>Cleaned Buffer ({debugData.cleanedBuffer.length} chars):</label>
                    <pre className="buffer-text cleaned">{debugData.cleanedBuffer || '(empty)'}</pre>
                  </div>
                </div>
              </div>

              {/* Pattern Tests */}
              <div className="debug-section">
                <h3>Pattern Matching</h3>
                <div className="pattern-tests">
                  {debugData.patternTests.map((test, index) => (
                    <div key={index} className={`pattern-test ${test.matches ? 'match' : 'no-match'}`}>
                      <div className="pattern-header">
                        {test.matches ? <CheckCircle size={16} /> : <XCircle size={16} />}
                        <code className="pattern-code">"{test.pattern}"</code>
                        <span className="pattern-state">→ {test.expectedState}</span>
                      </div>
                      <div className="pattern-description">{test.description}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Detection History */}
              <div className="debug-section">
                <h3>Recent History</h3>
                <div className="detection-history">
                  {debugData.detectionHistory.length === 0 ? (
                    <div className="no-history">No state changes detected yet</div>
                  ) : (
                    debugData.detectionHistory.map((entry, index) => (
                      <div key={index} className="history-entry">
                        <div className="history-time">
                          {new Date(entry.timestamp * 1000).toLocaleTimeString()}
                        </div>
                        <div className="history-transition">
                          <span className={`state-tag ${entry.from.toLowerCase()}`}>{entry.from}</span>
                          →
                          <span className={`state-tag ${entry.to.toLowerCase()}`}>{entry.to}</span>
                        </div>
                        <div className="history-details">{entry.details}</div>
                        <div className="history-confidence">({entry.confidence})</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}