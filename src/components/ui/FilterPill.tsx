import { ButtonHTMLAttributes } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FilterPillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  children: React.ReactNode;
  size?: 'sm' | 'md';
}

export function FilterPill({ 
  selected = false, 
  size = 'md',
  children, 
  className,
  ...props 
}: FilterPillProps) {
  const sizeClasses = {
    sm: "px-2.5 py-1 text-xs",
    md: "px-4 py-1.5 text-sm"
  };

  return (
    <Button
      variant="ghost"
      className={cn(
        "h-auto font-normal rounded-full transition-all duration-200 hover:scale-105 border",
        sizeClasses[size],
        selected
          ? "font-bold border-2"
          : "bg-bg-secondary text-text-primary border-transparent hover:bg-bg-hover",
        className
      )}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      {...props}
    >
      {children}
    </Button>
  );
}