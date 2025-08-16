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
use tauri::{AppHandle, Emitter, Manager, menu::{MenuBuilder, MenuItemBuilder}, tray::{TrayIconBuilder, TrayIconEvent}};
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
                preferred_ide: req.project.preferred_ide.unwrap_or_else(|| {
                    println!("No IDE preference provided, using empty string");
                    "".to_string()
                }),
                github_url: req.project.github_url,
                created_at: now,
                updated_at: now,
            };
            state.projects.insert(new_id.clone(), project);
            new_id
        });

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
    
    // Update tray menu
    drop(state); // Release the lock before calling update_tray_menu
    update_tray_menu(&app_handle);

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
        
        // Update tray menu
        drop(state); // Release the lock before calling update_tray_menu
        update_tray_menu(&app_handle);

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
                Err(e) => {
                    // If the IDE command fails, try alternative approaches
                    println!("IDE command '{}' failed: {}", command, e);
                    
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

// Store tray icon globally so we can update it
static TRAY_ICON: Lazy<Arc<Mutex<Option<tauri::tray::TrayIcon<tauri::Wry>>>>> = 
    Lazy::new(|| Arc::new(Mutex::new(None)));

fn setup_tray_icon(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle().clone();
    
    // Build initial tray menu
    let tray_menu = build_tray_menu(&app_handle)?;
    
    // Create tray icon
    let tray = TrayIconBuilder::new()
        .menu(&tray_menu)
        .icon(app.default_window_icon().unwrap().clone())
        .on_tray_icon_event(move |tray, event| {
            let app_handle = tray.app_handle();
            match event {
                TrayIconEvent::Click { button, .. } => {
                    if button == tauri::tray::MouseButton::Left {
                        handle_tray_left_click(&app_handle);
                    }
                }
                TrayIconEvent::DoubleClick { .. } => {
                    handle_tray_left_click(&app_handle);
                }
                _ => {}
            }
        })
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
            &MenuItemBuilder::new("Show Tally")
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

fn handle_tray_left_click(app_handle: &AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
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

// Function to get icon path based on state
fn get_tray_icon_path(state: &str) -> &'static str {
    match state {
        "pending" => "icons/32x32.png", // TODO: Replace with amber icon
        "error" => "icons/32x32.png",   // TODO: Replace with red icon  
        "working" => "icons/32x32.png", // TODO: Replace with green icon
        _ => "icons/32x32.png",         // Default gray icon
    }
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
        let icon_path = get_tray_icon_path(aggregate_state);
        
        // Note: For now using the same icon, but this is where we'd load different colored icons
        // When colored icons are available, replace with:
        // if let Ok(icon) = tauri::image::Image::from_path(icon_path) {
        //     let _ = tray.set_icon(Some(icon));
        // }
        
        // For development/testing, we could log the state change
        if aggregate_state != "idle" {
            println!("Tray icon should be {} (using {})", aggregate_state, icon_path);
        }
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
        .route("/v1/tasks/done", post(mark_task_done))
        .route("/v1/setup/status", get(get_setup_status))
        .layer(CorsLayer::permissive())
        .with_state(app_handle);

    let listener = TcpListener::bind("127.0.0.1:4317").await.unwrap();
    println!("Tally gateway listening on http://127.0.0.1:4317");
    
    axum::serve(listener, app).await.unwrap();
}
