use axum::{
    extract::State as AxumState,
    http::{StatusCode, HeaderMap},
    response::Json,
};
use log::{debug, info, warn, error};
use tauri::{AppHandle, Emitter};
use crate::types::*;
use crate::auth::validate_auth_header;
use crate::state::{APP_STATE, save_app_state};
use crate::utils::current_timestamp;

/// GET /v1/state - Return current application state
pub async fn get_state(headers: HeaderMap) -> Result<Json<AppState>, StatusCode> {
    // Validate authentication
    if !validate_auth_header(&headers) {
        warn!("Unauthorized access attempt to /v1/state");
        return Err(StatusCode::UNAUTHORIZED);
    }
    debug!("Returning app state");
    let state = APP_STATE.lock().clone();
    Ok(Json(state))
}

/// POST /v1/tasks/upsert - Create or update task and project
pub async fn upsert_task(
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
        detection_method: None, // Initial task creation - no detection method yet
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
            "body": req.task.state
        });
        let _ = app_handle.emit("show-notification", &notification_data);
    }
    
    // Update tray menu
    drop(state); // Release the lock before calling update_tray_menu
    crate::tray::update_tray_menu(&app_handle);

    // Save state to disk
    if let Err(e) = save_app_state() {
        error!("Failed to save app state: {e}");
    }

    Ok(Json(()))
}

/// Check if hooks are configured by looking for .claude/settings.local.json
fn has_claude_code_hooks(repo_path: &str) -> bool {
    let claude_settings_path = std::path::Path::new(repo_path).join(".claude").join("settings.local.json");
    claude_settings_path.exists()
}

/// POST /v1/tasks/state - Update task state
pub async fn update_task_state(
    headers: HeaderMap,
    AxumState(app_handle): AxumState<AppHandle>,
    Json(req): Json<StateUpdateRequest>,
) -> Result<Json<()>, StatusCode> {
    // Validate authentication
    if !validate_auth_header(&headers) {
        warn!("Unauthorized access attempt to /v1/tasks/state");
        return Err(StatusCode::UNAUTHORIZED);
    }
    let mut state = APP_STATE.lock();
    
    // Check if task exists and collect needed data
    let (project_name, agent_name, repo_path) = if let Some(task) = state.tasks.get(&req.task_id) {
        if let Some(project) = state.projects.get(&task.project_id) {
            (project.name.clone(), task.agent.clone(), project.repo_path.clone())
        } else {
            warn!("Project not found for task {}", req.task_id);
            ("Unknown".to_string(), "Unknown".to_string(), String::new())
        }
    } else {
        warn!("Task not found for state update: {}", req.task_id);
        return Err(StatusCode::NOT_FOUND);
    };

    // Determine detection method based on source and hook configuration
    let _hooks_configured = has_claude_code_hooks(&repo_path);
    
    let detection_method = if let Some(ref source) = req.source {
        match source.as_str() {
            "hook" => "hooks".to_string(),
            "wrapper" => "patterns".to_string(),
            _ => req.detection_method.clone().unwrap_or_else(|| "unknown".to_string())
        }
    } else {
        req.detection_method.clone().unwrap_or_else(|| "unknown".to_string())
    };

    // Log detection method
    info!("State update for task {} using {} detection (source: {}): {} -> {}", 
          req.task_id, detection_method, 
          req.source.as_deref().unwrap_or("none"),
          req.state, 
          req.details.as_deref().unwrap_or("no details"));

    // Update the task state
    if let Some(task) = state.tasks.get_mut(&req.task_id) {
        task.state = req.state.clone();
        task.details = req.details.clone();
        task.detection_method = Some(detection_method);
        task.updated_at = current_timestamp();
        state.updated_at = current_timestamp();

        // Emit event to frontend
        let _ = app_handle.emit("tasks-updated", &state.clone());

        // Send notification only for PENDING and ERROR states
        if req.state == "PENDING" || req.state == "ERROR" {
            let notification_data = serde_json::json!({
                "title": format!("{} - {}", project_name, agent_name),
                "body": req.state
            });
            let _ = app_handle.emit("show-notification", &notification_data);
        }
    }
    
    // Update tray menu
    drop(state); // Release the lock before calling update_tray_menu
    crate::tray::update_tray_menu(&app_handle);

    // Save state to disk
    if let Err(e) = save_app_state() {
        error!("Failed to save app state: {e}");
    }

    Ok(Json(()))
}

