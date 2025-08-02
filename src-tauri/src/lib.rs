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
use std::{collections::HashMap, sync::Arc, time::SystemTime};
use tauri::{AppHandle, Emitter};
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

    // Send notification for WAITING_USER state
    if req.task.state == "WAITING_USER" {
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

        // Send notification for WAITING_USER state
        if req.state == "WAITING_USER" {
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
            get_tasks
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
        .layer(CorsLayer::permissive())
        .with_state(app_handle);

    let listener = TcpListener::bind("127.0.0.1:4317").await.unwrap();
    println!("Tally gateway listening on http://127.0.0.1:4317");
    
    axum::serve(listener, app).await.unwrap();
}
