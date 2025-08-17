import { cn } from '@/lib/utils';

interface TaskStateBadgeProps {
  state: string;
  className?: string;
}

export default function TaskStateBadge({ state, className }: TaskStateBadgeProps) {
  return (
    <span className={cn(`task-state-badge ${state.toLowerCase()}`, className)}>
      {state}
    </span>
  );
}