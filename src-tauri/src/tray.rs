use std::sync::Arc;
use parking_lot::Mutex;
use once_cell::sync::Lazy;
use tauri::{AppHandle, Manager, menu::{MenuBuilder, MenuItemBuilder}, tray::TrayIconBuilder};
use image::GenericImageView;
use crate::constants::*;
use crate::state::{APP_STATE, get_aggregate_state};
use crate::commands::open_ide_and_terminal;

// Store tray icon globally so we can update it
static TRAY_ICON: Lazy<Arc<Mutex<Option<tauri::tray::TrayIcon<tauri::Wry>>>>> = 
    Lazy::new(|| Arc::new(Mutex::new(None)));

pub fn setup_tray_icon(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
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
            let Some(task_id) = id.strip_prefix("session_") else {
                log::error!("Invalid session ID format: {id}");
                return;
            };
            
            let state = APP_STATE.lock();
            if let Some(task) = state.tasks.get(task_id) {
                if let Some(project) = state.projects.get(&task.project_id) {
                    // Use existing open_ide_and_terminal logic
                    let project_path = project.repo_path.clone();
                    let preferred_ide = Some(project.preferred_ide.clone());
                    let project_name = project.name.clone();
                    
                    // Spawn the IDE opening in a separate task with proper error handling
                    let app_handle_clone = app_handle.clone();
                    let app_handle_for_notification = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        match open_ide_and_terminal(app_handle_clone, project_path, preferred_ide).await {
                            Ok(()) => {
                                log::info!("Successfully opened IDE for project: {project_name}");
                            }
                            Err(e) => {
                                log::error!("Failed to open IDE for project '{project_name}': {e}");
                                
                                // Show system notification about the failure
                                let notification_title = "Failed to Open IDE".to_string();
                                let notification_body = format!("Could not open IDE for project '{project_name}': {e}");
                                
                                tauri::async_runtime::spawn(async move {
                                    if let Err(notify_error) = crate::commands::send_notification(
                                        app_handle_for_notification, 
                                        notification_title, 
                                        notification_body
                                    ).await {
                                        log::warn!("Failed to show failure notification: {notify_error}");
                                    }
                                });
                            }
                        }
                    });
                }
            }
        }
        _ => {}
    }
}

// Function to load tray icon based on state
fn load_tray_icon(state: &str) -> tauri::image::Image<'static> {
    let icon_bytes = match state {
        "PENDING" => TRAY_ICON_PENDING,
        "ERROR" => TRAY_ICON_ERROR,
        "WORKING" => TRAY_ICON_WORKING,
        _ => TRAY_ICON_DEFAULT,
    };
    
    // Create image from bytes, with fallback to default icon
    let image = match image::load_from_memory(icon_bytes) {
        Ok(img) => img,
        Err(e) => {
            log::error!("Failed to load {state} tray icon: {e}, falling back to default");
            image::load_from_memory(TRAY_ICON_DEFAULT)
                .unwrap_or_else(|fallback_err| {
                    log::error!("Failed to load default tray icon: {fallback_err}");
                    // Create a minimal 16x16 black image as last resort
                    image::DynamicImage::new_rgba8(16, 16)
                })
        }
    };
    
    let rgba = image.to_rgba8();
    let (width, height) = image.dimensions();
    
    tauri::image::Image::new_owned(rgba.into_raw(), width, height)
}

// Function to update tray menu and icon when app state changes
pub fn update_tray_menu(app_handle: &AppHandle) {
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