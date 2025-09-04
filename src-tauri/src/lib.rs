mod auth;
mod commands;
mod constants;
mod handlers;
mod state;
mod toolbar;
mod tray;
mod types;
mod utils;

use commands::*;
use handlers::*;
use log::{error, info, warn};
use state::initialize_app_state;
use tauri::Manager;
use toolbar::{setup_unified_toolbar, toolbar_action};
use tray::setup_tray_icon;
use utils::*;

// HTTP server function
async fn start_http_server(app_handle: tauri::AppHandle) {
    use axum::Router;
    use tokio::net::TcpListener;

    // No CORS configuration necessary: only non-browser clients (Node CLI) call this server.
    // let cors = CorsLayer::new()
    //     .allow_origin(tower_http::cors::Any)
    //     .allow_methods([axum::http::Method::GET, axum::http::Method::POST])
    //     .allow_headers([
    //         axum::http::header::CONTENT_TYPE,
    //         axum::http::header::AUTHORIZATION,
    //     ]);

    let app = Router::new()
        .route("/v1/state", axum::routing::get(get_state))
        .route("/v1/tasks/upsert", axum::routing::post(upsert_task))
        .route("/v1/tasks/state", axum::routing::post(update_task_state))
        .route(
            "/v1/tasks/details",
            axum::routing::post(update_task_details),
        )
        .route("/v1/tasks/done", axum::routing::post(mark_task_done))
        .route("/v1/tasks/delete", axum::routing::post(delete_task))
        .route("/v1/tasks/pin", axum::routing::post(pin_task))
        .route("/v1/setup/status", axum::routing::get(get_setup_status))
        .route("/v1/health", axum::routing::get(health_check))
        .route("/v1/debug/patterns", axum::routing::get(get_debug_patterns))
        .route(
            "/v1/debug/patterns/{task_id}",
            axum::routing::get(get_debug_patterns_for_task),
        )
        .route("/v1/debug/update", axum::routing::post(update_debug_data))
        .with_state(app_handle);

    let listener = match TcpListener::bind("127.0.0.1:4317").await {
        Ok(listener) => {
            info!("HTTP server starting on 127.0.0.1:4317");
            listener
        }
        Err(e) => {
            error!("Failed to bind HTTP server: {e}");
            return;
        }
    };

    if let Err(e) = axum::serve(listener, app).await {
        error!("HTTP server error: {e}");
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

            // Initialize app state from disk
            if let Err(e) = initialize_app_state() {
                warn!("Failed to initialize app state: {e}");
            }

            // Initialize auth token on startup to ensure CLI can connect
            match auth::get_or_create_auth_token() {
                Ok(_) => info!("Auth token initialized successfully"),
                Err(e) => warn!("Failed to initialize auth token: {e}")
            }

            // Initialize tray icon with menu
            setup_tray_icon(app)?;

            // Setup unified toolbar for main window
            if let Some(window) = app.get_webview_window("main") {
                if let Err(e) = setup_unified_toolbar(&window) {
                    warn!("Failed to setup unified toolbar: {e}");
                }
            }

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
            frontend_get_debug_data,
            toolbar_action
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
