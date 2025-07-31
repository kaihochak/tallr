#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use axum::{routing::post, Json, Router};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, net::SocketAddr, path::PathBuf, sync::Arc, time::SystemTime};
use tauri::{AppHandle, CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, State as TauriState};

static APP_STATE: Lazy<Arc<Mutex<State>>> = Lazy::new(|| Arc::new(Mutex::new(State::default())));

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
struct State {
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
    last_event_at: i64,
    created_at: i64,
    updated_at: i64,
    snoozed_until: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
struct UpsertReq {
    project: ProjectIn,
    task: TaskIn,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StateReq {
    task_id: String,
    state: Option<String>,
    details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotResponse {
    projects: Vec<Project>,
    tasks: Vec<Task>,
    updated_at: i64,
}

#[tauri::command]
fn get_snapshot() -> SnapshotResponse {
    let state = APP_STATE.lock();
    SnapshotResponse {
        projects: state.projects.values().cloned().collect(),
        tasks: state.tasks.values().cloned().collect(),
        updated_at: state.updated_at,
    }
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

fn data_dir(app: &AppHandle) -> PathBuf {
    app.path_resolver().app_data_dir().expect("app data dir")
}

fn persist_snapshot(app: &AppHandle) {
    let state = APP_STATE.lock().clone();
    let dir = data_dir(app);
    let _ = fs::create_dir_all(&dir);
    let path = dir.join("snapshot.json");
    if let Ok(json) = serde_json::to_string_pretty(&state) {
        let _ = fs::write(path, json);
    }
    let _ = fs::write("snapshot.json", serde_json::to_string_pretty(&state).unwrap_or_default());
    
    // Emit state update event
    let snapshot = SnapshotResponse {
        projects: state.projects.values().cloned().collect(),
        tasks: state.tasks.values().cloned().collect(),
        updated_at: state.updated_at,
    };
    app.emit_all("state-update", &snapshot).ok();
}

async fn start_gateway(app: AppHandle, addr: SocketAddr, token: Option<String>) {
    use axum::http::{HeaderMap, StatusCode};

    async fn auth(headers: &HeaderMap, token: &Option<String>) -> Result<(), StatusCode> {
        if let Some(t) = token {
            if let Some(val) = headers.get("authorization") {
                let s = val.to_str().unwrap_or_default();
                if s == format!("Bearer {}", t) {
                    return Ok(());
                }
            }
            return Err(StatusCode::UNAUTHORIZED);
        }
        Ok(())
    }

    let app_handle = app.clone();
    let upsert = move |headers: HeaderMap, Json(payload): Json<UpsertReq>| {
        let app = app_handle.clone();
        let token = token.clone();
        async move {
            auth(&headers, &token)?;
            let mut st = APP_STATE.lock();
            let pid = format!("{}|{}", payload.project.name, payload.project.repo_path);
            let ts = now();
            let project = st.projects.entry(pid.clone()).or_insert_with(|| Project {
                id: pid.clone(),
                name: payload.project.name.clone(),
                repo_path: payload.project.repo_path.clone(),
                preferred_ide: payload.project.preferred_ide.clone().unwrap_or_else(|| "cursor".into()),
                github_url: payload.project.github_url.clone(),
                created_at: ts,
                updated_at: ts,
            });
            project.updated_at = ts;

            let t = st.tasks.entry(payload.task.id.clone()).or_insert_with(|| Task {
                id: payload.task.id.clone(),
                project_id: pid.clone(),
                agent: payload.task.agent.clone(),
                title: payload.task.title.clone(),
                state: payload.task.state.clone(),
                details: payload.task.details.clone(),
                last_event_at: ts,
                created_at: ts,
                updated_at: ts,
                snoozed_until: None,
            });
            t.state = payload.task.state;
            t.details = payload.task.details;
            t.title = payload.task.title;
            t.agent = t.agent.clone();
            t.last_event_at = ts;
            t.updated_at = ts;
            st.updated_at = ts;
            
            // Check if notification needed
            let should_notify = payload.task.state == "WAITING_USER" || payload.task.state == "ERROR";
            drop(st);
            persist_snapshot(&app);
            
            // Send desktop notification if needed
            if should_notify {
                let msg = format!("{} - {}", payload.task.title, payload.task.details.as_ref().unwrap_or(&payload.task.state));
                app.notification()
                    .title(&payload.project.name)
                    .body(&msg)
                    .show()
                    .ok();
            }
            
            Ok::<_, StatusCode>((StatusCode::OK, Json(serde_json::json!({"ok": true}))))
        }
    };

    let app_handle = app.clone();
    let state_route = move |headers: HeaderMap, Json(payload): Json<StateReq>| {
        let app = app_handle.clone();
        let token = token.clone();
        async move {
            auth(&headers, &token)?;
            let mut st = APP_STATE.lock();
            if let Some(t) = st.tasks.get_mut(&payload.task_id) {
                let ts = now();
                if let Some(s) = payload.state.clone() { t.state = s; }
                if let Some(d) = payload.details.clone() { t.details = Some(d); }
                t.last_event_at = ts;
                t.updated_at = ts;
                st.updated_at = ts;
            } else {
                return Err(StatusCode::NOT_FOUND);
            }
            
            // Check if notification needed
            let should_notify = payload.state.as_ref().map(|s| s == "WAITING_USER" || s == "ERROR").unwrap_or(false);
            let task_title = st.tasks.get(&payload.task_id).map(|t| t.title.clone()).unwrap_or_default();
            let project_name = st.tasks.get(&payload.task_id)
                .and_then(|t| st.projects.get(&t.project_id))
                .map(|p| p.name.clone())
                .unwrap_or_default();
            
            drop(st);
            persist_snapshot(&app);
            
            // Send desktop notification if needed
            if should_notify {
                let msg = format!("{} - {}", task_title, payload.details.as_ref().unwrap_or(&payload.state.unwrap_or_default()));
                app.notification()
                    .title(&project_name)
                    .body(&msg)
                    .show()
                    .ok();
            }
            
            Ok::<_, StatusCode>((StatusCode::OK, Json(serde_json::json!({"ok": true}))))
        }
    };

    let app_handle = app.clone();
    let done_route = move |headers: HeaderMap, Json(payload): Json<StateReq>| {
        let app = app_handle.clone();
        let token = token.clone();
        async move {
            auth(&headers, &token)?;
            let mut st = APP_STATE.lock();
            if let Some(t) = st.tasks.get_mut(&payload.task_id) {
                let ts = now();
                t.details = payload.details.clone();
                t.state = "DONE".into();
                t.last_event_at = ts;
                t.updated_at = ts;
                st.updated_at = ts;
            } else {
                return Err(StatusCode::NOT_FOUND);
            }
            drop(st);
            persist_snapshot(&app);
            Ok::<_, StatusCode>((StatusCode::OK, Json(serde_json::json!({"ok": true}))))
        }
    };

    let router = Router::new()
        .route("/v1/tasks/upsert", post(upsert))
        .route("/v1/tasks/state", post(state_route))
        .route("/v1/tasks/done", post(done_route));

    let server = axum::Server::bind(&addr).serve(router.into_make_service());
    println!("Tally gateway listening on http://{}", addr);
    let _ = server.await;
}

fn build_tray() -> SystemTray {
    let open = CustomMenuItem::new("open", "Open Window");
    let quit = CustomMenuItem::new("quit", "Quit");
    let menu = SystemTrayMenu::new().add_item(open).add_item(quit);
    SystemTray::new().with_menu(menu)
}

fn tray_handler(app: &AppHandle, event: SystemTrayEvent) {
    match event {
        SystemTrayEvent::MenuItemClick { id, .. } => {
            if id.as_str() == "quit" {
                std::process::exit(0);
            } else if id.as_str() == "open" {
                if let Some(w) = app.get_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        }
        SystemTrayEvent::LeftClick { .. } => {
            if let Some(w) = app.get_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
        _ => {}
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let token = std::env::var("TALLY_TOKEN").ok().or_else(|| std::env::var("SWITCHBOARD_TOKEN").ok());
            let handle = app.handle();
            tauri::async_runtime::spawn(start_gateway(handle.clone(), "127.0.0.1:4317".parse().unwrap(), token));
            persist_snapshot(&handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_snapshot])
        .system_tray(build_tray())
        .on_system_tray_event(|app, e| tray_handler(app, e))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
