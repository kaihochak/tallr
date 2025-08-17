use axum::{
    extract::State as AxumState,
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Arc, time::SystemTime, path::Path, fs};
use image::GenericImageView;
use tauri::{AppHandle, Emitter, Manager, menu::{MenuBuilder, MenuItemBuilder}, tray::TrayIconBuilder};
use tauri_plugin_shell::ShellExt;
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;

// Global application state
static APP_STATE: Lazy<Arc<Mutex<AppState>>> = Lazy::new(|| Arc::new(Mutex::new(AppState::default())));

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectIn {
    name: String,
    repo_path: String,
    preferred_ide: Option<String>,
    github_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaskIn {
    id: String,
    agent: String,
    title: String,
    state: String,
    details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct AppState {
    projects: HashMap<String, Project>,
    tasks: HashMap<String, Task>,
    debug_data: HashMap<String, DebugData>,
    updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Project {
    id: String,
    name: String,
    repo_path: String,
    preferred_ide: String,
    github_url: Option<String>,
    created_at: i64,
    updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Task {
    id: String,
    project_id: String,
    agent: String,
    title: String,
    state: String,
    details: Option<String>,
    created_at: i64,
    updated_at: i64,
    pinned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpsertRequest {
    project: ProjectIn,
    task: TaskIn,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StateUpdateRequest {
    task_id: String,
    state: String,
    details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DetailsUpdateRequest {
    task_id: String,
    details: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaskDoneRequest {
    task_id: String,
    details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaskDeleteRequest {
    task_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaskPinRequest {
    task_id: String,
    pinned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetupStatus {
    is_first_launch: bool,
    cli_installed: bool,
    setup_completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DebugData {
    cleaned_buffer: String,
    current_state: String,
    detection_history: Vec<DetectionHistoryEntry>,
    task_id: String,
    pattern_tests: Option<serde_json::Value>,
    confidence: Option<String>,
    is_active: Option<bool>,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DetectionHistoryEntry {
    timestamp: i64,
    from: String,
    to: String,
    details: String,
    confidence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DebugUpdateRequest {
    debug_data: DebugData,
}

// Axum 0.8 handlers with modern path syntax
async fn get_state() -> Json<AppState> {
    let state = APP_STATE.lock().clone();
    Json(state)
}

async fn upsert_task(
    AxumState(app_handle): AxumState<AppHandle>,
    Json(req): Json<UpsertRequest>,
) -> Result<Json<()>, StatusCode> {
    let mut state = APP_STATE.lock();
    let now = current_timestamp();
    
    // Check if project with same repo_path already exists
    let project_id = state.projects
        .iter()
        .find(|(_, p)| p.repo_path == req.project.repo_path)
        .map(|(id, _)| id.clone())
        .unwrap_or_else(|| {
            // Create new project if not found
            let new_id = uuid::Uuid::new_v4().to_string();
            let project = Project {
                id: new_id.clone(),
                name: req.project.name.clone(),
                repo_path: req.project.repo_path.clone(),
                preferred_ide: req.project.preferred_ide.unwrap_or_else(|| "".to_string()),
                github_url: req.project.github_url,
                created_at: now,
                updated_at: now,
            };
            state.projects.insert(new_id.clone(), project);
            new_id
        });

    // Create or update task (preserve existing pinned status if task exists)
    let existing_pinned = state.tasks.get(&req.task.id).map(|t| t.pinned).unwrap_or(false);
    let task = Task {
        id: req.task.id.clone(),
        project_id,
        agent: req.task.agent.clone(),  // Clone to avoid move
        title: req.task.title,
        state: req.task.state.clone(),
        details: req.task.details.clone(),
        created_at: now,
        updated_at: now,
        pinned: existing_pinned,
    };
    state.tasks.insert(req.task.id.clone(), task.clone());
    state.updated_at = now;

    // Emit event to frontend
    let _ = app_handle.emit("tasks-updated", &state.clone());

    // Send notification for PENDING state
    if req.task.state == "PENDING" {
        let notification_data = serde_json::json!({
            "title": format!("Tallor - {}", req.task.agent),
            "body": req.task.details.unwrap_or_else(|| "Agent is waiting for user input".to_string())
        });
        let _ = app_handle.emit("show-notification", &notification_data);
    }
    
    // Update tray menu
    drop(state); // Release the lock before calling update_tray_menu
    update_tray_menu(&app_handle);

    // Save state to disk
    if let Err(_e) = save_app_state() {
    }

    Ok(Json(()))
}

async fn update_task_state(
    AxumState(app_handle): AxumState<AppHandle>,
    Json(req): Json<StateUpdateRequest>,
) -> Result<Json<()>, StatusCode> {
    let mut state = APP_STATE.lock();
    
    // Check if task exists and collect needed data
    let task_data = state.tasks.get(&req.task_id).map(|t| (t.agent.clone(), t.details.clone()));
    
    if let Some((agent, _)) = task_data {
        // Now we can mutate the task
        if let Some(task) = state.tasks.get_mut(&req.task_id) {
            task.state = req.state.clone();
            task.details = req.details.clone();
            task.updated_at = current_timestamp();
        }
        state.updated_at = current_timestamp();

        // Emit event to frontend
        let _ = app_handle.emit("tasks-updated", &state.clone());

        // Send notification for PENDING state
        if req.state == "PENDING" {
            let notification_data = serde_json::json!({
                "title": format!("Tallor - {}", agent),
                "body": req.details.unwrap_or_else(|| "Agent is waiting for user input".to_string())
            });
            let _ = app_handle.emit("show-notification", &notification_data);
        }
        
        // Update tray menu
        drop(state); // Release the lock before calling update_tray_menu
        update_tray_menu(&app_handle);

        // Save state to disk
        if let Err(_e) = save_app_state() {
            }

        Ok(Json(()))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

async fn update_task_details(
    AxumState(app_handle): AxumState<AppHandle>,
    Json(req): Json<DetailsUpdateRequest>,
) -> Result<Json<()>, StatusCode> {
    let mut state = APP_STATE.lock();
    
    if let Some(task) = state.tasks.get_mut(&req.task_id) {
        task.details = Some(req.details);
        task.updated_at = current_timestamp();
        state.updated_at = current_timestamp();
        
        // Emit event to frontend for real-time updates
        let _ = app_handle.emit("tasks-updated", &state.clone());
        
        Ok(Json(()))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

async fn mark_task_done(
    AxumState(app_handle): AxumState<AppHandle>,
    Json(req): Json<TaskDoneRequest>,
) -> Result<Json<()>, StatusCode> {
    let mut state = APP_STATE.lock();
    
    if let Some(task) = state.tasks.get_mut(&req.task_id) {
        task.state = "DONE".to_string();
        task.details = req.details;
        task.updated_at = current_timestamp();
        state.updated_at = current_timestamp();

        // Emit event to frontend
        let _ = app_handle.emit("tasks-updated", &state.clone());
        
        // Update tray menu
        drop(state); // Release the lock before calling update_tray_menu
        update_tray_menu(&app_handle);

        // Save state to disk
        if let Err(_e) = save_app_state() {
            }

        Ok(Json(()))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

async fn delete_task(
    AxumState(app_handle): AxumState<AppHandle>,
    Json(req): Json<TaskDeleteRequest>,
) -> Result<Json<()>, StatusCode> {
    let mut state = APP_STATE.lock();
    
    if state.tasks.remove(&req.task_id).is_some() {
        state.updated_at = current_timestamp();

        // Emit event to frontend
        let _ = app_handle.emit("tasks-updated", &state.clone());
        
        // Update tray menu
        drop(state); // Release the lock before calling update_tray_menu
        update_tray_menu(&app_handle);

        // Save state to disk
        if let Err(_e) = save_app_state() {
            }

        Ok(Json(()))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

async fn toggle_task_pin(
    AxumState(app_handle): AxumState<AppHandle>,
    Json(req): Json<TaskPinRequest>,
) -> Result<Json<()>, StatusCode> {
    let mut state = APP_STATE.lock();
    
    if let Some(task) = state.tasks.get_mut(&req.task_id) {
        task.pinned = req.pinned;
        task.updated_at = current_timestamp();
        state.updated_at = current_timestamp();

        // Emit event to frontend
        let _ = app_handle.emit("tasks-updated", &state.clone());
        
        // Update tray menu
        drop(state); // Release the lock before calling update_tray_menu
        update_tray_menu(&app_handle);

        // Save state to disk
        if let Err(_e) = save_app_state() {
            }

        Ok(Json(()))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

async fn get_setup_status() -> Json<SetupStatus> {
    let cli_installed = is_cli_installed();
    let setup_completed = get_setup_completion_flag();
    let is_first_launch = !setup_completed;

    Json(SetupStatus {
        is_first_launch,
        cli_installed,
        setup_completed,
    })
}

async fn get_debug_patterns_for_task(axum::extract::Path(task_id): axum::extract::Path<String>) -> Result<Json<DebugData>, StatusCode> {
    let state = APP_STATE.lock();
    
    match state.debug_data.get(&task_id) {
        Some(debug_data) => Ok(Json(debug_data.clone())),
        None => Err(StatusCode::NOT_FOUND)
    }
}

async fn get_debug_patterns() -> Result<Json<DebugData>, StatusCode> {
    let state = APP_STATE.lock();
    
    // Find the most recent debug data entry (highest timestamp)
    let most_recent = state.debug_data
        .values()
        .max_by_key(|debug_data| {
            debug_data.detection_history
                .iter()
                .map(|entry| entry.timestamp)
                .max()
                .unwrap_or(0)
        });
    
    match most_recent {
        Some(debug_data) => {
            // Create a clean copy of the debug data
            let clean_debug_data = debug_data.clone();
            
            // Remove ANSI codes from the cleaned buffer for better frontend display
            // This is already done by the CLI wrapper, but let's ensure it's clean
            if clean_debug_data.cleaned_buffer.contains('\u{001b}') {
                // Simple ANSI removal regex would be better, but for now just note this
                // The frontend should handle ANSI codes properly
            }
            
            Ok(Json(clean_debug_data))
        },
        None => Err(StatusCode::NOT_FOUND)
    }
}

async fn update_debug_data(
    Json(req): Json<DebugUpdateRequest>,
) -> Result<Json<()>, StatusCode> {
    let mut state = APP_STATE.lock();
    let task_id = req.debug_data.task_id.clone();
    state.debug_data.insert(task_id, req.debug_data);
    state.updated_at = current_timestamp();
    
    Ok(Json(()))
}

fn is_cli_installed() -> bool {
    // Check if symlink exists at /usr/local/bin/tallor
    Path::new("/usr/local/bin/tallor").exists()
}

fn get_setup_completion_flag() -> bool {
    // Check if setup completion file exists
    get_app_data_dir()
        .map(|dir| dir.join(".setup_completed").exists())
        .unwrap_or(false)
}

fn get_app_data_dir() -> Result<std::path::PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "Unable to find HOME directory")?;
    Ok(std::path::PathBuf::from(home).join("Library/Application Support/Tallor"))
}

fn mark_setup_completed() -> Result<(), String> {
    let app_data_dir = get_app_data_dir()?;
    fs::create_dir_all(&app_data_dir).map_err(|e| format!("Failed to create app data directory: {}", e))?;
    fs::write(app_data_dir.join(".setup_completed"), "").map_err(|e| format!("Failed to create setup flag: {}", e))?;
    Ok(())
}

fn get_sessions_file_path() -> Result<std::path::PathBuf, String> {
    let app_data_dir = get_app_data_dir()?;
    Ok(app_data_dir.join("sessions.json"))
}

fn save_app_state() -> Result<(), String> {
    let state = APP_STATE.lock().clone();
    let app_data_dir = get_app_data_dir()?;
    
    // Ensure directory exists
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    
    let sessions_file = get_sessions_file_path()?;
    let state_json = serde_json::to_string_pretty(&state)
        .map_err(|e| format!("Failed to serialize app state: {}", e))?;
    
    fs::write(&sessions_file, state_json)
        .map_err(|e| format!("Failed to write sessions file: {}", e))?;
    
    Ok(())
}

fn cleanup_done_sessions(mut state: AppState) -> AppState {
    let initial_task_count = state.tasks.len();
    
    // Remove all tasks with "DONE" state
    state.tasks.retain(|_, task| task.state != "DONE");
    
    let cleaned_task_count = state.tasks.len();
    let removed_count = initial_task_count - cleaned_task_count;
    
    if removed_count > 0 {
        // Update the state timestamp since we modified it
        state.updated_at = current_timestamp();
    }
    
    state
}

fn load_app_state() -> Result<AppState, String> {
    let sessions_file = get_sessions_file_path()?;
    
    if !sessions_file.exists() {
        return Ok(AppState::default());
    }
    
    let state_content = fs::read_to_string(&sessions_file)
        .map_err(|e| format!("Failed to read sessions file: {}", e))?;
    
    if state_content.trim().is_empty() {
        return Ok(AppState::default());
    }
    
    let state: AppState = serde_json::from_str(&state_content)
        .map_err(|e| {
            // If JSON parsing fails, backup the corrupted file and start fresh
            let backup_path = sessions_file.with_extension("json.backup");
            let _ = fs::rename(&sessions_file, &backup_path);
            format!("Failed to parse sessions file (backed up as {:?}): {}", backup_path, e)
        })?;
    
    Ok(state)
}

// Helper function to get IDE command with proper arguments
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

// Tauri command for opening IDE and terminal
#[tauri::command]
async fn open_ide_and_terminal(
    app: AppHandle,
    project_path: String,
    ide: Option<String>,
) -> Result<(), String> {
    match ide {
        Some(ide_cmd) if !ide_cmd.is_empty() => {
            let (command, args) = get_ide_command_and_args(&ide_cmd, &project_path);
            
            // Try to open with the IDE command
            let result = app.shell()
                .command(&command)
                .args(&args)
                .spawn();
                
            match result {
                Ok(_) => Ok(()),
                Err(_e) => {
                    // If the IDE command fails, try alternative approaches
                    
                    // Try with 'open -a' on macOS
                    let open_result = app.shell()
                        .command("open")
                        .args(&["-a", &command, &project_path])
                        .spawn();
                        
                    match open_result {
                        Ok(_) => Ok(()),
                        Err(_) => {
                            // Last resort: just open the directory
                            app.shell()
                                .command("open")
                                .args(&[&project_path])
                                .spawn()
                                .map_err(|e2| format!("Failed to open project with '{}' and fallback failed: {}", command, e2))?;
                            Ok(())
                        }
                    }
                }
            }
        }
        _ => {
            // No IDE specified - just try to open with system default
            app.shell()
                .command("open")
                .args(&[&project_path])
                .spawn()
                .map_err(|e| format!("Failed to open project directory: {}", e))?;
            Ok(())
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    always_on_top: bool,
    visible_on_all_workspaces: bool,
    window_position: Option<WindowPosition>,
    preferred_ide: String,
    theme: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WindowPosition {
    x: i32,
    y: i32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            always_on_top: true,
            visible_on_all_workspaces: true,
            window_position: None,
            preferred_ide: "cursor".to_string(),
            theme: "light".to_string(),
        }
    }
}

#[tauri::command]
async fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    // Ensure directory exists
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;
    
    let settings_file = app_data_dir.join("settings.json");
    let settings_json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    
    fs::write(&settings_file, settings_json)
        .map_err(|e| format!("Failed to write settings file: {}", e))?;
    
    Ok(())
}

#[tauri::command]
async fn load_settings(app: AppHandle) -> Result<AppSettings, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    let settings_file = app_data_dir.join("settings.json");
    
    if !settings_file.exists() {
        return Ok(AppSettings::default());
    }
    
    let settings_content = fs::read_to_string(&settings_file)
        .map_err(|e| format!("Failed to read settings file: {}", e))?;
    
    let settings: AppSettings = serde_json::from_str(&settings_content)
        .map_err(|e| format!("Failed to parse settings: {}", e))?;
    
    Ok(settings)
}

#[tauri::command]
async fn check_cli_permissions() -> Result<bool, String> {
    let bin_dir = Path::new("/usr/local/bin");
    
    // Check if directory exists and is writable
    if !bin_dir.exists() {
        return Ok(false);
    }
    
    // Try to check write permissions
    let test_file = bin_dir.join(".tallor_test_write");
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
async fn install_cli_globally(app: AppHandle) -> Result<(), String> {
    // Get the path to the CLI binary
    let cli_source = if cfg!(debug_assertions) {
        // In development, use the tools directory relative to the project root
        // The working directory is src-tauri, so we need to go up one level
        let project_dir = std::env::current_dir()
            .map_err(|e| format!("Failed to get current dir: {}", e))?
            .parent()
            .ok_or("Failed to get parent directory")?
            .to_path_buf();
        project_dir.join("tools").join("tallor")
    } else {
        // In production, use the resource directory
        let resource_path = app.path().resource_dir().map_err(|e| format!("Failed to get resource path: {}", e))?;
        resource_path.join("tallor")
    };
    
    // Check if CLI binary exists
    if !cli_source.exists() {
        return Err(format!("CLI binary not found at: {:?}", cli_source));
    }
    
    // Ensure /usr/local/bin directory exists
    let bin_dir = Path::new("/usr/local/bin");
    if !bin_dir.exists() {
        // Try to create it
        if let Err(e) = fs::create_dir_all(bin_dir) {
            return Err(format!("Cannot create /usr/local/bin: {}. Please run: sudo mkdir -p /usr/local/bin", e));
        }
    }
    
    // Check write permissions
    let test_file = bin_dir.join(".tallor_test_write");
    if fs::write(&test_file, "test").is_err() {
        return Err("Permission denied. Please use the manual installation method with sudo.".to_string());
    }
    let _ = fs::remove_file(&test_file);
    
    // Create symlink at /usr/local/bin/tallor
    let cli_dest = bin_dir.join("tallor");
    
    // Remove existing symlink if it exists
    if cli_dest.exists() {
        if let Err(e) = fs::remove_file(&cli_dest) {
            return Err(format!("Cannot remove existing CLI: {}. Please run: sudo rm /usr/local/bin/tallor", e));
        }
    }
    
    // Create the symlink
    std::os::unix::fs::symlink(&cli_source, &cli_dest)
        .map_err(|e| format!("Failed to create symlink: {}. Please use the manual installation method.", e))?;
    
    // Verify the symlink works
    if !cli_dest.exists() {
        return Err("Symlink creation failed. Please use the manual installation method.".to_string());
    }
    
    // Mark setup as completed
    mark_setup_completed()?;
    
    
    Ok(())
}

#[tauri::command] 
async fn get_setup_status_cmd() -> SetupStatus {
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
async fn mark_setup_completed_cmd() -> Result<(), String> {
    mark_setup_completed()
}

#[tauri::command]
async fn get_tasks() -> AppState {
    APP_STATE.lock().clone()
}

fn current_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

// Store tray icon globally so we can update it
static TRAY_ICON: Lazy<Arc<Mutex<Option<tauri::tray::TrayIcon<tauri::Wry>>>>> = 
    Lazy::new(|| Arc::new(Mutex::new(None)));

fn setup_tray_icon(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle().clone();
    
    // Build initial tray menu
    let tray_menu = build_tray_menu(&app_handle)?;
    
    // Get initial icon based on current state
    let initial_state = get_aggregate_state();
    let tray_icon = load_tray_icon(initial_state);
    
    // Create tray icon
    let tray = TrayIconBuilder::new()
        .menu(&tray_menu)
        .icon(tray_icon)
        // No tray icon click handling needed - menu appears on left click automatically
        .on_menu_event(move |app, event| {
            handle_tray_menu_event(app, &event.id().0);
        })
        .build(app)?;
    
    // Store the tray icon globally so we can update it later
    *TRAY_ICON.lock() = Some(tray);
    
    Ok(())
}

fn build_tray_menu(app_handle: &AppHandle) -> Result<tauri::menu::Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let mut menu_builder = MenuBuilder::new(app_handle);
    
    // Get current app state to build session items
    let state = APP_STATE.lock();
    
    // Add session items if any exist
    if !state.tasks.is_empty() {
        for (task_id, task) in &state.tasks {
            let project = state.projects.get(&task.project_id);
            let project_name = project.map(|p| &p.name).unwrap_or(&task.project_id);
            
            let status_icon = match task.state.as_str() {
                "PENDING" => "🟠",
                "WORKING" => "🟢", 
                "ERROR" => "🔴",
                _ => "⚪"
            };
            
            let menu_text = format!("{} {} - {} - {}", status_icon, project_name, task.agent, task.state);
            menu_builder = menu_builder.item(
                &MenuItemBuilder::new(&menu_text)
                    .id(format!("session_{}", task_id))
                    .build(app_handle)?
            );
        }
        
        // Add separator before static items
        menu_builder = menu_builder.separator();
    } else {
        // Show "No active sessions" when empty
        menu_builder = menu_builder.item(
            &MenuItemBuilder::new("No active sessions")
                .id("no_sessions")
                .enabled(false)
                .build(app_handle)?
        );
        menu_builder = menu_builder.separator();
    }
    
    // Add static menu items
    menu_builder = menu_builder
        .item(
            &MenuItemBuilder::new("Show Tallor")
                .id("show_window")
                .build(app_handle)?
        )
        .item(
            &MenuItemBuilder::new("Quit")
                .id("quit")
                .build(app_handle)?
        );
    
    Ok(menu_builder.build()?)
}


fn handle_tray_menu_event(app_handle: &AppHandle, menu_id: &str) {
    match menu_id {
        "show_window" => {
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        "quit" => {
            app_handle.exit(0);
        }
        id if id.starts_with("session_") => {
            // Handle session click - extract task ID and open IDE
            let task_id = id.strip_prefix("session_").unwrap();
            
            let state = APP_STATE.lock();
            if let Some(task) = state.tasks.get(task_id) {
                if let Some(project) = state.projects.get(&task.project_id) {
                    // Use existing open_ide_and_terminal logic
                    let project_path = project.repo_path.clone();
                    let preferred_ide = Some(project.preferred_ide.clone());
                    
                    // Spawn the IDE opening in a separate task
                    let app_handle_clone = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = open_ide_and_terminal(app_handle_clone, project_path, preferred_ide).await;
                    });
                }
            }
        }
        _ => {}
    }
}

// Function to get aggregate state from current tasks
fn get_aggregate_state() -> &'static str {
    let state = APP_STATE.lock();
    let states: Vec<&str> = state.tasks.values().map(|t| t.state.as_str()).collect();
    
    if states.contains(&"PENDING") {
        "pending"
    } else if states.contains(&"ERROR") {
        "error"
    } else if states.contains(&"WORKING") {
        "working"
    } else if states.is_empty() {
        "idle"
    } else {
        "idle"
    }
}

// Include tray icon bytes at compile time
const TRAY_ICON_DEFAULT: &[u8] = include_bytes!("../icons/tray/tray-default.png");
const TRAY_ICON_WORKING: &[u8] = include_bytes!("../icons/tray/tray-working.png");
const TRAY_ICON_PENDING: &[u8] = include_bytes!("../icons/tray/tray-pending.png");
const TRAY_ICON_ERROR: &[u8] = include_bytes!("../icons/tray/tray-error.png");


// Function to load tray icon based on state
fn load_tray_icon(state: &str) -> tauri::image::Image<'static> {
    let icon_bytes = match state {
        "pending" => TRAY_ICON_PENDING,
        "error" => TRAY_ICON_ERROR,
        "working" => TRAY_ICON_WORKING,
        _ => TRAY_ICON_DEFAULT,
    };
    
    // Create image from bytes
    let image = image::load_from_memory(icon_bytes).expect("Failed to load tray icon");
    let rgba = image.to_rgba8();
    let (width, height) = image.dimensions();
    
    tauri::image::Image::new_owned(rgba.into_raw(), width, height)
}

// Function to update tray menu and icon when app state changes
fn update_tray_menu(app_handle: &AppHandle) {
    if let Some(tray) = TRAY_ICON.lock().as_ref() {
        // Update menu
        if let Ok(new_menu) = build_tray_menu(app_handle) {
            let _ = tray.set_menu(Some(new_menu));
        }
        
        // Update icon based on aggregate state
        let aggregate_state = get_aggregate_state();
        
        // Load and set the appropriate icon
        let icon = load_tray_icon(aggregate_state);
        let _ = tray.set_icon(Some(icon));
        
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            
            // Load persisted state on startup (with robust error handling)
            match load_app_state() {
                Ok(loaded_state) => {
                    // Clean up done sessions before setting the state
                    let cleaned_state = cleanup_done_sessions(loaded_state);
                    
                    // Save the cleaned state back to disk to persist the cleanup
                    *APP_STATE.lock() = cleaned_state.clone();
                    if let Err(_e) = save_app_state() {
                    }
                    
                },
                Err(_e) => {
                    // APP_STATE is already initialized with default empty state
                }
            }
            
            // Initialize tray icon with menu
            setup_tray_icon(app)?;
            
            // Start HTTP server in background using Tauri's async runtime
            tauri::async_runtime::spawn(async move {
                start_http_server(app_handle).await;
            });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_ide_and_terminal,
            get_tasks,
            install_cli_globally,
            check_cli_permissions,
            get_setup_status_cmd,
            mark_setup_completed_cmd,
            save_settings,
            load_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn start_http_server(app_handle: AppHandle) {
    // Create Axum 0.8 router with modern path syntax
    let app = Router::new()
        .route("/v1/state", get(get_state))
        .route("/v1/tasks/upsert", post(upsert_task))
        .route("/v1/tasks/state", post(update_task_state))
        .route("/v1/tasks/details", post(update_task_details))
        .route("/v1/tasks/done", post(mark_task_done))
        .route("/v1/tasks/delete", post(delete_task))
        .route("/v1/tasks/pin", post(toggle_task_pin))
        .route("/v1/setup/status", get(get_setup_status))
        .route("/v1/debug/patterns", get(get_debug_patterns))
        .route("/v1/debug/patterns/{task_id}", get(get_debug_patterns_for_task))
        .route("/v1/debug/update", post(update_debug_data))
        .layer(CorsLayer::permissive())
        .with_state(app_handle);

    let listener = TcpListener::bind("127.0.0.1:4317").await.unwrap();
    
    axum::serve(listener, app).await.unwrap();
}
