import { useEffect, useCallback, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface UseAdaptiveWindowSizeParams {
  viewMode: 'full' | 'simple' | 'tally';
  taskCount: number;
  showDoneTasks: boolean;
  hasError: boolean;
  isLoading: boolean;
}

export const useAdaptiveWindowSize = ({
  viewMode,
  taskCount,
  showDoneTasks,
  hasError,
  isLoading
}: UseAdaptiveWindowSizeParams) => {
  const [prevSize, setPrevSize] = useState<{ width: number; height: number } | null>(null);
  const lastAppliedHeightRef = useRef<number | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate optimal window height based on content
  const calculateOptimalHeight = useCallback((
    mode: string, 
    count: number, 
    _showDone: boolean, 
    error: boolean, 
    loading: boolean
  ): number => {
    const TOOLBAR_HEIGHT = 44;
    const FOOTER_HEIGHT = mode === 'simple' ? 50 : 60; // Smaller footer for simple mode
    const PADDING = mode === 'simple' ? 24 : 32; // Less padding for simple mode
    const BUFFER = mode === 'simple' ? 16 : 20; // Less buffer for simple mode
    
    if (mode === 'tally') {
      return 110; // Fixed height for tally mode (44px toolbar + 44px tally lights + 22px labels)
    }
    
    if (error) {
      return Math.max(300, TOOLBAR_HEIGHT + 150 + FOOTER_HEIGHT + PADDING + BUFFER);
    }
    
    if (loading || count === 0) {
      return TOOLBAR_HEIGHT + 400 + FOOTER_HEIGHT + PADDING + BUFFER; // ~536px
    }
    
    // Calculate based on task rows
    const TASK_HEIGHT = mode === 'simple' ? 36 : 52; // Reduced simple mode height
    const PROJECT_FILTER_HEIGHT = mode === 'simple' ? 40 : 48; // Slightly smaller filter height for simple mode
    const tasksHeight = count * TASK_HEIGHT;
    const totalContentHeight = PROJECT_FILTER_HEIGHT + tasksHeight;
    
    const calculatedHeight = TOOLBAR_HEIGHT + totalContentHeight + FOOTER_HEIGHT + PADDING + BUFFER;
    
    // Apply reasonable bounds
    const MIN_HEIGHT = 400;
    const MAX_HEIGHT = Math.min(800, window.screen.availHeight * 0.8);
    
    return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, calculatedHeight));
  }, []);

  // Debounced window resize function
  const applyWindowSize = useCallback(async (isViewModeChange = false) => {
    const appWindow = getCurrentWindow();
    
    try {
      const currentSize = await appWindow.outerSize();
      const optimalHeight = calculateOptimalHeight(viewMode, taskCount, showDoneTasks, hasError, isLoading);
      
      // Skip if height hasn't changed significantly (unless it's a view mode change)
      if (!isViewModeChange && lastAppliedHeightRef.current !== null) {
        const heightDiff = Math.abs(currentSize.height - optimalHeight);
        if (heightDiff < 50) {
          return;
        }
      }
      
      if (viewMode === 'tally') {
        // Store previous size before switching to tally
        if (!prevSize && isViewModeChange) {
          setPrevSize({ width: currentSize.width, height: currentSize.height });
        }
        await appWindow.setResizable(false);
        await appWindow.setSize({ 
          width: currentSize.width, 
          height: optimalHeight, 
          type: 'Physical' 
        } as any);
      } else {
        // For non-tally modes, apply optimal height but keep resizable
        await appWindow.setResizable(true);
        
        await appWindow.setSize({ 
          width: currentSize.width, 
          height: optimalHeight, 
          type: 'Physical' 
        } as any);
        
        // Clear prevSize if we were coming from tally mode
        if (prevSize && isViewModeChange) {
          setPrevSize(null);
        }
      }
      
      lastAppliedHeightRef.current = optimalHeight;
    } catch (err) {
      console.warn('Failed to apply adaptive sizing', err);
    }
  }, [viewMode, taskCount, showDoneTasks, hasError, isLoading, calculateOptimalHeight, prevSize]);

  // Effect for view mode changes (immediate)
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      applyWindowSize(true);
    }, 100);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  // Effect for content changes (debounced)
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      applyWindowSize(false);
    }, 300);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskCount, showDoneTasks, hasError, isLoading]);

  return {
    // Expose function for manual resize if needed
    resizeWindow: () => applyWindowSize(false)
  };
};