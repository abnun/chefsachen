//! Protokollierung für die Ferndiagnose.
//!
//! Geht bei einem Nutzer etwas schief, ist das Einzige, was ihn erreicht, eine
//! Fehlermeldung im Fenster — und die ist weg, sobald er sie wegklickt. Ohne
//! Aufzeichnung bleibt jede Rückfrage bei "und was stand da genau?" stehen.
//!
//! **Was hier nicht hineingehört:** Rechnungsinhalte, Kunden- oder
//! Artikelnamen, Beträge, Adressen. Die Datei landet im Zweifel per E-Mail
//! beim Entwickler; sie darf nichts enthalten, was über die eigene
//! Geschäftstätigkeit Auskunft gibt. Protokolliert werden technische
//! Vorgänge und Fehlertexte — Kennungen statt Inhalte, wo eine Zuordnung
//! nötig ist.

use tauri_plugin_log::{Target, TargetKind, TimezoneStrategy};

/// Name der Protokolldatei (ohne Endung). Der Plugin hängt `.log` an.
pub const DATEINAME: &str = "kleinunternehmer-verwaltung";

/// Größe, ab der die Datei umgebrochen wird — 2 MiB.
///
/// Der Plugin behält dabei genau eine ältere Datei. Das reicht, um einen
/// Fehler zu finden, den jemand erst am Folgetag meldet, und läuft nicht
/// unbemerkt voll.
const MAX_GROESSE_BYTES: u128 = 2 * 1024 * 1024;

/// Baut das Protokoll-Plugin.
pub fn plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_log::Builder::new()
        .targets([
            Target::new(TargetKind::LogDir { file_name: Some(DATEINAME.into()) }),
            // Beim Entwickeln ist die Datei umständlich; im ausgelieferten
            // Programm sieht die Standardausgabe ohnehin niemand.
            Target::new(TargetKind::Stdout),
        ])
        // UTC statt Ortszeit: Die Zeitstempel im Protokoll sollen sich mit
        // denen in der Datenbank vergleichen lassen, und die stehen in UTC.
        .timezone_strategy(TimezoneStrategy::UseUtc)
        .max_file_size(MAX_GROESSE_BYTES)
        .level(if cfg!(debug_assertions) {
            log::LevelFilter::Debug
        } else {
            log::LevelFilter::Info
        })
        .filter(|metadata| soll_protokollieren(metadata.target(), metadata.level()))
        .build()
}

/// Entscheidet, ob eine Meldung in die Datei darf.
///
/// Die Abhängigkeiten reden zu viel: `sqlx` protokolliert auf Info-Ebene jede
/// ausgeführte Abfrage. Damit stünden Kundennamen, Rechnungsnummern und
/// Beträge in einer Datei, die im Zweifel per E-Mail verschickt wird — genau
/// das, was hier nicht passieren darf.
///
/// Deshalb: eigene Meldungen immer, fremde erst ab Warnung. Ein Problem in
/// einer Abhängigkeit bleibt so sichtbar, ihr Alltagsgeplauder nicht.
fn soll_protokollieren(ziel: &str, stufe: log::Level) -> bool {
    ziel.starts_with("kleinunternehmer_verwaltung") || stufe <= log::Level::Warn
}

/// Meldet ungefangene Programmabstürze ins Protokoll.
///
/// Ohne das verschwindet ein Panic in der Standardfehlerausgabe, die im
/// ausgelieferten Programm niemand sieht — der Nutzer erlebt nur ein Fenster,
/// das nicht mehr reagiert.
pub fn absturzmelder_einrichten() {
    let vorheriger = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log::error!("Abbruch: {info}");
        vorheriger(info);
    }));
}

/// Schreibt beim Start fest, womit man es zu tun hat.
///
/// Ohne diese Zeile lässt sich einem eingeschickten Protokoll nicht ansehen,
/// welche Version es erzeugt hat — und die Antwort „welche Version hast du
/// denn?" ist erfahrungsgemäß unzuverlässig.
pub fn startzeile(version: &str) {
    log::info!(
        "Start — Version {version}, {} {}",
        std::env::consts::OS,
        std::env::consts::ARCH
    );
}

/// Liefert den Pfad der Protokolldatei für die Oberfläche.
///
/// Der Nutzer soll die Datei finden, ohne zu wissen, wo sein Betriebssystem
/// Protokolle ablegt — auf macOS liegt sie an einer ganz anderen Stelle als
/// seine Daten.
#[tauri::command]
pub fn protokoll_pfad(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    app.path()
        .app_log_dir()
        .map(|d| d.join(format!("{DATEINAME}.log")).display().to_string())
        .map_err(|e| format!("Der Protokollordner konnte nicht ermittelt werden: {e}"))
}

#[cfg(test)]
mod tests {
    use super::soll_protokollieren;
    use log::Level;

    #[test]
    fn eigene_meldungen_werden_aufgezeichnet() {
        assert!(soll_protokollieren("kleinunternehmer_verwaltung_lib", Level::Info));
        assert!(soll_protokollieren("kleinunternehmer_verwaltung_lib::protokoll", Level::Debug));
    }

    #[test]
    fn abfragen_der_datenbankschicht_bleiben_draussen() {
        // sqlx schreibt jede Abfrage auf Info-Ebene. Stünde sie in der Datei,
        // enthielte das Protokoll Kunden- und Rechnungsdaten.
        assert!(!soll_protokollieren("sqlx::query", Level::Info));
        assert!(!soll_protokollieren("sqlx::query", Level::Debug));
    }

    #[test]
    fn probleme_fremder_bausteine_bleiben_sichtbar() {
        assert!(soll_protokollieren("sqlx::query", Level::Warn));
        assert!(soll_protokollieren("tauri_plugin_updater", Level::Error));
    }
}
