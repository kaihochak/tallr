use tauri::{WebviewWindow, Emitter};

#[cfg(target_os = "macos")]
pub fn setup_unified_toolbar(window: &WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    // The unified toolbar on macOS with titleBarStyle: "Overlay" means
    // we need to handle the window controls from the web view side
    // The native title bar is transparent and overlays the content
    
    // Emit an event to let the frontend know to add padding for the title bar
    window.emit("unified-toolbar-ready", true)?;
    
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn setup_unified_toolbar(_window: &WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    // Non-macOS platforms don't support unified toolbar
    Ok(())
}

// Commands to handle toolbar actions from the frontend
#[tauri::command]
pub fn toolbar_action(window: WebviewWindow, action: String) -> Result<(), String> {
    match action.as_str() {
        "toggle-pin" => {
            let is_pinned = window.is_always_on_top().map_err(|e| e.to_string())?;
            window.set_always_on_top(!is_pinned).map_err(|e| e.to_string())?;
        }
        "toggle-maximize" => {
            // Handle maximize toggle through backend for macOS overlay titlebar
            let is_maximized = window.is_maximized().map_err(|e| e.to_string())?;
            if is_maximized {
                window.unmaximize().map_err(|e| e.to_string())?;
            } else {
                window.maximize().map_err(|e| e.to_string())?;
            }
        }
        _ => {
            // Other actions are handled by the frontend
        }
    }
    Ok(())
}