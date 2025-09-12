import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import TaskRow from "./components/TaskRow";
import EmptyState from "./components/EmptyState";
import UnifiedToolbar from "./components/UnifiedToolbar";
import { ProjectFilterPills } from "./components/ProjectFilterPills";
import { FilterPill } from "./components/ui/FilterPill";
import { DebugPage } from "./components/DebugPage";
import { ErrorDisplay } from "./components/debug/ErrorDisplay";
import { CliConnectionStatus } from "./components/CliConnectionStatus";
import { SetupWizard } from "./components/SetupWizard";
import { HooksTip } from "./components/HooksTip";
import { useAppState } from "./hooks/useAppState";
import { useSettings } from "./hooks/useSettings";
import { useFilteredTasks, useTaskCounts } from "./hooks/useFilteredTasks";
import { useAdaptiveWindowSize } from "./hooks/useAdaptiveWindowSize";
import { debug } from "./utils/debug";
import { logger } from "./utils/logger";
import { notificationService } from "./services/notificationService";
import { ApiService } from "./services/api";
import { getHighestPriorityState } from "./lib/taskHelpers";

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
  const { settings, toggleAlwaysOnTop, toggleTheme, toggleViewMode, toggleNotifications, toggleAutoSortTasks, toggleGroupByProject } = useSettings();
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [currentPage, setCurrentPage] = useState<'tasks' | 'debug'>('tasks');
  const [debugTaskId, setDebugTaskId] = useState<string | null>(null);
  const [showDoneTasks, setShowDoneTasks] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showHooksTip, setShowHooksTip] = useState(false);

  // Load setup status
  useEffect(() => {
    const loadSetupStatus = async () => {
      try {
        logger.info("Loading setup status");
        const status = await invoke<SetupStatus>("get_setup_status_cmd");
        setShowSetupWizard(status.isFirstLaunch && !status.setupCompleted);
        
        // Show hooks tip if setup just completed and user hasn't dismissed it
        if (status.setupCompleted && !localStorage.getItem('tallr-hooks-tip-dismissed')) {
          setShowHooksTip(true);
        }
        
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
    selectedProjectId,
    autoSortTasks: settings.autoSortTasks
  });

  // Auto-clear project filter when no tasks match but other active tasks exist
  useEffect(() => {
    if (selectedProjectId && filteredTasks.length === 0 && !showDoneTasks) {
      // Check if there are active tasks in other projects
      const otherActiveTasks = Object.values(appState.tasks).filter(
        task => task.state !== "DONE" && task.projectId !== selectedProjectId
      );
      
      if (otherActiveTasks.length > 0) {
        setSelectedProjectId(null);
      }
    }
  }, [filteredTasks.length, selectedProjectId, showDoneTasks, appState.tasks]);

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

      // Command+Shift+C to copy debug state to clipboard
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === "c") {
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

  // Handle dismissing hooks tip
  const handleDismissHooksTip = useCallback(() => {
    localStorage.setItem('tallr-hooks-tip-dismissed', 'true');
    setShowHooksTip(false);
  }, []);

  // Get aggregate state for tray color
  const aggregateState = useMemo(() => {
    const states = Object.values(appState.tasks).map(t => t.state);
    if (states.includes("PENDING")) return "pending";
    if (states.includes("WORKING")) return "working";
    return "idle";
  }, [appState.tasks]);


  // Use adaptive window sizing hook
  useAdaptiveWindowSize({
    viewMode: settings.viewMode,
    taskCount: filteredTasks.length,
    showDoneTasks,
    hasError: !!error,
    isLoading
  });

  if (showSetupWizard) {
    return <SetupWizard onSetupComplete={handleSetupComplete} />;
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-bg-primary to-bg-secondary animate-fadeIn">
      {/* Unified Toolbar - positioned absolutely over content */}
      <UnifiedToolbar
        aggregateState={aggregateState}
        activeTasks={taskCounts.activeTasks}
        doneTasks={taskCounts.doneTasks}
        showDoneTasks={showDoneTasks}
        alwaysOnTop={settings.alwaysOnTop}
        notificationsEnabled={settings.notificationsEnabled}
        autoSortTasks={settings.autoSortTasks}
        groupByProject={settings.groupByProject}
        theme={settings.theme}
        viewMode={settings.viewMode}
        onTogglePin={toggleAlwaysOnTop}
        onToggleDoneTasks={() => setShowDoneTasks(prev => !prev)}
        onToggleNotifications={toggleNotifications}
        onToggleAutoSortTasks={toggleAutoSortTasks}
        onToggleGroupByProject={toggleGroupByProject}
        onToggleTheme={toggleTheme}
        onToggleViewMode={toggleViewMode}
      />

      {/* Main Content - Add padding top for toolbar */}
      {currentPage === 'tasks' && (
        settings.viewMode === 'tally' ? (
          // Tally view mode - Status indicators in main window
          <div className="flex-1 flex py-10">
            {error ? (
              <ErrorDisplay error={error} onRetry={retryConnection} />
            ) : isLoading ? (
              <div className="flex w-full">
                <div className="flex-1 bg-gradient-to-r from-bg-tertiary via-bg-hover to-bg-tertiary bg-[length:2000px_100%] animate-shimmer"></div>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="flex-1 bg-bg-tertiary"></div>
            ) : (
              // Group tasks by project
              <div className="flex items-center w-full h-full px-2 gap-2">
                {(() => {
                  // Group tasks by project
                  const tasksByProject = filteredTasks.reduce((acc, task) => {
                    const projectId = task.projectId;
                    if (!acc[projectId]) {
                      acc[projectId] = [];
                    }
                    acc[projectId].push(task);
                    return acc;
                  }, {} as Record<string, typeof filteredTasks>);
                  
                  const projectEntries = Object.entries(tasksByProject);
                  const hasMultipleProjects = projectEntries.length > 1;
                  const projectWidth = 100 / projectEntries.length;
                  
                  return projectEntries.map(([projectId, projectTasks], projectIndex) => {
                    const project = appState.projects[projectId];
                    
                    return (
                      <div
                        key={projectId}
                        className={`flex flex-col items-center justify-center ${hasMultipleProjects && projectIndex > 0 ? 'border-l border-border-primary/20' : ''}`}
                        style={{ width: `${projectWidth}%` }}
                      >
                        <div className="flex gap-0.5 w-full rounded-md overflow-hidden">
                          {projectTasks.map((task) => {
                            const segmentWidth = 100 / projectTasks.length;
                            
                            return (
                              <button
                                key={task.id}
                                className={`tally-segment-full tally-segment-${task.state.toLowerCase()} rounded-none
                                  ${task.pinned ? 'ring-2 ring-teal-500 ring-inset' : ''}`}
                                style={{ width: `${segmentWidth}%` }}
                                onClick={(e) => {
                                  if (e.altKey) {
                                    handleShowDebugForTask(task.id);
                                  } else {
                                    handleJumpToSpecificTask(task.id);
                                  }
                                }}
                                title={`${project?.name || 'Unknown'} - ${task.agent} (${task.state.toLowerCase()})`}
                              />
                            );
                          })}
                        </div>
                        <span className="text-[10px] text-text-secondary mt-1 truncate max-w-full">
                          {project?.name || 'Unknown'}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        ) : (
          // Normal view modes
          <div className="flex-1 overflow-y-auto p-4 pt-12 bg-bg-primary scrollbar-thin scrollbar-thumb-border-primary scrollbar-track-transparent scrollbar-thumb-rounded-full scrollbar-track-rounded-full hover:scrollbar-thumb-border-secondary">
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
                {!settings.groupByProject && (
                  <ProjectFilterPills
                    projects={appState.projects}
                    tasks={appState.tasks}
                    selectedProjectId={selectedProjectId}
                    onSelectProject={setSelectedProjectId}
                    showDoneTasks={showDoneTasks}
                    viewMode={settings.viewMode}
                  />
                )}
                {showHooksTip && (
                  <HooksTip onDismiss={handleDismissHooksTip} />
                )}
                {settings.groupByProject ? (
                  // Grouped by project - column layout
                  (() => {
                    // First, get all projects that have any tasks (not just filtered)
                    const allTasksByProject = Object.values(appState.tasks)
                      .filter(task => showDoneTasks ? task.state === 'DONE' : task.state !== 'DONE')
                      .reduce((acc, task) => {
                        const projectId = task.projectId;
                        if (!acc[projectId]) {
                          acc[projectId] = [];
                        }
                        acc[projectId].push(task);
                        return acc;
                      }, {} as Record<string, typeof filteredTasks>);
                    
                    // Then apply project filtering to get the tasks to display
                    const tasksByProject = filteredTasks.reduce((acc, task) => {
                      const projectId = task.projectId;
                      if (!acc[projectId]) {
                        acc[projectId] = [];
                      }
                      acc[projectId].push(task);
                      return acc;
                    }, {} as Record<string, typeof filteredTasks>);
                    
                    // Use all projects for showing FilterPills, but filtered tasks for content
                    const allProjectEntries = Object.entries(allTasksByProject);
                    const hasMultipleProjects = allProjectEntries.length > 1;
                    
                    if (allProjectEntries.length === 0) {
                      return null;
                    }
                    
                    return (
                      <div className="flex gap-4 min-h-0 flex-1">
                        {allProjectEntries.map(([projectId, allProjectTasks], projectIndex) => {
                          // Get the filtered tasks for this project (might be empty)
                          const projectTasks = tasksByProject[projectId] || [];
                          const project = appState.projects[projectId];
                          // Use allProjectTasks for state calculation to show true project state
                          const highestPriorityState = getHighestPriorityState(allProjectTasks);
                          const isSelected = selectedProjectId === projectId;
                          const projectState = highestPriorityState.toLowerCase();
                          const hasFilteredTasks = projectTasks.length > 0;
                          
                          // Use the same state-based styling as ProjectFilterPills
                          const getProjectStateClasses = (state: string, isSelected: boolean) => {
                            switch (state) {
                              case 'pending':
                                return isSelected 
                                  ? 'border-status-pending bg-status-pending/30 text-status-pending dark:bg-status-pending/20 dark:text-status-pending hover:bg-status-pending/40 dark:hover:bg-status-pending/30 status-pulse-pending'
                                  : 'border-status-pending/60 bg-status-pending/12 status-pulse-pending';
                              case 'working':
                                return isSelected
                                  ? 'border-status-working bg-status-working/30 text-status-working dark:bg-status-working/20 dark:text-status-working hover:bg-status-working/40 dark:hover:bg-status-working/30 status-pulse-working'
                                  : 'border-status-working/60 bg-status-working/12 status-pulse-working';
                              case 'idle':
                                return isSelected
                                  ? 'border-status-idle bg-status-idle/40 text-status-idle dark:bg-status-idle/20 dark:text-status-idle hover:bg-status-idle/50 dark:hover:bg-status-idle/30'
                                  : 'border-status-idle/30 bg-status-idle/5';
                              default:
                                return '';
                            }
                          };
                          
                          // Dynamic width based on selection
                          const getColumnClasses = () => {
                            if (!selectedProjectId) {
                              // No filter active - equal width columns
                              return 'flex-1 flex flex-col min-w-0';
                            } else if (isSelected) {
                              // This project is selected - takes almost all space
                              return 'flex-[10] flex flex-col min-w-0';
                            } else {
                              // This project is not selected - extremely minimal width (just a sliver)
                              return 'flex-[0.1] flex flex-col min-w-[40px] max-w-[60px]';
                            }
                          };

                          return (
                            <div
                              key={projectId}
                              className={`${getColumnClasses()} transition-all duration-300 ease-in-out ${hasMultipleProjects && projectIndex > 0 ? 'border-l border-border-primary/20 pl-2' : ''}`}
                            >
                              {/* Project header using FilterPill - always show when multiple projects */}
                              {hasMultipleProjects && (
                                <div className="mb-3 flex justify-center">
                                  <FilterPill
                                    selected={isSelected}
                                    size={selectedProjectId && !isSelected ? "sm" : "md"}
                                    onClick={() => setSelectedProjectId(selectedProjectId === projectId ? null : projectId)}
                                    className={`${selectedProjectId && !isSelected ? 'w-8 h-8 p-0 min-w-0' : 'w-full max-w-none'} justify-center ${getProjectStateClasses(projectState, isSelected)} ${!hasFilteredTasks && !isSelected ? 'opacity-50' : ''}`}
                                    title={`${project?.name || 'Unknown'} (${allProjectTasks.length} tasks)${selectedProjectId === projectId ? ' - Click to clear filter' : ''}`}
                                  >
                                    {selectedProjectId && !isSelected ? (
                                      // Ultra minimal - just show first letter for collapsed columns
                                      <span className="text-xs font-bold">
                                        {(project?.name || 'U')[0].toUpperCase()}
                                      </span>
                                    ) : (
                                      // Full view for selected or no-filter state
                                      `${project?.name || 'Unknown'} (${isSelected ? projectTasks.length : allProjectTasks.length})`
                                    )}
                                  </FilterPill>
                                </div>
                              )}
                              
                              {/* Tasks for this project */}
                              <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border-primary scrollbar-track-transparent">
                                {selectedProjectId && selectedProjectId !== projectId ? (
                                  // Collapsed view - show all tasks as vertical color indicators (like tally mode but vertical)
                                  <div className="flex flex-col px-1">
                                    {allProjectTasks.map((task) => (
                                      <button
                                        key={task.id}
                                        className={`w-full min-h-[44px] mb-2 rounded-lg tally-segment-${task.state.toLowerCase()} transition-all duration-200 hover:brightness-110 ${
                                          task.pinned ? 'ring-2 ring-teal-500 ring-inset' : ''
                                        }`}
                                        onClick={(e) => {
                                          if (e.altKey) {
                                            handleShowDebugForTask(task.id);
                                          } else {
                                            handleJumpToSpecificTask(task.id);
                                          }
                                        }}
                                        title={`${task.agent} - ${task.title} (${task.state.toLowerCase()})`}
                                      />
                                    ))}
                                  </div>
                                ) : projectTasks.length > 0 ? (
                                  // Normal view - show full TaskRow components
                                  projectTasks.map((task) => (
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
                                      hideProjectName={true}
                                    />
                                  ))
                                ) : (
                                  // Empty state when no tasks exist for this project
                                  null
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()
                ) : (
                  // Normal single column layout
                  filteredTasks.map((task) => {
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
                  })
                )}
              </div>
            )}
          </div>
        )
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
          {/* Left cluster: connection, version, tasks toggle */}
          <div className="flex items-center gap-4">
            <CliConnectionStatus />
            <span>v0.1.3</span>
            <button
              onClick={() => setShowDoneTasks(prev => !prev)}
              className="px-2 py-1 rounded bg-bg-tertiary/50 text-text-secondary hover:bg-bg-hover/50 transition-colors cursor-pointer"
              title={showDoneTasks ? 'Show active tasks' : 'Show completed tasks'}
              aria-label={showDoneTasks ? 'Show active tasks' : 'Show completed tasks'}
            >
              {showDoneTasks ? `${taskCounts.doneTasks} done` : `${taskCounts.activeTasks} tasks`}
            </button>
          </div>
          {/* Right cluster: DEV badge, built by */}
          <div className="flex items-center gap-3">
            {import.meta.env.DEV && (
              <span className="px-2 py-0.5 font-semibold bg-orange-500/20 text-orange-600 dark:text-orange-400 rounded border border-orange-500/30">
                DEV
              </span>
            )}
            <div className="text-right">
              Built by{" "}
              <button
                onClick={() => open("https://tallr.dev")}
                className="hover:text-accent-primary transition-colors cursor-pointer"
              >
                Tallr Team
              </button>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

export default App;
