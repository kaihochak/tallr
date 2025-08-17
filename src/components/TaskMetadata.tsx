import { Project, Task } from '@/types';
import { Badge } from './Badge';
import { calculateSessionNumber } from '@/lib/sessionHelpers';
import { cn } from '@/lib/utils';

interface TaskMetadataProps {
  task: Task;
  project: Project | undefined;
  allTasks: Task[];
  className?: string;
}

export default function TaskMetadata({ task, project, allTasks, className }: TaskMetadataProps) {
  const sessionNumber = calculateSessionNumber(task, allTasks, project);
  
  return (
    <div className={cn("flex items-center gap-3 flex-1", className)}>
      {/* Project Name with Session Number */}
      <span className="font-bold text-text-primary text-base sm:text-lg whitespace-nowrap overflow-hidden text-ellipsis">
        {project?.name || "Unknown"}
        {sessionNumber && (
          <span className="font-medium text-text-secondary text-sm sm:text-base ml-1.5">
            #{sessionNumber}
          </span>
        )}
      </span>
      
      {/* Badges */}
      <div className="flex items-center text-text-muted">
        <Badge type="agent" name={task.agent} />
        {project?.preferredIde && (
          <>
            <span className="text-text-muted mx-0.5">·</span>
            <Badge type="ide" name={project.preferredIde} />
          </>
        )}
      </div>
    </div>
  );
}