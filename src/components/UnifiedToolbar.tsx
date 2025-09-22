import { 
  Pin,
  Bell,
  BellOff,
  Sun,
  Moon,
  Rows3,
  Rows2,
  Square,
  ArrowUpDown,
  ListOrdered,
  Columns2,
  AlignJustify
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import React, { useRef } from 'react';

interface UnifiedToolbarProps {
  aggregateState: string;
  activeTasks: number; // retained for API compatibility (unused here)
  doneTasks: number;   // retained for API compatibility (unused here)
  showDoneTasks: boolean; // retained for API compatibility (unused here)
  alwaysOnTop: boolean;
  notificationsEnabled: boolean;
  autoSortTasks: boolean;
  groupByProject: boolean;
  theme: 'light' | 'dark';
  viewMode: 'full' | 'simple' | 'tally';
  onTogglePin: () => void;
  onToggleDoneTasks: () => void; // retained (unused here)
  onToggleNotifications: () => void;
  onToggleAutoSortTasks: () => void;
  onToggleGroupByProject: () => void;
  onToggleTheme: () => void;
  onToggleViewMode: () => void;
}

export default function UnifiedToolbar({
  aggregateState,
  /* unused here: */ activeTasks: _activeTasks,
  /* unused here: */ doneTasks: _doneTasks,
  /* unused here: */ showDoneTasks: _showDoneTasks,
  alwaysOnTop,
  notificationsEnabled,
  autoSortTasks,
  groupByProject,
  theme,
  viewMode,
  onTogglePin,
  /* unused here: */ onToggleDoneTasks: _onToggleDoneTasks,
  onToggleNotifications,
  onToggleAutoSortTasks,
  onToggleGroupByProject,
  onToggleTheme,
  onToggleViewMode
}: UnifiedToolbarProps) {
  // Handle toolbar action via Tauri command
  const handleTogglePin = async () => {
    try {
      await invoke('toolbar_action', { action: 'toggle-pin' });
      onTogglePin();
    } catch (error) {
      console.error('Failed to toggle pin:', error);
      onTogglePin(); // Fallback to frontend handling
    }
  };

  const isLeftClick = (e: React.MouseEvent) =>
    e.button === 0 && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !e.altKey;

  const isMouseDownRef = useRef(false);
  const startedDragRef = useRef(false);
  const downPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const onMouseDownCapture = (e: React.MouseEvent) => {
    if (!isLeftClick(e)) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-drag]')) return;

    isMouseDownRef.current = true;
    startedDragRef.current = false;
    downPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const onMouseMoveCapture = (e: React.MouseEvent) => {
    if (!isMouseDownRef.current || startedDragRef.current) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-drag]')) return;

    const dx = e.clientX - downPosRef.current.x;
    const dy = e.clientY - downPosRef.current.y;
    if (Math.hypot(dx, dy) > 3) {
      startedDragRef.current = true;
      const appWindow = getCurrentWindow();
      void appWindow.startDragging().catch((err) => {
        console.warn('startDragging failed', err);
      });
    }
  };

  const onMouseUpCapture = () => {
    isMouseDownRef.current = false;
    startedDragRef.current = false;
  };

  const onDoubleClickCapture = async (e: React.MouseEvent) => {
    if (!isLeftClick(e)) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-drag]')) return;
    
    // Use Tauri command for macOS overlay titlebar compatibility
    try {
      await invoke('toolbar_action', { action: 'toggle-maximize' });
    } catch (err) {
      console.warn('toolbar_action toggle-maximize failed, falling back:', err);
      // Fallback to direct API call
      const appWindow = getCurrentWindow();
      void appWindow.toggleMaximize().catch((err2) => {
        console.warn('toggleMaximize fallback failed:', err2);
      });
    }
  };

  // Get theme icon and title
  const getThemeIcon = () => {
    return theme === 'light' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />;
  };

  const getThemeTitle = () => {
    return theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
  };

  // Get view mode icon and title
  const getViewModeIcon = () => {
    switch (viewMode) {
      case 'full': return <Rows3 className="w-4 h-4" />;
      case 'simple': return <Rows2 className="w-4 h-4" />;
      case 'tally': return <Square className="w-4 h-4" />;
    }
  };

  const getViewModeTitle = () => {
    switch (viewMode) {
      case 'full': return 'Switch to simple view';
      case 'simple': return 'Switch to tally view';
      case 'tally': return 'Switch to full view';
    }
  };

  return (
    <div
      className="fixed top-0 left-0 right-0 h-11 bg-transparent z-50 select-none pointer-events-none"
    >
      {/* Inner interactive content, leaves left area free for traffic lights */}
      <div
        className="absolute inset-y-0 right-0 left-[96px] flex items-center justify-between pointer-events-auto cursor-default"
        onMouseDownCapture={onMouseDownCapture}
        onMouseMoveCapture={onMouseMoveCapture}
        onMouseUpCapture={onMouseUpCapture}
        onDoubleClickCapture={onDoubleClickCapture}
      >
      {/* Left side - Reserve space for traffic lights via padding-left */}
      <div className="flex items-center gap-0 flex-1">
        {/* Show status indicator and title for all modes */}
        <div className="flex items-center gap-0">
          <div className={`status-indicator ${aggregateState}`} data-tauri-drag-region></div>
          <div className="flex items-center gap-2 ml-3" data-tauri-drag-region>
            <h1 className={`text-base font-bold bg-gradient-to-r bg-clip-text text-transparent tracking-tight m-0 select-none cursor-default ${
              aggregateState === 'pending' ? 'from-status-pending to-status-pending' :
              aggregateState === 'working' ? 'from-status-working to-status-working' :
              aggregateState === 'idle' ? 'from-status-idle to-status-idle' :
              'from-accent-primary to-accent-primary-hover'
            }`}>
              Tallr
            </h1>
          </div>
        </div>
        
        {/* Draggable spacer area between content and buttons */}
        <div className="flex-1 min-w-4" data-tauri-drag-region></div>
      </div>
      
      {/* Right side controls */}
      <div className="flex items-center gap-2 pr-4" data-no-drag>
        {/* All controls visible in all modes */}
        <Button
          variant="ghost"
          size="icon"
          className={`w-6 h-6 cursor-pointer transition-all duration-200 hover:scale-105 ${
            notificationsEnabled
              ? theme === 'light'
                ? 'bg-gray-300 text-gray-800 hover:bg-gray-400'
                : 'bg-gray-600 text-white hover:bg-gray-700'
              : 'bg-transparent text-text-secondary hover:bg-bg-hover/30'
          }`}
          onClick={onToggleNotifications}
          title={notificationsEnabled ? "Disable notifications" : "Enable notifications"}
          aria-label={notificationsEnabled ? "Disable notifications" : "Enable notifications"}
        >
          {notificationsEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={`w-6 h-6 cursor-pointer transition-all duration-200 hover:scale-105 ${
            autoSortTasks
              ? theme === 'light'
                ? 'bg-gray-300 text-gray-800 hover:bg-gray-400'
                : 'bg-gray-600 text-white hover:bg-gray-700'
              : 'bg-transparent text-text-secondary hover:bg-bg-hover/30'
          }`}
          onClick={onToggleAutoSortTasks}
          title={autoSortTasks ? "Disable auto-sort (sort by time)" : "Enable auto-sort (sort by priority)"}
          aria-label={autoSortTasks ? "Disable auto-sort" : "Enable auto-sort"}
        >
          {autoSortTasks ? <ListOrdered className="w-3.5 h-3.5" /> : <ArrowUpDown className="w-3.5 h-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={`w-6 h-6 cursor-pointer transition-all duration-200 hover:scale-105 ${
            groupByProject && viewMode !== 'tally'
              ? theme === 'light'
                ? 'bg-gray-300 text-gray-800 hover:bg-gray-400'
                : 'bg-gray-600 text-white hover:bg-gray-700'
              : 'bg-transparent text-text-secondary hover:bg-bg-hover/30'
          }`}
          onClick={onToggleGroupByProject}
          title={groupByProject ? "Disable project grouping (single column)" : "Enable project grouping (columns by project)"}
          aria-label={groupByProject ? "Disable project grouping" : "Enable project grouping"}
          disabled={viewMode === 'tally'}
        >
          {groupByProject ? <Columns2 className="w-3.5 h-3.5" /> : <AlignJustify className="w-3.5 h-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={`w-6 h-6 cursor-pointer transition-all duration-200 hover:scale-105 ${
            theme === 'light'
              ? 'bg-gray-300 text-gray-800 hover:bg-gray-400'
              : 'bg-transparent text-text-secondary hover:bg-bg-hover/30'
          }`}
          onClick={onToggleTheme}
          title={getThemeTitle()}
          aria-label={getThemeTitle()}
        >
          {getThemeIcon()}
        </Button>
        
        {/* View mode toggle */}
        <Button
          variant="ghost"
          size="icon"
          className={`w-6 h-6 cursor-pointer transition-all duration-200 hover:scale-105 ${
            viewMode === 'full'
              ? theme === 'light'
                ? 'bg-gray-300 text-gray-800 hover:bg-gray-400'
                : 'bg-gray-600 text-white hover:bg-gray-700'
              : 'bg-transparent text-text-secondary hover:bg-bg-hover/30'
          }`}
          onClick={onToggleViewMode}
          title={getViewModeTitle()}
          aria-label={getViewModeTitle()}
        >
          {getViewModeIcon()}
        </Button>
        
        {/* Pin toggle - always visible */}
        <Button
          variant="ghost"
          size="icon"
          className={`w-6 h-6 cursor-pointer transition-all duration-200 hover:scale-105 ${
            alwaysOnTop
              ? theme === 'light'
                ? 'bg-gray-300 text-gray-800 hover:bg-gray-400'
                : 'bg-gray-600 text-white hover:bg-gray-700'
              : 'bg-transparent text-text-secondary hover:bg-bg-hover/30'
          }`}
          onClick={handleTogglePin}
          title={alwaysOnTop ? "Disable always on top (⌘⇧T)" : "Enable always on top (⌘⇧T)"}
          aria-label={alwaysOnTop ? "Disable always on top" : "Enable always on top"}
        >
          <Pin className={`w-3.5 h-3.5 transition-transform duration-200 ${alwaysOnTop ? 'rotate-45' : ''}`} />
        </Button>
      </div>
    </div>
    </div>
  );
}
