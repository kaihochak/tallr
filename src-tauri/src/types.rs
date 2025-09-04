use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// Input types for API requests
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectIn {
    pub name: String,
    pub repo_path: String,
    pub preferred_ide: Option<String>,
    pub github_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskIn {
    pub id: String,
    pub agent: String,
    pub title: String,
    pub state: String,
    pub details: Option<String>,
    pub source: Option<String>,
}

// Core domain types
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppState {
    pub projects: HashMap<String, Project>,
    pub tasks: HashMap<String, Task>,
    pub debug_data: HashMap<String, DebugData>,
    pub updated_at: i64,
    pub last_cli_ping: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub repo_path: String,
    pub preferred_ide: String,
    pub github_url: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub project_id: String,
    pub agent: String,
    pub title: String,
    pub state: String,
    pub details: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub pinned: bool,
    pub detection_method: Option<String>,
    pub confidence: Option<f64>,
    pub network_context: Option<NetworkContext>,
    pub session_context: Option<SessionContext>,
}

// Enhanced state context types
// Based on @happy-coder's rich state context approach
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkContext {
    pub active_requests: u32,
    pub average_response_time: u32,
    pub thinking_duration: Option<u64>,
    pub last_activity: Option<i64>,
    pub request_types: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionContext {
    pub session_id: Option<String>,
    pub message_count: Option<u32>,
    pub last_message: Option<SessionMessage>,
    pub waiting_time: Option<u64>,
    pub conversation_length: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMessage {
    pub message_type: String,
    pub timestamp: String,
    pub preview: String,
}

// Request/Response types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertRequest {
    pub project: ProjectIn,
    pub task: TaskIn,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StateUpdateRequest {
    pub task_id: String,
    pub state: String,
    pub details: Option<String>,
    pub detection_method: Option<String>,
    pub source: Option<String>,
}

// Enhanced state update request with rich context
// Based on @happy-coder's network interception approach
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnhancedStateUpdateRequest {
    pub task_id: String,
    pub state: String,
    pub context: EnhancedStateContext,
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnhancedStateContext {
    pub network: Option<NetworkContext>,
    pub session: Option<SessionContext>,
    pub detection_method: String,
    pub confidence: f64,
    pub timestamp: i64,
    pub raw_data: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetailsUpdateRequest {
    pub task_id: String,
    pub details: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskDoneRequest {
    pub task_id: String,
    pub details: Option<String>,
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskDeleteRequest {
    pub task_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskPinRequest {
    pub task_id: String,
    pub pinned: bool,
}

// Setup and status types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupStatus {
    pub is_first_launch: bool,
    pub cli_installed: bool,
    pub setup_completed: bool,
}

// Debug types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugData {
    pub cleaned_buffer: String,
    pub current_state: String,
    pub detection_history: Vec<DetectionHistoryEntry>,
    pub task_id: String,
    pub pattern_tests: Option<serde_json::Value>,
    pub confidence: Option<String>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectionHistoryEntry {
    pub timestamp: i64,
    pub from: String,
    pub to: String,
    pub details: String,
    pub confidence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugUpdateRequest {
    pub debug_data: DebugData,
}

// Settings types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub always_on_top: bool,
    pub visible_on_all_workspaces: bool,
    pub window_position: Option<WindowPosition>,
    pub preferred_ide: String,
    pub theme: String,
    pub notifications_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowPosition {
    pub x: i32,
    pub y: i32,
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