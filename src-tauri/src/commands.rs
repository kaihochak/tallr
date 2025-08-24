use std::{fs, path::Path};
use log::{debug, info, warn, error};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::ShellExt;
use crate::types::*;
use crate::state::{APP_STATE, save_app_state};
use crate::utils::*;
use crate::auth::get_or_create_auth_token;

/// Helper function to get IDE command with proper arguments
fn get_ide_command_and_args(ide_cmd: &str, project_path: &str) -> (String, Vec<String>) {
    match ide_cmd {
        "code" => ("code".to_string(), vec![project_path.to_string()]),
        "cursor" => ("cursor".to_string(), vec![project_path.to_string()]),
        "zed" => ("zed".to_string(), vec![project_path.to_string()]),
        "webstorm" => ("webstorm".to_string(), vec![project_path.to_string()]),
        "idea" => ("idea".to_string(), vec![project_path.to_string()]),
        "pycharm" => ("pycharm".to_string(), vec![project_path.to_string()]),
        "phpstorm" => ("phpstorm".to_string(), vec![project_path.to_string()]),
        "rubymine" => ("rubymine".to_string(), vec![project_path.to_string()]),
        "clion" => ("clion".to_string(), vec![project_path.to_string()]),
        "goland" => ("goland".to_string(), vec![project_path.to_string()]),
        "rider" => ("rider".to_string(), vec![project_path.to_string()]),
        "windsurf" => ("windsurf".to_string(), vec![project_path.to_string()]),
        _ => {
            // For unknown IDEs, try the command as-is
            (ide_cmd.to_string(), vec![project_path.to_string()])
        }
    }
}

/// Tauri command for opening IDE and terminal
#[tauri::command]
pub async fn open_ide_and_terminal(
    app: AppHandle,
    project_path: String,
    ide: Option<String>,
) -> Result<(), String> {
    info!("open_ide_and_terminal called with project_path: {project_path:?}, ide: {ide:?}");
    
    match ide {
        Some(ide_cmd) if !ide_cmd.is_empty() => {
            let (command, args) = get_ide_command_and_args(&ide_cmd, &project_path);
            info!("Trying to open with IDE command: {command} {args:?}");
            
            // Try to open with the IDE command with proper PATH
            let result = app.shell()
                .command(&command)
                .args(&args)
                .env("PATH", "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/Applications/Visual Studio Code.app/Contents/Resources/app/bin:/Applications/Cursor.app/Contents/Resources/app/bin")
                .spawn();
                
            match result {
                Ok(_) => {
                    info!("Successfully opened IDE with command: {command}");
                    Ok(())
                }
                Err(e) => {
                    warn!("IDE command '{command}' failed: {e}. Trying fallback.");
                    
                    // Try with 'open -a' on macOS
                    let open_result = app.shell()
                        .command("open")
                        .args(["-a", &command, &project_path])
                        .env("PATH", "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin")
                        .spawn();
                        
                    match open_result {
                        Ok(_) => {
                            info!("Successfully opened IDE with 'open -a' fallback");
                            Ok(())
                        }
                        Err(e2) => {
                            warn!("'open -a' fallback failed: {e2}. Trying directory fallback.");
                            
                            // Last resort: just open the directory
                            app.shell()
                                .command("open")
                                .args([&project_path])
                                .env("PATH", "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin")
                                .spawn()
                                .map_err(|e3| {
                                    let error_msg = format!(
                                        "All methods failed to open project:\n\
                                        1. IDE command '{command}': {e}\n\
                                        2. 'open -a' fallback: {e2}\n\
                                        3. Directory fallback: {e3}"
                                    );
                                    error!("{error_msg}");
                                    error_msg
                                })?;
                            info!("Opened project directory as fallback");
                            Ok(())
                        }
                    }
                }
            }
        }
        _ => {
            info!("No IDE specified, opening project directory with system default");
            // No IDE specified - just try to open with system default
            app.shell()
                .command("open")
                .args([&project_path])
                .env("PATH", "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin")
                .spawn()
                .map_err(|e| {
                    let error_msg = format!("Failed to open project directory: {e}");
                    error!("{error_msg}");
                    error_msg
                })?;
            info!("Successfully opened project directory");
            Ok(())
        }
    }
}

