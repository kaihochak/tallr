import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const CopyButton = ({
  onClick,
  copyKey,
  copiedStates,
  className = "",
  size = 16,
}: {
  onClick: () => void;
  copyKey: string;
  copiedStates: Record<string, boolean>;
  className?: string;
  size?: number;
}) => (
  <Button
    variant="ghost"
    size="sm"
    onClick={onClick}
    className={cn("h-8 w-8 text-text-secondary hover:text-text-primary", className)}
    title="Copy to clipboard"
  >
    {copiedStates[copyKey] ? <Check size={size} /> : <Copy size={size} />}
  </Button>
);
