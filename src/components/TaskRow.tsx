import { useCallback, useState, useRef, useEffect, useMemo } from "react";
import { 
  Trash2,
  MoreHorizontal,
  ExternalLink,
  Bug,
  Pin,
  PinOff
} from "lucide-react";
import { Badge } from "./Badge";
import TaskDetail from "./TaskDetail";

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
  completedAt?: number;
  pinned: boolean;
}

interface TaskRowProps {
  task: Task;
  project: Project | undefined;
  isExpanded: boolean;
  setExpandedTasks: React.Dispatch<React.SetStateAction<Set<string>>>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onJumpToContext: (taskId: string) => Promise<void>;
  onShowDebug: (taskId: string) => void;
  onTogglePin: (taskId: string, pinned: boolean) => Promise<void>;
  allTasks: Task[];
}

export default function TaskRow({
  task,
  project,
  isExpanded,
  setExpandedTasks,
  onDeleteTask,
  onJumpToContext,
  onShowDebug,
  onTogglePin,
  allTasks
}: TaskRowProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Calculate session number for tasks on the same project
  const sessionNumber = useMemo(() => {
    if (!project) return null;
    
    // Get all tasks for this project, excluding DONE tasks
    const projectTasks = allTasks
      .filter(t => t.projectId === task.projectId && t.state !== "DONE")
      .sort((a, b) => a.createdAt - b.createdAt); // Sort by creation time (oldest first)
    
    // Only show session numbers if there are multiple active tasks for this project
    if (projectTasks.length <= 1) return null;
    
    // Find the index of current task and add 1 for 1-based numbering
    const taskIndex = projectTasks.findIndex(t => t.id === task.id);
    return taskIndex >= 0 ? taskIndex + 1 : null;
  }, [allTasks, task.projectId, task.id, task.state, project]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);

  // Updated to use the passed-in callback
  const handleJumpToContext = useCallback(async () => {
    if (!project) return;
    await onJumpToContext(task.id);
  }, [task.id, onJumpToContext, project]);

  const toggleTaskExpanded = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(task.id)) {
        newSet.delete(task.id);
      } else {
        newSet.add(task.id);
      }
      return newSet;
    });
  }, [task.id, setExpandedTasks]);


  const handleToggleDropdown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDropdown(prev => !prev);
  }, []);

  const handleDropdownAction = useCallback(async (action: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDropdown(false);

    try {
      switch (action) {
        case 'jump':
          await onJumpToContext(task.id);
          break;
        case 'debug':
          onShowDebug(task.id);
          break;
        case 'pin':
          await onTogglePin(task.id, !task.pinned);
          break;
        case 'delete':
          if (confirm(`Delete session "${task.agent}" in ${project?.name || "Unknown"}?`)) {
            await onDeleteTask(task.id);
          }
          break;
      }
    } catch (error) {
      console.error(`Failed to ${action} task:`, error);
      alert(`Failed to ${action} session. Please try again.`);
    }
  }, [task.id, task.agent, task.pinned, project?.name, onJumpToContext, onShowDebug, onTogglePin, onDeleteTask]);

  return (
    <div
      className={`flex flex-col gap-2 p-5 mb-1 rounded-xl bg-bg-card border border-border-light cursor-pointer transition-all duration-200 animate-slideInUp shadow-sm relative overflow-hidden min-h-[60px] ${
        task.state.toLowerCase() === 'completed' ? 'opacity-80' : ''
      } hover:-translate-y-0.5 hover:shadow-md hover:border-border-secondary`}
      onClick={handleJumpToContext}
    >
      {/* Left Status Indicator */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 transition-all duration-200 ${
        task.state.toLowerCase() === 'pending' 
          ? 'bg-status-pending shadow-[0_0_8px_var(--status-pending)] animate-pulse' 
          : task.state.toLowerCase() === 'working'
          ? 'bg-status-working shadow-[0_0_8px_var(--status-working)] animate-pulse'
          : 'bg-status-idle'
      }`} />
      
      {/* Main Content Row */}
      <div className="flex items-center gap-3 w-full min-w-0">
        {/* Status Badge */}
        <span className={`task-state-badge ${task.state.toLowerCase()}`}>
          {task.state}
        </span>

        {/* Project Name */}
        <span className="font-bold text-text-primary text-base whitespace-nowrap overflow-hidden text-ellipsis">
          {project?.name || "Unknown"}
          {sessionNumber && <span className="font-normal text-text-muted text-sm ml-1.5">#{sessionNumber}</span>}
        </span>

        {/* Metadata */}
        <div className="flex items-center gap-1.5 flex-1">
          <Badge type="agent" name={task.agent} />
          {project?.preferredIde && (
            <>
              <span className="text-text-muted mx-0.5">·</span>
              <Badge type="ide" name={project.preferredIde} />
            </>
          )}
        </div>

        {/* Task Actions */}
        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          <div className="relative z-[1001]" ref={dropdownRef}>
            <button 
              className="flex items-center justify-center w-8 h-8 border-none rounded-md bg-transparent text-text-tertiary cursor-pointer transition-all duration-200 hover:bg-bg-hover hover:text-text-primary hover:scale-105"
              title="More actions" 
              onClick={handleToggleDropdown}
            >
              <MoreHorizontal size={16} />
            </button>
            {showDropdown && (
              <div className="absolute top-full right-0 bg-bg-primary border border-border-secondary rounded-lg shadow-lg z-[1000] min-w-[140px] overflow-visible animate-[dropdown-enter_0.1s_ease-out]">
                <button 
                  className="flex items-center gap-2 w-full px-3 py-2 border-none bg-transparent text-text-primary text-sm cursor-pointer transition-all duration-200 text-left hover:bg-bg-hover first:hover:rounded-t-lg last:hover:rounded-b-lg"
                  onClick={(e) => handleDropdownAction('jump', e)}
                >
                  <ExternalLink size={14} />
                  Jump to
                </button>
                <button 
                  className="flex items-center gap-2 w-full px-3 py-2 border-none bg-transparent text-text-primary text-sm cursor-pointer transition-all duration-200 text-left hover:bg-bg-hover"
                  onClick={(e) => handleDropdownAction('debug', e)}
                >
                  <Bug size={14} />
                  Debug
                </button>
                <button 
                  className="flex items-center gap-2 w-full px-3 py-2 border-none bg-transparent text-text-primary text-sm cursor-pointer transition-all duration-200 text-left hover:bg-bg-hover"
                  onClick={(e) => handleDropdownAction('pin', e)}
                >
                  {task.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                  {task.pinned ? 'Unpin' : 'Pin to top'}
                </button>
                <div className="h-px bg-border-secondary my-1"></div>
                <button 
                  className="flex items-center gap-2 w-full px-3 py-2 border-none bg-transparent text-red-500 text-sm cursor-pointer transition-all duration-200 text-left hover:bg-red-50 last:hover:rounded-b-lg"
                  onClick={(e) => handleDropdownAction('delete', e)}
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Details Row */}
      {task.details && (
        <TaskDetail 
          details={task.details}
          isExpanded={isExpanded}
          onToggleExpanded={toggleTaskExpanded}
        />
      )}
    </div>
  );
}