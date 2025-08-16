import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { 
  Search, 
  Filter, 
  Activity, 
  Rocket, 
  Clock, 
  Terminal,
  Server,
  RefreshCw,
  ChevronRight,
  HelpCircle,
  Code,
  Sparkles
} from "lucide-react";
import SetupWizard from "./components/SetupWizard";
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
  const [appState, setAppState] = useState<AppState>({ projects: {}, tasks: {}, updatedAt: 0 });
  const [searchFilter, setSearchFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Listen for backend updates
  useEffect(() => {
    const unlisten = listen<AppState>("tasks-updated", (event) => {
      setAppState(event.payload);
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  // Listen for notifications
  useEffect(() => {
    const unlisten = listen<{title: string, body: string}>("show-notification", (event) => {
      // Show browser notification as fallback
      if (Notification.permission === "granted") {
        new Notification(event.payload.title, {
          body: event.payload.body,
          icon: "/tauri.svg"
        });
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  // Load initial data and setup status
  useEffect(() => {
    const loadTasks = async () => {
      try {
        const response = await fetch("http://127.0.0.1:4317/v1/state");
        const data = await response.json();
        setAppState(data);
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to load tasks:", error);
        setIsLoading(false);
      }
    };

    const loadSetupStatus = async () => {
      try {
        const status = await invoke<SetupStatus>("get_setup_status_cmd");
        setShowSetupWizard(status.isFirstLaunch && !status.setupCompleted);
      } catch (error) {
        console.error("Failed to load setup status:", error);
      }
    };

    loadTasks();
    loadSetupStatus();
    
    // Poll for updates every 2 seconds
    const interval = setInterval(loadTasks, 2000);
    return () => clearInterval(interval);
  }, []);

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
      // Sort by state priority (PENDING, WORKING, IDLE)
      const statePriority = { PENDING: 0, WORKING: 1, IDLE: 2 };
      const aPriority = statePriority[a.state as keyof typeof statePriority] ?? 3;
      const bPriority = statePriority[b.state as keyof typeof statePriority] ?? 3;
      
      if (aPriority !== bPriority) return aPriority - bPriority;
      return b.updatedAt - a.updatedAt; // Most recent first
    });
  }, [appState, searchFilter, stateFilter]);

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
  }, [selectedTaskIndex, showQuickSwitcher, filteredTasks, handleJumpToContext]);

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
          <div className="empty-state">
            <Sparkles className="empty-illustration" />
            <h3>Ready to track your AI sessions!</h3>
            <p>Use the <code>tally</code> command to wrap any AI tool and get notifications when it needs input.</p>
            <div className="usage-examples">
              <div className="usage-example">
                <h4><Terminal className="example-icon" /> Try it out:</h4>
                <code>cd ~/your-project</code>
                <code>tally claude</code>
              </div>
              <div className="usage-example">
                <h4><Code className="example-icon" /> Other AI tools:</h4>
                <code>tally gemini</code>
                <code>tally cursor-composer</code>
              </div>
            </div>
            <div className="empty-help">
              <HelpCircle className="help-icon" />
              <small>Sessions will appear here automatically when you start them</small>
            </div>
          </div>
        ) : (
          filteredTasks.map((task, index) => {
            const project = appState.projects[task.projectId];
            const isSelected = index === selectedTaskIndex;
            const age = Math.floor((Date.now() - task.updatedAt * 1000) / 60000);
            
            return (
              <div
                key={task.id}
                className={`task-row ${isSelected ? "selected" : ""} state-${task.state.toLowerCase()}`}
                onClick={() => handleJumpToContext(task)}
              >
                <div className="task-main">
                  <div className="task-header">
                    <span className="project-name">{project?.name || "Unknown"}</span>
                    <ChevronRight style={{ width: 16, height: 16, opacity: 0.5 }} />
                    <span className="task-title">{task.title}</span>
                    <span className={`task-state ${task.state.toLowerCase()}`}>
                      {task.state}
                    </span>
                    <span className="task-age">
                      <Clock className="clock-icon" />
                      {age}m ago
                    </span>
                  </div>
                  
                  <div className="task-details">
                    <span className="agent">
                      <Terminal className="agent-icon" />
                      {task.agent}
                    </span>
                    {task.details && <span className="details">{task.details}</span>}
                  </div>
                </div>

                <div className="task-actions" onClick={(e) => e.stopPropagation()}>
                  <button 
                    className="action-button"
                    title="Open IDE & Terminal" 
                    onClick={() => handleJumpToContext(task)}
                  >
                    <Rocket className="action-button-icon" />
                  </button>
                </div>
              </div>
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