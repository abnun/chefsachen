//! Sicherung der Datenbank.
//!
//! Die App verwaltet Buchhaltungsdaten mit gesetzlicher Aufbewahrungspflicht,
//! lokal und ohne Cloud-Abgleich. Ein Plattendefekt oder eine fehlgeschlagene
//! Migration bedeutete bislang den vollständigen Verlust — es gab weder eine
//! automatische Sicherung noch einen Wiederherstellungsweg.
//!
//! Bei jedem Start entsteht deshalb eine Kopie, von der die jüngsten zehn
//! behalten werden. Die Sicherung läuft **vor** den Migrationen: Bricht eine
//! Migration ab oder verändert sie Daten fehlerhaft, ist der Stand davor noch
//! vorhanden.

use crate::error::{AppError, AppResult};
use std::path::{Path, PathBuf};

/// Anzahl der aufbewahrten Sicherungen. Zehn decken bei täglicher Nutzung rund
/// zwei Wochen ab, ohne nennenswert Platz zu belegen.
pub const ANZAHL_SICHERUNGEN: usize = 10;

const PRAEFIX: &str = "daten-";
const ENDUNG: &str = ".db";

pub fn verzeichnis(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("Sicherungen")
}

/// Legt eine Sicherung der Datenbank an und räumt ältere ab.
///
/// Tut nichts, wenn die Datenbank noch nicht existiert (erster Start).
/// Ein Fehler beim Sichern darf den Start **nicht** verhindern — deshalb gibt
/// diese Funktion ihn zurück, statt ihn zu erzwingen; der Aufrufer entscheidet.
pub fn sichern(datenbank: &Path, app_data_dir: &Path, zeitstempel: &str) -> AppResult<Option<PathBuf>> {
    if !datenbank.is_file() {
        return Ok(None);
    }
    let ziel_verzeichnis = verzeichnis(app_data_dir);
    std::fs::create_dir_all(&ziel_verzeichnis)
        .map_err(|e| AppError::Technisch(format!("Sicherungsordner nicht anlegbar: {e}")))?;

    let ziel = ziel_verzeichnis.join(format!("{PRAEFIX}{zeitstempel}{ENDUNG}"));
    std::fs::copy(datenbank, &ziel)
        .map_err(|e| AppError::Technisch(format!("Sicherung fehlgeschlagen: {e}")))?;

    aufraeumen(&ziel_verzeichnis, ANZAHL_SICHERUNGEN)?;
    Ok(Some(ziel))
}

/// Behält die jüngsten `behalten` Sicherungen und entfernt die übrigen.
///
/// Die Reihenfolge ergibt sich aus dem Dateinamen: Der Zeitstempel ist so
/// gewählt, dass er sich lexikografisch sortieren lässt. Das ist verlässlicher
/// als das Änderungsdatum der Datei, das beim Kopieren oder Verschieben
/// verlorengeht.
fn aufraeumen(verzeichnis: &Path, behalten: usize) -> AppResult<()> {
    let mut sicherungen: Vec<PathBuf> = std::fs::read_dir(verzeichnis)
        .map_err(|e| AppError::Technisch(e.to_string()))?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with(PRAEFIX) && n.ends_with(ENDUNG))
        })
        .collect();
    sicherungen.sort();

    if sicherungen.len() > behalten {
        for alt in &sicherungen[..sicherungen.len() - behalten] {
            // Ein nicht löschbarer Rest ist kein Grund, den Start abzubrechen.
            let _ = std::fs::remove_file(alt);
        }
    }
    Ok(())
}

/// Listet die vorhandenen Sicherungen, jüngste zuerst.
pub fn liste(app_data_dir: &Path) -> Vec<Sicherung> {
    let verzeichnis = verzeichnis(app_data_dir);
    let Ok(eintraege) = std::fs::read_dir(&verzeichnis) else {
        return Vec::new();
    };
    let mut gefunden: Vec<Sicherung> = eintraege
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let pfad = e.path();
            let name = pfad.file_name()?.to_str()?.to_string();
            if !name.starts_with(PRAEFIX) || !name.ends_with(ENDUNG) {
                return None;
            }
            Some(Sicherung {
                zeitstempel: name[PRAEFIX.len()..name.len() - ENDUNG.len()].to_string(),
                groesse_bytes: e.metadata().map(|m| m.len()).unwrap_or(0),
                pfad: pfad.to_string_lossy().into_owned(),
            })
        })
        .collect();
    gefunden.sort_by(|a, b| b.zeitstempel.cmp(&a.zeitstempel));
    gefunden
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct Sicherung {
    /// Zeitpunkt der Sicherung, aus dem Dateinamen.
    pub zeitstempel: String,
    pub groesse_bytes: u64,
    pub pfad: String,
}

