import { 
  Activity, 
  Pin,
  ChevronUp,
  ChevronDown
} from "lucide-react";

interface Task {
  id: string;
  projectId: string;
  agent: string;
  title: string;
  state: string;
  details?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  isRemoving?: boolean;
}

interface HeaderProps {
  aggregateState: string;
  selectedTaskIndex: number;
  filteredTasks: Task[];
  activeTasks: number;
  doneTasks: number;
  showDoneTasks: boolean;
  alwaysOnTop: boolean;
  onNavigateUp: () => void;
  onNavigateDown: () => void;
  onTogglePin: () => void;
  onToggleDoneTasks: () => void;
}

export default function Header({
  aggregateState,
  selectedTaskIndex,
  filteredTasks,
  activeTasks,
  doneTasks,
  showDoneTasks,
  alwaysOnTop,
  onNavigateUp,
  onNavigateDown,
  onTogglePin,
  onToggleDoneTasks
}: HeaderProps) {
  return (
    <div className="header">
      <div className="header-left">
        <div className="logo-container">
          <Activity className="logo-icon" />
          <h1>Tally</h1>
        </div>
        <div className={`status-indicator ${aggregateState}`}></div>
        <button 
          className={`task-count no-drag ${showDoneTasks ? 'active' : ''}`}
          onClick={onToggleDoneTasks}
          title={showDoneTasks ? "Show active tasks" : "Show completed tasks"}
          aria-label={showDoneTasks ? "Show active tasks" : "Show completed tasks"}
        >
          {showDoneTasks ? `${doneTasks} done` : `${activeTasks} tasks`}
        </button>
      </div>
      <div className="header-right">
        <button
          className="header-button no-drag"
          onClick={onNavigateUp}
          title="Previous task (↑)"
          aria-label="Previous task"
          disabled={filteredTasks.length === 0}
        >
          <ChevronUp className="header-icon" />
        </button>
        <button
          className="header-button no-drag"
          onClick={onNavigateDown}
          title="Next task (↓)"
          aria-label="Next task"
          disabled={filteredTasks.length === 0}
        >
          <ChevronDown className="header-icon" />
        </button>
        <button
          className={`pin-toggle no-drag ${alwaysOnTop ? 'active' : ''}`}
          onClick={onTogglePin}
          title={alwaysOnTop ? "Disable always on top (⌘⇧T)" : "Enable always on top (⌘⇧T)"}
          aria-label={alwaysOnTop ? "Disable always on top" : "Enable always on top"}
        >
          <Pin className="pin-icon" />
        </button>
      </div>
    </div>
  );
}