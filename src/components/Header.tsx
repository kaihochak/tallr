import { 
  Pin,
  Filter,
  Sun,
  Moon
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  onTogglePin: () => void;
  onToggleDoneTasks: () => void;
  onStateFilterChange: (value: string) => void;
  onToggleTheme: () => void;
}

export default function Header({
  aggregateState,
  activeTasks,
  doneTasks,
  showDoneTasks,
  alwaysOnTop,
  stateFilter,
  theme,
  onTogglePin,
  onToggleDoneTasks,
  onStateFilterChange,
  onToggleTheme
}: HeaderProps) {
  // Get theme icon and title
  const getThemeIcon = () => {
    return theme === 'light' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />;
  };

  const getThemeTitle = () => {
    return theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
  };
  return (
    <div className="flex items-center justify-between px-6 py-4 bg-bg-card border-b border-border-primary backdrop-blur-sm shadow-sm z-10" 
         style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="flex items-center gap-0">
        <div className={`status-indicator ${aggregateState}`}></div>
        <div className="flex items-center gap-2 ml-3">
          <h1 className="text-lg font-bold bg-gradient-to-r from-accent-primary to-accent-primary-hover bg-clip-text text-transparent tracking-tight m-0">
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
      <div className="flex items-center gap-4" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none z-10" />
          <Select value={stateFilter} onValueChange={onStateFilterChange}>
            <SelectTrigger className="pl-9 pr-4 py-2.5 w-[130px] border-border-primary bg-bg-card text-text-primary text-sm font-medium hover:border-border-secondary hover:bg-bg-hover cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="cursor-pointer">
              <SelectItem value="all" className="cursor-pointer">All States</SelectItem>
              <SelectItem value="PENDING" className="cursor-pointer">Pending</SelectItem>
              <SelectItem value="WORKING" className="cursor-pointer">Working</SelectItem>
              <SelectItem value="IDLE" className="cursor-pointer">Idle</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8 bg-bg-tertiary text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:scale-105 cursor-pointer"
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
          className={`w-8 h-8 relative z-25 transition-all duration-200 cursor-pointer ${
            alwaysOnTop
              ? 'bg-accent-primary text-white shadow-[0_0_16px_rgba(129,140,248,0.3)] hover:bg-accent-primary-hover'
              : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover hover:text-text-primary'
          } hover:scale-105`}
          onClick={onTogglePin}
          title={alwaysOnTop ? "Disable always on top (⌘⇧T)" : "Enable always on top (⌘⇧T)"}
          aria-label={alwaysOnTop ? "Disable always on top" : "Enable always on top"}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <Pin className={`w-4.5 h-4.5 transition-transform duration-200 ${alwaysOnTop ? 'rotate-45' : ''}`} />
        </Button>
      </div>
    </div>
  );
}