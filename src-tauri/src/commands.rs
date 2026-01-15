// ============================================
// Tauri Commands Module
// Exposed commands callable from the frontend
// ============================================

use keyring::Entry;
use tauri::command;

/// Service name used for all credentials
const SERVICE_NAME: &str = "teams-agent-bridge";

/// Get application information
#[command]
pub fn get_app_info() -> serde_json::Value {
    serde_json::json!({
        "name": "Teams Agent Bridge",
        "version": env!("CARGO_PKG_VERSION"),
        "description": "Modular desktop application for joining meetings with AI agents",
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH
    })
}

/// Open an external URL in the default browser
#[command]
pub fn open_external_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}

// ============================================
// Secure Credential Storage Commands
// Uses system credential manager (Windows Credential Manager,
// macOS Keychain, Linux Secret Service)
// ============================================

/// Store a credential in the system credential manager
/// 
/// # Arguments
/// * `key` - Unique identifier for the credential (e.g., "acs.accessKey", "agent.copilot-studio.abc123.clientSecret")
/// * `value` - The secret value to store
#[command]
pub fn store_credential(key: String, value: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, &key)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
    
    entry
        .set_password(&value)
        .map_err(|e| format!("Failed to store credential '{}': {}", key, e))
}

/// Retrieve a credential from the system credential manager
/// 
/// # Arguments
/// * `key` - Unique identifier for the credential
/// 
/// # Returns
/// * `Ok(Some(value))` - The credential value if found
/// * `Ok(None)` - If the credential doesn't exist
/// * `Err(msg)` - If there was an error accessing the credential manager
#[command]
pub fn get_credential(key: String) -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE_NAME, &key)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
    
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to retrieve credential '{}': {}", key, e)),
    }
}

/// Delete a credential from the system credential manager
/// 
/// # Arguments
/// * `key` - Unique identifier for the credential
/// 
/// # Returns
/// * `Ok(true)` - The credential was deleted
/// * `Ok(false)` - The credential didn't exist
/// * `Err(msg)` - If there was an error accessing the credential manager
#[command]
pub fn delete_credential(key: String) -> Result<bool, String> {
    let entry = Entry::new(SERVICE_NAME, &key)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
    
    match entry.delete_credential() {
        Ok(()) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(format!("Failed to delete credential '{}': {}", key, e)),
    }
}

/// Store multiple credentials at once (batch operation)
/// 
/// # Arguments
/// * `credentials` - Array of (key, value) pairs to store
/// 
/// # Returns
/// * `Ok(count)` - Number of credentials successfully stored
/// * `Err(msg)` - If there was an error
#[command]
pub fn store_credentials_batch(credentials: Vec<(String, String)>) -> Result<usize, String> {
    let mut count = 0;
    for (key, value) in credentials {
        let entry = Entry::new(SERVICE_NAME, &key)
            .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
        
        entry
            .set_password(&value)
            .map_err(|e| format!("Failed to store credential '{}': {}", key, e))?;
        
        count += 1;
    }
    Ok(count)
}

/// Retrieve multiple credentials at once (batch operation)
/// 
/// # Arguments
/// * `keys` - Array of keys to retrieve
/// 
/// # Returns
/// * `Ok(map)` - Object with key -> value (only includes found credentials)
#[command]
pub fn get_credentials_batch(keys: Vec<String>) -> Result<serde_json::Value, String> {
    let mut result = serde_json::Map::new();
    
    for key in keys {
        let entry = Entry::new(SERVICE_NAME, &key)
            .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
        
        match entry.get_password() {
            Ok(password) => {
                result.insert(key, serde_json::Value::String(password));
            }
            Err(keyring::Error::NoEntry) => {
                // Skip missing credentials
            }
            Err(e) => {
                return Err(format!("Failed to retrieve credential '{}': {}", key, e));
            }
        }
    }
    
    Ok(serde_json::Value::Object(result))
}

/// Delete multiple credentials at once (batch operation)
/// 
/// # Arguments
/// * `keys` - Array of keys to delete
/// 
/// # Returns
/// * `Ok(count)` - Number of credentials actually deleted (excludes non-existent)
#[command]
pub fn delete_credentials_batch(keys: Vec<String>) -> Result<usize, String> {
    let mut count = 0;
    
    for key in keys {
        let entry = Entry::new(SERVICE_NAME, &key)
            .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
        
        match entry.delete_credential() {
            Ok(()) => count += 1,
            Err(keyring::Error::NoEntry) => {
                // Skip non-existent credentials
            }
            Err(e) => {
                return Err(format!("Failed to delete credential '{}': {}", key, e));
            }
        }
    }
    
    Ok(count)
}
