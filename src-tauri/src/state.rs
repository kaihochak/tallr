use std::{fs, sync::Arc};
use parking_lot::Mutex;
use once_cell::sync::Lazy;
use log::{error, warn, debug};
use crate::types::AppState;
use crate::utils::{current_timestamp, get_sessions_file_path};

// Global application state
pub static APP_STATE: Lazy<Arc<Mutex<AppState>>> = Lazy::new(|| Arc::new(Mutex::new(AppState::default())));

/// Save current app state to disk
pub fn save_app_state() -> Result<(), String> {
    let state = APP_STATE.lock().clone();
    let app_data_dir = crate::utils::get_app_data_dir()?;
    
    // Ensure directory exists
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data directory: {e}"))?;
    
    let sessions_file = app_data_dir.join("sessions.json");
    let state_json = serde_json::to_string_pretty(&state)
        .map_err(|e| format!("Failed to serialize app state: {e}"))?;
    
    fs::write(&sessions_file, state_json)
        .map_err(|e| format!("Failed to write sessions file: {e}"))?;
    
    Ok(())
}


/// Load app state from disk
pub fn load_app_state() -> Result<AppState, String> {
    let sessions_file = get_sessions_file_path()?;
    
    if !sessions_file.exists() {
        return Ok(AppState::default());
    }
    
    let state_content = fs::read_to_string(&sessions_file)
        .map_err(|e| format!("Failed to read sessions file: {e}"))?;
    
    if state_content.trim().is_empty() {
        return Ok(AppState::default());
    }
    
    let state: AppState = serde_json::from_str(&state_content)
        .map_err(|e| {
            // If JSON parsing fails, backup the corrupted file and start fresh
            let backup_path = sessions_file.with_extension("json.backup");
            let _ = fs::rename(&sessions_file, &backup_path);
            format!("Failed to parse sessions file (backed up as {backup_path:?}): {e}")
        })?;
    
    Ok(state)
}

/// Get aggregate state from current tasks
pub fn get_aggregate_state() -> &'static str {
    let state = APP_STATE.lock();
    let states: Vec<&str> = state.tasks.values()
        .filter(|t| t.state != "DONE")  // Filter out DONE tasks
        .map(|t| t.state.as_str())
        .collect();
    
    // Priority order: ERROR > PENDING > WORKING > IDLE
    if states.contains(&"ERROR") {
        "ERROR"
    } else if states.contains(&"PENDING") {
        "PENDING"
    } else if states.contains(&"WORKING") {
        "WORKING"
    } else {
        "IDLE"
    }
}

/// Initialize app state by loading from disk or starting fresh
pub fn initialize_app_state() -> Result<(), String> {
    match load_app_state() {
        Ok(loaded_state) => {
            // Clean up old DONE tasks before setting state
            let current_time = current_timestamp();
            let mut cleaned_state = loaded_state;
            let original_count = cleaned_state.tasks.len();
            
            // Remove DONE tasks older than 30 seconds
            cleaned_state.tasks.retain(|_, task| {
                if task.state == "DONE" {
                    let age_seconds = current_time - task.updated_at;
                    age_seconds <= 30
                } else {
                    true
                }
            });
            
            let cleaned_count = cleaned_state.tasks.len();
            let removed_count = original_count - cleaned_count;
            
            if removed_count > 0 {
                debug!("Cleaned up {removed_count} old DONE tasks on startup");
                cleaned_state.updated_at = current_time;
                
                // Save the cleaned state back to disk to persist the cleanup
                *APP_STATE.lock() = cleaned_state.clone();
                if let Err(e) = save_app_state() {
                    error!("Failed to save cleaned app state: {e}");
                }
            } else {
                *APP_STATE.lock() = cleaned_state;
            }
        }
        Err(e) => {
            warn!("Failed to load app state, starting with empty state: {e}");
            // APP_STATE is already initialized with default empty state
        }
    }
    Ok(())
}