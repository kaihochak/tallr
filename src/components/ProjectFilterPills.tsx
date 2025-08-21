import { useMemo } from 'react';
import { X } from 'lucide-react';
import type { Project, Task } from '@/types';
import { FilterPill } from '@/components/ui/FilterPill';

interface ProjectFilterPillsProps {
  projects: Record<string, Project>;
  tasks: Record<string, Task>;
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  showDoneTasks?: boolean;
}

export function ProjectFilterPills({
  projects,
  tasks,
  selectedProjectId,
  onSelectProject,
  showDoneTasks = false
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

  // Don't show filter if only one project has tasks
  if (projectsWithTasks.length <= 1) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 mb-3">
      {/* Individual project pills */}
      {projectsWithTasks.map(project => {
        const taskCount = projectTaskCounts[project.id] || 0;
        const isSelected = selectedProjectId === project.id;
        
        return (
          <FilterPill
            key={project.id}
            selected={isSelected}
            onClick={() => onSelectProject(isSelected ? null : project.id)}
          >
            {project.name} ({taskCount})
          </FilterPill>
        );
      })}

      {/* Reset/Clear filter pill - only show when a project is selected */}
      {selectedProjectId && (
        <FilterPill
          selected={false}
          onClick={() => onSelectProject(null)}
          className="w-8 h-8 px-2 py-0 rounded-full"
          title="Clear project filter"
        >
          <X className="w-3 h-3" />
        </FilterPill>
      )}
    </div>
  );
}