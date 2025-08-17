import { useCallback } from "react";
import { 
  Trash2,
  MoreHorizontal,
  ExternalLink,
  Bug,
  Pin,
  PinOff
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { TaskRowProps } from '@/types';
import { isTaskCompleted } from '@/lib/sessionHelpers';
import { cn } from '@/lib/utils';
import StatusIndicator from './StatusIndicator';
import TaskMetadata from './TaskMetadata';
import TaskDetail from "./TaskDetail";

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

  const handleDropdownAction = useCallback(async (action: string) => {
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
      className={cn(
        "flex flex-col gap-2 p-5 mb-4 rounded-xl bg-bg-card border border-border-light cursor-pointer transition-all duration-200 animate-slideInUp shadow-sm relative overflow-hidden min-h-[60px]",
        "hover:-translate-y-0.5 hover:shadow-md hover:border-border-secondary",
        isTaskCompleted(task.state) && "opacity-80"
      )}
      onClick={handleJumpToContext}
    >
      <StatusIndicator state={task.state} />
      
      {/* Main Content Row */}
      <div className="flex items-center gap-3 w-full min-w-0">
        {/* Status Badge */}
        <span className={`task-state-badge ${task.state.toLowerCase()}`}>
          {task.state}
        </span>

        {/* Task Metadata */}
        <TaskMetadata 
          task={task}
          project={project}
          allTasks={allTasks}
        />

        {/* Task Actions */}
        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon"
                className="w-8 h-8 text-text-tertiary hover:bg-bg-hover hover:text-text-primary cursor-pointer"
                title="More actions"
              >
                <MoreHorizontal size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[140px] cursor-pointer">
              <DropdownMenuItem onSelect={() => handleDropdownAction('jump')} className="cursor-pointer">
                <ExternalLink size={14} className="mr-2" />
                Jump to
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleDropdownAction('debug')} className="cursor-pointer">
                <Bug size={14} className="mr-2" />
                Debug
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleDropdownAction('pin')} className="cursor-pointer">
                {task.pinned ? <PinOff size={14} className="mr-2" /> : <Pin size={14} className="mr-2" />}
                {task.pinned ? 'Unpin' : 'Pin to top'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onSelect={() => handleDropdownAction('delete')}
                className="text-destructive focus:text-destructive cursor-pointer"
              >
                <Trash2 size={14} className="mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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