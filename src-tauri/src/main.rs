// Teams Agent Bridge - Tauri Application
// Modular desktop application for joining meetings with AI agents

// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::get_app_info,
            commands::open_external_url,
            // Secure credential storage commands
            commands::store_credential,
            commands::get_credential,
            commands::delete_credential,
            commands::store_credentials_batch,
            commands::get_credentials_batch,
            commands::delete_credentials_batch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
