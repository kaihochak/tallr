import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { 
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Clock,
  Terminal,
  Rocket
} from "lucide-react";

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
  isRemoving?: boolean;
}

interface TaskRowProps {
  task: Task;
  project: Project | undefined;
  isSelected: boolean;
  isExpanded: boolean;
  isRemoving: boolean;
  countdown?: number;
  expandedTasks: Set<string>;
  setExpandedTasks: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export default function TaskRow({
  task,
  project,
  isSelected,
  isExpanded,
  isRemoving,
  countdown,
  expandedTasks,
  setExpandedTasks
}: TaskRowProps) {
  const age = Math.floor((Date.now() - task.updatedAt * 1000) / 60000);
  const isCompleted = countdown !== undefined;

  const handleJumpToContext = useCallback(async () => {
    if (!project || isCompleted) return;

    try {
      await invoke("open_ide_and_terminal", {
        projectPath: project.repoPath,
        ide: project.preferredIde
      });
    } catch (error) {
      console.error("Failed to open IDE and terminal:", error);
    }
  }, [project, isCompleted]);

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

  return (
    <div
      className={`task-row ${isSelected ? "selected" : ""} state-${task.state.toLowerCase()} ${isExpanded ? "expanded" : ""} ${isRemoving ? "removing" : ""} ${isCompleted ? "completed" : ""}`}
      onClick={handleJumpToContext}
    >
      <div className="task-main">
        <div className="task-header">
          <span className="project-name">{project?.name || "Unknown"}</span>
          <ChevronRight style={{ width: 16, height: 16, opacity: 0.5 }} />
          <span className="task-title">{task.title}</span>
          {isCompleted ? (
            <span className="task-state completed">
              ✅ Done - {countdown}s
            </span>
          ) : (
            <span className={`task-state ${task.state.toLowerCase()}`}>
              {task.state}
            </span>
          )}
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
          {task.details && (
            <div className="details-container">
              <span className={`details ${isExpanded ? "expanded" : "collapsed"}`}>
                {task.details}
              </span>
              {task.details.length > 100 && (
                <button 
                  className="expand-button"
                  onClick={toggleTaskExpanded}
                  title={isExpanded ? "Show less" : "Show more"}
                >
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="task-actions" onClick={(e) => e.stopPropagation()}>
        <button 
          className="action-button"
          title="Open IDE & Terminal" 
          onClick={handleJumpToContext}
          disabled={isCompleted}
        >
          <Rocket className="action-button-icon" />
        </button>
      </div>
    </div>
  );
}