/// Zeitstempel für einen Sicherungsdateinamen: sortierbar und ohne Zeichen,
/// die in Dateinamen Probleme machen.
pub fn zeitstempel_jetzt() -> String {
    chrono::Local::now().format("%Y-%m-%d_%H-%M-%S").to_string()
}

/// Tauri-Befehle rund um die Sicherungen. Liegen hier statt in `commands/`,
/// weil sie ohne Datenbankzugriff auskommen — sie arbeiten auf Dateien.
#[tauri::command]
pub fn sicherungen_liste<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> AppResult<Vec<Sicherung>> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| AppError::Technisch(e.to_string()))?;
    Ok(liste(&dir))
}

/// Legt auf Wunsch sofort eine Sicherung an — etwa vor einer größeren Änderung.
#[tauri::command]
pub fn sicherung_jetzt<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> AppResult<Sicherung> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| AppError::Technisch(e.to_string()))?;
    let zeitstempel = zeitstempel_jetzt();
    sichern(&dir.join("daten.db"), &dir, &zeitstempel)?
        .ok_or_else(|| AppError::Technisch("Es gibt noch keine Datenbank zum Sichern.".into()))?;
    liste(&dir)
        .into_iter()
        .find(|s| s.zeitstempel == zeitstempel)
        .ok_or_else(|| AppError::Technisch("Sicherung wurde angelegt, ist aber nicht auffindbar.".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn datenbank_anlegen(dir: &Path, inhalt: &str) -> PathBuf {
        let pfad = dir.join("daten.db");
        std::fs::write(&pfad, inhalt).unwrap();
        pfad
    }

    #[test]
    fn sichern_legt_eine_kopie_an() {
        let dir = tempfile::tempdir().unwrap();
        let db = datenbank_anlegen(dir.path(), "inhalt");

        let ziel = sichern(&db, dir.path(), "2026-08-03_10-00-00").unwrap().unwrap();

        assert!(ziel.is_file());
        assert_eq!(std::fs::read_to_string(&ziel).unwrap(), "inhalt");
    }

    /// Beim allerersten Start gibt es noch keine Datenbank — das ist kein Fehler.
    #[test]
    fn ohne_datenbank_passiert_nichts() {
        let dir = tempfile::tempdir().unwrap();
        assert!(sichern(&dir.path().join("fehlt.db"), dir.path(), "x").unwrap().is_none());
    }

    #[test]
    fn es_werden_nur_die_juengsten_sicherungen_behalten() {
        let dir = tempfile::tempdir().unwrap();
        let db = datenbank_anlegen(dir.path(), "inhalt");

        for i in 0..ANZAHL_SICHERUNGEN + 5 {
            sichern(&db, dir.path(), &format!("2026-08-03_10-{i:02}-00")).unwrap();
        }

        let vorhanden = liste(dir.path());
        assert_eq!(vorhanden.len(), ANZAHL_SICHERUNGEN);
        // Jüngste zuerst, älteste entfernt.
        assert_eq!(vorhanden[0].zeitstempel, "2026-08-03_10-14-00");
        assert_eq!(vorhanden[ANZAHL_SICHERUNGEN - 1].zeitstempel, "2026-08-03_10-05-00");
    }

    /// Fremde Dateien im Sicherungsordner dürfen weder gezählt noch gelöscht werden.
    #[test]
    fn fremde_dateien_bleiben_unberuehrt() {
        let dir = tempfile::tempdir().unwrap();
        let db = datenbank_anlegen(dir.path(), "inhalt");
        sichern(&db, dir.path(), "2026-08-03_10-00-00").unwrap();
        let fremd = verzeichnis(dir.path()).join("notiz.txt");
        std::fs::write(&fremd, "wichtig").unwrap();

        for i in 1..ANZAHL_SICHERUNGEN + 3 {
            sichern(&db, dir.path(), &format!("2026-08-03_11-{i:02}-00")).unwrap();
        }

        assert!(fremd.is_file(), "fremde Datei wurde entfernt");
        assert_eq!(liste(dir.path()).len(), ANZAHL_SICHERUNGEN);
    }

    #[test]
    fn liste_ist_ohne_verzeichnis_leer() {
        let dir = tempfile::tempdir().unwrap();
        assert!(liste(dir.path()).is_empty());
    }

    #[test]
    fn zeitstempel_ist_sortierbar_und_dateinamentauglich() {
        let t = zeitstempel_jetzt();
        assert_eq!(t.len(), 19, "erwartet JJJJ-MM-TT_hh-mm-ss, war: {t}");
        assert!(!t.contains(':'), "Doppelpunkte sind in Dateinamen problematisch");
        assert!(!t.contains('/'));
    }
}
