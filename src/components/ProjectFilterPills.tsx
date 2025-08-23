import { useMemo } from 'react';
import { X } from 'lucide-react';
import type { Project, Task } from '@/types';
import { FilterPill } from '@/components/ui/FilterPill';
import { getHighestPriorityState } from '@/lib/taskHelpers';

interface ProjectFilterPillsProps {
  projects: Record<string, Project>;
  tasks: Record<string, Task>;
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  showDoneTasks?: boolean;
  viewMode?: 'tally' | 'simple' | 'full';
}

export function ProjectFilterPills({
  projects,
  tasks,
  selectedProjectId,
  onSelectProject,
  showDoneTasks = false,
  viewMode = 'full'
}: ProjectFilterPillsProps) {
  // Calculate task counts per project
  const projectTaskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    
    Object.values(tasks).forEach(task => {
      if (showDoneTasks ? task.state === 'DONE' : task.state !== 'DONE') {
        counts[task.projectId] = (counts[task.projectId] || 0) + 1;
      }
    });
    
    return counts;
  }, [tasks, showDoneTasks]);

  // Get projects that have tasks
  const projectsWithTasks = useMemo(() => {
    return Object.values(projects).filter(project => 
      projectTaskCounts[project.id] > 0
    );
  }, [projects, projectTaskCounts]);

  // Calculate state for each project
  const projectStates = useMemo(() => {
    const states: Record<string, string> = {};
    
    Object.values(projects).forEach(project => {
      const projectTasks = Object.values(tasks).filter(task => 
        task.projectId === project.id && 
        (showDoneTasks ? task.state === 'DONE' : task.state !== 'DONE')
      );
      
      const highestState = getHighestPriorityState(projectTasks);
      states[project.id] = highestState.toLowerCase();
    });
    
    return states;
  }, [projects, tasks, showDoneTasks]);

  // Get state-based styling for project pills
  const getProjectStateClasses = (state: string, isSelected: boolean) => {
    switch (state) {
      case 'pending':
        return isSelected 
          ? 'border-status-pending bg-status-pending/30 text-status-pending dark:bg-status-pending/20 dark:text-status-pending hover:bg-status-pending/40 dark:hover:bg-status-pending/30 status-pulse-pending'
          : 'border-status-pending/60 bg-status-pending/12 status-pulse-pending';
      case 'working':
        return isSelected
          ? 'border-status-working bg-status-working/30 text-status-working dark:bg-status-working/20 dark:text-status-working hover:bg-status-working/40 dark:hover:bg-status-working/30 status-pulse-working'
          : 'border-status-working/60 bg-status-working/12 status-pulse-working';
      case 'idle':
        return isSelected
          ? 'border-status-idle bg-status-idle/40 text-status-idle dark:bg-status-idle/20 dark:text-status-idle hover:bg-status-idle/50 dark:hover:bg-status-idle/30'
          : 'border-status-idle/30 bg-status-idle/5';
      default:
        return '';
    }
  };

  // Don't show filter if only one project has tasks OR if in tally mode
  if (projectsWithTasks.length <= 1 || viewMode === 'tally') {
    return null;
  }

  // Determine pill size and spacing based on view mode
  const pillSize = viewMode === 'simple' ? 'sm' : 'md';
  const containerSpacing = viewMode === 'simple' ? 'gap-1.5 mb-2' : 'gap-2 mb-3';

  return (
    <div className={`flex items-center ${containerSpacing}`}>
      {/* Project filter pills with individual status indicators */}
      {projectsWithTasks.map(project => {
        const taskCount = projectTaskCounts[project.id] || 0;
        const isSelected = selectedProjectId === project.id;
        const projectState = projectStates[project.id] || 'idle';
        
        return (
          <FilterPill
            key={project.id}
            selected={isSelected}
            size={pillSize}
            onClick={() => onSelectProject(isSelected ? null : project.id)}
            className={getProjectStateClasses(projectState, isSelected)}
          >
            {project.name} ({taskCount})
          </FilterPill>
        );
      })}

      {/* Reset/Clear filter pill - only show when a project is selected */}
      {selectedProjectId && (
        <FilterPill
          selected={false}
          size={pillSize}
          onClick={() => onSelectProject(null)}
          className={viewMode === 'simple' ? "w-6 h-6 px-1.5 py-0 rounded-full" : "w-8 h-8 px-2 py-0 rounded-full"}
          title="Clear project filter"
        >
          <X className={viewMode === 'simple' ? "w-2.5 h-2.5" : "w-3 h-3"} />
        </FilterPill>
      )}
    </div>
  );
}