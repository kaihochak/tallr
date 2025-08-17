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
  theme: 'light' | 'dark';
  simpleMode: boolean;
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>({
    alwaysOnTop: true,
    visibleOnAllWorkspaces: true,
    windowPosition: undefined,
    preferredIde: "cursor",
    theme: "light",
    simpleMode: false
  });
  
  const [isLoading, setIsLoading] = useState(true);

  // Apply theme to document
  const applyTheme = useCallback((theme: 'light' | 'dark') => {
    const html = document.documentElement;
    
    // Always apply manual theme class
    html.classList.remove('light', 'dark');
    html.classList.add(theme);
  }, []);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const loadedSettings = await invoke<AppSettings>("load_settings");
        
        // Ensure theme property exists with default value
        const settingsWithTheme = {
          ...loadedSettings,
          theme: (loadedSettings.theme === 'light' || loadedSettings.theme === 'dark') 
            ? loadedSettings.theme 
            : 'light' as const
        };
        
        setSettings(settingsWithTheme);
        
        // Apply theme immediately after loading
        applyTheme(settingsWithTheme.theme);
        
        // Apply window settings
        const window = getCurrentWindow();
        await window.setAlwaysOnTop(settingsWithTheme.alwaysOnTop);
        await window.setVisibleOnAllWorkspaces(settingsWithTheme.visibleOnAllWorkspaces);
        
      } catch (error) {
        console.error("Failed to load settings:", error);
        // Apply default theme even if loading fails
        applyTheme('light');
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [applyTheme]);

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

  // Toggle theme
  const toggleTheme = useCallback(async () => {
    const nextTheme = settings.theme === 'light' ? 'dark' : 'light';
    
    applyTheme(nextTheme);
    await saveSettings({ theme: nextTheme });
  }, [settings.theme, applyTheme, saveSettings]);

  // Toggle simple mode
  const toggleSimpleMode = useCallback(async () => {
    const newState = !settings.simpleMode;
    await saveSettings({ simpleMode: newState });
  }, [settings.simpleMode, saveSettings]);

  // Apply theme when settings change
  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme, applyTheme]);

  return {
    settings,
    isLoading,
    toggleAlwaysOnTop,
    saveWindowPosition,
    setPreferredIde,
    toggleTheme,
    toggleSimpleMode,
    saveSettings
  };
}