/// POST /v1/tasks/state-enhanced - Update task state with enhanced context
/// Based on @happy-coder's network interception approach with rich state context
pub async fn update_task_state_enhanced(
    headers: HeaderMap,
    AxumState(app_handle): AxumState<AppHandle>,
    Json(req): Json<EnhancedStateUpdateRequest>,
) -> Result<Json<()>, StatusCode> {
    // Validate authentication
    if !validate_auth_header(&headers) {
        warn!("Unauthorized access attempt to /v1/tasks/state-enhanced");
        return Err(StatusCode::UNAUTHORIZED);
    }
    
    let mut state = APP_STATE.lock();
    
    // Check if task exists and collect needed data
    let (project_name, agent_name, repo_path) = if let Some(task) = state.tasks.get(&req.task_id) {
        if let Some(project) = state.projects.get(&task.project_id) {
            (project.name.clone(), task.agent.clone(), project.repo_path.clone())
        } else {
            warn!("Project not found for task {}", req.task_id);
            ("Unknown".to_string(), "Unknown".to_string(), String::new())
        }
    } else {
        warn!("Task not found for enhanced state update: {}", req.task_id);
        return Err(StatusCode::NOT_FOUND);
    };

    // Log enhanced state update with confidence and detection method
    info!("Enhanced state update for task {} using {} detection (confidence: {:.2}): {} with context", 
          req.task_id, 
          req.context.detection_method, 
          req.context.confidence,
          req.state);

    // Update the task with enhanced context
    if let Some(task) = state.tasks.get_mut(&req.task_id) {
        task.state = req.state.clone();
        task.detection_method = Some(req.context.detection_method.clone());
        task.confidence = Some(req.context.confidence);
        task.network_context = req.context.network.clone();
        task.session_context = req.context.session.clone();
        task.updated_at = current_timestamp();
        
        // Generate enhanced details from context
        let enhanced_details = generate_enhanced_details(&req.context);
        task.details = Some(enhanced_details);
        
        state.updated_at = current_timestamp();

        // Emit event to frontend with enhanced data
        let _ = app_handle.emit("tasks-updated", &state.clone());

        // Enhanced notification logic based on confidence and context
        let should_notify = should_send_enhanced_notification(&req.state, &req.context, &task.state);
        
        if should_notify {
            let notification_data = create_enhanced_notification(
                &project_name, 
                &agent_name, 
                &req.state, 
                &req.context
            );
            let _ = app_handle.emit("show-notification", &notification_data);
        }
    }
    
    // Update tray menu
    drop(state);
    crate::tray::update_tray_menu(&app_handle);

    // Save state to disk
    if let Err(e) = save_app_state() {
        error!("Failed to save app state: {e}");
    }

    Ok(Json(()))
}

/// Generate enhanced details from context
/// Incorporates @happy-coder's rich state information
fn generate_enhanced_details(context: &EnhancedStateContext) -> String {
    let mut details = vec![
        format!("Detection: {} (confidence: {:.1}%)", 
               context.detection_method, context.confidence * 100.0)
    ];
    
    // Add network context details
    if let Some(ref network) = context.network {
        if network.active_requests > 0 {
            details.push(format!("Active requests: {}", network.active_requests));
        }
        if network.average_response_time > 0 {
            details.push(format!("Avg response: {}ms", network.average_response_time));
        }
        if let Some(thinking_duration) = network.thinking_duration {
            if thinking_duration > 0 {
                details.push(format!("Thinking: {}s", thinking_duration / 1000));
            }
        }
    }
    
    // Add session context details
    if let Some(ref session) = context.session {
        if let Some(count) = session.message_count {
            details.push(format!("Messages: {}", count));
        }
        if let Some(ref last_msg) = session.last_message {
            details.push(format!("Last: {}", last_msg.preview));
        }
    }
    
    details.join(" | ")
}

/// Determine if notification should be sent based on enhanced context
/// Implements confidence-based notification logic
fn should_send_enhanced_notification(state: &str, context: &EnhancedStateContext, _prev_state: &str) -> bool {
    // Only notify for PENDING and ERROR states
    if state != "PENDING" && state != "ERROR" {
        return false;
    }
    
    // High confidence threshold for notifications to reduce false positives
    // Based on @happy-coder's approach: network detection has high confidence
    let confidence_threshold = match context.detection_method.as_str() {
        "network" => 0.8,      // High threshold for network detection
        "session-file" => 0.85, // Very high threshold for session files
        "pattern" => 0.7,       // Lower threshold for pattern detection (legacy)
        _ => 0.75               // Default threshold
    };
    
    context.confidence >= confidence_threshold
}

