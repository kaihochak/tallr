import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Download, Terminal, Copy, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COPY_TIMEOUT, SYMLINK_COMMAND } from '@/lib/constants';

interface SetupWizardProps {
  onSetupComplete: () => void;
}

export function SetupWizard({ onSetupComplete }: SetupWizardProps) {
  const [installing, setInstalling] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [showManualInstructions, setShowManualInstructions] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    setSetupError(null);

    try {
      // First check permissions
      const hasPermission = await invoke<boolean>('check_cli_permissions');
      if (!hasPermission) {
        throw new Error('Permission denied. Please use the manual installation method with sudo.');
      }

      // Perform installation
      await invoke('install_cli_globally');
      // Installation complete - go straight to main app
      onSetupComplete();
    } catch (err: unknown) {
      console.error('Installation failed:', err);
      const errorMsg = (err instanceof Error ? err.message : String(err)).replace('Error: ', '');
      setSetupError(errorMsg);

      // If permission denied, automatically show manual instructions
      if (errorMsg.includes('Permission denied') || errorMsg.includes('sudo')) {
        setShowManualInstructions(true);
      }
    } finally {
      setInstalling(false);
    }
  }, [onSetupComplete]);

  const handleCopyCommand = useCallback(() => {
    navigator.clipboard.writeText(SYMLINK_COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_TIMEOUT);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-bg-primary to-bg-secondary animate-fadeIn">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-lg w-full space-y-6">
          <div className="text-center space-y-4">
            <h1 className="text-3xl font-bold text-text-primary">Install CLI Tools</h1>
            <p className="text-text-secondary">
              Get notified when your AI sessions need input.
            </p>
          </div>

          <Button
            onClick={handleInstall}
            disabled={installing}
            className="w-full h-12 text-base font-medium"
            size="lg"
          >
            {installing ? (
              <>
                <Download className="w-5 h-5 mr-2 animate-spin" /> Installing...
              </>
            ) : (
              <>
                <Download className="w-5 h-5 mr-2" /> Install CLI Tools
              </>
            )}
          </Button>

          {setupError && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="flex items-center gap-2 mb-2 text-destructive">
                <AlertCircle size={16} />
                <strong>Installation failed:</strong>
              </div>
              <p className="text-destructive text-sm mb-2">{setupError}</p>
              {showManualInstructions && (
                <p className="text-destructive text-sm">Please try the manual installation method below.</p>
              )}
            </div>
          )}

          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={() => setShowManualInstructions(!showManualInstructions)}
              className="text-sm"
            >
              {showManualInstructions ? 'Hide' : 'Manual installation'}
            </Button>
          </div>

          {/* Manual installation instructions */}
          {showManualInstructions && (
            <div className="space-y-4 p-4 bg-bg-secondary border border-border-primary rounded-lg">
              <div className="flex items-center gap-2">
                <Terminal size={18} className="text-text-primary" />
                <h4 className="font-semibold text-text-primary">Manual Installation</h4>
              </div>
              <p className="text-sm text-text-secondary">Run this command in Terminal:</p>
              <div className="relative">
                <code className="block p-3 bg-bg-tertiary border border-border-secondary rounded-lg text-sm font-mono text-text-primary pr-12 whitespace-pre-wrap">
                  sudo ln -s /Applications/Tallr.app/Contents/MacOS/tallr /usr/local/bin/tallr
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopyCommand}
                  className="absolute top-2 right-2 h-8 w-8 text-text-secondary hover:text-text-primary"
                  title="Copy to clipboard"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </Button>
              </div>
              <p className="text-xs text-text-tertiary">
                You'll be prompted for your password to create the symlink.
              </p>
              <div className="flex justify-center pt-2">
                <Button
                  onClick={onSetupComplete}
                  className="text-sm"
                >
                  Continue to App
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}