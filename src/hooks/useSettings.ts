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

interface ViewModeSize {
  width: number;
  height: number;
}

interface AppSettings {
  alwaysOnTop: boolean;
  visibleOnAllWorkspaces: boolean;
  windowPosition?: WindowPosition;
  preferredIde: string;
  theme: 'light' | 'dark';
  viewMode: 'full' | 'simple' | 'tally';
  viewModeSizes?: {
    full?: ViewModeSize;
    simple?: ViewModeSize;
    tally?: ViewModeSize;
  };
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>({
    alwaysOnTop: true,
    visibleOnAllWorkspaces: true,
    windowPosition: undefined,
    preferredIde: "cursor",
    theme: "light",
    viewMode: "full",
    viewModeSizes: {
      full: { width: 480, height: 650 },
      simple: { width: 480, height: 400 },
      tally: { width: 320, height: 80 }
    }
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
        
        // Ensure theme, viewMode, and viewModeSizes properties exist with default values
        const settingsWithDefaults = {
          ...loadedSettings,
          theme: (loadedSettings.theme === 'light' || loadedSettings.theme === 'dark') 
            ? loadedSettings.theme 
            : 'light' as const,
          viewMode: (['full', 'simple', 'tally'].includes(loadedSettings.viewMode))
            ? loadedSettings.viewMode
            : 'full' as const,
          viewModeSizes: {
            full: loadedSettings.viewModeSizes?.full || { width: 480, height: 650 },
            simple: loadedSettings.viewModeSizes?.simple || { width: 480, height: 400 },
            tally: loadedSettings.viewModeSizes?.tally || { width: 320, height: 80 }
          }
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
      updatedSettings,
      viewModeSizes: updatedSettings.viewModeSizes
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
      // Get current window size to save for the current mode
      const currentSize = await window.innerSize();
      console.log('Current window size:', currentSize);
      
      // Add reasonable size limits (more permissive)
      const constrainSize = (size: { width: number; height: number }) => ({
        width: Math.max(120, Math.min(size.width, 2000)),  // Between 120-2000px width
        height: Math.max(60, Math.min(size.height, 1200))   // Between 60-1200px height  
      });
      
      // Save current size for the current mode (with constraints)
      const constrainedCurrentSize = constrainSize(currentSize);
      const updatedViewModeSizes = {
        ...settings.viewModeSizes,
        [currentMode]: constrainedCurrentSize
      };
      
      // Get the preferred size for the next mode
      let nextModeSize = updatedViewModeSizes[nextMode];
      if (!nextModeSize) {
        // Use distinct defaults if no saved size exists
        const defaultSizes = {
          full: { width: 480, height: 650 },
          simple: { width: 480, height: 400 },
          tally: { width: 320, height: 80 }
        };
        nextModeSize = defaultSizes[nextMode];
        console.log(`📐 Using default size for ${nextMode}:`, nextModeSize);
      } else {
        console.log(`💾 Using saved size for ${nextMode}:`, nextModeSize);
      }
      
      // Ensure next mode size is also constrained
      nextModeSize = constrainSize(nextModeSize);
      
      console.log(`🔄 Switching from ${currentMode} to ${nextMode}`, {
        currentSize: { width: currentSize.width, height: currentSize.height },
        constrainedCurrentSize,
        nextSize: nextModeSize,
        currentViewModeSizes: settings.viewModeSizes,
        updatedViewModeSizes
      });
      
      // Update settings with new view mode and saved sizes
      await saveSettings({ 
        viewMode: nextMode,
        viewModeSizes: updatedViewModeSizes
      });
      
      // Resize window to the preferred size for the next mode
      const newSize = new LogicalSize(nextModeSize.width, nextModeSize.height);
      await window.setSize(newSize);
      console.log('Window resized successfully to:', nextModeSize);
      
    } catch (error) {
      console.error('Failed to resize window:', error);
      // Fallback: just update the view mode without resizing
      await saveSettings({ viewMode: nextMode });
    }
  }, [settings.viewMode, settings.viewModeSizes, saveSettings]);

  // Apply theme when settings change
  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme, applyTheme]);

  // Handle automatic window resizing when viewMode changes (disabled - toggleViewMode handles this)
  // useEffect(() => {
  //   const handleWindowResize = async () => {
  //     if (isLoading) return; // Don't resize during initial load
  //     
  //     const window = getCurrentWindow();
  //     
  //     try {
  //       const currentSize = await window.innerSize();
  //       const preferredSize = settings.viewModeSizes?.[settings.viewMode];
  //       
  //       if (preferredSize) {
  //         // Check if current size differs significantly from preferred size
  //         const widthDiff = Math.abs(currentSize.width - preferredSize.width);
  //         const heightDiff = Math.abs(currentSize.height - preferredSize.height);
  //         
  //         if (widthDiff > 10 || heightDiff > 10) {
  //           console.log('Auto-resizing to preferred size for', settings.viewMode, preferredSize);
  //           const newSize = new LogicalSize(preferredSize.width, preferredSize.height);
  //           await window.setSize(newSize);
  //         }
  //       }
  //     } catch (error) {
  //       console.error('Failed to auto-resize window:', error);
  //     }
  //   };

  //   handleWindowResize();
  // }, [settings.viewMode, settings.viewModeSizes, isLoading]);

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