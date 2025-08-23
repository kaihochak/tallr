import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Wifi, WifiOff } from 'lucide-react';

interface CliConnectionData {
  connected: boolean;
  lastPing: number | null;
  currentTime: number;
}

export function CliConnectionStatus() {
  const [connectionData, setConnectionData] = useState<CliConnectionData | null>(null);

  const checkConnection = async () => {
    try {
      const data = await invoke<CliConnectionData>('get_cli_connectivity');
      setConnectionData(data);
    } catch (error) {
      console.error('[FRONTEND] Failed to check CLI connectivity:', error);
      setConnectionData({ connected: false, lastPing: null, currentTime: Date.now() / 1000 });
    }
  };

  useEffect(() => {
    // Initial check
    checkConnection();

    // Check every 5 seconds
    const interval = setInterval(checkConnection, 5000);

    return () => clearInterval(interval);
  }, []);

  if (!connectionData) {
    return null;
  }

  const getTitle = () => {
    if (connectionData.connected && connectionData.lastPing) {
      const lastPingTime = new Date(connectionData.lastPing * 1000);
      return `CLI Connected - Last ping: ${lastPingTime.toLocaleTimeString()}`;
    }
    return 'CLI Disconnected - No recent activity';
  };

  return (
    <div 
      className={`flex items-center gap-1 ${connectionData.connected ? 'text-green-400' : 'text-red-400'} opacity-75`}
      title={getTitle()}
    >
      {connectionData.connected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
      <span className="text-xs">CLI</span>
    </div>
  );
}