import React, { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './SetupWizard.css';

interface SetupWizardProps {
  onComplete: () => void;
  onSkip: () => void;
}

const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete, onSkip }) => {
  const [installComplete, setInstallComplete] = useState(false);
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
      setInstallComplete(true);
      setTimeout(() => onComplete(), 2000);
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

  if (installComplete) {
    return (
      <div className="setup-wizard-overlay">
        <div className="setup-wizard">
          <div className="wizard-success">
            <div className="success-icon">✅</div>
            <h2>CLI Tools Installed!</h2>
            <p>The <code>tally</code> command has been installed successfully.</p>
            
            <div className="usage-example">
              <h4>Try it out:</h4>
              <code>cd ~/your-project</code>
              <code>tally claude</code>
            </div>
            
            <button className="done-button" onClick={onComplete}>
              Start Using Tally
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-wizard-overlay">
      <div className="setup-wizard">
        <div className="wizard-header">
          <div className="wizard-icon">🚀</div>
          <h2>Welcome to Tally!</h2>
          <p>Track your AI coding sessions and get notified when they need input.</p>
        </div>

        <div className="install-main">
          <h3>Install CLI Tools</h3>
          <p className="install-description">
            Install the <code>tally</code> command to track AI sessions from any terminal.
          </p>
          
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
                <span className="install-icon">🚀</span> Install CLI Tools
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
          
          <div className="install-info">
            <p>This will create a symlink at <code>/usr/local/bin/tally</code></p>
          </div>
        </div>

        <div className="wizard-actions">
          <button 
            className="alternatives-button" 
            onClick={() => setShowManualInstructions(!showManualInstructions)}
          >
            {showManualInstructions ? 'Hide' : 'Manual installation'}
          </button>
          <button className="skip-button" onClick={onSkip}>
            Skip for now
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