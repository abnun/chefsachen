use tauri::Manager;

mod backup;
mod commands;
mod db;
mod dokument;
mod domain;
mod error;
mod protokoll;

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

    // Eine vorgemerkte Wiederherstellung zuerst: Sie muss geschehen, bevor
    // irgendeine Verbindung auf die Datei zeigt.
    match backup::vorgemerkte_einspielen(&datenbank, &dir, &backup::zeitstempel_jetzt()) {
        Ok(true) => log::info!("Vorgemerkte Sicherung eingespielt"),
        Ok(false) => {}
        Err(e) => log::error!("Wiederherstellung fehlgeschlagen: {e:?}"),
    }

    // Vor den Migrationen sichern: Bricht eine Migration ab oder verändert sie
    // Daten fehlerhaft, ist der Stand davor noch vorhanden. Ein Fehler beim
    // Sichern darf den Start nicht verhindern — dann wäre die App wegen einer
    // Vorsichtsmaßnahme unbenutzbar.
    match backup::sichern(&datenbank, &dir, &backup::zeitstempel_jetzt()) {
        Ok(Some(_)) => log::info!("Sicherung vor den Migrationen angelegt"),
        Ok(None) => log::info!("Keine Sicherung nötig, es gibt noch keine Datenbank"),
        Err(e) => log::warn!("Sicherung beim Start fehlgeschlagen: {e:?}"),
    }

    log::info!("Datenbank wird geöffnet und migriert");
    tauri::async_runtime::block_on(db::init_db(&datenbank)).map_err(|e| {
        log::error!("Datenbank konnte nicht geöffnet werden: {e:?}");
        format!(
            "Die Datenbank konnte nicht geöffnet werden.\n\nAblage: {}\n\nGrund: {e}\n\n             Möglicherweise läuft das Programm bereits, oder eine Sicherung im Ordner              \"Sicherungen\" lässt sich als Ersatz einspielen.",
            datenbank.display()
        )
    })
}

/// Zeigt einen Startfehler als Dialog. Fällt auf die Standardfehlerausgabe
/// zurück, falls sich nicht einmal mehr ein Fenster öffnen lässt.
fn zeige_startfehler(app: &tauri::App, meldung: &str) {
    log::error!("Start fehlgeschlagen: {meldung}");
    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
    app.dialog()
        .message(meldung)
        .title("Kleinunternehmer-Verwaltung kann nicht starten")
        .kind(MessageDialogKind::Error)
        .blocking_show();
}

/// Der erzeugte Anwendungskontext: Konfiguration, Berechtigungen, Oberfläche.
///
/// `generate_context!` darf pro Crate nur einmal stehen — der Test in [`ipc`]
/// braucht denselben Kontext wie [`run`], damit er gegen die echten
/// Berechtigungen läuft und nicht gegen leere.
fn kontext<R: tauri::Runtime>() -> tauri::Context<R> {
    tauri::generate_context!()
}

/// Registriert die Plugins, deren Funktionen die Oberfläche aufruft.
///
/// Wie [`mit_befehlen`] getrennt gehalten, damit der Test in [`ipc`] dieselbe
/// Anwendung baut wie [`run`]. Ein Plugin, das nur in `run` steht, ließe den
/// Test bestehen und das Programm scheitern.
fn mit_plugins<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    let builder = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init());

    // Aktualisierung und Neustart gibt es auf Mobilgeräten nicht.
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder
        // Der Updater lädt und prüft in Rust, nicht im Webview — die
        // Inhaltsrichtlinie der Oberfläche muss GitHub deshalb nicht kennen.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    builder
}

/// Registriert alle Befehle, die die Oberfläche aufrufen darf.
///
/// Bewusst getrennt von [`run`]: Der Test in [`ipc`] baut dieselbe Liste über
/// derselben Grenze auf. Stünde sie fest in `run`, ließe sich nur prüfen, was
/// die Befehlsfunktionen tun — nicht, ob sie überhaupt erreichbar sind. Genau
/// daran lag P1.1.
fn mit_befehlen<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.invoke_handler(tauri::generate_handler![
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
            commands::belege::belegposition_verschieben,
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
            backup::sicherung_wiederherstellen,
            backup::sicherung_exportieren,
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
            commands::eingangsrechnungen::eingangsrechnung_aenderungen,
            commands::eingangsrechnungen::eingangsrechnung_original_exportieren,
            protokoll::protokoll_pfad
    ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Vor allem anderen: Was danach schiefgeht, soll aufgezeichnet werden.
    protokoll::absturzmelder_einrichten();

    // Das Protokoll-Plugin setzt den globalen Logger und steht deshalb nicht
    // in `mit_plugins`: Ein zweiter Aufruf im selben Prozess bricht ab, und die
    // Tests bauen mehrere Anwendungen nacheinander.
    let builder = mit_plugins(tauri::Builder::default().plugin(protokoll::plugin()))
        .setup(|app| {
            protokoll::startzeile(app.package_info().version.to_string().as_str());
            match starten(app) {
                Ok(pool) => {
                    app.manage(pool);
                    Ok(())
                }
                Err(meldung) => {
                    // Ohne diesen Dialog beendet sich die App wortlos: Der Nutzer
                    // klickt doppelt und es passiert nichts. Die Ursache steht
                    // zusätzlich im Protokoll, der Dialog ist die einzige
                    // Fassung, die den Nutzer unmittelbar erreicht.
                    zeige_startfehler(app, &meldung);
                    Err(meldung.into())
                }
            }
        })
        ;

    mit_befehlen(builder)
        .run(kontext())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod ipc;
