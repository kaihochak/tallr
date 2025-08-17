export interface Project {
  id: string;
  name: string;
  repoPath: string;
  preferredIde: string;
  githubUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Task {
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

export interface AppState {
  projects: Record<string, Project>;
  tasks: Record<string, Task>;
  updatedAt: number;
}

export interface TaskRowProps {
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

export type TaskState = 'PENDING' | 'WORKING' | 'IDLE' | 'DONE' | 'ERROR';
export type BadgeType = 'agent' | 'ide';