import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import TaskRow from "./components/TaskRow";
import EmptyState from "./components/EmptyState";
import Header from "./components/Header";
import { ProjectFilterPills } from "./components/ProjectFilterPills";
import { DebugPage } from "./components/DebugPage";
import { ErrorDisplay } from "./components/debug/ErrorDisplay";
import { CliConnectionStatus } from "./components/CliConnectionStatus";
import { SetupWizard } from "./components/SetupWizard";
import { useAppState } from "./hooks/useAppState";
import { useSettings } from "./hooks/useSettings";
import { useFilteredTasks, useTaskCounts } from "./hooks/useFilteredTasks";
import { debug } from "./utils/debug";
import { logger } from "./utils/logger";
import { notificationService } from "./services/notificationService";
import { ApiService } from "./services/api";

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
  const { appState, isLoading, error, retryConnection } = useAppState();
  const { settings, toggleAlwaysOnTop, toggleTheme, toggleViewMode, toggleNotifications } = useSettings();
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [currentPage, setCurrentPage] = useState<'tasks' | 'debug'>('tasks');
  const [debugTaskId, setDebugTaskId] = useState<string | null>(null);
  const [showDoneTasks, setShowDoneTasks] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Load setup status
  useEffect(() => {
    const loadSetupStatus = async () => {
      try {
        logger.info("Loading setup status");
        const status = await invoke<SetupStatus>("get_setup_status_cmd");
        setShowSetupWizard(status.isFirstLaunch && !status.setupCompleted);
        logger.info("Setup status loaded", { isFirstLaunch: status.isFirstLaunch, setupCompleted: status.setupCompleted });
        
        // Initialize notifications
        try {
          await notificationService.initialize();
          logger.info("Notification service initialized", { enabled: notificationService.isEnabled() });
        } catch (notifyError) {
          logger.warn("Failed to initialize notification service", notifyError);
        }
      } catch (error) {
        logger.error("Failed to load setup status", error);
      }
    };

    loadSetupStatus();
  }, []);

  // Calculate task counts
  const taskCounts = useTaskCounts(appState);

  // Filter tasks based on state filter and done/active toggle
  const filteredTasks = useFilteredTasks({ 
    appState, 
    showDoneTasks, 
    selectedProjectId 
  });

  // Handle jump to context
  const handleJumpToContext = useCallback(async (task: Task) => {
    const project = appState.projects[task.projectId];
    if (!project) return;
    
    try {
      logger.info(`Attempting to jump to project: ${project.name}`);
      
      await invoke("open_ide_and_terminal", {
        projectPath: project.repoPath,
        ide: project.preferredIde
      });
      
      logger.info(`✅ Successfully opened IDE for project: ${project.name}`);
    } catch (error: any) {
      const errorMessage = error?.message || error || 'Unknown error';
      logger.error(`Failed to open IDE and terminal for ${project.name}`, error);
      
      try {
        await notificationService.showNotification({
          title: "Failed to Open IDE",
          body: `Could not open ${project.preferredIde || 'IDE'} for ${project.name}: ${errorMessage}`
        });
      } catch (notifyError) {
        console.warn('Failed to show failure notification:', notifyError);
      }
    }
  }, [appState.projects]);



  // Handle mark task as done (formerly delete task)
  const handleDeleteTask = useCallback(async (taskId: string) => {
    logger.userAction("Mark task done", { taskId });
    try {
      await ApiService.markTaskDone(taskId);
      logger.info("Task marked as done successfully", { taskId });
    } catch (error) {
      logger.error("Failed to mark task as done", { taskId, error });
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
    if (!import.meta.env.DEV) {
      console.warn('Debug feature is not available in production');
      return;
    }
    setDebugTaskId(taskId);
    setCurrentPage('debug');
  }, []);

  // Handle toggle pin
  const handleTogglePin = useCallback(async (taskId: string, pinned: boolean) => {
    logger.userAction("Toggle task pin", { taskId, pinned });
    try {
      await ApiService.toggleTaskPin(taskId, pinned);
      logger.info("Task pin toggled successfully", { taskId, pinned });
    } catch (error) {
      logger.error("Failed to toggle pin", { taskId, pinned, error });
      throw error; // Re-throw so TaskRow can handle the error display
    }
  }, []);

  // Copy debug state to clipboard for sharing
  const copyDebugStateToClipboard = useCallback(async () => {
    try {
      const debugData = await ApiService.getDebugData();
      const simplifiedState = {
        currentState: debugData.currentState,
        taskId: debugData.taskId,
        recentHistory: debugData.detectionHistory.slice(-3),
        timestamp: new Date().toISOString()
      };

      await navigator.clipboard.writeText(JSON.stringify(simplifiedState, null, 2));
      debug.ui('Debug state copied to clipboard', simplifiedState);
    } catch (error) {
      debug.ui('Failed to copy debug state', { error });
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

      // Command+Shift+C to copy debug state to clipboard (dev only)
      if (import.meta.env.DEV && e.metaKey && e.shiftKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copyDebugStateToClipboard();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleAlwaysOnTop, copyDebugStateToClipboard]);

  // Setup wizard handler
  const handleSetupComplete = useCallback(async () => {
    try {
      await invoke("mark_setup_completed_cmd");
      setShowSetupWizard(false);
    } catch (error) {
      logger.error("Failed to mark setup complete", error);
    }
  }, []);

  // Get aggregate state for tray color
  const aggregateState = useMemo(() => {
    const states = Object.values(appState.tasks).map(t => t.state);
    if (states.includes("PENDING")) return "pending";
    if (states.includes("WORKING")) return "working";
    return "idle";
  }, [appState.tasks]);


  if (showSetupWizard) {
    return <SetupWizard onSetupComplete={handleSetupComplete} />;
  }

  return (
    <div className={`${settings.viewMode === 'tally' ? 'h-auto' : 'h-screen'} flex flex-col bg-gradient-to-br from-bg-primary to-bg-secondary animate-fadeIn`}>
      {/* Header */}
      <Header
        aggregateState={aggregateState}
        activeTasks={taskCounts.activeTasks}
        doneTasks={taskCounts.doneTasks}
        showDoneTasks={showDoneTasks}
        alwaysOnTop={settings.alwaysOnTop}
        notificationsEnabled={settings.notificationsEnabled}
        theme={settings.theme}
        viewMode={settings.viewMode}
        tasks={filteredTasks}
        projects={appState.projects}
        onTogglePin={toggleAlwaysOnTop}
        onToggleDoneTasks={() => setShowDoneTasks(prev => !prev)}
        onToggleNotifications={toggleNotifications}
        onToggleTheme={toggleTheme}
        onToggleViewMode={toggleViewMode}
        onJumpToContext={handleJumpToSpecificTask}
        onShowDebug={handleShowDebugForTask}
      />

      {/* Main Content - Hidden in tally mode */}
      {currentPage === 'tasks' && settings.viewMode !== 'tally' && (
        <div className="flex-1 overflow-y-auto p-4 bg-bg-primary scrollbar-thin scrollbar-thumb-border-primary scrollbar-track-transparent scrollbar-thumb-rounded-full scrollbar-track-rounded-full hover:scrollbar-thumb-border-secondary">
          {error ? (
            // Connection error display
            <ErrorDisplay error={error} onRetry={retryConnection} />
          ) : isLoading ? (
            // Loading skeletons
            <>
              <div className="h-20 mb-3 rounded-xl bg-gradient-to-r from-bg-tertiary via-bg-hover to-bg-tertiary bg-[length:2000px_100%] animate-shimmer"></div>
              <div className="h-20 mb-3 rounded-xl bg-gradient-to-r from-bg-tertiary via-bg-hover to-bg-tertiary bg-[length:2000px_100%] animate-shimmer"></div>
              <div className="h-20 mb-3 rounded-xl bg-gradient-to-r from-bg-tertiary via-bg-hover to-bg-tertiary bg-[length:2000px_100%] animate-shimmer"></div>
            </>
          ) : filteredTasks.length === 0 ? (
            showDoneTasks ? (
              <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8 animate-fadeIn">
                <h3 className="text-2xl font-semibold text-text-primary mb-3 m-0">No completed sessions</h3>
                <p className="text-text-secondary text-base mb-8 m-0 max-w-[400px]">
                  Sessions marked as done will appear here
                </p>
              </div>
            ) : (
              <EmptyState />
            )
          ) : (
            <div className="flex flex-col">
              <ProjectFilterPills
                projects={appState.projects}
                tasks={appState.tasks}
                selectedProjectId={selectedProjectId}
                onSelectProject={setSelectedProjectId}
                showDoneTasks={showDoneTasks}
                viewMode={settings.viewMode}
              />
              {filteredTasks.map((task) => {
                const project = appState.projects[task.projectId];

                return (
                  <TaskRow
                    key={task.id}
                    task={task}
                    project={project}
                    viewMode={settings.viewMode}
                    onDeleteTask={handleDeleteTask}
                    onJumpToContext={handleJumpToSpecificTask}
                    onShowDebug={handleShowDebugForTask}
                    onTogglePin={handleTogglePin}
                    allTasks={filteredTasks}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {currentPage === 'debug' && settings.viewMode !== 'tally' && (
        <DebugPage
          taskId={debugTaskId}
          task={debugTaskId ? appState.tasks[debugTaskId] || null : null}
          onBack={() => {
            setDebugTaskId(null);
            setCurrentPage('tasks');
          }}
        />
      )}

      {/* Footer - Hidden in tally mode */}
      {settings.viewMode !== 'tally' && (
        <footer className="p-4 bg-bg-primary text-xs text-text-primary flex justify-between items-center">
          <div className="flex items-center gap-4">
            <span>v0.1.0</span>
            <CliConnectionStatus />
            <span className="text-text-secondary">
              Port: {import.meta.env.VITE_TALLR_PORT || (import.meta.env.DEV ? '4317' : '4317')}
            </span>
          </div>
          <div className="text-right">
            Built by{" "}
            <button
              onClick={() => open("https://tallr.dev")}
              className="hover:text-accent-primary transition-colors cursor-pointer"
            >
              Tallr Team
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

export default App;