#[tauri::command]
pub async fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    
    // Ensure directory exists
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data dir: {e}"))?;
    
    let settings_file = app_data_dir.join("settings.json");
    let settings_json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {e}"))?;
    
    fs::write(&settings_file, settings_json)
        .map_err(|e| format!("Failed to write settings file: {e}"))?;
    
    Ok(())
}

#[tauri::command]
pub async fn load_settings(app: AppHandle) -> Result<AppSettings, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    
    let settings_file = app_data_dir.join("settings.json");
    
    if !settings_file.exists() {
        return Ok(AppSettings::default());
    }
    
    let settings_content = fs::read_to_string(&settings_file)
        .map_err(|e| format!("Failed to read settings file: {e}"))?;
    
    let settings: AppSettings = serde_json::from_str(&settings_content)
        .map_err(|e| format!("Failed to parse settings: {e}"))?;
    
    Ok(settings)
}

#[tauri::command]
pub async fn check_cli_permissions() -> Result<bool, String> {
    let bin_dir = Path::new("/usr/local/bin");
    
    // Check if directory exists and is writable
    if !bin_dir.exists() {
        return Ok(false);
    }
    
    // Try to check write permissions
    let test_file = bin_dir.join(".tallr_test_write");
    match fs::write(&test_file, "test") {
        Ok(_) => {
            // Clean up test file
            let _ = fs::remove_file(&test_file);
            Ok(true)
        },
        Err(_) => Ok(false)
    }
}

#[tauri::command]
pub async fn install_cli_globally(app: AppHandle) -> Result<(), String> {
    // Get the path to the CLI binary
    let cli_source = if cfg!(debug_assertions) {
        // In development, use the tools directory relative to the project root
        let project_dir = std::env::current_dir()
            .map_err(|e| format!("Failed to get current dir: {e}"))?
            .parent()
            .ok_or("Failed to get parent directory")?
            .to_path_buf();
        let dev_path = project_dir.join("tools").join("tallr");
        debug!("Development CLI path: {dev_path:?}");
        dev_path
    } else {
        // In production, the binary is in the MacOS directory, not Resources
        let resource_path = app.path().resource_dir()
            .map_err(|e| format!("Failed to get resource path: {e}"))?;
        
        debug!("Resource directory: {resource_path:?}");
        
        // The correct path for production builds: Contents/MacOS/tallr
        let macos_path = resource_path
            .parent()  // Contents
            .ok_or("Failed to get Contents directory")?
            .join("MacOS")
            .join("tallr");
        
        debug!("Checking MacOS directory path: {:?} (exists: {})", macos_path, macos_path.exists());
        
        if macos_path.exists() {
            debug!("Found CLI binary in MacOS directory");
            macos_path
        } else {
            // Fallback: try resource-based paths for alternative build configurations
            let possible_paths = vec![
                resource_path.join("_up_").join("tools").join("tallr"), // Legacy location
                resource_path.join("tools").join("tallr"),              // Alternative location
                resource_path.join("tallr"),                            // Root of resources
            ];
            
            debug!("MacOS path not found, trying fallback paths:");
            for path in &possible_paths {
                debug!("  - {:?} (exists: {})", path, path.exists());
            }
            
            // Find the first fallback path that exists
            possible_paths.into_iter()
                .find(|path| path.exists())
                .unwrap_or_else(|| {
                    // If none found, return the MacOS path for better error messages
                    warn!("CLI binary not found in any expected location");
                    macos_path
                })
        }
    };
    
    // Check if CLI binary exists
    if !cli_source.exists() {
        let build_type = if cfg!(debug_assertions) { "development" } else { "production" };
        return Err(format!(
            "CLI binary not found at: {cli_source:?}\n\
            Build type: {build_type}\n\
            This indicates a packaging issue. The CLI binary should be bundled with the application.\n\
            Please report this issue with your build configuration."
        ));
    }
    
    info!("Found CLI binary at: {cli_source:?}");
    
    // Ensure the CLI binary is executable (important for production builds)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = cli_source.metadata()
            .map_err(|e| format!("Failed to get CLI file metadata: {e}"))?
            .permissions();
        perms.set_mode(0o755); // rwxr-xr-x
        std::fs::set_permissions(&cli_source, perms)
            .map_err(|e| format!("Failed to set CLI executable permissions: {e}"))?;
        info!("Set executable permissions for CLI at: {cli_source:?}");
    }
    
    // Ensure /usr/local/bin directory exists
    let bin_dir = Path::new("/usr/local/bin");
    if !bin_dir.exists() {
        // Try to create it
        if let Err(e) = fs::create_dir_all(bin_dir) {
            return Err(format!("Cannot create /usr/local/bin: {e}. Please run: sudo mkdir -p /usr/local/bin"));
        }
    }
    
    // Check write permissions
    let test_file = bin_dir.join(".tallr_test_write");
    if fs::write(&test_file, "test").is_err() {
        return Err("Permission denied. Please use the manual installation method with sudo.".to_string());
    }
    let _ = fs::remove_file(&test_file);
    
    // Create symlink at /usr/local/bin/tallr
    let cli_dest = bin_dir.join("tallr");
    
    // Remove existing symlink if it exists
    if cli_dest.exists() {
        if let Err(e) = fs::remove_file(&cli_dest) {
            return Err(format!("Cannot remove existing CLI: {e}. Please run: sudo rm /usr/local/bin/tallr"));
        }
    }
    
    // Create symlink
    #[cfg(unix)]
    {
        if let Err(e) = std::os::unix::fs::symlink(&cli_source, &cli_dest) {
            return Err(format!("Failed to create symlink: {e}. Please run: sudo ln -s {cli_source:?} /usr/local/bin/tallr"));
        }
    }
    
    info!("Successfully installed CLI at: {cli_dest:?}");
    Ok(())
}

