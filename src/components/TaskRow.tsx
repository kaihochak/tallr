import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { 
  ChevronDown,
  ChevronUp,
  Clock,
  Terminal,
  ExternalLink,
  Code
} from "lucide-react";

// Icon mapping for agents and IDEs
const agentIcons = {
  claude: Terminal, // Will be replaced with actual Claude icon
  cursor: Terminal,
  gemini: Terminal,
  default: Terminal
};

const ideIcons = {
  cursor: Code,
  code: Code,
  vscode: Code,
  windsurf: Code,
  webstorm: Code,
  default: Code
};

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
    >
      {/* Row 1: Project Name */}
      <div className="task-project-row">
        <span className="project-name">{project?.name || "Unknown"}</span>
      </div>

      {/* Row 2: Metadata */}
      <div className="task-metadata-row">
        <div className="metadata-info">
          <Terminal className="agent-icon" />
          <span className="agent-name">{task.agent}</span>
          {project?.preferredIde && (
            <>
              <span className="metadata-separator">·</span>
              <Code className="ide-icon" />
              <span className="ide-name">{project.preferredIde}</span>
            </>
          )}
          <span className="metadata-separator">·</span>
          <Clock className="clock-icon" />
          <span className="task-age">{age}m ago</span>
        </div>
      </div>

      {/* Row 2: Status Badge */}
      <div className="task-status-badge">
        {isCompleted ? (
          <span className="task-state completed">
            ✅ Done - {countdown}s
          </span>
        ) : (
          <span className={`task-state ${task.state.toLowerCase()}`}>
            {task.state}
          </span>
        )}
      </div>

      {/* Row 1: Action Button */}
      <div className="task-action" onClick={(e) => e.stopPropagation()}>
        <button 
          className="action-button"
          title="Open IDE & Terminal" 
          onClick={handleJumpToContext}
          disabled={isCompleted}
        >
          <ExternalLink className="action-button-icon" />
        </button>
      </div>

      {/* Row 3: Activity (spans full width) */}
      {task.details && (
        <div className="task-activity-row">
          <div className="activity-content">
            <span className={`activity-text ${isExpanded ? "expanded" : "collapsed"}`}>
              {task.details}
            </span>
            {task.details.length > 100 && (
              <button 
                className="expand-toggle"
                onClick={toggleTaskExpanded}
                title={isExpanded ? "Show less" : "Show more"}
              >
                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}