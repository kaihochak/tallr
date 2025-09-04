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
  state: TaskState;
  details?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  pinned: boolean;
  detectionMethod?: string;
  confidence?: number;
  networkContext?: NetworkContext;
  sessionContext?: SessionContext;
}

// Enhanced context types matching backend implementation
// Based on @happy-coder's rich state context approach
export interface NetworkContext {
  activeRequests: number;
  averageResponseTime: number;
  thinkingDuration?: number;
  lastActivity?: number;
  requestTypes?: string[];
}

export interface SessionContext {
  sessionId?: string;
  messageCount?: number;
  lastMessage?: SessionMessage;
  waitingTime?: number;
  conversationLength?: number;
}

export interface SessionMessage {
  messageType: string;
  timestamp: string;
  preview: string;
}

export interface AppState {
  projects: Record<string, Project>;
  tasks: Record<string, Task>;
  updatedAt: number;
}

export interface TaskRowProps {
  task: Task;
  project: Project | undefined;
  viewMode: ViewMode;
  onDeleteTask: (taskId: string) => Promise<void>;
  onJumpToContext: (taskId: string) => Promise<void>;
  onShowDebug: (taskId: string) => void;
  onTogglePin: (taskId: string, pinned: boolean) => Promise<void>;
  allTasks: Task[];
}

export type TaskState = 'PENDING' | 'WORKING' | 'IDLE' | 'DONE' | 'ERROR';
export type BadgeType = 'agent' | 'ide';
export type ViewMode = 'full' | 'simple' | 'tally';