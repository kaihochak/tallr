import { getTaskStateClasses } from '@/lib/sessionHelpers';
import { cn } from '@/lib/utils';

interface StatusIndicatorProps {
  state: string;
  className?: string;
}

export default function StatusIndicator({ state, className }: StatusIndicatorProps) {
  const stateClasses = getTaskStateClasses(state);
  
  return (
    <div 
      className={cn(
        "absolute left-0 top-0 bottom-0 w-1 transition-all duration-200",
        stateClasses,
        className
      )} 
    />
  );
}