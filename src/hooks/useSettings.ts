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
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>({
    alwaysOnTop: true,
    visibleOnAllWorkspaces: true,
    windowPosition: undefined,
    preferredIde: "cursor",
    theme: "light",
    viewMode: "full"
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
        
        console.log('📁 Loaded settings from disk:', loadedSettings);
        
        // Ensure theme and viewMode properties exist with default values
        const settingsWithDefaults = {
          ...loadedSettings,
          theme: (loadedSettings.theme === 'light' || loadedSettings.theme === 'dark') 
            ? loadedSettings.theme 
            : 'light' as const,
          viewMode: (['full', 'simple', 'tally'].includes(loadedSettings.viewMode))
            ? loadedSettings.viewMode
            : 'full' as const
        };
        
        console.log('🔧 Settings with defaults applied:', settingsWithDefaults);
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
    
    console.log('💾 Saving settings:', {
      newSettings,
      updatedSettings
    });
    
    try {
      await invoke("save_settings", { settings: updatedSettings });
      setSettings(updatedSettings);
      console.log('✅ Settings saved successfully');
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
        full: { width: 480, height: 720 },
        simple: { width: 480, height: 540 },
        tally: { width: 320, height: 80 }
      };
      
      const nextModeSize = fixedSizes[nextMode];
      
      console.log(`🔄 Switching from ${currentMode} to ${nextMode}`, {
        nextSize: nextModeSize
      });
      
      // Update settings with new view mode
      await saveSettings({ 
        viewMode: nextMode
      });
      
      // Wait for React to finish layout updates before resizing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Resize window to the fixed size for the next mode
      const newSize = new LogicalSize(nextModeSize.width, nextModeSize.height);
      await window.setSize(newSize);
      console.log('Window resized successfully to:', nextModeSize);
      
    } catch (error) {
      console.error('Failed to resize window:', error);
      // Fallback: just update the view mode without resizing
      await saveSettings({ viewMode: nextMode });
    }
  }, [saveSettings]);

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
    saveSettings
  };
}