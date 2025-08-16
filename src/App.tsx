import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { 
  Filter
} from "lucide-react";
import SetupWizard from "./components/SetupWizard";
import TaskRow from "./components/TaskRow";
import EmptyState from "./components/EmptyState";
import Header from "./components/Header";
import { DebugDialog } from "./components/DebugDialog";
import { useAppState } from "./hooks/useAppState";
import { useSettings } from "./hooks/useSettings";
import "./App.css";

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
  pinned: boolean;
}

interface SetupStatus {
  isFirstLaunch: boolean;
  cliInstalled: boolean;
  setupCompleted: boolean;
}

function App() {
  const { appState, isLoading } = useAppState();
  const { settings, toggleAlwaysOnTop } = useSettings();
  const [stateFilter, setStateFilter] = useState("all");
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [showDebugDialog, setShowDebugDialog] = useState(false);
  const [showDoneTasks, setShowDoneTasks] = useState(false);

  // Load setup status
  useEffect(() => {
    const loadSetupStatus = async () => {
      try {
        const status = await invoke<SetupStatus>("get_setup_status_cmd");
        setShowSetupWizard(status.isFirstLaunch && !status.setupCompleted);
      } catch (error) {
        console.error("Failed to load setup status:", error);
      }
    };

    loadSetupStatus();
  }, []);



  // Calculate task counts
  const taskCounts = useMemo(() => {
    const allTasks = Object.values(appState.tasks);
    const activeTasks = allTasks.filter(task => task.state !== "DONE").length;
    const doneTasks = allTasks.filter(task => task.state === "DONE").length;
    return { activeTasks, doneTasks };
  }, [appState.tasks]);

  // Filter tasks based on state filter and done/active toggle
  const filteredTasks = useMemo(() => {
    const tasks = Object.values(appState.tasks);
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;
    
    return tasks.filter(task => {
      const matchesState = stateFilter === "all" || task.state === stateFilter;
      
      // Handle done/active toggle
      if (showDoneTasks) {
        // Show only DONE tasks
        if (task.state !== "DONE") {
          return false;
        }
      } else {
        // Show only non-DONE tasks (existing behavior)
        if (task.state === "DONE") {
          return false;
        }
        
        // Filter out IDLE tasks older than 1 hour to prevent UI clutter
        if (task.state === "IDLE" && task.completedAt && (now - task.completedAt) > ONE_HOUR) {
          return false;
        }
      }
      
      return matchesState;
    }).sort((a, b) => {
      // First priority: pinned tasks at top
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      
      // Second priority: state priority (PENDING, WORKING, IDLE)
      const statePriority = { PENDING: 0, WORKING: 1, IDLE: 2, DONE: 3 };
      const aPriority = statePriority[a.state as keyof typeof statePriority] ?? 4;
      const bPriority = statePriority[b.state as keyof typeof statePriority] ?? 4;
      
      if (aPriority !== bPriority) return aPriority - bPriority;
      
      // Third priority: most recent first
      return b.updatedAt - a.updatedAt;
    });
  }, [appState, stateFilter, showDoneTasks]);

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

  // Handle delete task
  const handleDeleteTask = useCallback(async (taskId: string) => {
    try {
      const response = await fetch("http://127.0.0.1:4317/v1/tasks/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ taskId }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error("Failed to delete task:", error);
      throw error; // Re-throw so TaskRow can handle the error display
    }
  }, []);

  // Handle jump to specific task
  const handleJumpToSpecificTask = useCallback(async (taskId: string) => {
    const task = appState.tasks[taskId];
    if (task) {
      await handleJumpToContext(task);
    }
  }, [appState.tasks, handleJumpToContext]);

  // Handle show debug for specific task
  const handleShowDebugForTask = useCallback((taskId: string) => {
    // For now, just open the debug dialog - could be enhanced to focus on specific task
    setShowDebugDialog(true);
  }, []);

  // Handle toggle pin
  const handleTogglePin = useCallback(async (taskId: string, pinned: boolean) => {
    try {
      const response = await fetch("http://127.0.0.1:4317/v1/tasks/pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ taskId, pinned }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error("Failed to toggle pin:", error);
      throw error; // Re-throw so TaskRow can handle the error display
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command+Shift+T for always-on-top toggle
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        toggleAlwaysOnTop();
      }
      
      // Arrow navigation
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedTaskIndex(prev => Math.max(0, prev - 1));
      }
      
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedTaskIndex(prev => Math.min(filteredTasks.length - 1, prev + 1));
      }
      
      // Enter to jump to selected task
      if (e.key === "Enter" && filteredTasks[selectedTaskIndex]) {
        e.preventDefault();
        handleJumpToSpecificTask(filteredTasks[selectedTaskIndex].id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedTaskIndex, filteredTasks, handleJumpToSpecificTask, toggleAlwaysOnTop]);

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
      <Header 
        aggregateState={aggregateState}
        selectedTaskIndex={selectedTaskIndex}
        filteredTasks={filteredTasks}
        activeTasks={taskCounts.activeTasks}
        doneTasks={taskCounts.doneTasks}
        showDoneTasks={showDoneTasks}
        alwaysOnTop={settings.alwaysOnTop}
        onNavigateUp={() => setSelectedTaskIndex(prev => Math.max(0, prev - 1))}
        onNavigateDown={() => setSelectedTaskIndex(prev => Math.min(filteredTasks.length - 1, prev + 1))}
        onTogglePin={toggleAlwaysOnTop}
        onToggleDoneTasks={() => setShowDoneTasks(prev => !prev)}
      />

      {/* Filters */}
      <div className="filters">
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
            
            return (
              <TaskRow
                key={task.id}
                task={task}
                project={project}
                isSelected={isSelected}
                isExpanded={isExpanded}
                expandedTasks={expandedTasks}
                setExpandedTasks={setExpandedTasks}
                onDeleteTask={handleDeleteTask}
                onJumpToContext={handleJumpToSpecificTask}
                onShowDebug={handleShowDebugForTask}
                onTogglePin={handleTogglePin}
              />
            );
          })
        )}
      </div>

      {/* Debug Dialog */}
      <DebugDialog 
        isOpen={showDebugDialog}
        onClose={() => setShowDebugDialog(false)}
      />
    </div>
  );
}

export default App;