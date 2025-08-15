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
use tauri::{AppHandle, Emitter, Manager};
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
struct TaskDoneRequest {
    task_id: String,
    details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetupStatus {
    is_first_launch: bool,
    cli_installed: bool,
    setup_completed: bool,
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
    
    // Create or update project
    let project_id = uuid::Uuid::new_v4().to_string();
    let project = Project {
        id: project_id.clone(),
        name: req.project.name.clone(),
        repo_path: req.project.repo_path.clone(),
        preferred_ide: req.project.preferred_ide.unwrap_or_else(|| "cursor".to_string()),
        github_url: req.project.github_url,
        created_at: now,
        updated_at: now,
    };
    state.projects.insert(project_id.clone(), project);

    // Create or update task
    let task = Task {
        id: req.task.id.clone(),
        project_id,
        agent: req.task.agent.clone(),  // Clone to avoid move
        title: req.task.title,
        state: req.task.state.clone(),
        details: req.task.details.clone(),
        created_at: now,
        updated_at: now,
    };
    state.tasks.insert(req.task.id.clone(), task.clone());
    state.updated_at = now;

    // Emit event to frontend
    let _ = app_handle.emit("tasks-updated", &state.clone());

    // Send notification for PENDING state
    if req.task.state == "PENDING" {
        let notification_data = serde_json::json!({
            "title": format!("Tally - {}", req.task.agent),
            "body": req.task.details.unwrap_or_else(|| "Agent is waiting for user input".to_string())
        });
        let _ = app_handle.emit("show-notification", &notification_data);
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
                "title": format!("Tally - {}", agent),
                "body": req.details.unwrap_or_else(|| "Agent is waiting for user input".to_string())
            });
            let _ = app_handle.emit("show-notification", &notification_data);
        }

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

fn is_cli_installed() -> bool {
    // Check if symlink exists at /usr/local/bin/tally
    Path::new("/usr/local/bin/tally").exists()
}

fn get_setup_completion_flag() -> bool {
    // Check if setup completion file exists
    get_app_data_dir()
        .map(|dir| dir.join(".setup_completed").exists())
        .unwrap_or(false)
}

fn get_app_data_dir() -> Result<std::path::PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "Unable to find HOME directory")?;
    Ok(std::path::PathBuf::from(home).join("Library/Application Support/Tally"))
}

fn mark_setup_completed() -> Result<(), String> {
    let app_data_dir = get_app_data_dir()?;
    fs::create_dir_all(&app_data_dir).map_err(|e| format!("Failed to create app data directory: {}", e))?;
    fs::write(app_data_dir.join(".setup_completed"), "").map_err(|e| format!("Failed to create setup flag: {}", e))?;
    Ok(())
}

// Tauri command for opening IDE and terminal
#[tauri::command]
async fn open_ide_and_terminal(
    app: AppHandle,
    project_path: String,
    ide: Option<String>,
) -> Result<(), String> {
    let ide_cmd = ide.unwrap_or_else(|| "cursor".to_string());
    
    // Open IDE using shell plugin execute command
    app.shell()
        .command(&ide_cmd)
        .args(&["--reuse-window", &project_path])
        .spawn()
        .map_err(|e| format!("Failed to open IDE: {}", e))?;

    // Open Terminal via AppleScript (macOS)
    let script = format!(
        r#"tell application "Terminal"
            activate
            do script "cd '{}'"
        end tell"#,
        project_path
    );
    
    app.shell()
        .command("osascript")
        .args(&["-e", &script])
        .spawn()
        .map_err(|e| format!("Failed to open terminal: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn check_cli_permissions() -> Result<bool, String> {
    let bin_dir = Path::new("/usr/local/bin");
    
    // Check if directory exists and is writable
    if !bin_dir.exists() {
        return Ok(false);
    }
    
    // Try to check write permissions
    let test_file = bin_dir.join(".tally_test_write");
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
        project_dir.join("tools").join("tally")
    } else {
        // In production, use the resource directory
        let resource_path = app.path().resource_dir().map_err(|e| format!("Failed to get resource path: {}", e))?;
        resource_path.join("tally")
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
    let test_file = bin_dir.join(".tally_test_write");
    if fs::write(&test_file, "test").is_err() {
        return Err("Permission denied. Please use the manual installation method with sudo.".to_string());
    }
    let _ = fs::remove_file(&test_file);
    
    // Create symlink at /usr/local/bin/tally
    let cli_dest = bin_dir.join("tally");
    
    // Remove existing symlink if it exists
    if cli_dest.exists() {
        if let Err(e) = fs::remove_file(&cli_dest) {
            return Err(format!("Cannot remove existing CLI: {}. Please run: sudo rm /usr/local/bin/tally", e));
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
    
    println!("Successfully installed CLI from {:?} to {:?}", cli_source, cli_dest);
    
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            
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
            mark_setup_completed_cmd
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
        .route("/v1/tasks/done", post(mark_task_done))
        .route("/v1/setup/status", get(get_setup_status))
        .layer(CorsLayer::permissive())
        .with_state(app_handle);

    let listener = TcpListener::bind("127.0.0.1:4317").await.unwrap();
    println!("Tally gateway listening on http://127.0.0.1:4317");
    
    axum::serve(listener, app).await.unwrap();
}
