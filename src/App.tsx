import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { Download, Terminal, Copy, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TaskRow from "./components/TaskRow";
import EmptyState from "./components/EmptyState";
import Header from "./components/Header";
import { DebugPage } from "./components/DebugPage";
import { ErrorDisplay } from "./components/debug/ErrorDisplay";
import { useAppState } from "./hooks/useAppState";
import { useSettings } from "./hooks/useSettings";
import { debug } from "./utils/debug";
import { logger } from "./utils/logger";
import { ApiService } from "./services/api";
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
  const { appState, isLoading, error, retryConnection } = useAppState();
  const { settings, toggleAlwaysOnTop, toggleTheme, toggleViewMode, toggleNotifications } = useSettings();
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [currentPage, setCurrentPage] = useState<'tasks' | 'debug'>('tasks');
  const [debugTaskId, setDebugTaskId] = useState<string | null>(null);
  const [showDoneTasks, setShowDoneTasks] = useState(false);
  
  
  // Setup wizard state
  const [installing, setInstalling] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [showManualInstructions, setShowManualInstructions] = useState(false);
  const [copied, setCopied] = useState(false);

  // Load setup status
  useEffect(() => {
    const loadSetupStatus = async () => {
      try {
        logger.info("Loading setup status");
        const status = await invoke<SetupStatus>("get_setup_status_cmd");
        setShowSetupWizard(status.isFirstLaunch && !status.setupCompleted);
        logger.info("Setup status loaded", { isFirstLaunch: status.isFirstLaunch, setupCompleted: status.setupCompleted });
      } catch (error) {
        logger.error("Failed to load setup status", error);
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
      const matchesState = true;
      
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
      
      // Third priority: creation order (oldest first for stability)
      return a.createdAt - b.createdAt;
    });
  }, [appState, showDoneTasks]);

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
    logger.userAction("Delete task", { taskId });
    console.log(`Attempting to delete task: ${taskId}`);
    try {
      await ApiService.deleteTask(taskId);
      logger.info("Task deleted successfully", { taskId });
      console.log(`Successfully deleted task: ${taskId}`);
    } catch (error) {
      logger.error("Failed to delete task", { taskId, error });
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
      console.error("Failed to toggle pin:", error);
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
      
      // Show a brief notification (could enhance this later)
      console.log('Debug state copied to clipboard');
    } catch (error) {
      debug.ui('Failed to copy debug state', { error });
      console.error('Failed to copy debug state:', error);
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

  // Setup wizard handlers
  const handleInstall = useCallback(async () => {
    setInstalling(true);
    setSetupError(null);
    
    try {
      // First check permissions
      const hasPermission = await invoke<boolean>('check_cli_permissions');
      if (!hasPermission) {
        throw new Error('Permission denied. Please use the manual installation method with sudo.');
      }
      
      // Perform installation
      await invoke('install_cli_globally');
      // Installation complete - go straight to main app
      handleSetupComplete();
    } catch (err: any) {
      console.error('Installation failed:', err);
      const errorMsg = err.toString().replace('Error: ', '');
      setSetupError(errorMsg);
      
      // If permission denied, automatically show manual instructions
      if (errorMsg.includes('Permission denied') || errorMsg.includes('sudo')) {
        setShowManualInstructions(true);
      }
    } finally {
      setInstalling(false);
    }
  }, []);

  const handleCopyCommand = useCallback(() => {
    const command = 'sudo ln -s /Applications/Tallr.app/Contents/MacOS/tallr /usr/local/bin/tallr';
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

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


  if (showSetupWizard) {
    return (
      <div className="h-screen flex flex-col bg-gradient-to-br from-bg-primary to-bg-secondary animate-fadeIn">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-lg w-full space-y-6">
            <div className="text-center space-y-4">
              <h1 className="text-3xl font-bold text-text-primary">Install CLI Tools</h1>
              <p className="text-text-secondary">
                Get notified when your AI sessions need input.
              </p>
            </div>
            
            <Button 
              onClick={handleInstall}
              disabled={installing}
              className="w-full h-12 text-base font-medium"
              size="lg"
            >
              {installing ? (
                <>
                  <Download className="w-5 h-5 mr-2 animate-spin" /> Installing...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5 mr-2" /> Install CLI Tools
                </>
              )}
            </Button>
            
            {setupError && (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <div className="flex items-center gap-2 mb-2 text-destructive">
                  <AlertCircle size={16} />
                  <strong>Installation failed:</strong>
                </div>
                <p className="text-destructive text-sm mb-2">{setupError}</p>
                {showManualInstructions && (
                  <p className="text-destructive text-sm">Please try the manual installation method below.</p>
                )}
              </div>
            )}

            <div className="flex justify-center">
              <Button 
                variant="outline"
                onClick={() => setShowManualInstructions(!showManualInstructions)}
                className="text-sm"
              >
                {showManualInstructions ? 'Hide' : 'Manual installation'}
              </Button>
            </div>

            {/* Manual installation instructions */}
            {showManualInstructions && (
              <div className="space-y-4 p-4 bg-bg-secondary border border-border-primary rounded-lg">
                <div className="flex items-center gap-2">
                  <Terminal size={18} className="text-text-primary" />
                  <h4 className="font-semibold text-text-primary">Manual Installation</h4>
                </div>
                <p className="text-sm text-text-secondary">Run this command in Terminal:</p>
                <div className="relative">
                  <code className="block p-3 bg-bg-tertiary border border-border-secondary rounded-lg text-sm font-mono text-text-primary pr-12 whitespace-pre-wrap">
                    sudo ln -s /Applications/Tallr.app/Contents/MacOS/tallr /usr/local/bin/tallr
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCopyCommand}
                    className="absolute top-2 right-2 h-8 w-8 text-text-secondary hover:text-text-primary"
                    title="Copy to clipboard"
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </Button>
                </div>
                <p className="text-xs text-text-tertiary">
                  You'll be prompted for your password to create the symlink.
                </p>
                <div className="flex justify-center pt-2">
                  <Button 
                    onClick={handleSetupComplete}
                    className="text-sm"
                  >
                    Continue to App
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
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
        <div className="flex-1 overflow-y-auto p-6 bg-bg-primary scrollbar-thin scrollbar-thumb-border-primary scrollbar-track-transparent scrollbar-thumb-rounded-full scrollbar-track-rounded-full hover:scrollbar-thumb-border-secondary">
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
          <button 
            onClick={() => open("https://github.com/anthropics/claude-code/issues")}
            className="hover:text-accent-primary transition-colors cursor-pointer"
          >
            Submit Support
          </button>
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