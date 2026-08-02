// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::Manager;

mod backup;
mod commands;
mod db;
mod dokument;
mod domain;
mod error;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Richtet Verzeichnis, Sicherung und Datenbank ein.
///
/// Gibt einen für Menschen lesbaren Text zurück statt eines technischen Fehlers:
/// Was hier schiefgeht, sieht der Nutzer unmittelbar, und "No such file or
/// directory (os error 2)" hilft ihm nicht weiter.
fn starten(app: &tauri::App) -> Result<sqlx::SqlitePool, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Der Datenordner der App konnte nicht ermittelt werden: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| {
        format!("Der Datenordner konnte nicht angelegt werden ({}):\n{e}", dir.display())
    })?;
    let datenbank = dir.join("daten.db");

    // Vor den Migrationen sichern: Bricht eine Migration ab oder verändert sie
    // Daten fehlerhaft, ist der Stand davor noch vorhanden. Ein Fehler beim
    // Sichern darf den Start nicht verhindern — dann wäre die App wegen einer
    // Vorsichtsmaßnahme unbenutzbar.
    if let Err(e) = backup::sichern(&datenbank, &dir, &backup::zeitstempel_jetzt()) {
        eprintln!("Sicherung beim Start fehlgeschlagen: {e:?}");
    }

    tauri::async_runtime::block_on(db::init_db(&datenbank)).map_err(|e| {
        format!(
            "Die Datenbank konnte nicht geöffnet werden.\n\nAblage: {}\n\nGrund: {e}\n\n             Möglicherweise läuft das Programm bereits, oder eine Sicherung im Ordner              \"Sicherungen\" lässt sich als Ersatz einspielen.",
            datenbank.display()
        )
    })
}

/// Zeigt einen Startfehler als Dialog. Fällt auf die Standardfehlerausgabe
/// zurück, falls sich nicht einmal mehr ein Fenster öffnen lässt.
fn zeige_startfehler(app: &tauri::App, meldung: &str) {
    eprintln!("Start fehlgeschlagen: {meldung}");
    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
    app.dialog()
        .message(meldung)
        .title("Kleinunternehmer-Verwaltung kann nicht starten")
        .kind(MessageDialogKind::Error)
        .blocking_show();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            match starten(app) {
                Ok(pool) => {
                    app.manage(pool);
                    Ok(())
                }
                Err(meldung) => {
                    // Ohne diesen Dialog beendet sich die App wortlos: Der Nutzer
                    // klickt doppelt und es passiert nichts. Da es weder Logdatei
                    // noch Absturzbericht gibt (siehe P5.4), bliebe ihm keinerlei
                    // Anhaltspunkt.
                    zeige_startfehler(app, &meldung);
                    Err(meldung.into())
                }
            }
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
            commands::belege::belegposition_save,
            commands::belege::belegposition_delete,
            commands::belege::beleg_stellen,
            commands::belege::angebot_status_setzen,
            commands::belege::angebot_in_rechnung_ueberfuehren,
            commands::belege::rechnung_stornieren,
            commands::belege::zahlung_erfassen,
            commands::belege::zahlung_delete,
            commands::belege::offene_posten_list,
            dokument::export::beleg_pdf_exportieren,
            dokument::export::rechnung_xrechnung_exportieren,
            dokument::export::rechnung_zugferd_exportieren,
            commands::artikel::artikel_list,
            commands::artikel::artikel_create,
            commands::artikel::artikel_update,
            commands::artikel::artikel_delete,
            commands::artikel::kundenpreis_list,
            commands::artikel::kundenpreis_list_fuer_kunde,
            commands::artikel::kundenpreis_save,
            commands::artikel::kundenpreis_delete,
            commands::artikel::preis_ermitteln,
            commands::firma::firma_get,
            commands::firma::firma_save,
            commands::firma::firma_logo_set,
            commands::firma::firma_logo_get,
            commands::dashboard::dashboard_laden,
            backup::sicherungen_liste,
            backup::sicherung_jetzt,
            commands::einstellungen::einstellung_get,
            commands::einstellungen::einstellung_set,
            commands::einstellungen::einstellung_list,
            commands::einstellungen::nummernkreis_list,
            commands::einstellungen::nummernkreis_update,
            commands::eingangsrechnungen::eingangsrechnung_import_vorschau,
            commands::eingangsrechnungen::eingangsrechnung_speichern,
            commands::eingangsrechnungen::eingangsrechnung_list,
            commands::eingangsrechnungen::eingangsrechnung_get,
            commands::eingangsrechnungen::eingangsrechnung_update,
            commands::eingangsrechnungen::eingangsrechnung_original_exportieren
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
