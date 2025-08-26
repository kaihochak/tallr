import { useState, useEffect } from 'react';
import { ApiService, DebugData } from '@/services/api';
import { debug } from '@/utils/debug';

export function useDebugData(taskId: string | null) {
  const [debugData, setDebugData] = useState<DebugData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    debug.ui('Debug page opened', { taskId });

    const fetchDebugData = async () => {
      try {
        setError(null);
        
        debug.api('Fetching debug data', { taskId: taskId || 'latest' });
        
        let data;
        try {
          data = await ApiService.getDebugData(taskId || undefined);
        } catch (specificError) {
          if (taskId && specificError instanceof Error && specificError.message.includes('404')) {
            debug.api('Task-specific debug data not found, trying latest...', { taskId });
            data = await ApiService.getDebugData(undefined);
          } else {
            throw specificError;
          }
        }
        
        setDebugData(data);
        debug.ui('Debug data fetched successfully', { 
          taskId: data.taskId, 
          state: data.currentState,
          historyLength: data.detectionHistory.length,
          bufferLength: data.cleanedBuffer?.length || 0
        });
      } catch (err) {
        const apiError = err instanceof Error ? err : new Error('Failed to fetch debug data');
        console.error('[DEBUG] API call failed:', apiError);
        debug.api('Debug data fetch failed', { 
          error: apiError.message, 
          taskId: taskId || 'latest',
          stack: apiError.stack 
        });
        
        let errorMessage = apiError.message;
        if (apiError.message.includes('404')) {
          errorMessage = taskId 
            ? `No debug data found for task "${taskId}". This task may not have any pattern detection activity.`
            : 'No active debug sessions found. Start a CLI session to see debug data.';
        } else if (apiError.message.includes('timeout')) {
          errorMessage = 'Connection timeout. Make sure the Tallr app is running.';
        } else if (apiError.message.includes('ECONNREFUSED')) {
          errorMessage = 'Cannot connect to Tallr backend. Make sure the app is running on port 4317.';
        }
        
        setError(errorMessage);
        setDebugData(null);
      } finally {
        // Set loading to false after the first fetch attempt
        if (isLoading) {
            setIsLoading(false);
        }
      }
    };

    // Initial fetch
    setIsLoading(true);
    fetchDebugData();

    // Poll every 500ms
    const interval = setInterval(fetchDebugData, 500);
    
    return () => {
      clearInterval(interval);
      debug.ui('Debug page closed');
    };
  }, [taskId]);

  return { debugData, isLoading, error };
}
