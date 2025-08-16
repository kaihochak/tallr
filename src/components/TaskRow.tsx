import { useCallback, useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { 
  ChevronDown,
  ChevronUp,
  Clock,
  Trash2,
  MoreHorizontal,
  ExternalLink,
  Bug,
  Pin,
  PinOff
} from "lucide-react";
import { Badge } from "./Badge";

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
  isSelected: boolean;
  isExpanded: boolean;
  expandedTasks: Set<string>;
  setExpandedTasks: React.Dispatch<React.SetStateAction<Set<string>>>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onJumpToContext: (taskId: string) => Promise<void>;
  onShowDebug: (taskId: string) => void;
  onTogglePin: (taskId: string, pinned: boolean) => Promise<void>;
}

export default function TaskRow({
  task,
  project,
  isSelected,
  isExpanded,
  expandedTasks,
  setExpandedTasks,
  onDeleteTask,
  onJumpToContext,
  onShowDebug,
  onTogglePin
}: TaskRowProps) {
  const age = Math.floor((Date.now() - task.updatedAt * 1000) / 60000);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const handleDeleteTask = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (confirm(`Delete session "${task.agent}" in ${project?.name || "Unknown"}?`)) {
      try {
        await onDeleteTask(task.id);
      } catch (error) {
        console.error("Failed to delete task:", error);
        alert("Failed to delete session. Please try again.");
      }
    }
  }, [task.id, task.agent, project?.name, onDeleteTask]);

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
      className={`task-row ${isSelected ? "selected" : ""} state-${task.state.toLowerCase()} ${isExpanded ? "expanded" : ""}`}
      onClick={handleJumpToContext}
      style={{ cursor: 'pointer' }}
    >
      {/* Row 1: Project Name */}
      <div className="task-project-row">
        <span className="project-name">{project?.name || "Unknown"}</span>
      </div>

      {/* Row 2: Metadata */}
      <div className="task-metadata-row">
        <div className="metadata-info">
          <Badge type="agent" name={task.agent} />
          {project?.preferredIde && (
            <>
              <span className="metadata-separator">·</span>
              <Badge type="ide" name={project.preferredIde} />
            </>
          )}
          <span className="metadata-separator">·</span>
          <Clock className="clock-icon" />
          <span className="task-age">{age}m ago</span>
        </div>
      </div>

      {/* Row 2: Status Badge */}
      <div className="task-status-badge">
        <span className={`task-state ${task.state.toLowerCase()}`}>
          {task.state}
        </span>
      </div>

      {/* Task Actions */}
      <div className="task-action" onClick={(e) => e.stopPropagation()}>
        {task.details && task.details.length > 100 && (
          <button 
            className="expand-button-main"
            title={isExpanded ? "Show less" : "Show more"} 
            onClick={toggleTaskExpanded}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        )}
        <div className="dropdown-container" ref={dropdownRef}>
          <button 
            className="more-button"
            title="More actions" 
            onClick={handleToggleDropdown}
          >
            <MoreHorizontal size={16} />
          </button>
          {showDropdown && (
            <div className="dropdown-menu">
              <button 
                className="dropdown-item"
                onClick={(e) => handleDropdownAction('jump', e)}
              >
                <ExternalLink size={14} />
                Jump to
              </button>
              <button 
                className="dropdown-item"
                onClick={(e) => handleDropdownAction('debug', e)}
              >
                <Bug size={14} />
                Debug
              </button>
              <button 
                className="dropdown-item"
                onClick={(e) => handleDropdownAction('pin', e)}
              >
                {task.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                {task.pinned ? 'Unpin' : 'Pin to top'}
              </button>
              <div className="dropdown-divider"></div>
              <button 
                className="dropdown-item delete-item"
                onClick={(e) => handleDropdownAction('delete', e)}
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Activity (spans full width) */}
      {task.details && (
        <div className="task-activity-row">
          <div className="activity-content">
            <span className={`activity-text ${isExpanded ? "expanded" : "collapsed"}`}>
              {task.details}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}