/// Create enhanced notification with context information
fn create_enhanced_notification(
    project_name: &str, 
    agent_name: &str, 
    state: &str, 
    context: &EnhancedStateContext
) -> serde_json::Value {
    let mut title = format!("{} - {}", project_name, agent_name);
    let mut body = state.to_string();
    
    // Add thinking duration for WORKING -> PENDING transitions
    if state == "PENDING" {
        if let Some(ref network) = context.network {
            if let Some(thinking_duration) = network.thinking_duration {
                if thinking_duration > 0 {
                    body = format!("{} (after {}s thinking)", body, thinking_duration / 1000);
                }
            }
        }
        
        // Add session context for better user understanding
        if let Some(ref session) = context.session {
            if let Some(ref last_msg) = session.last_message {
                // Truncate preview for notification
                let preview = if last_msg.preview.len() > 50 {
                    format!("{}...", &last_msg.preview[..47])
                } else {
                    last_msg.preview.clone()
                };
                body = format!("{}: {}", body, preview);
            }
        }
    }
    
    // Add confidence indicator for debugging (in development)
    if std::env::var("DEBUG").is_ok() {
        title = format!("{} ({:.0}%)", title, context.confidence * 100.0);
    }
    
    serde_json::json!({
        "title": title,
        "body": body,
        "confidence": context.confidence,
        "detection_method": context.detection_method
    })
}

/// POST /v1/tasks/details - Update task details
pub async fn update_task_details(
    headers: HeaderMap,
    AxumState(app_handle): AxumState<AppHandle>,
    Json(req): Json<DetailsUpdateRequest>,
) -> Result<Json<()>, StatusCode> {
    // Validate authentication
    if !validate_auth_header(&headers) {
        warn!("Unauthorized access attempt to /v1/tasks/details");
        return Err(StatusCode::UNAUTHORIZED);
    }
    let mut state = APP_STATE.lock();
    
    if let Some(task) = state.tasks.get_mut(&req.task_id) {
        task.details = Some(req.details);
        task.updated_at = current_timestamp();
        state.updated_at = current_timestamp();

        // Emit event to frontend
        let _ = app_handle.emit("tasks-updated", &state.clone());
        
        // Save state to disk
        drop(state); // Release the lock before calling save_app_state
        if let Err(e) = save_app_state() {
            error!("Failed to save app state: {e}");
        }
    }
    
    Ok(Json(()))
}

/// POST /v1/tasks/done - Mark task as done
pub async fn mark_task_done(
    headers: HeaderMap,
    AxumState(app_handle): AxumState<AppHandle>,
    Json(req): Json<TaskDoneRequest>,
) -> Result<Json<()>, StatusCode> {
    // Validate authentication
    if !validate_auth_header(&headers) {
        warn!("Unauthorized access attempt to /v1/tasks/done");
        return Err(StatusCode::UNAUTHORIZED);
    }
    let mut state = APP_STATE.lock();
    
    if let Some(task) = state.tasks.get_mut(&req.task_id) {
        task.state = "DONE".to_string();
        task.details = req.details;
        task.updated_at = current_timestamp();
        let task_title = task.title.clone();
        state.updated_at = current_timestamp();

        info!("Marked task as done: {} ({})", task_title, req.task_id);

        // Emit event to frontend
        let _ = app_handle.emit("tasks-updated", &state.clone());
        
        // Update tray menu
        drop(state); // Release the lock before calling update_tray_menu
        crate::tray::update_tray_menu(&app_handle);

        // Save state to disk
        if let Err(e) = save_app_state() {
            error!("Failed to save app state: {e}");
        }
    }
    
    Ok(Json(()))
}

/// DELETE /v1/tasks/:id - Delete task
pub async fn delete_task(
    headers: HeaderMap,
    AxumState(app_handle): AxumState<AppHandle>,
    Json(req): Json<TaskDeleteRequest>,
) -> Result<Json<()>, StatusCode> {
    // Validate authentication
    if !validate_auth_header(&headers) {
        warn!("Unauthorized access attempt to /v1/tasks/delete");
        return Err(StatusCode::UNAUTHORIZED);
    }
    let mut state = APP_STATE.lock();
    
    if state.tasks.remove(&req.task_id).is_some() {
        state.updated_at = current_timestamp();
        info!("Deleted task: {}", req.task_id);

        // Emit event to frontend
        let _ = app_handle.emit("tasks-updated", &state.clone());
        
        // Update tray menu
        drop(state); // Release the lock before calling update_tray_menu
        crate::tray::update_tray_menu(&app_handle);

        // Save state to disk
        if let Err(e) = save_app_state() {
            error!("Failed to save app state: {e}");
        }
    }
    
    Ok(Json(()))
}

