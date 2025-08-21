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
import { isTaskCompleted, getTaskStateClasses } from '@/lib/sessionHelpers';
import { cn } from '@/lib/utils';
import StatusIndicator from './StatusIndicator';
import TaskMetadata from './TaskMetadata';
import TaskDetail from "./TaskDetail";
import TaskStateBadge from './TaskStateBadge';

export default function TaskRow({
  task,
  project,
  viewMode,
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

  // Tally mode - just a button-sized colored light
  if (viewMode === 'tally') {
    const stateClasses = getTaskStateClasses(task.state);
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "w-7 h-7 rounded-md cursor-pointer transition-all duration-200 hover:scale-105 border-0 p-0",
          stateClasses,
          task.pinned && "ring-2 ring-teal-500"
        )}
        onClick={(e) => {
          if (e.altKey) {
            e.preventDefault();
            onShowDebug?.(task.id);
          } else {
            handleJumpToContext();
          }
        }}
        title={`${project?.name || 'Unknown'} - ${task.agent} (${task.state.toLowerCase()})`}
      />
    );
  }

  // Full and simple modes
  return (
    <>
      <div
        className={cn(
          "flex flex-col justify-center gap-1 px-4 py-2 mb-2 rounded-lg bg-bg-card border border-border-primary cursor-pointer transition-all duration-150 animate-slideInUp relative overflow-hidden",
          viewMode === 'simple' ? "min-h-[36px]" : "min-h-[44px]",
          "hover:border-border-secondary hover:bg-bg-hover",
          isTaskCompleted(task.state) && "opacity-70"
        )}
        style={task.pinned ? { borderColor: '#14b8a6' } : {}}
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
        <div className="flex items-center gap-2 w-full">
          {/* Left Content - Can overflow */}
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            {/* Status Badge */}
            <TaskStateBadge state={task.state} />

            {/* Task Metadata */}
            <TaskMetadata 
              task={task}
              project={project}
              allTasks={allTasks}
            />
          </div>

          {/* Task Actions - Fixed position, never overflow */}
          <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="w-7 h-7 text-text-tertiary hover:bg-bg-hover hover:text-text-primary cursor-pointer"
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
                {import.meta.env.DEV && (
                  <DropdownMenuItem onSelect={() => handleDropdownAction('debug')} className="cursor-pointer">
                    <Bug size={14} className="mr-2" />
                    Debug
                  </DropdownMenuItem>
                )}
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

        {/* Details Row - Only rendered when in full mode */}
        {viewMode === 'full' && (
          <TaskDetail 
            details={task.details || ''}
          />
        )}
      </div>

      {/* Delete Confirmation Dialog - Rendered outside TaskRow to prevent event conflicts */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog} modal>
        <DialogContent 
          className="z-[100] pointer-events-auto"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Delete Session</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the "{task.agent}" session in {project?.name || "Unknown"}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pointer-events-auto">
            <Button 
              variant="outline" 
              className="pointer-events-auto cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteDialog(false);
              }}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              className="pointer-events-auto cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                handleConfirmDelete();
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}