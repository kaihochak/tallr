/**
 * Network Activity Indicator Component
 * 
 * Displays network context from @happy-coder's network interception approach
 * Shows active requests, thinking duration, and network activity status
 */

import { useMemo } from 'react';
import { Activity, Wifi, Clock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NetworkContext } from '@/types';

interface NetworkActivityIndicatorProps {
  networkContext: NetworkContext;
  state: string;
  className?: string;
  showDetails?: boolean;
}

export function NetworkActivityIndicator({
  networkContext,
  state,
  className,
  showDetails = true
}: NetworkActivityIndicatorProps) {
  const indicator = useMemo(() => {
    const { activeRequests, thinkingDuration, averageResponseTime } = networkContext;
    
    // Determine indicator type based on network activity
    if (activeRequests > 0) {
      return {
        icon: Activity,
        label: `${activeRequests} active`,
        color: 'text-blue-500',
        bgColor: 'bg-blue-50',
        pulse: true
      };
    }
    
    if (state === 'WORKING' && thinkingDuration && thinkingDuration > 0) {
      return {
        icon: Zap,
        label: `${Math.round(thinkingDuration / 1000)}s thinking`,
        color: 'text-orange-500',
        bgColor: 'bg-orange-50',
        pulse: true
      };
    }
    
    if (averageResponseTime > 0) {
      return {
        icon: Wifi,
        label: `${averageResponseTime}ms avg`,
        color: 'text-green-500',
        bgColor: 'bg-green-50',
        pulse: false
      };
    }
    
    return {
      icon: Clock,
      label: 'No activity',
      color: 'text-gray-400',
      bgColor: 'bg-gray-50',
      pulse: false
    };
  }, [networkContext, state]);

  const Icon = indicator.icon;

  if (!showDetails) {
    // Compact mode - just the pulsing icon
    return (
      <div
        className={cn(
          "flex items-center justify-center w-4 h-4 rounded-full",
          indicator.bgColor,
          indicator.pulse && "animate-pulse",
          className
        )}
        title={`Network: ${indicator.label}`}
      >
        <Icon size={10} className={indicator.color} />
      </div>
    );
  }

  // Full mode - icon with label
  return (
    <div
      className={cn(
        "flex items-center gap-1 px-2 py-1 rounded text-xs",
        indicator.bgColor,
        indicator.pulse && "animate-pulse",
        className
      )}
      title="Network activity from @happy-coder's detection"
    >
      <Icon size={12} className={indicator.color} />
      <span className={cn("font-mono", indicator.color)}>
        {indicator.label}
      </span>
    </div>
  );
}

/**
 * Confidence Score Badge
 * Shows the confidence level of the state detection
 */
interface ConfidenceScoreProps {
  confidence: number;
  detectionMethod?: string;
  className?: string;
}

export function ConfidenceScore({
  confidence,
  detectionMethod,
  className
}: ConfidenceScoreProps) {
  const confidenceData = useMemo(() => {
    const percentage = Math.round(confidence * 100);
    
    if (percentage >= 90) {
      return {
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        border: 'border-green-200',
        label: 'Very High'
      };
    }
    
    if (percentage >= 80) {
      return {
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        border: 'border-blue-200',
        label: 'High'
      };
    }
    
    if (percentage >= 70) {
      return {
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-50',
        border: 'border-yellow-200',
        label: 'Medium'
      };
    }
    
    return {
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      border: 'border-red-200',
      label: 'Low'
    };
  }, [confidence]);

  const percentage = Math.round(confidence * 100);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border",
        confidenceData.bgColor,
        confidenceData.border,
        className
      )}
      title={`Detection confidence: ${percentage}% (${detectionMethod || 'unknown'} method)`}
    >
      <div
        className={cn(
          "w-2 h-2 rounded-full",
          percentage >= 80 ? 'bg-current' : 'border-2 border-current'
        )}
      />
      <span className={cn("font-mono font-medium", confidenceData.color)}>
        {percentage}%
      </span>
    </div>
  );
}

/**
 * Session Context Indicator
 * Shows session-based information from .claude/*.jsonl files
 */
interface SessionContextIndicatorProps {
  sessionContext: {
    messageCount?: number;
    lastMessage?: {
      messageType: string;
      timestamp: string;
      preview: string;
    };
    waitingTime?: number;
  };
  className?: string;
}

export function SessionContextIndicator({
  sessionContext,
  className
}: SessionContextIndicatorProps) {
  const { messageCount, lastMessage, waitingTime } = sessionContext;

  if (!messageCount && !lastMessage) {
    return null;
  }

  const waitingSeconds = waitingTime ? Math.round(waitingTime / 1000) : 0;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1 rounded text-xs bg-purple-50 border border-purple-200",
        className
      )}
      title="Session context from .claude files"
    >
      {messageCount && (
        <span className="text-purple-600 font-mono">
          {messageCount} msgs
        </span>
      )}
      
      {waitingSeconds > 0 && (
        <span className="text-purple-500 font-mono">
          {waitingSeconds}s waiting
        </span>
      )}
      
      {lastMessage && (
        <div className="flex-1 truncate">
          <span className="text-purple-700 text-xs">
            {lastMessage.preview.substring(0, 30)}
            {lastMessage.preview.length > 30 ? '...' : ''}
          </span>
        </div>
      )}
    </div>
  );
}

export default NetworkActivityIndicator;