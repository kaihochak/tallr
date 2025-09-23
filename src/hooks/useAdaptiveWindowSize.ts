import { useEffect, useCallback, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';

// Window dimension constants for different modes
const SIMPLE_MODE_WIDTH = 360;
const SIMPLE_MODE_HEIGHT = 200;

const FULL_MODE_WIDTH = 360;
const FULL_MODE_HEIGHT = 320;

const TALLY_MODE_WIDTH = 360;
const TALLY_MODE_HEIGHT = 90;

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
    _count: number,
    _showDone: boolean,
    _error: boolean,
    _loading: boolean
  ): number => {
    if (mode === 'tally') {
      return TALLY_MODE_HEIGHT;
    }

    if (mode === 'simple') {
      return SIMPLE_MODE_HEIGHT;
    }

    return FULL_MODE_HEIGHT;
  }, []);

  // Calculate optimal window width based on mode
  const calculateOptimalWidth = useCallback((mode: string): number => {
    if (mode === 'tally') {
      return TALLY_MODE_WIDTH;
    } else if (mode === 'simple') {
      return SIMPLE_MODE_WIDTH;
    } else {
      return FULL_MODE_WIDTH;
    }
  }, []);

  // Debounced window resize function
  const applyWindowSize = useCallback(async (isViewModeChange = false) => {
    const appWindow = getCurrentWindow();

    try {
      const currentSize = await appWindow.outerSize();
      const optimalHeight = calculateOptimalHeight(viewMode, taskCount, showDoneTasks, hasError, isLoading);
      const optimalWidth = calculateOptimalWidth(viewMode);
      
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
        await appWindow.setSize(new LogicalSize(optimalWidth, optimalHeight));
      } else {
        // For non-tally modes, apply optimal dimensions
        await appWindow.setSize(new LogicalSize(optimalWidth, optimalHeight));
        
        // Clear prevSize if we were coming from tally mode
        if (prevSize && isViewModeChange) {
          setPrevSize(null);
        }
      }

      lastAppliedHeightRef.current = optimalHeight;
    } catch (err) {
      console.warn('Failed to apply adaptive sizing', err);
    }
  }, [viewMode, taskCount, showDoneTasks, hasError, isLoading, calculateOptimalHeight, calculateOptimalWidth, prevSize]);

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