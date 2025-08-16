import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface WindowPosition {
  x: number;
  y: number;
}

interface AppSettings {
  alwaysOnTop: boolean;
  visibleOnAllWorkspaces: boolean;
  windowPosition?: WindowPosition;
  preferredIde: string;
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>({
    alwaysOnTop: true,
    visibleOnAllWorkspaces: true,
    windowPosition: undefined,
    preferredIde: "cursor"
  });
  
  const [isLoading, setIsLoading] = useState(true);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const loadedSettings = await invoke<AppSettings>("load_settings");
        setSettings(loadedSettings);
        
        // Apply window settings
        const window = getCurrentWindow();
        await window.setAlwaysOnTop(loadedSettings.alwaysOnTop);
        await window.setVisibleOnAllWorkspaces(loadedSettings.visibleOnAllWorkspaces);
        
      } catch (error) {
        console.error("Failed to load settings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  // Save settings to file
  const saveSettings = useCallback(async (newSettings: Partial<AppSettings>) => {
    const updatedSettings = { ...settings, ...newSettings };
    
    try {
      await invoke("save_settings", { settings: updatedSettings });
      setSettings(updatedSettings);
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  }, [settings]);

  // Toggle always on top with workspace visibility
  const toggleAlwaysOnTop = useCallback(async () => {
    const newState = !settings.alwaysOnTop;
    
    try {
      const window = getCurrentWindow();
      await window.setAlwaysOnTop(newState);
      await window.setVisibleOnAllWorkspaces(newState);
      
      await saveSettings({
        alwaysOnTop: newState,
        visibleOnAllWorkspaces: newState
      });
    } catch (error) {
      console.error("Failed to toggle always-on-top:", error);
    }
  }, [settings.alwaysOnTop, saveSettings]);

  // Save window position
  const saveWindowPosition = useCallback(async (position: WindowPosition) => {
    await saveSettings({ windowPosition: position });
  }, [saveSettings]);

  // Update preferred IDE
  const setPreferredIde = useCallback(async (ide: string) => {
    await saveSettings({ preferredIde: ide });
  }, [saveSettings]);

  return {
    settings,
    isLoading,
    toggleAlwaysOnTop,
    saveWindowPosition,
    setPreferredIde,
    saveSettings
  };
}