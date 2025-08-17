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
  theme: 'light' | 'dark' | 'system';
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>({
    alwaysOnTop: true,
    visibleOnAllWorkspaces: true,
    windowPosition: undefined,
    preferredIde: "cursor",
    theme: "system"
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

  // Apply theme to document
  const applyTheme = useCallback((theme: 'light' | 'dark' | 'system') => {
    const html = document.documentElement;
    
    if (theme === 'system') {
      // Remove manual theme classes and let CSS media query handle it
      html.classList.remove('light', 'dark');
    } else {
      // Apply manual theme
      html.classList.remove('light', 'dark');
      html.classList.add(theme);
    }
  }, []);

  // Toggle theme
  const toggleTheme = useCallback(async () => {
    const themes: Array<'system' | 'light' | 'dark'> = ['system', 'light', 'dark'];
    const currentIndex = themes.indexOf(settings.theme);
    const nextTheme = themes[(currentIndex + 1) % themes.length];
    
    applyTheme(nextTheme);
    await saveSettings({ theme: nextTheme });
  }, [settings.theme, applyTheme, saveSettings]);

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
    saveSettings
  };
}