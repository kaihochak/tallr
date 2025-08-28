import { useState } from "react";
import { Info, Copy, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HooksTipProps {
  onDismiss: () => void;
}

const HOOKS_CONFIG = `"hooks": {
  "Notification": [{
    "matcher": "*",
    "hooks": [{
      "type": "command",
      "command": "curl -X POST 'http://127.0.0.1:4317/v1/tasks/state' -H 'Authorization: Bearer '\${TALLR_TOKEN} -H 'Content-Type: application/json' -d '{\\"taskId\\": \\"\${TALLR_TASK_ID}\\", \\"state\\": \\"PENDING\\", \\"details\\": \\"Claude notification received\\", \\"source\\": \\"hook\\"}' --silent --max-time 2 || true"
    }]
  }],
  "Stop": [{
    "matcher": "*", 
    "hooks": [{
      "type": "command",
      "command": "curl -X POST 'http://127.0.0.1:4317/v1/tasks/state' -H 'Authorization: Bearer '\${TALLR_TOKEN} -H 'Content-Type: application/json' -d '{\\"taskId\\": \\"\${TALLR_TASK_ID}\\", \\"state\\": \\"IDLE\\", \\"details\\": \\"Claude stopped processing\\", \\"source\\": \\"hook\\"}' --silent --max-time 2 || true"
    }]
  }]
}`;

export function HooksTip({ onDismiss }: HooksTipProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(HOOKS_CONFIG);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mb-4 p-4 bg-accent-secondary/10 border border-accent-secondary/20 rounded-lg animate-fadeIn">
      <div className="flex items-start gap-3">
        <Info size={20} className="text-accent-primary mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-text-primary">💡 Tip: Claude Code Hooks</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDismiss}
              className="h-6 w-6 text-text-secondary hover:text-text-primary"
            >
              <X size={14} />
            </Button>
          </div>
          <p className="text-sm text-text-secondary mb-3">
            For even better accuracy, set up Claude Code hooks in your projects.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs"
            >
              {showDetails ? 'Hide' : 'Show me how'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="text-xs"
            >
              Dismiss
            </Button>
          </div>
        </div>
      </div>
      
      {showDetails && (
        <div className="mt-4 pt-4 border-t border-border-secondary space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-secondary">
              Add this to <code className="text-text-primary bg-bg-tertiary px-1 rounded">.claude/settings.local.json</code> in your project:
            </p>
            <Button variant="outline" size="icon" onClick={handleCopy} title={copied ? 'Copied!' : 'Copy'}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </Button>
          </div>
          <div className="relative">
            <pre className="text-xs bg-bg-tertiary border border-border-secondary rounded p-3 text-text-primary whitespace-pre-wrap break-all">
              {HOOKS_CONFIG}
            </pre>
          </div>
          <p className="text-xs text-text-tertiary">
            Create the file if it doesn't exist. Restart Claude Code after making changes.
          </p>
        </div>
      )}
    </div>
  );
}