import { 
  Pin,
  Filter,
  Sun,
  Moon,
  Monitor
} from "lucide-react";

interface HeaderProps {
  aggregateState: string;
  activeTasks: number;
  doneTasks: number;
  showDoneTasks: boolean;
  alwaysOnTop: boolean;
  stateFilter: string;
  theme: 'light' | 'dark' | 'system';
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
    switch (theme) {
      case 'light': return <Sun className="w-4 h-4" />;
      case 'dark': return <Moon className="w-4 h-4" />;
      case 'system': return <Monitor className="w-4 h-4" />;
    }
  };

  const getThemeTitle = () => {
    switch (theme) {
      case 'light': return 'Switch to dark theme';
      case 'dark': return 'Switch to system theme';
      case 'system': return 'Switch to light theme';
    }
  };
  return (
    <div className="flex items-center justify-between px-6 py-4 bg-bg-card border-b border-border-primary backdrop-blur-sm shadow-sm z-10" 
         style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="flex items-center gap-0">
        <div className={`status-indicator ${aggregateState}`}></div>
        <div className="flex items-center gap-2 ml-3">
          <h1 className="text-lg font-bold bg-gradient-to-r from-accent-primary to-accent-primary-hover bg-clip-text text-transparent tracking-tight m-0">
            TALLY
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
          <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
          <select
            value={stateFilter}
            onChange={(e) => onStateFilterChange(e.target.value)}
            className="pl-9 pr-9 py-2.5 border border-border-primary rounded-lg bg-bg-card text-text-primary text-sm font-medium outline-none cursor-pointer transition-all duration-200 appearance-none hover:border-border-secondary hover:bg-bg-hover focus:border-accent-primary focus:shadow-[0_0_0_3px_var(--accent-primary-light)]"
            style={{
              backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center'
            }}
          >
            <option value="all">All States</option>
            <option value="PENDING">Pending</option>
            <option value="WORKING">Working</option>
            <option value="IDLE">Idle</option>
          </select>
        </div>
        <button
          className="flex items-center justify-center w-8 h-8 border-none rounded-lg bg-bg-tertiary text-text-secondary cursor-pointer transition-all duration-200 hover:bg-bg-hover hover:text-text-primary hover:scale-105"
          onClick={onToggleTheme}
          title={getThemeTitle()}
          aria-label={getThemeTitle()}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {getThemeIcon()}
        </button>
        <button
          className={`flex items-center justify-center w-8 h-8 border-none rounded-lg cursor-pointer transition-all duration-200 relative z-25 ${
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
        </button>
      </div>
    </div>
  );
}