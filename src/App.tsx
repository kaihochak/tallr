import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { 
  Search, 
  Filter, 
  Activity, 
  Server,
  RefreshCw,
  Pin
} from "lucide-react";
import SetupWizard from "./components/SetupWizard";
import TaskRow from "./components/TaskRow";
import EmptyState from "./components/EmptyState";
import { useAppState } from "./hooks/useAppState";
import "./App.css";

interface Project {
  id: string;
  name: string;
  repoPath: string;
  preferredIde: string;
  githubUrl?: string;
  createdAt: number;
  updatedAt: number;
}

interface Task {
  id: string;
  projectId: string;
  agent: string;
  title: string;
  state: string;
  details?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number; // When task was marked as done
  isRemoving?: boolean; // UI state for countdown removal
}

interface AppState {
  projects: Record<string, Project>;
  tasks: Record<string, Task>;
  updatedAt: number;
}

interface SetupStatus {
  isFirstLaunch: boolean;
  cliInstalled: boolean;
  setupCompleted: boolean;
}

function App() {
  const { appState, isLoading, removingTasks, taskCountdowns } = useAppState();
  const [searchFilter, setSearchFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);

  // Load setup status and initialize always-on-top
  useEffect(() => {
    const loadSetupStatus = async () => {
      try {
        const status = await invoke<SetupStatus>("get_setup_status_cmd");
        setShowSetupWizard(status.isFirstLaunch && !status.setupCompleted);
      } catch (error) {
        console.error("Failed to load setup status:", error);
      }
    };

    const initAlwaysOnTop = async () => {
      try {
        const window = getCurrentWindow();
        const isOnTop = await window.isAlwaysOnTop();
        setAlwaysOnTop(isOnTop);
      } catch (error) {
        console.error("Failed to get always-on-top status:", error);
      }
    };

    loadSetupStatus();
    initAlwaysOnTop();
  }, []);

  // Toggle always-on-top
  const toggleAlwaysOnTop = useCallback(async () => {
    console.log("Toggle always-on-top clicked, current state:", alwaysOnTop);
    try {
      const window = getCurrentWindow();
      const newState = !alwaysOnTop;
      await window.setAlwaysOnTop(newState);
      setAlwaysOnTop(newState);
      console.log("Always-on-top set to:", newState);
    } catch (error) {
      console.error("Failed to toggle always-on-top:", error);
    }
  }, [alwaysOnTop]);

  // Filter tasks based on search and state filters
  const filteredTasks = useMemo(() => {
    const tasks = Object.values(appState.tasks);
    
    return tasks.filter(task => {
      const project = appState.projects[task.projectId];
      const searchText = `${project?.name || ""} ${task.title} ${task.agent}`.toLowerCase();
      const matchesSearch = searchFilter === "" || searchText.includes(searchFilter.toLowerCase());
      const matchesState = stateFilter === "all" || task.state === stateFilter;
      
      return matchesSearch && matchesState;
    }).sort((a, b) => {
      // Completed tasks with countdown should appear at the end
      const aCompleted = taskCountdowns[a.id] !== undefined;
      const bCompleted = taskCountdowns[b.id] !== undefined;
      
      if (aCompleted && !bCompleted) return 1;
      if (!aCompleted && bCompleted) return -1;
      
      // For non-completed tasks, sort by state priority (PENDING, WORKING, IDLE)
      const statePriority = { PENDING: 0, WORKING: 1, IDLE: 2 };
      const aPriority = statePriority[a.state as keyof typeof statePriority] ?? 3;
      const bPriority = statePriority[b.state as keyof typeof statePriority] ?? 3;
      
      if (aPriority !== bPriority) return aPriority - bPriority;
      return b.updatedAt - a.updatedAt; // Most recent first
    });
  }, [appState, searchFilter, stateFilter, taskCountdowns]);

  // Handle jump to context
  const handleJumpToContext = useCallback(async (task: Task) => {
    const project = appState.projects[task.projectId];
    if (!project) return;

    try {
      await invoke("open_ide_and_terminal", {
        projectPath: project.repoPath,
        ide: project.preferredIde
      });
    } catch (error) {
      console.error("Failed to open IDE and terminal:", error);
    }
  }, [appState.projects]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command+Shift+T for always-on-top toggle
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        toggleAlwaysOnTop();
      }
      
      // Command+K for quick switcher
      if (e.metaKey && e.key === "k") {
        e.preventDefault();
        setShowQuickSwitcher(true);
      }
      
      // Escape to close quick switcher
      if (e.key === "Escape") {
        setShowQuickSwitcher(false);
      }
      
      // Arrow navigation
      if (e.key === "ArrowUp" && !showQuickSwitcher) {
        e.preventDefault();
        setSelectedTaskIndex(prev => Math.max(0, prev - 1));
      }
      
      if (e.key === "ArrowDown" && !showQuickSwitcher) {
        e.preventDefault();
        setSelectedTaskIndex(prev => Math.min(filteredTasks.length - 1, prev + 1));
      }
      
      // Enter to jump to selected task
      if (e.key === "Enter" && !showQuickSwitcher && filteredTasks[selectedTaskIndex]) {
        e.preventDefault();
        handleJumpToContext(filteredTasks[selectedTaskIndex]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedTaskIndex, showQuickSwitcher, filteredTasks, handleJumpToContext, toggleAlwaysOnTop]);

  // Setup wizard handlers
  const handleSetupComplete = useCallback(async () => {
    try {
      await invoke("mark_setup_completed_cmd");
      setShowSetupWizard(false);
    } catch (error) {
      console.error("Failed to mark setup complete:", error);
    }
  }, []);

  // Get aggregate state for tray color
  const aggregateState = useMemo(() => {
    const states = Object.values(appState.tasks).map(t => t.state);
    if (states.includes("PENDING")) return "pending";
    if (states.includes("WORKING")) return "working";
    return "idle";
  }, [appState.tasks]);


  return (
    <div className="tally-app">
      {/* Setup Wizard */}
      {showSetupWizard && (
        <SetupWizard 
          onComplete={handleSetupComplete}
        />
      )}
      
      {/* Header */}
      <div className="header">
        <div className="header-left">
          <div className="logo-container">
            <Activity className="logo-icon" />
            <h1>Tally</h1>
          </div>
          <div className={`status-indicator ${aggregateState}`}></div>
        </div>
        <div className="header-right">
          <button
            className={`pin-toggle no-drag ${alwaysOnTop ? 'active' : ''}`}
            onClick={toggleAlwaysOnTop}
            title={alwaysOnTop ? "Disable always on top" : "Enable always on top"}
            aria-label={alwaysOnTop ? "Disable always on top" : "Enable always on top"}
          >
            <Pin className="pin-icon" />
          </button>
          <span className="task-count">{Object.keys(appState.tasks).length} tasks</span>
        </div>
      </div>

      {/* Filters */}
      <div className="filters">
        <div className="search-wrapper">
          <Search className="search-icon" />
          <input
            type="text"
            placeholder="Search projects, tasks, agents... (⌘K)"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-wrapper">
          <Filter className="filter-icon" />
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="state-filter"
          >
            <option value="all">All States</option>
            <option value="PENDING">Pending</option>
            <option value="WORKING">Working</option>
            <option value="IDLE">Idle</option>
          </select>
        </div>
      </div>

      {/* Task List */}
      <div className="task-list">
        {isLoading ? (
          // Loading skeletons
          <>
            <div className="skeleton skeleton-task"></div>
            <div className="skeleton skeleton-task"></div>
            <div className="skeleton skeleton-task"></div>
          </>
        ) : filteredTasks.length === 0 ? (
          <EmptyState />
        ) : (
          filteredTasks.map((task, index) => {
            const project = appState.projects[task.projectId];
            const isSelected = index === selectedTaskIndex;
            const isExpanded = expandedTasks.has(task.id);
            const isRemoving = removingTasks.has(task.id);
            const countdown = taskCountdowns[task.id];
            
            return (
              <TaskRow
                key={task.id}
                task={task}
                project={project}
                isSelected={isSelected}
                isExpanded={isExpanded}
                isRemoving={isRemoving}
                countdown={countdown}
                expandedTasks={expandedTasks}
                setExpandedTasks={setExpandedTasks}
              />
            );
          })
        )}
      </div>

      {/* Quick Switcher Modal */}
      {showQuickSwitcher && (
        <div className="quick-switcher-overlay" onClick={() => setShowQuickSwitcher(false)}>
          <div className="quick-switcher" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              placeholder="Jump to project or task..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && filteredTasks[0]) {
                  handleJumpToContext(filteredTasks[0]);
                  setShowQuickSwitcher(false);
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="footer">
        <div className="footer-stats">
          <span className="footer-stat">
            <Server className="footer-icon" />
            Gateway: 127.0.0.1:4317
          </span>
          <span className="footer-stat">
            <RefreshCw className="footer-icon" />
            {new Date(appState.updatedAt * 1000).toLocaleTimeString()}
          </span>
        </div>
        <div className="footer-help">
          <span>
            <span className="key-hint">⌘K</span> Quick switch
          </span>
          <span>
            <span className="key-hint">⌘⇧T</span> Pin window
          </span>
          <span>
            <span className="key-hint">↑↓</span> Navigate
          </span>
          <span>
            <span className="key-hint">⏎</span> Jump
          </span>
        </div>
      </div>
    </div>
  );
}

export default App;