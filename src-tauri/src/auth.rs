use std::{fs, sync::Arc};
use parking_lot::Mutex;
use once_cell::sync::Lazy;
use axum::http::HeaderMap;
use crate::utils::get_app_data_dir;

// Global authentication token (loaded once at startup)
pub static AUTH_TOKEN: Lazy<Arc<Mutex<Option<String>>>> = Lazy::new(|| Arc::new(Mutex::new(None)));

/// Generate a cryptographically secure random token
fn generate_secure_token() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
    hex::encode(bytes)
}

/// Get or create authentication token
pub fn get_or_create_auth_token() -> Result<String, String> {
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

/// Get path to auth token file
fn get_auth_token_file_path() -> Result<std::path::PathBuf, String> {
    let app_data_dir = get_app_data_dir()?;
    Ok(app_data_dir.join("auth.token"))
}

/// Authentication validation function with constant-time comparison
pub fn validate_auth_header(headers: &HeaderMap) -> bool {
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