import { 
  Pin,
  Filter,
  Sun,
  Moon,
  Rows3,
  Rows2,
  Square
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Task, Project } from '@/types';
import { getTaskStateClasses } from '@/lib/sessionHelpers';
import { cn } from '@/lib/utils';

interface HeaderProps {
  aggregateState: string;
  activeTasks: number;
  doneTasks: number;
  showDoneTasks: boolean;
  alwaysOnTop: boolean;
  stateFilter: string;
  theme: 'light' | 'dark';
  viewMode: 'full' | 'simple' | 'tally';
  tasks?: Task[];
  projects?: Record<string, Project>;
  onTogglePin: () => void;
  onToggleDoneTasks: () => void;
  onStateFilterChange: (value: string) => void;
  onToggleTheme: () => void;
  onToggleViewMode: () => void;
  onJumpToContext?: (taskId: string) => Promise<void>;
  onShowDebug?: (taskId: string) => void;
}

export default function Header({
  aggregateState,
  activeTasks,
  doneTasks,
  showDoneTasks,
  alwaysOnTop,
  stateFilter,
  theme,
  viewMode,
  tasks = [],
  projects = {},
  onTogglePin,
  onToggleDoneTasks,
  onStateFilterChange,
  onToggleTheme,
  onToggleViewMode,
  onJumpToContext,
  onShowDebug
}: HeaderProps) {
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
    <div className="flex items-center justify-between px-6 py-4 bg-bg-primary border-b border-border-primary backdrop-blur-sm shadow-sm z-10" 
         style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      
      {/* Left side - Only show in non-tally mode */}
      {viewMode !== 'tally' && (
        <div className="flex items-center gap-0">
          <div className={`status-indicator ${aggregateState}`}></div>
          <div className="flex items-center gap-2 ml-3">
            <h1 className={`text-lg font-bold bg-gradient-to-r bg-clip-text text-transparent tracking-tight m-0 ${
              aggregateState === 'pending' ? 'from-status-pending to-status-pending' :
              aggregateState === 'working' ? 'from-status-working to-status-working' :
              aggregateState === 'idle' ? 'from-status-idle to-status-idle' :
              'from-accent-primary to-accent-primary-hover'
            }`}>
              TALLR
            </h1>
          </div>
          <button 
            className={`ml-3 px-3 py-1 text-xs font-medium rounded-full border-none cursor-pointer transition-all duration-200 ${
              showDoneTasks 
                ? 'bg-accent-primary-light text-accent-primary border border-accent-primary hover:bg-accent-primary hover:text-white' 
                : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover hover:text-text-primary'
            } hover:scale-105`}
            onClick={onToggleDoneTasks}
            title={showDoneTasks ? "Show active tasks" : "Show completed tasks"}
            aria-label={showDoneTasks ? "Show active tasks" : "Show completed tasks"}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {showDoneTasks ? `${doneTasks} done` : `${activeTasks} tasks`}
          </button>
        </div>
      )}

      {/* Tally mode - Show only task dots */}
      {viewMode === 'tally' && (
        <div className="flex flex-wrap gap-1">
          {tasks.map((task) => {
            const project = projects[task.projectId];
            const stateClasses = getTaskStateClasses(task.state);
            
            return (
              <Button
                key={task.id}
                variant="ghost"
                size="icon"
                className={cn(
                  "w-7 h-7 rounded-md cursor-pointer transition-all duration-200 hover:scale-105 border-0 p-0",
                  stateClasses,
                  task.pinned && "ring-2 ring-teal-500"
                )}
                onClick={(e) => {
                  if (e.altKey && onShowDebug) {
                    e.preventDefault();
                    onShowDebug(task.id);
                  } else if (onJumpToContext) {
                    onJumpToContext(task.id);
                  }
                }}
                title={`${project?.name || 'Unknown'} - ${task.agent} (${task.state.toLowerCase()})`}
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              />
            );
          })}
        </div>
      )}
      
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Hide most controls in tally mode */}
        {viewMode !== 'tally' && (
          <>
            <Select value={stateFilter} onValueChange={onStateFilterChange}>
              <SelectTrigger 
                className="!w-7 !h-7 !min-h-0 !p-0 !px-0 !py-0 !border-0 !rounded-md !bg-bg-primary !text-text-primary hover:!bg-bg-hover hover:!scale-105 !cursor-pointer !transition-all !duration-200 !flex !items-center !justify-center !gap-0 !shadow-none focus-visible:!ring-0 [&>svg:last-child]:!hidden"
                size="sm"
              >
                <Filter className="w-4 h-4" />
              </SelectTrigger>
              <SelectContent className="cursor-pointer">
                <SelectItem value="all" className="cursor-pointer">All States</SelectItem>
                <SelectItem value="PENDING" className="cursor-pointer">Pending</SelectItem>
                <SelectItem value="WORKING" className="cursor-pointer">Working</SelectItem>
                <SelectItem value="IDLE" className="cursor-pointer">Idle</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 bg-bg-primary text-text-primary hover:bg-bg-hover hover:scale-105 cursor-pointer transition-all duration-200"
              onClick={onToggleTheme}
              title={getThemeTitle()}
              aria-label={getThemeTitle()}
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              {getThemeIcon()}
            </Button>
          </>
        )}
        
        {/* View mode toggle - always visible */}
        <Button
          variant="ghost"
          size="icon"
          className={`w-7 h-7 cursor-pointer transition-all duration-200 hover:scale-105 ${
            viewMode !== 'full'
              ? 'bg-accent-primary text-white hover:bg-accent-primary-hover' 
              : 'bg-bg-primary text-text-primary hover:bg-bg-hover'
          }`}
          onClick={onToggleViewMode}
          title={getViewModeTitle()}
          aria-label={getViewModeTitle()}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {getViewModeIcon()}
        </Button>
        
        {/* Pin toggle - always visible */}
        <Button
          variant="ghost"
          size="icon"
          className={`w-7 h-7 cursor-pointer transition-all duration-200 hover:scale-105 ${
            alwaysOnTop 
              ? 'bg-accent-primary text-white hover:bg-accent-primary-hover' 
              : 'bg-bg-primary text-text-primary hover:bg-bg-hover'
          }`}
          onClick={onTogglePin}
          title={alwaysOnTop ? "Disable always on top (⌘⇧T)" : "Enable always on top (⌘⇧T)"}
          aria-label={alwaysOnTop ? "Disable always on top" : "Enable always on top"}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <Pin className={`w-4 h-4 transition-transform duration-200 ${alwaysOnTop ? 'rotate-45' : ''}`} />
        </Button>
      </div>
    </div>
  );
}