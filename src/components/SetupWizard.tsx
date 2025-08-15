import React, { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './SetupWizard.css';

interface SetupWizardProps {
  onComplete: () => void;
}

const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
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
    const command = 'sudo ln -s /Applications/Tally.app/Contents/MacOS/tally /usr/local/bin/tally';
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <div className="setup-wizard-overlay">
      <div className="setup-wizard">
        <div className="install-main">
          <h2>Install CLI Tools</h2>
          <p>Get notified when your AI sessions need input.</p>
          
          <button 
            className="primary-install-button" 
            onClick={handleInstall}
            disabled={installing}
          >
            {installing ? (
              <>
                <span className="spinner">⏳</span> Installing...
              </>
            ) : (
              <>
                Install CLI Tools
              </>
            )}
          </button>
          
          {error && (
            <div className="install-error">
              <p><strong>Installation failed:</strong></p>
              <p className="error-message">{error}</p>
              {showManualInstructions && (
                <p>Please try the manual installation method below.</p>
              )}
            </div>
          )}
        </div>

        <div className="wizard-actions">
          <button 
            className="alternatives-button" 
            onClick={() => setShowManualInstructions(!showManualInstructions)}
          >
            {showManualInstructions ? 'Hide' : 'Manual installation'}
          </button>
        </div>

        {/* Manual installation instructions */}
        {showManualInstructions && (
          <div className="manual-panel">
            <h4>Manual Installation</h4>
            <p>Run this command in Terminal:</p>
            <div className="command-box">
              <code>sudo ln -s /Applications/Tally.app/Contents/MacOS/tally /usr/local/bin/tally</code>
              <button className="copy-button" onClick={handleCopyCommand}>
                {copied ? '✓' : '📋'}
              </button>
            </div>
            <p className="manual-note">
              You'll be prompted for your password to create the symlink.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SetupWizard;