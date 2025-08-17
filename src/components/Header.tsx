import { 
  Pin,
  Filter,
  Sun,
  Moon,
  Rows3
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  aggregateState: string;
  activeTasks: number;
  doneTasks: number;
  showDoneTasks: boolean;
  alwaysOnTop: boolean;
  stateFilter: string;
  theme: 'light' | 'dark';
  simpleMode: boolean;
  onTogglePin: () => void;
  onToggleDoneTasks: () => void;
  onStateFilterChange: (value: string) => void;
  onToggleTheme: () => void;
  onToggleSimpleMode: () => void;
}

export default function Header({
  aggregateState,
  activeTasks,
  doneTasks,
  showDoneTasks,
  alwaysOnTop,
  stateFilter,
  theme,
  simpleMode,
  onTogglePin,
  onToggleDoneTasks,
  onStateFilterChange,
  onToggleTheme,
  onToggleSimpleMode
}: HeaderProps) {
  // Get theme icon and title
  const getThemeIcon = () => {
    return theme === 'light' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />;
  };

  const getThemeTitle = () => {
    return theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
  };
  return (
    <div className="flex items-center justify-between px-6 py-4 bg-bg-primary border-b border-border-primary backdrop-blur-sm shadow-sm z-10" 
         style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="flex items-center gap-0">
        <div className={`status-indicator ${aggregateState}`}></div>
        <div className="flex items-center gap-2 ml-3">
          <h1 className={`text-lg font-bold bg-gradient-to-r bg-clip-text text-transparent tracking-tight m-0 ${
            aggregateState === 'pending' ? 'from-status-pending to-status-pending' :
            aggregateState === 'working' ? 'from-status-working to-status-working' :
            aggregateState === 'idle' ? 'from-status-idle to-status-idle' :
            'from-accent-primary to-accent-primary-hover'
          }`}>
            TALLOR
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
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
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
        <Button
          variant="ghost"
          size="icon"
          className={`w-7 h-7 cursor-pointer transition-all duration-200 hover:scale-105 ${
            simpleMode 
              ? 'bg-accent-primary text-white hover:bg-accent-primary-hover' 
              : 'bg-bg-primary text-text-primary hover:bg-bg-hover'
          }`}
          onClick={onToggleSimpleMode}
          title={simpleMode ? "Disable simple mode" : "Enable simple mode"}
          aria-label={simpleMode ? "Disable simple mode" : "Enable simple mode"}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <Rows3 className="w-4 h-4" />
        </Button>
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