/// POST /v1/tasks/pin - Pin/unpin task
pub async fn pin_task(
    headers: HeaderMap,
    AxumState(app_handle): AxumState<AppHandle>,
    Json(req): Json<TaskPinRequest>,
) -> Result<Json<()>, StatusCode> {
    // Validate authentication
    if !validate_auth_header(&headers) {
        warn!("Unauthorized access attempt to /v1/tasks/pin");
        return Err(StatusCode::UNAUTHORIZED);
    }
    let mut state = APP_STATE.lock();
    
    if let Some(task) = state.tasks.get_mut(&req.task_id) {
        task.pinned = req.pinned;
        task.updated_at = current_timestamp();
        let task_title = task.title.clone();
        state.updated_at = current_timestamp();

        info!("{} task: {} ({})", 
              if req.pinned { "Pinned" } else { "Unpinned" },
              task_title, req.task_id);

        // Emit event to frontend
        let _ = app_handle.emit("tasks-updated", &state.clone());
        
        // Save state to disk
        drop(state); // Release the lock before calling save_app_state
        if let Err(e) = save_app_state() {
            error!("Failed to save app state: {e}");
        }
    }
    
    Ok(Json(()))
}

/// GET /v1/setup/status - Get setup status
pub async fn get_setup_status(headers: HeaderMap) -> Result<Json<SetupStatus>, StatusCode> {
    // Validate authentication
    if !validate_auth_header(&headers) {
        warn!("Unauthorized access attempt to /v1/setup/status");
        return Err(StatusCode::UNAUTHORIZED);
    }
    
    let is_first_launch = !crate::utils::get_setup_completion_flag();
    let cli_installed = crate::utils::is_cli_installed();
    let setup_completed = crate::utils::get_setup_completion_flag();
        
    let status = SetupStatus {
        is_first_launch,
        cli_installed,      
        setup_completed,
    };
    
    Ok(Json(status))
}

/// GET /v1/health - Health check endpoint
pub async fn health_check(headers: HeaderMap) -> Result<Json<serde_json::Value>, StatusCode> {
    // Validate authentication
    if !validate_auth_header(&headers) {
        warn!("Unauthorized access attempt to /v1/health");
        return Err(StatusCode::UNAUTHORIZED);
    }
    
    // Update last CLI ping timestamp
    let current_time = current_timestamp();
    let mut state = APP_STATE.lock();
    state.last_cli_ping = Some(current_time);
    info!("Health check: Updated last_cli_ping to {current_time}");
    
    let response = serde_json::json!({
        "status": "ok",
        "timestamp": current_time,
        "tasks": state.tasks.len(),
        "projects": state.projects.len()
    });
    
    drop(state); // Release lock before saving
    
    // Save state to persist CLI ping
    if let Err(e) = save_app_state() {
        error!("Failed to save app state after health check: {e}");
    }
    
    Ok(Json(response))
}

/// GET /v1/debug/patterns/:task_id - Get debug patterns for specific task
pub async fn get_debug_patterns_for_task(
    headers: HeaderMap,
    axum::extract::Path(task_id): axum::extract::Path<String>,
) -> Result<Json<DebugData>, StatusCode> {
    // Validate authentication
    if !validate_auth_header(&headers) {
        warn!("Unauthorized access attempt to /v1/debug/patterns/{task_id}");
        return Err(StatusCode::UNAUTHORIZED);
    }
    
    debug!("Returning debug patterns for task: {task_id}");
    let state = APP_STATE.lock();
    
    match state.debug_data.get(&task_id) {
        Some(debug_data) => Ok(Json(debug_data.clone())),
        None => {
            // Return empty debug data structure
            let empty_debug = DebugData {
                cleaned_buffer: String::new(),
                current_state: "IDLE".to_string(),
                detection_history: Vec::new(),
                task_id: task_id.clone(),
                pattern_tests: None,
                confidence: None,
                is_active: None,
            };
            Ok(Json(empty_debug))
        }
    }
}

/// GET /v1/debug/patterns - Get most recent debug patterns
pub async fn get_debug_patterns(_headers: HeaderMap) -> Result<Json<DebugData>, StatusCode> {
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
        Some(debug_data) => Ok(Json(debug_data.clone())),
        None => {
            // Return empty debug data structure
            let empty_debug = DebugData {
                cleaned_buffer: String::new(),
                current_state: "IDLE".to_string(),
                detection_history: Vec::new(),
                task_id: "none".to_string(),
                pattern_tests: None,
                confidence: None,
                is_active: None,
            };
            Ok(Json(empty_debug))
        }
    }
}

/// POST /v1/debug/update - Update debug data
pub async fn update_debug_data(
    headers: HeaderMap,
    Json(req): Json<DebugUpdateRequest>,
) -> Result<Json<()>, StatusCode> {
    // Validate authentication
    if !validate_auth_header(&headers) {
        warn!("Unauthorized access attempt to /v1/debug/update");
        return Err(StatusCode::UNAUTHORIZED);
    }
    let mut state = APP_STATE.lock();
    let task_id = req.debug_data.task_id.clone();
    state.debug_data.insert(task_id, req.debug_data);
    
    // Save to disk
    drop(state); // Release lock before calling save_app_state
    if let Err(e) = save_app_state() {
        error!("Failed to save debug data: {e}");
    }
    
    Ok(Json(()))
}