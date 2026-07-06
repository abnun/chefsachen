// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::Manager;

mod db;
mod domain;
mod error;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dir = app.path().app_data_dir().expect("app_data_dir");
            std::fs::create_dir_all(&dir)?;
            let pool = tauri::async_runtime::block_on(db::init_db(&dir.join("daten.db")))?;
            app.manage(pool);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
