import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";

interface WindowPosition {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface AppSettings {
  alwaysOnTop: boolean;
  visibleOnAllWorkspaces: boolean;
  windowPosition?: WindowPosition;
  preferredIde: string;
  theme: 'light' | 'dark';
  viewMode: 'full' | 'simple' | 'tally';
  notificationsEnabled: boolean;
  autoSortTasks: boolean;
  groupByProject: boolean;
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>({
    alwaysOnTop: true,
    visibleOnAllWorkspaces: true,
    windowPosition: undefined,
    preferredIde: "cursor",
    theme: "light",
    viewMode: "full",
    notificationsEnabled: true,
    autoSortTasks: true,
    groupByProject: true
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
        
        
        // Ensure theme and viewMode properties exist with default values
        const settingsWithDefaults = {
          ...loadedSettings,
          theme: (loadedSettings.theme === 'light' || loadedSettings.theme === 'dark') 
            ? loadedSettings.theme 
            : 'light' as const,
          viewMode: (['full', 'simple', 'tally'].includes(loadedSettings.viewMode))
            ? loadedSettings.viewMode
            : 'full' as const,
          notificationsEnabled: loadedSettings.notificationsEnabled !== undefined 
            ? loadedSettings.notificationsEnabled 
            : true,
          autoSortTasks: loadedSettings.autoSortTasks !== undefined
            ? loadedSettings.autoSortTasks
            : true,
          groupByProject: loadedSettings.groupByProject !== undefined
            ? loadedSettings.groupByProject
            : true
        };
        
        setSettings(settingsWithDefaults);
        
        // Apply theme immediately after loading
        applyTheme(settingsWithDefaults.theme);
        
        // Apply window settings
        const window = getCurrentWindow();
        await window.setAlwaysOnTop(settingsWithDefaults.alwaysOnTop);
        await window.setVisibleOnAllWorkspaces(settingsWithDefaults.visibleOnAllWorkspaces);
        
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
      console.error("❌ Failed to save settings:", error);
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

  // Toggle view mode (full -> simple -> tally -> full)
  const toggleViewMode = useCallback(async () => {
    const currentMode = settings.viewMode;
    const nextMode = currentMode === 'full' ? 'simple' : 
                     currentMode === 'simple' ? 'tally' : 'full';
    
    const window = getCurrentWindow();
    
    try {
      // Use fixed, predefined sizes for each mode
      const fixedSizes = {
        full: { width: 360, height: 600 },
        simple: { width: 360, height: 450 },
        tally: { width: 360, height: 80 }
      };
      
      const nextModeSize = fixedSizes[nextMode];
      
      
      // Update settings with new view mode
      await saveSettings({ 
        viewMode: nextMode
      });
      
      // Wait for React to finish layout updates before resizing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Resize window to the fixed size for the next mode
      const newSize = new LogicalSize(nextModeSize.width, nextModeSize.height);
      await window.setSize(newSize);
      
    } catch (error) {
      console.error('Failed to resize window:', error);
      // Fallback: just update the view mode without resizing
      await saveSettings({ viewMode: nextMode });
    }
  }, [saveSettings]);

  // Toggle notifications
  const toggleNotifications = useCallback(async () => {
    const newState = !settings.notificationsEnabled;
    await saveSettings({ notificationsEnabled: newState });
  }, [settings.notificationsEnabled, saveSettings]);

  // Toggle auto sort tasks
  const toggleAutoSortTasks = useCallback(async () => {
    const newState = !settings.autoSortTasks;
    await saveSettings({ autoSortTasks: newState });
  }, [settings.autoSortTasks, saveSettings]);

  // Toggle group by project
  const toggleGroupByProject = useCallback(async () => {
    const newState = !settings.groupByProject;
    await saveSettings({ groupByProject: newState });
  }, [settings.groupByProject, saveSettings]);

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
    toggleViewMode,
    toggleNotifications,
    toggleAutoSortTasks,
    toggleGroupByProject,
    saveSettings
  };
}