use axum::{
    extract::State as AxumState,
    http::{StatusCode, HeaderMap, Method, HeaderValue, header::{CONTENT_TYPE, AUTHORIZATION}},
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

// Logging imports
use log::{debug, info, warn, error};
use chrono::Local;

// Global application state
static APP_STATE: Lazy<Arc<Mutex<AppState>>> = Lazy::new(|| Arc::new(Mutex::new(AppState::default())));

// Global authentication token (loaded once at startup)
static AUTH_TOKEN: Lazy<Arc<Mutex<Option<String>>>> = Lazy::new(|| Arc::new(Mutex::new(None)));

// Generate a cryptographically secure random token
fn generate_secure_token() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
    hex::encode(bytes)
}

// Get or create authentication token
fn get_or_create_auth_token() -> Result<String, String> {
    // First check if we have it in memory
    if let Some(token) = AUTH_TOKEN.lock().as_ref() {
        return Ok(token.clone());
    }
    
    // Check environment variables (highest priority)
    if let Ok(token) = std::env::var("TALLR_TOKEN") {
        AUTH_TOKEN.lock().replace(token.clone());
        return Ok(token);
    }
    
    
    // Try to load from file
    let token_file = get_auth_token_file_path()?;
    
    if token_file.exists() {
        let token = fs::read_to_string(&token_file)
            .map_err(|e| format!("Failed to read auth token file: {e}"))?
            .trim()
            .to_string();
        
        if !token.is_empty() {
            AUTH_TOKEN.lock().replace(token.clone());
            return Ok(token);
        }
    }
    
    // Generate new token and save it
    let new_token = generate_secure_token();
    
    // Ensure directory exists
    if let Some(parent) = token_file.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create auth token directory: {e}"))?;
    }
    
    // Write token to file
    fs::write(&token_file, &new_token)
        .map_err(|e| format!("Failed to write auth token file: {e}"))?;
    
    AUTH_TOKEN.lock().replace(new_token.clone());
    Ok(new_token)
}

// Get path to auth token file
fn get_auth_token_file_path() -> Result<std::path::PathBuf, String> {
    let app_data_dir = get_app_data_dir()?;
    Ok(app_data_dir.join("auth.token"))
}

// Initialize logging
fn setup_logging() -> Result<(), String> {
    let app_data_dir = get_app_data_dir()?;
    let logs_dir = app_data_dir.join("logs");
    
    // Ensure logs directory exists
    fs::create_dir_all(&logs_dir)
        .map_err(|e| format!("Failed to create logs directory: {e}"))?;
    
    let log_file = logs_dir.join("tallr.log");
    
    // Set up file logging with rotation
    use std::io::Write;
    
    // Custom logger that writes to both file and console
    let target = Box::new(std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
        .map_err(|e| format!("Failed to open log file: {e}"))?);
    
    // Initialize env_logger to write to our file
    env_logger::Builder::from_default_env()
        .target(env_logger::Target::Pipe(target))
        .format(|buf, record| {
            writeln!(
                buf,
                "{} [{}] {}: {}",
                Local::now().format("%Y-%m-%d %H:%M:%S%.3f"),
                record.level(),
                record.target(),
                record.args()
            )
        })
        .init();
    
    info!("Logging initialized - log file: {log_file:?}");
    Ok(())
}

// Authentication validation function
fn validate_auth_header(headers: &HeaderMap) -> bool {
    // Get the expected token
    let expected_token = match get_or_create_auth_token() {
        Ok(token) => token,
        Err(_) => return false, // Fail closed if we can't get a token
    };
    
    // Check if Authorization header exists and matches
    if let Some(auth_header) = headers.get("authorization") {
        if let Ok(auth_str) = auth_header.to_str() {
            if let Some(token) = auth_str.strip_prefix("Bearer ") {
                // Use constant-time comparison to prevent timing attacks
                return token.len() == expected_token.len() 
                    && token.bytes().zip(expected_token.bytes()).all(|(a, b)| a == b);
            }
        }
    }
    false
}

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
    last_cli_ping: Option<i64>,
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
async fn get_state(headers: HeaderMap) -> Result<Json<AppState>, StatusCode> {
    // Validate authentication
    if !validate_auth_header(&headers) {
        warn!("Unauthorized access attempt to /v1/state");
        return Err(StatusCode::UNAUTHORIZED);
    }
    debug!("Returning app state");
    let state = APP_STATE.lock().clone();
    Ok(Json(state))
}

