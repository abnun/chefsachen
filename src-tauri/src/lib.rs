// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::Manager;

mod commands;
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let dir = app.path().app_data_dir().expect("app_data_dir");
            std::fs::create_dir_all(&dir)?;
            let pool = tauri::async_runtime::block_on(db::init_db(&dir.join("daten.db")))?;
            app.manage(pool);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::einheiten::einheit_list,
            commands::einheiten::einheit_create,
            commands::einheiten::einheit_update,
            commands::einheiten::einheit_delete,
            commands::kunden::kunde_list,
            commands::kunden::kunde_get,
            commands::kunden::kunde_create,
            commands::kunden::kunde_update,
            commands::kunden::kunde_delete,
            commands::kunden::adresse_save,
            commands::kunden::adresse_delete,
            commands::kunden::ansprechpartner_save,
            commands::kunden::ansprechpartner_delete,
            commands::belege::beleg_list,
            commands::belege::beleg_get,
            commands::belege::beleg_create,
            commands::belege::beleg_update,
            commands::belege::beleg_delete,
            commands::artikel::artikel_list,
            commands::artikel::artikel_create,
            commands::artikel::artikel_update,
            commands::artikel::artikel_delete,
            commands::artikel::kundenpreis_list,
            commands::artikel::kundenpreis_save,
            commands::artikel::kundenpreis_delete,
            commands::artikel::preis_ermitteln,
            commands::firma::firma_get,
            commands::firma::firma_save,
            commands::firma::firma_logo_set,
            commands::firma::firma_logo_get,
            commands::einstellungen::einstellung_get,
            commands::einstellungen::einstellung_set,
            commands::einstellungen::einstellung_list,
            commands::einstellungen::nummernkreis_list,
            commands::einstellungen::nummernkreis_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