#[tauri::command] 
pub async fn get_setup_status_cmd() -> SetupStatus {
    let cli_installed = is_cli_installed();
    let setup_completed = get_setup_completion_flag();
    let is_first_launch = !setup_completed;

    SetupStatus {
        is_first_launch,
        cli_installed,
        setup_completed,
    }
}

#[tauri::command]
pub async fn mark_setup_completed_cmd() -> Result<(), String> {
    mark_setup_completed()
}

#[tauri::command]
pub async fn get_tasks() -> AppState {
    APP_STATE.lock().clone()
}

#[tauri::command]
pub async fn send_notification(app: AppHandle, title: String, body: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    
    let notification = app.notification()
        .builder()
        .title(title)
        .body(body);
    
    if let Err(e) = notification.show() {
        error!("Failed to show notification: {e}");
        return Err(format!("Failed to show notification: {e}"));
    }
    
    Ok(())
}

#[tauri::command]
pub async fn get_auth_token() -> Result<String, String> {
    get_or_create_auth_token()
}

#[tauri::command]
pub async fn get_cli_connectivity() -> serde_json::Value {
    info!("Frontend requesting CLI connectivity status");
    
    let state = APP_STATE.lock();
    let last_ping = state.last_cli_ping;
    let current_time = current_timestamp();
    
    let is_connected = if let Some(last_ping) = last_ping {
        let seconds_since_ping = current_time - last_ping;
        let is_recent = seconds_since_ping <= 30; // 30 second threshold
        
        info!("CLI connectivity check: last_ping={last_ping}, seconds_since={seconds_since_ping}, is_connected={is_recent}");
        
        is_recent
    } else {
        info!("CLI connectivity check: no ping recorded, is_connected=false");
        false
    };
    
    serde_json::json!({
        "connected": is_connected,
        "last_ping": last_ping,
        "current_time": current_time
    })
}

#[tauri::command]
pub async fn write_frontend_log(level: String, message: String, context: Option<String>) -> Result<(), String> {
    match level.to_lowercase().as_str() {
        "info" => info!("[FRONTEND] {}: {}", message, context.unwrap_or_default()),
        "warn" => warn!("[FRONTEND] {}: {}", message, context.unwrap_or_default()),
        "error" => error!("[FRONTEND] {}: {}", message, context.unwrap_or_default()),
        "debug" => debug!("[FRONTEND] {}: {}", message, context.unwrap_or_default()),
        _ => info!("[FRONTEND] {}: {}", message, context.unwrap_or_default()),
    }
    Ok(())
}

#[tauri::command]
pub async fn frontend_update_task_state(
    app_handle: AppHandle,
    task_id: String,
    state: String,
    details: Option<String>
) -> Result<(), String> {
    let mut app_state = APP_STATE.lock();
    
    if let Some(task) = app_state.tasks.get_mut(&task_id) {
        task.state = state;
        task.details = details;
        task.updated_at = current_timestamp();
        app_state.updated_at = current_timestamp();

        // Emit event to frontend for real-time updates
        let _ = app_handle.emit("tasks-updated", &app_state.clone());
        
        // Save to disk
        drop(app_state); // Release the lock before calling save_app_state
        if let Err(e) = save_app_state() {
            error!("Failed to save app state: {e}");
            return Err(format!("Failed to save app state: {e}"));
        }
        
        Ok(())
    } else {
        Err("Task not found".to_string())
    }
}

