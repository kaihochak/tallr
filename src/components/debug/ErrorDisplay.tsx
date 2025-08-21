import { XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorDisplayProps {
  error: string;
  onRetry?: () => void | Promise<void>;
}

export function ErrorDisplay({ error, onRetry }: ErrorDisplayProps) {
  return (
    <div className="flex items-center justify-between p-6 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive mb-6">
      <div className="flex items-center gap-3">
        <XCircle size={20} />
        <span>{error}</span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRetry || (() => window.location.reload())}
        className="text-destructive hover:text-destructive/80"
        title="Retry connection"
      >
        Retry
      </Button>
    </div>
  );
}
