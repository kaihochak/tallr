import { useCallback, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

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
          setShowDeleteDialog(true);
          break;
      }
    } catch (error) {
      console.error(`Failed to ${action} task:`, error);
      alert(`Failed to ${action} session. Please try again.`);
    }
  }, [task.id, task.agent, task.pinned, project?.name, onJumpToContext, onShowDebug, onTogglePin, onDeleteTask]);

  const handleConfirmDelete = useCallback(async () => {
    try {
      await onDeleteTask(task.id);
      setShowDeleteDialog(false);
    } catch (error) {
      console.error("Failed to delete task:", error);
      alert("Failed to delete session. Please try again.");
    }
  }, [task.id, onDeleteTask]);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 p-4 mb-3 rounded-lg bg-bg-card border border-border-primary cursor-pointer transition-all duration-150 animate-slideInUp relative overflow-hidden min-h-[60px]",
        "hover:border-border-secondary hover:bg-bg-hover",
        isTaskCompleted(task.state) && "opacity-70"
      )}
      title="Click to open in IDE • Option+Click for debug console"
      onClick={(e) => {
        // Option+click opens debug dialog
        if (e.altKey) {
          e.preventDefault();
          onShowDebug?.(task.id);
        } else {
          handleJumpToContext();
        }
      }}
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Session</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the "{task.agent}" session in {project?.name || "Unknown"}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}