#[tauri::command]
pub async fn frontend_mark_task_done(
    app_handle: AppHandle,
    task_id: String,
    details: Option<String>
) -> Result<(), String> {
    let mut app_state = APP_STATE.lock();
    
    if let Some(task) = app_state.tasks.get_mut(&task_id) {
        task.state = "DONE".to_string();
        task.details = details;
        task.updated_at = current_timestamp();
        app_state.updated_at = current_timestamp();

        // Emit event to frontend for real-time updates
        let _ = app_handle.emit("tasks-updated", &app_state.clone());
        
        // Update tray menu
        drop(app_state); // Release the lock before calling update_tray_menu
        crate::tray::update_tray_menu(&app_handle);

        // Save to disk
        if let Err(e) = save_app_state() {
            error!("Failed to save app state: {e}");
            return Err(format!("Failed to save app state: {e}"));
        }
        
        Ok(())
    } else {
        Err("Task not found".to_string())
    }
}

#[tauri::command]
pub async fn frontend_delete_task(
    app_handle: AppHandle,
    task_id: String
) -> Result<(), String> {
    let mut app_state = APP_STATE.lock();
    
    if app_state.tasks.remove(&task_id).is_some() {
        app_state.updated_at = current_timestamp();

        // Emit event to frontend for real-time updates
        let _ = app_handle.emit("tasks-updated", &app_state.clone());
        
        // Update tray menu
        drop(app_state); // Release the lock before calling update_tray_menu
        crate::tray::update_tray_menu(&app_handle);

        // Save to disk
        if let Err(e) = save_app_state() {
            error!("Failed to save app state: {e}");
            return Err(format!("Failed to save app state: {e}"));
        }
        
        Ok(())
    } else {
        Err("Task not found".to_string())
    }
}

#[tauri::command]
pub async fn frontend_toggle_task_pin(
    app_handle: AppHandle,
    task_id: String,
    pinned: bool
) -> Result<(), String> {
    let mut app_state = APP_STATE.lock();
    
    if let Some(task) = app_state.tasks.get_mut(&task_id) {
        task.pinned = pinned;
        task.updated_at = current_timestamp();
        app_state.updated_at = current_timestamp();

        // Emit event to frontend for real-time updates
        let _ = app_handle.emit("tasks-updated", &app_state.clone());
        
        // Save to disk
        drop(app_state); // Release the lock before calling save_app_state
        if let Err(e) = save_app_state() {
            error!("Failed to save app state: {e}");
            return Err(format!("Failed to save app state: {e}"));
        }
        
        Ok(())
    } else {
        Err("Task not found".to_string())
    }
}

#[tauri::command]
pub async fn frontend_get_debug_data(task_id: Option<String>) -> Result<serde_json::Value, String> {
    let app_state = APP_STATE.lock();
    
    if let Some(task_id) = task_id {
        // Get debug data for specific task
        match app_state.debug_data.get(&task_id) {
            Some(debug_data) => Ok(serde_json::to_value(debug_data)
                .map_err(|e| format!("Failed to serialize debug data: {e}"))?),
            None => Ok(serde_json::json!(null))
        }
    } else {
        // Get all debug data
        Ok(serde_json::to_value(&app_state.debug_data)
            .map_err(|e| format!("Failed to serialize debug data: {e}"))?)
    }
}

/// Get recent backend logs for debugging
#[tauri::command]
pub async fn get_recent_logs(_limit: Option<usize>) -> Result<Vec<String>, String> {
    // For now, return a simple status about the enhanced logging we implemented
    Ok(vec![
        "[INFO] Enhanced window jumping diagnostics active".to_string(),
        format!("[INFO] Current time: {:?}", std::time::SystemTime::now()),
        "[INFO] Features implemented:".to_string(),
        "  • User-visible error notifications".to_string(),
        "  • Automatic retry logic (3 attempts)".to_string(),
        "  • Backend timing logs".to_string(),
        "  • CLI binary validation".to_string(),
        "[INFO] Check browser console for detailed logs".to_string(),
    ])
}