import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConnectionHealth } from '@/hooks/useConnectionHealth';
import { cn } from '@/lib/utils';

interface ConnectionStatusProps {
  health: ConnectionHealth;
  onRetry: () => void;
  className?: string;
}

export function ConnectionStatus({ health, onRetry, className }: ConnectionStatusProps) {
  const getIcon = () => {
    switch (health.status) {
      case 'connected':
        return <Wifi className="w-4 h-4" />;
      case 'disconnected':
        return <WifiOff className="w-4 h-4" />;
      case 'checking':
        return <Loader2 className="w-4 h-4 animate-spin" />;
    }
  };

  const getColor = () => {
    switch (health.status) {
      case 'connected':
        return 'text-green-500';
      case 'disconnected':
        return 'text-red-500';
      case 'checking':
        return 'text-yellow-500';
    }
  };

  const getTitle = () => {
    switch (health.status) {
      case 'connected':
        return `Connected${health.lastConnected ? ` - Last: ${health.lastConnected.toLocaleTimeString()}` : ''}`;
      case 'disconnected':
        return `Disconnected${health.error ? ` - ${health.error}` : ''}${health.lastConnected ? ` - Last connected: ${health.lastConnected.toLocaleTimeString()}` : ''}`;
      case 'checking':
        return 'Checking connection...';
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "w-7 h-7 cursor-pointer transition-all duration-200 hover:scale-105",
        getColor(),
        className
      )}
      onClick={onRetry}
      title={getTitle()}
      aria-label={`Connection status: ${health.status}. Click to retry.`}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {getIcon()}
    </Button>
  );
}