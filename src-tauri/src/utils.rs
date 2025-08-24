use std::{fs, time::SystemTime, path::Path};
use log::info;
use chrono::Local;

/// Get current Unix timestamp
pub fn current_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .expect("System time should be after Unix epoch")
        .as_secs() as i64
}

/// Get application data directory for macOS
pub fn get_app_data_dir() -> Result<std::path::PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "Unable to find HOME directory")?;
    Ok(std::path::PathBuf::from(home).join("Library/Application Support/Tallr"))
}

/// Get path to sessions file
pub fn get_sessions_file_path() -> Result<std::path::PathBuf, String> {
    let app_data_dir = get_app_data_dir()?;
    Ok(app_data_dir.join("sessions.json"))
}

/// Check if CLI is installed at /usr/local/bin/tallr
pub fn is_cli_installed() -> bool {
    // Check if symlink exists at /usr/local/bin/tallr
    Path::new("/usr/local/bin/tallr").exists()
}

/// Check if setup has been completed
pub fn get_setup_completion_flag() -> bool {
    // Check if setup completion file exists
    get_app_data_dir()
        .map(|dir| dir.join(".setup_completed").exists())
        .unwrap_or(false)
}

/// Mark setup as completed by creating a flag file
pub fn mark_setup_completed() -> Result<(), String> {
    let app_data_dir = get_app_data_dir()?;
    fs::create_dir_all(&app_data_dir).map_err(|e| format!("Failed to create app data directory: {e}"))?;
    fs::write(app_data_dir.join(".setup_completed"), "").map_err(|e| format!("Failed to create setup flag: {e}"))?;
    Ok(())
}

/// Initialize logging with file rotation
pub fn setup_logging() -> Result<(), String> {
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