async fn upsert_task(
    headers: HeaderMap,
    AxumState(app_handle): AxumState<AppHandle>,
    Json(req): Json<UpsertRequest>,
) -> Result<Json<()>, StatusCode> {
    // Validate authentication
    if !validate_auth_header(&headers) {
        warn!("Unauthorized access attempt to /v1/tasks/upsert");
        return Err(StatusCode::UNAUTHORIZED);
    }
    
    info!("Upserting task: {} for project: {}", req.task.id, req.project.name);
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

    // Send notification only for PENDING and ERROR states
    if req.task.state == "PENDING" || req.task.state == "ERROR" {
        let project_name = req.project.name.clone();
        let notification_data = serde_json::json!({
            "title": format!("{} - {}", project_name, req.task.agent),
            "body": ""
        });
        let _ = app_handle.emit("show-notification", &notification_data);
    }
    
    // Update tray menu
    drop(state); // Release the lock before calling update_tray_menu
    update_tray_menu(&app_handle);

    // Save state to disk
    if let Err(e) = save_app_state() {
        error!("Failed to save app state: {e}");
    }

    Ok(Json(()))
}

async fn update_task_state(
    headers: HeaderMap,
    AxumState(app_handle): AxumState<AppHandle>,
    Json(req): Json<StateUpdateRequest>,
) -> Result<Json<()>, StatusCode> {
    // Validate authentication
    if !validate_auth_header(&headers) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let mut state = APP_STATE.lock();
    
    // Check if task exists and collect needed data
    let task_data = state.tasks.get(&req.task_id).map(|t| (t.agent.clone(), t.project_id.clone()));
    
    if let Some((agent, project_id)) = task_data {
        let project_name = state.projects.get(&project_id)
            .map(|p| p.name.clone())
            .unwrap_or_else(|| "Unknown Project".to_string());
            
        // Now we can mutate the task
        if let Some(task) = state.tasks.get_mut(&req.task_id) {
            task.state = req.state.clone();
            task.details = req.details.clone();
            task.updated_at = current_timestamp();
        }
        state.updated_at = current_timestamp();

        // Emit event to frontend
        let _ = app_handle.emit("tasks-updated", &state.clone());

        // Send notification only for PENDING and ERROR states
        if req.state == "PENDING" || req.state == "ERROR" {
            let notification_data = serde_json::json!({
                "title": format!("{} - {}", project_name, agent),
                "body": ""
            });
            let _ = app_handle.emit("show-notification", &notification_data);
        }
        
        // Update tray menu
        drop(state); // Release the lock before calling update_tray_menu
        update_tray_menu(&app_handle);

        // Save state to disk
        if let Err(e) = save_app_state() {
                eprintln!("Failed to save app state: {}", e);
            }

        Ok(Json(()))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

async fn update_task_details(
    headers: HeaderMap,
    AxumState(app_handle): AxumState<AppHandle>,
    Json(req): Json<DetailsUpdateRequest>,
) -> Result<Json<()>, StatusCode> {
    // Validate authentication
    if !validate_auth_header(&headers) {
        return Err(StatusCode::UNAUTHORIZED);
    }
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
    headers: HeaderMap,
    AxumState(app_handle): AxumState<AppHandle>,
    Json(req): Json<TaskDoneRequest>,
) -> Result<Json<()>, StatusCode> {
    // Validate authentication
    if !validate_auth_header(&headers) {
        return Err(StatusCode::UNAUTHORIZED);
    }
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
        if let Err(e) = save_app_state() {
                eprintln!("Failed to save app state: {}", e);
            }

        Ok(Json(()))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

async fn delete_task(
    headers: HeaderMap,
    AxumState(app_handle): AxumState<AppHandle>,
    Json(req): Json<TaskDeleteRequest>,
) -> Result<Json<()>, StatusCode> {
    // Validate authentication
    if !validate_auth_header(&headers) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let mut state = APP_STATE.lock();
    
    if state.tasks.remove(&req.task_id).is_some() {
        state.updated_at = current_timestamp();

        // Emit event to frontend
        let _ = app_handle.emit("tasks-updated", &state.clone());
        
        // Update tray menu
        drop(state); // Release the lock before calling update_tray_menu
        update_tray_menu(&app_handle);

        // Save state to disk
        if let Err(e) = save_app_state() {
                eprintln!("Failed to save app state: {}", e);
            }

        Ok(Json(()))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

async fn toggle_task_pin(
    headers: HeaderMap,
    AxumState(app_handle): AxumState<AppHandle>,
    Json(req): Json<TaskPinRequest>,
) -> Result<Json<()>, StatusCode> {
    // Validate authentication
    if !validate_auth_header(&headers) {
        return Err(StatusCode::UNAUTHORIZED);
    }
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
        if let Err(e) = save_app_state() {
                eprintln!("Failed to save app state: {}", e);
            }

        Ok(Json(()))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

async fn get_setup_status(headers: HeaderMap) -> Result<Json<SetupStatus>, StatusCode> {
    // Validate authentication
    if !validate_auth_header(&headers) {
        warn!("Unauthorized access attempt to /v1/setup/status");
        return Err(StatusCode::UNAUTHORIZED);
    }
    
    debug!("Returning setup status");
    let cli_installed = is_cli_installed();
    let setup_completed = get_setup_completion_flag();
    let is_first_launch = !setup_completed;

    Ok(Json(SetupStatus {
        is_first_launch,
        cli_installed,
        setup_completed,
    }))
}

async fn health_check(headers: HeaderMap) -> Result<Json<serde_json::Value>, StatusCode> {
    info!("🩺 Health check endpoint called");
    
    // Validate authentication
    if !validate_auth_header(&headers) {
        warn!("Health check: Unauthorized access attempt to /v1/health");
        return Err(StatusCode::UNAUTHORIZED);
    }
    
    info!("Health check: Authentication successful");
    
    // Update last CLI ping timestamp
    let current_time = current_timestamp();
    let mut state = APP_STATE.lock();
    state.last_cli_ping = Some(current_time);
    info!("Health check: Updated last_cli_ping to {}", current_time);
    drop(state);
    
    info!("🩺 Health check: Ping processed successfully");
    Ok(Json(serde_json::json!({"status": "ok", "timestamp": current_time})))
}

#[cfg(debug_assertions)]
async fn get_debug_patterns_for_task(
    headers: HeaderMap,
    axum::extract::Path(task_id): axum::extract::Path<String>
) -> Result<Json<DebugData>, StatusCode> {
    warn!("DEBUG MODE: get_debug_patterns_for_task called for task: {task_id}");
    
    // Validate authentication
    if !validate_auth_header(&headers) {
        warn!("Unauthorized access attempt to /v1/debug/patterns/{task_id}");
        return Err(StatusCode::UNAUTHORIZED);
    }
    
    debug!("Returning debug patterns for task: {task_id}");
    let state = APP_STATE.lock();
    
    match state.debug_data.get(&task_id) {
        Some(debug_data) => Ok(Json(debug_data.clone())),
        None => Err(StatusCode::NOT_FOUND)
    }
}

#[cfg(not(debug_assertions))]
async fn get_debug_patterns_for_task(
    _headers: HeaderMap,
    _path: axum::extract::Path<String>
) -> Result<Json<DebugData>, StatusCode> {
    warn!("RELEASE MODE: Debug endpoint disabled - returning 404");
    Err(StatusCode::NOT_FOUND)
}

#[cfg(debug_assertions)]
async fn get_debug_patterns(headers: HeaderMap) -> Result<Json<DebugData>, StatusCode> {
    warn!("DEBUG MODE: get_debug_patterns called");
    
    // Validate authentication
    if !validate_auth_header(&headers) {
        warn!("Unauthorized access attempt to /v1/debug/patterns");
        return Err(StatusCode::UNAUTHORIZED);
    }
    
    debug!("Returning most recent debug patterns");
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

#[cfg(not(debug_assertions))]
async fn get_debug_patterns(_headers: HeaderMap) -> Result<Json<DebugData>, StatusCode> {
    warn!("RELEASE MODE: Debug patterns endpoint disabled - returning 404");
    Err(StatusCode::NOT_FOUND)
}

async fn update_debug_data(
    headers: HeaderMap,
    Json(req): Json<DebugUpdateRequest>,
) -> Result<Json<()>, StatusCode> {
    // Validate authentication
    if !validate_auth_header(&headers) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let mut state = APP_STATE.lock();
    let task_id = req.debug_data.task_id.clone();
    state.debug_data.insert(task_id, req.debug_data);
    state.updated_at = current_timestamp();
    
    Ok(Json(()))
}

fn is_cli_installed() -> bool {
    // Check if symlink exists at /usr/local/bin/tallr
    Path::new("/usr/local/bin/tallr").exists()
}

fn get_setup_completion_flag() -> bool {
    // Check if setup completion file exists
    get_app_data_dir()
        .map(|dir| dir.join(".setup_completed").exists())
        .unwrap_or(false)
}

fn get_app_data_dir() -> Result<std::path::PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "Unable to find HOME directory")?;
    Ok(std::path::PathBuf::from(home).join("Library/Application Support/Tallr"))
}

fn mark_setup_completed() -> Result<(), String> {
    let app_data_dir = get_app_data_dir()?;
    fs::create_dir_all(&app_data_dir).map_err(|e| format!("Failed to create app data directory: {e}"))?;
    fs::write(app_data_dir.join(".setup_completed"), "").map_err(|e| format!("Failed to create setup flag: {e}"))?;
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
        .map_err(|e| format!("Failed to create app data directory: {e}"))?;
    
    let sessions_file = get_sessions_file_path()?;
    let state_json = serde_json::to_string_pretty(&state)
        .map_err(|e| format!("Failed to serialize app state: {e}"))?;
    
    fs::write(&sessions_file, state_json)
        .map_err(|e| format!("Failed to write sessions file: {e}"))?;
    
    Ok(())
}

fn cleanup_done_sessions(mut state: AppState) -> AppState {
    let initial_task_count = state.tasks.len();
    let now = current_timestamp();
    let one_hour_ms = 60 * 60 * 1000;
    
    // Remove tasks with "DONE" state or old IDLE tasks
    state.tasks.retain(|_, task| {
        // Remove DONE tasks
        if task.state == "DONE" {
            return false;
        }
        
        // Remove IDLE tasks older than 1 hour
        if task.state == "IDLE" {
            // Use updated_at as fallback since completed_at doesn't exist in backend Task struct
            let task_time = std::cmp::max(task.updated_at, task.created_at);
            if (now - task_time) > one_hour_ms {
                return false;
            }
        }
        
        true
    });
    
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
    info!("open_ide_and_terminal called with project_path: {:?}, ide: {:?}", project_path, ide);
    
    match ide {
        Some(ide_cmd) if !ide_cmd.is_empty() => {
            let (command, args) = get_ide_command_and_args(&ide_cmd, &project_path);
            info!("Trying to open with IDE command: {} {:?}", command, args);
            
            // Try to open with the IDE command
            let result = app.shell()
                .command(&command)
                .args(&args)
                .spawn();
                
            match result {
                Ok(_) => {
                    info!("Successfully opened IDE with command: {}", command);
                    Ok(())
                }
                Err(e) => {
                    warn!("IDE command '{}' failed: {}. Trying fallback.", command, e);
                    
                    // Try with 'open -a' on macOS
                    let open_result = app.shell()
                        .command("open")
                        .args(["-a", &command, &project_path])
                        .spawn();
                        
                    match open_result {
                        Ok(_) => {
                            info!("Successfully opened IDE with 'open -a' fallback");
                            Ok(())
                        }
                        Err(e2) => {
                            warn!("'open -a' fallback failed: {}. Trying directory fallback.", e2);
                            
                            // Last resort: just open the directory
                            app.shell()
                                .command("open")
                                .args([&project_path])
                                .spawn()
                                .map_err(|e3| {
                                    let error_msg = format!(
                                        "All methods failed to open project:\n\
                                        1. IDE command '{}': {}\n\
                                        2. 'open -a' fallback: {}\n\
                                        3. Directory fallback: {}",
                                        command, e, e2, e3
                                    );
                                    error!("{}", error_msg);
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
                .spawn()
                .map_err(|e| {
                    let error_msg = format!("Failed to open project directory: {}", e);
                    error!("{}", error_msg);
                    error_msg
                })?;
            info!("Successfully opened project directory");
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
    notifications_enabled: bool,
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
            notifications_enabled: true,
        }
    }
}

#[tauri::command]
async fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
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
async fn load_settings(app: AppHandle) -> Result<AppSettings, String> {
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
async fn check_cli_permissions() -> Result<bool, String> {
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
async fn install_cli_globally(app: AppHandle) -> Result<(), String> {
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
    
    // Create the symlink
    info!("Creating symlink from {cli_source:?} to {cli_dest:?}");
    std::os::unix::fs::symlink(&cli_source, &cli_dest)
        .map_err(|e| format!(
            "Failed to create symlink from {cli_source:?} to {cli_dest:?}: {e}\n\
            Please use the manual installation method:\n\
            sudo ln -s {cli_source:?} {cli_dest:?}"
        ))?;
    
    // Verify the symlink works
    if !cli_dest.exists() {
        return Err(format!(
            "Symlink verification failed: {cli_dest:?} does not exist after creation.\n\
            Please use the manual installation method:\n\
            sudo ln -s {cli_source:?} {cli_dest:?}"
        ));
    }
    
    info!("Successfully created and verified CLI symlink at: {cli_dest:?}");
    
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

#[tauri::command]
async fn send_notification(app: AppHandle, title: String, body: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| format!("Failed to show notification: {e}"))?;
    
    Ok(())
}

#[tauri::command]
async fn get_auth_token() -> Result<String, String> {
    get_or_create_auth_token()
}

#[tauri::command]
async fn get_cli_connectivity() -> serde_json::Value {
    info!("Frontend requesting CLI connectivity status");
    
    let state = APP_STATE.lock();
    let last_ping = state.last_cli_ping;
    let current_time = current_timestamp();
    drop(state);
    
    info!("Connectivity data: last_ping={:?}, current_time={}", last_ping, current_time);
    
    let is_connected = match last_ping {
        Some(ping_time) => {
            let time_diff = current_time - ping_time;
            let connected = time_diff < 30;
            info!("Time since last ping: {}s, Connected: {}", time_diff, connected);
            connected
        },
        None => {
            info!("No ping received yet, marking as disconnected");
            false
        }
    };
    
    let result = serde_json::json!({
        "connected": is_connected,
        "lastPing": last_ping,
        "currentTime": current_time
    });
    
    info!("Returning connectivity result: {:?}", result);
    
    result
}

#[tauri::command]
async fn write_frontend_log(level: String, message: String, context: Option<String>) -> Result<(), String> {
    match level.to_lowercase().as_str() {
        "info" => info!("[FRONTEND] {}: {}", message, context.unwrap_or_default()),
        "warn" => warn!("[FRONTEND] {}: {}", message, context.unwrap_or_default()),
        "error" => error!("[FRONTEND] {}: {}", message, context.unwrap_or_default()),
        "debug" => debug!("[FRONTEND] {}: {}", message, context.unwrap_or_default()),
        _ => info!("[FRONTEND] {}: {}", message, context.unwrap_or_default()),
    }
    Ok(())
}

// Frontend-specific Tauri commands (replacing HTTP calls)

#[tauri::command]
async fn frontend_update_task_state(
    app_handle: AppHandle,
    task_id: String,
    state: String,
    details: Option<String>
) -> Result<(), String> {
    let mut app_state = APP_STATE.lock();
    
    if let Some(task) = app_state.tasks.get_mut(&task_id) {
        task.state = state.clone();
        if let Some(details) = details {
            task.details = Some(details);
        }
        task.updated_at = current_timestamp();
        
        // Emit event for real-time updates
        let _ = app_handle.emit("task-updated", &*task);
        
        info!("Frontend updated task {} state to {}", task_id, state);
        Ok(())
    } else {
        Err(format!("Task {} not found", task_id))
    }
}

#[tauri::command]
async fn frontend_mark_task_done(
    app_handle: AppHandle,
    task_id: String,
    details: Option<String>
) -> Result<(), String> {
    let mut app_state = APP_STATE.lock();
    
    if let Some(task) = app_state.tasks.get_mut(&task_id) {
        task.state = "DONE".to_string();
        if let Some(details) = details {
            task.details = Some(details);
        } else {
            task.details = Some("Completed by user".to_string());
        }
        task.updated_at = current_timestamp();
        
        // Emit event for real-time updates
        let _ = app_handle.emit("task-updated", &*task);
        
        drop(app_state); // Drop lock before saving
        
        // Save state to disk
        if let Err(e) = save_app_state() {
            error!("Failed to save app state after marking task done: {e}");
        }
        
        info!("Frontend marked task {} as done", task_id);
        Ok(())
    } else {
        Err(format!("Task {} not found", task_id))
    }
}

#[tauri::command]
async fn frontend_delete_task(
    app_handle: AppHandle,
    task_id: String
) -> Result<(), String> {
    let mut app_state = APP_STATE.lock();
    
    if app_state.tasks.remove(&task_id).is_some() {
        app_state.updated_at = current_timestamp();
        
        // Emit event for real-time updates
        let _ = app_handle.emit("task-deleted", task_id.clone());
        
        drop(app_state); // Drop lock before saving
        
        // Save state to disk
        if let Err(e) = save_app_state() {
            error!("Failed to save app state after task deletion: {e}");
        }
        
        info!("Frontend deleted task {}", task_id);
        Ok(())
    } else {
        Err(format!("Task {} not found", task_id))
    }
}

#[tauri::command]
async fn frontend_toggle_task_pin(
    app_handle: AppHandle,
    task_id: String,
    pinned: bool
) -> Result<(), String> {
    let mut app_state = APP_STATE.lock();
    
    if let Some(task) = app_state.tasks.get_mut(&task_id) {
        task.pinned = pinned;
        task.updated_at = current_timestamp();
        
        // Emit event for real-time updates
        let _ = app_handle.emit("task-updated", &*task);
        
        info!("Frontend {} task {}", if pinned { "pinned" } else { "unpinned" }, task_id);
        Ok(())
    } else {
        Err(format!("Task {} not found", task_id))
    }
}

#[tauri::command]
async fn frontend_get_debug_data(task_id: Option<String>) -> Result<serde_json::Value, String> {
    let app_state = APP_STATE.lock();
    
    if let Some(task_id) = task_id {
        if let Some(debug_data) = app_state.debug_data.get(&task_id) {
            Ok(serde_json::to_value(debug_data).unwrap_or(serde_json::Value::Null))
        } else {
            Err(format!("Debug data for task {} not found", task_id))
        }
    } else {
        // Return all debug data
        Ok(serde_json::to_value(&app_state.debug_data).unwrap_or(serde_json::Value::Null))
    }
}

fn current_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .expect("System time should be after Unix epoch")
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
    
    // Add session items if any exist (filter out DONE tasks)
    let active_tasks: Vec<_> = state.tasks.iter().filter(|(_, task)| task.state != "DONE").collect();
    if !active_tasks.is_empty() {
        for (task_id, task) in active_tasks {
            let project = state.projects.get(&task.project_id);
            let project_name = project.map(|p| &p.name).unwrap_or(&task.project_id);
            
            let status_icon = match task.state.as_str() {
                "PENDING" => "🟡",  // Yellow circle for pending
                "WORKING" => "🔵",  // Blue circle for working
                "ERROR" => "🔴",    // Red circle for error
                "IDLE" => "⚫",     // Black circle for idle
                _ => "⚪"           // White circle for unknown
            };
            
            let menu_text = format!("{} {} - {} - {}", status_icon, project_name, task.agent, task.state);
            menu_builder = menu_builder.item(
                &MenuItemBuilder::new(&menu_text)
                    .id(format!("session_{task_id}"))
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
            &MenuItemBuilder::new("Show Tallr")
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
            let task_id = id.strip_prefix("session_").expect("ID should have session_ prefix");
            
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
    let states: Vec<&str> = state.tasks.values()
        .filter(|t| t.state != "DONE")  // Filter out DONE tasks
        .map(|t| t.state.as_str())
        .collect();
    
    if states.contains(&"PENDING") {
        "pending"
    } else if states.contains(&"ERROR") {
        "error"
    } else if states.contains(&"WORKING") {
        "working"
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
            
            // Initialize logging
            if let Err(e) = setup_logging() {
                eprintln!("Failed to setup logging: {e}");
            }
            
            info!("Tallr application starting up");
            
            // Load persisted state on startup (with robust error handling)
            match load_app_state() {
                Ok(loaded_state) => {
                    info!("Loaded app state with {} projects and {} tasks", 
                          loaded_state.projects.len(), loaded_state.tasks.len());
                    
                    // Clean up done sessions before setting the state
                    let cleaned_state = cleanup_done_sessions(loaded_state);
                    
                    // Save the cleaned state back to disk to persist the cleanup
                    *APP_STATE.lock() = cleaned_state.clone();
                    if let Err(e) = save_app_state() {
                        error!("Failed to save cleaned app state: {e}");
                    }
                    
                },
                Err(e) => {
                    warn!("Failed to load app state, starting with empty state: {e}");
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
            load_settings,
            send_notification,
            get_auth_token,
            get_cli_connectivity,
            write_frontend_log,
            frontend_update_task_state,
            frontend_mark_task_done,
            frontend_delete_task,
            frontend_toggle_task_pin,
            frontend_get_debug_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn start_http_server(app_handle: AppHandle) {
    // Allow port configuration via environment variable, use 4317 for both dev/prod
    let default_port = "4317"; // Both dev and prod use 4317
    
    let mut port = std::env::var("TALLR_PORT").unwrap_or_else(|_| default_port.to_string());
    let mut addr = format!("127.0.0.1:{}", port);
    info!("Starting HTTP server on {} ({})", addr, if cfg!(debug_assertions) { "dev" } else { "prod" });
    
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
        .route("/v1/health", get(health_check))
        .route("/v1/debug/patterns", get(get_debug_patterns))
        .route("/v1/debug/patterns/{task_id}", get(get_debug_patterns_for_task))
        .route("/v1/debug/update", post(update_debug_data))
        .layer(
            CorsLayer::new()
                .allow_origin("tauri://localhost".parse::<HeaderValue>().expect("Valid tauri origin header"))
                .allow_origin("http://127.0.0.1:1420".parse::<HeaderValue>().expect("Valid localhost origin header"))
                .allow_origin("http://localhost:1420".parse::<HeaderValue>().expect("Valid localhost origin header"))
                .allow_methods([Method::GET, Method::POST])
                .allow_headers([CONTENT_TYPE, AUTHORIZATION])
        )
        .with_state(app_handle);

    // Try to bind to the configured port, with fallback ports if needed
    let original_port = port.clone();
    let mut attempts = 0;
    let max_attempts = 5;
    
    loop {
        match TcpListener::bind(&addr).await {
            Ok(listener) => {
                if port != original_port {
                    warn!("Original port {} was busy, using port {} instead", original_port, port);
                }
                info!("HTTP server listening on {}", addr);
                
                if let Err(e) = axum::serve(listener, app).await {
                    error!("HTTP server error: {e}");
                }
                break;
            }
            Err(e) => {
                attempts += 1;
                
                if attempts >= max_attempts {
                    error!("Failed to start HTTP server after {} attempts. Last error: {}", max_attempts, e);
                    error!("Please ensure no other instances of Tallr are running or try setting TALLR_PORT environment variable to a different port.");
                    break;
                }
                
                // If address is in use, try next port
                if e.kind() == std::io::ErrorKind::AddrInUse {
                    let current_port: u16 = port.parse().unwrap_or(4317);
                    let next_port = current_port + attempts;
                    port = next_port.to_string();
                    addr = format!("127.0.0.1:{}", port);
                    
                    warn!("Port {} is in use, trying port {} (attempt {}/{})", current_port, next_port, attempts, max_attempts);
                    
                    // Small delay before retry
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                } else {
                    error!("Failed to bind HTTP server to {}: {e}", addr);
                    break;
                }
            }
        }
    }
}
