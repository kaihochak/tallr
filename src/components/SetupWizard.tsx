import React, { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Download, Terminal, Copy, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface SetupWizardProps {
  isOpen: boolean;
  onComplete: () => void;
}

const SetupWizard: React.FC<SetupWizardProps> = ({ isOpen, onComplete }) => {
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManualInstructions, setShowManualInstructions] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    setError(null);
    
    try {
      // First check permissions
      const hasPermission = await invoke<boolean>('check_cli_permissions');
      if (!hasPermission) {
        throw new Error('Permission denied. Please use the manual installation method with sudo.');
      }
      
      // Perform installation
      await invoke('install_cli_globally');
      // Installation complete - go straight to main app
      onComplete();
    } catch (err: any) {
      console.error('Installation failed:', err);
      const errorMsg = err.toString().replace('Error: ', '');
      setError(errorMsg);
      
      // If permission denied, automatically show manual instructions
      if (errorMsg.includes('Permission denied') || errorMsg.includes('sudo')) {
        setShowManualInstructions(true);
      }
    } finally {
      setInstalling(false);
    }
  }, [onComplete]);

  const handleCopyCommand = useCallback(() => {
    const command = 'sudo ln -s /Applications/Tallor.app/Contents/MacOS/tallor /usr/local/bin/tallor';
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-center">
            Install CLI Tools
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <p className="text-center text-text-secondary">
            Get notified when your AI sessions need input.
          </p>
          
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
          
          {error && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="flex items-center gap-2 mb-2 text-destructive">
                <AlertCircle size={16} />
                <strong>Installation failed:</strong>
              </div>
              <p className="text-destructive text-sm mb-2">{error}</p>
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
                  sudo ln -s /Applications/Tallor.app/Contents/MacOS/tallor /usr/local/bin/tallor
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
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SetupWizard;