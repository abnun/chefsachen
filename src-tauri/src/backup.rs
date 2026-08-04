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

/// Merkt eine Sicherung zum Zurückspielen vor. Wirksam beim nächsten Start.
/// Gibt zurück, ob dabei eine bereits bestehende Vormerkung ersetzt wurde.
#[tauri::command]
pub fn sicherung_wiederherstellen<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    zeitstempel: String,
) -> AppResult<bool> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| AppError::Technisch(e.to_string()))?;
    vormerken(&dir, &zeitstempel)
}

/// Bündelt eine Sicherung mit dem Belegarchiv, damit die Oberfläche sie an
/// einen selbst gewählten Ort speichern kann.
///
/// Die automatischen Sicherungen liegen neben der Datenbank — auf derselben
/// Platte. Bei einem Defekt sind sie mit weg; erst eine Kopie woandershin ist
/// eine Sicherung im eigentlichen Sinn. Die Datei ist eine Zip statt der
/// nackten Datenbank: siehe [`archiv_bauen`], warum das Belegarchiv dazugehört.
#[tauri::command]
pub fn sicherung_exportieren<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    zeitstempel: String,
) -> AppResult<Vec<u8>> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| AppError::Technisch(e.to_string()))?;
    let pfad = verzeichnis(&dir).join(format!("{PRAEFIX}{zeitstempel}{ENDUNG}"));
    archiv_bauen(&pfad, &dir)
}

/// Legt auf Wunsch sofort eine Sicherung an — etwa vor einer größeren Änderung.
///
/// Vorher ein WAL-Checkpoint über die laufende Verbindung: Im WAL-Modus liegen
/// die jüngsten Transaktionen sonst noch in `daten.db-wal`, und die Kopie der
/// Hauptdatei enthielte den Stand vom Programmstart statt den von jetzt.
#[tauri::command]
pub async fn sicherung_jetzt<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    pool: tauri::State<'_, sqlx::SqlitePool>,
) -> AppResult<Sicherung> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| AppError::Technisch(e.to_string()))?;
    crate::db::wal_einfalten(&pool)
        .await
        .map_err(|e| AppError::Technisch(format!("WAL-Checkpoint fehlgeschlagen: {e}")))?;
    let zeitstempel = zeitstempel_jetzt();
    sichern(&dir.join("daten.db"), &dir, &zeitstempel)?
        .ok_or_else(|| AppError::Technisch("Es gibt noch keine Datenbank zum Sichern.".into()))?;
    liste(&dir)
        .into_iter()
        .find(|s| s.zeitstempel == zeitstempel)
        .ok_or_else(|| AppError::Technisch("Sicherung wurde angelegt, ist aber nicht auffindbar.".into()))
}

/// Bündelt eine Datenbank-Sicherung mit dem Belegarchiv zu einer Zip-Datei.
///
/// Eine Sicherung der Datenbank allein reicht nicht: Erzeugte PDFs,
/// XRechnungen und ZUGFeRD-Dateien liegen als eigene Dateien im
/// `Belege`-Ordner daneben, nicht in der Datenbank. Wer nur die Datenbank
/// exportiert und woandershin verschiebt — etwa beim Umzug auf einen neuen
/// Rechner —, verliert dieses Archiv, ohne es zu merken. Und seit die
/// Belegvorlage einstellbar ist, lässt sich ein Beleg auch nicht mehr
/// verlässlich aus der Datenbank nachbilden: Ein später neu erzeugtes PDF
/// kann anders aussehen als das damals ausgestellte.
///
/// Die Zip trägt dieselbe Struktur wie im Programmordner (`daten.db` und
/// `Belege/…`), damit sie sich im Zweifel von Hand an ihren Platz zurücklegen
/// lässt.
pub fn archiv_bauen(datenbank: &Path, app_data_dir: &Path) -> AppResult<Vec<u8>> {
    use std::io::Write;

    let db_bytes = std::fs::read(datenbank)
        .map_err(|e| AppError::Technisch(format!("Sicherung nicht lesbar: {e}")))?;

    let mut puffer = Vec::new();
    let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut puffer));
    let optionen = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    let fehler = |e: zip::result::ZipError| AppError::Technisch(format!("Archiv nicht erstellbar: {e}"));

    zip.start_file("daten.db", optionen).map_err(fehler)?;
    zip.write_all(&db_bytes)
        .map_err(|e| AppError::Technisch(format!("Archiv nicht beschreibbar: {e}")))?;

    let belege_dir = crate::dokument::export::belege_verzeichnis(app_data_dir);
    if let Ok(eintraege) = std::fs::read_dir(&belege_dir) {
        // Nur Dateien, sortiert: Der Ordner enthält bislang keine
        // Unterordner, aber ein deterministisches Archiv lässt sich leichter
        // mit einem früheren vergleichen als eines mit zufälliger Reihenfolge.
        let mut dateien: Vec<_> = eintraege
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.is_file())
            .collect();
        dateien.sort();

        for datei in dateien {
            let Some(name) = datei.file_name().and_then(|n| n.to_str()) else { continue };
            zip.start_file(format!("Belege/{name}"), optionen).map_err(fehler)?;
            let bytes = std::fs::read(&datei)
                .map_err(|e| AppError::Technisch(format!("Beleg nicht lesbar: {e}")))?;
            zip.write_all(&bytes)
                .map_err(|e| AppError::Technisch(format!("Archiv nicht beschreibbar: {e}")))?;
        }
    }

    zip.finish().map_err(fehler)?;
    Ok(puffer)
}

/// Ergebnis eines Zip-Imports, für die Rückmeldung in der Oberfläche.
#[derive(Debug, serde::Serialize)]
pub struct ZipImport {
    /// Ins Belegarchiv übernommene Dateien.
    pub belege_neu: usize,
    /// Übersprungen, weil bereits vorhanden — das Archiv bleibt unveränderbar.
    pub belege_vorhanden: usize,
    /// Es lag bereits eine Vormerkung (etwa aus „Zurückspielen") — sie wurde
    /// ersetzt. Ohne den Hinweis gewänne die zweite Entscheidung unsichtbar.
    pub vormerkung_ersetzt: bool,
}

/// Prüft, ob die Bytes eine Datenbank sind, die diese Programmversion öffnen
/// kann.
///
/// Ohne die Prüfung würden beliebige Bytes als Vormerkung abgelegt und beim
/// nächsten Start per rename zur `daten.db` — ist die Datei keine Datenbank
/// oder stammt sie aus einer *neueren* Programmversion (unbekannte
/// Migrationen), scheitert dann jeder weitere Start, und der Weg zurück führt
/// über Handarbeit im Sicherungsordner. Genau das Von-Hand-Hantieren, das der
/// Import abschaffen soll.
async fn pruefe_datenbank_einspielbar(db_bytes: &[u8], app_data_dir: &Path) -> AppResult<()> {
    if !db_bytes.starts_with(b"SQLite format 3\0") {
        return Err(AppError::Validation {
            feld: "datei".into(),
            meldung: "Die daten.db in dieser Zip ist keine SQLite-Datenbank.".into(),
        });
    }
    // Migrationsstand nur über eine echte Verbindung feststellbar — dazu die
    // Bytes kurz in eine Prüfdatei legen. Sie wird in jedem Fall wieder
    // entfernt.
    let pruef_pfad = app_data_dir.join("wiederherstellen.pruefung.db");
    std::fs::write(&pruef_pfad, db_bytes)
        .map_err(|e| AppError::Technisch(format!("Prüfdatei nicht schreibbar: {e}")))?;
    let stand = migrationsstand(&pruef_pfad).await;
    let _ = std::fs::remove_file(&pruef_pfad);
    let stand = stand?;

    let eigener = crate::db::hoechste_migration();
    if stand > eigener {
        return Err(AppError::Validation {
            feld: "datei".into(),
            meldung: format!(
                "Diese Sicherung stammt aus einer neueren Programmversion (Datenstand {stand}, \
                 diese Version kennt {eigener}). Bitte zuerst die Anwendung aktualisieren."
            ),
        });
    }
    Ok(())
}

/// Höchste in einer Datenbankdatei verzeichnete Migration; 0, wenn die
/// Migrationstabelle fehlt (sehr alte oder leere Datenbank — unkritisch, die
/// Migrationen laufen dann beim Einspielen normal durch).
async fn migrationsstand(pfad: &Path) -> AppResult<i64> {
    use sqlx::sqlite::{SqlitePoolOptions, SqliteConnectOptions};
    let opts = SqliteConnectOptions::new().filename(pfad);
    let pool = SqlitePoolOptions::new().max_connections(1).connect_with(opts).await
        .map_err(|e| AppError::Technisch(format!("Prüfdatei nicht lesbar: {e}")))?;
    let stand: Result<(i64,), _> =
        sqlx::query_as("SELECT COALESCE(MAX(version), 0) FROM _sqlx_migrations")
            .fetch_one(&pool).await;
    pool.close().await;
    Ok(stand.map(|s| s.0).unwrap_or(0))
}

/// Spielt eine exportierte Sicherungs-Zip wieder ein.
///
/// Der Export erzeugt seit A1 eine Zip aus `daten.db` und dem Belegarchiv —
/// aber es gab keinen Weg zurück: Genau im beworbenen Ernstfall („Platte
/// defekt", neuer Rechner) musste man die Zip von Hand entpacken und die
/// Dateien an die richtigen Pfade legen, was nirgends erklärt war.
///
/// Die Datenbank wird nicht sofort ersetzt (sie ist im laufenden Betrieb
/// geöffnet), sondern wie beim Zurückspielen einer internen Sicherung als
/// Vormerkung abgelegt und beim nächsten Start eingespielt — inklusive
/// Rettungskopie des dann aktuellen Standes. Die Belegdateien werden dagegen
/// sofort übernommen; bereits vorhandene bleiben unangetastet, nach derselben
/// Regel, nach der auch `ablegen` nie überschreibt (GoBD-Unveränderbarkeit).
///
/// Die Vormerkung entsteht als **letzter** Schritt: Bräche der Import vorher
/// ab, meldete die Oberfläche einen Fehler — und beim nächsten Start würde
/// die Datenbank trotzdem still ausgetauscht.
pub async fn zip_einspielen(zip_pfad: &Path, app_data_dir: &Path) -> AppResult<ZipImport> {
    let datei = std::fs::File::open(zip_pfad)
        .map_err(|e| AppError::Technisch(format!("Sicherungsdatei nicht lesbar: {e}")))?;
    let mut archiv = zip::ZipArchive::new(datei)
        .map_err(|_| AppError::Validation {
            feld: "datei".into(),
            meldung: "Das ist keine lesbare Zip-Datei.".into(),
        })?;

    // Alles erst lesen, dann schreiben: Eine Zip ohne (brauchbare) daten.db
    // ist keine Sicherung dieser Anwendung — dann soll auch kein einzelner
    // Beleg übernommen worden sein.
    let mut db_bytes: Option<Vec<u8>> = None;
    let mut belege: Vec<(String, Vec<u8>)> = Vec::new();
    for i in 0..archiv.len() {
        let mut eintrag = archiv.by_index(i)
            .map_err(|e| AppError::Technisch(format!("Zip-Eintrag nicht lesbar: {e}")))?;
        let name = eintrag.name().to_string();
        let mut inhalt = Vec::new();
        std::io::Read::read_to_end(&mut eintrag, &mut inhalt)
            .map_err(|e| AppError::Technisch(format!("Zip-Eintrag nicht lesbar: {e}")))?;

        if name == "daten.db" {
            db_bytes = Some(inhalt);
            continue;
        }
        // Nur flache Einträge unterhalb von Belege/ — alles andere (fremde
        // Pfade, Unterordner, "../"-Konstruktionen) wird ignoriert, statt
        // Dateien außerhalb des Programmordners zu schreiben (Zip-Slip).
        let Some(dateiname) = name.strip_prefix("Belege/") else { continue };
        if dateiname.is_empty() || dateiname.contains('/') || dateiname.contains('\\') || dateiname.contains("..") {
            continue;
        }
        belege.push((dateiname.to_string(), inhalt));
    }

    let Some(db_bytes) = db_bytes else {
        return Err(AppError::Validation {
            feld: "datei".into(),
            meldung: "Diese Zip enthält keine daten.db — sie ist keine Sicherung dieser Anwendung.".into(),
        });
    };
    pruefe_datenbank_einspielbar(&db_bytes, app_data_dir).await?;

    let belege_dir = crate::dokument::export::belege_verzeichnis(app_data_dir);
    let mut ergebnis = ZipImport { belege_neu: 0, belege_vorhanden: 0, vormerkung_ersetzt: false };
    for (dateiname, inhalt) in belege {
        let ziel = belege_dir.join(&dateiname);
        if ziel.exists() {
            ergebnis.belege_vorhanden += 1;
            continue;
        }
        std::fs::create_dir_all(&belege_dir)
            .map_err(|e| AppError::Technisch(format!("Belegordner nicht anlegbar: {e}")))?;
        std::fs::write(&ziel, &inhalt)
            .map_err(|e| AppError::Technisch(format!("Beleg nicht schreibbar: {e}")))?;
        ergebnis.belege_neu += 1;
    }

    let vormerkung = app_data_dir.join(VORMERKUNG);
    ergebnis.vormerkung_ersetzt = vormerkung.exists();
    std::fs::write(&vormerkung, &db_bytes)
        .map_err(|e| AppError::Technisch(format!("Wiederherstellung nicht vorbereitbar: {e}")))?;

    Ok(ergebnis)
}

/// Spielt eine exportierte Sicherungs-Zip ein: Belegarchiv sofort, Datenbank
/// als Vormerkung beim nächsten Start.
#[tauri::command]
pub async fn sicherung_aus_datei_einspielen<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    pfad: String,
) -> AppResult<ZipImport> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| AppError::Technisch(e.to_string()))?;
    zip_einspielen(Path::new(&pfad), &dir).await
}

/// Name der Datei, die einen vorgemerkten Wiederherstellungswunsch trägt.
const VORMERKUNG: &str = "wiederherstellen.db";

/// Merkt eine Sicherung zum Zurückspielen beim nächsten Start vor.
///
/// Die Datenbank ist im laufenden Betrieb geöffnet — sie einfach zu
/// überschreiben, während Verbindungen darauf zeigen, führt zu einem halb
/// gelesenen Zustand oder zu einer beschädigten Datei. Statt gegen die offene
/// Verbindung zu arbeiten, wird die gewählte Sicherung danebengelegt und beim
/// nächsten Start eingespielt, bevor überhaupt eine Verbindung entsteht.
///
/// Gibt zurück, ob eine bereits bestehende Vormerkung ersetzt wurde — es gibt
/// nur eine, die letzte Entscheidung gewinnt, und das soll sichtbar sein.
pub fn vormerken(app_data_dir: &Path, zeitstempel: &str) -> AppResult<bool> {
    let quelle = verzeichnis(app_data_dir).join(format!("{PRAEFIX}{zeitstempel}{ENDUNG}"));
    if !quelle.is_file() {
        return Err(AppError::Validation {
            feld: "zeitstempel".into(),
            meldung: "Diese Sicherung gibt es nicht.".into(),
        });
    }
    let ziel = app_data_dir.join(VORMERKUNG);
    let ersetzt = ziel.exists();
    std::fs::copy(&quelle, &ziel)
        .map_err(|e| AppError::Technisch(format!("Sicherung nicht vorbereitbar: {e}")))?;
    Ok(ersetzt)
}

/// Spielt eine vorgemerkte Sicherung ein. Beim Start aufzurufen, **bevor** die
/// Datenbank geöffnet wird.
///
/// Gibt zurück, ob etwas eingespielt wurde.
///
/// Vor dem Überschreiben entsteht eine Sicherung des aktuellen Standes. Ohne
/// sie wäre ein versehentliches Zurückspielen unumkehrbar — und genau das
/// passiert, wenn jemand den falschen Zeitpunkt anklickt.
pub fn vorgemerkte_einspielen(datenbank: &Path, app_data_dir: &Path, zeitstempel: &str) -> AppResult<bool> {
    let vormerkung = app_data_dir.join(VORMERKUNG);
    if !vormerkung.is_file() {
        return Ok(false);
    }

    sichern(datenbank, app_data_dir, zeitstempel)?;

    std::fs::rename(&vormerkung, datenbank)
        .map_err(|e| AppError::Technisch(format!("Wiederherstellung fehlgeschlagen: {e}")))?;

    // WAL und Shared-Memory gehören zur *alten* Datei. Bleiben sie liegen,
    // mischt SQLite Änderungen hinein, die es in der zurückgespielten Datenbank
    // nie gab — im günstigen Fall gibt es einen Fehler, im ungünstigen stille
    // Vermischung.
    for endung in ["-wal", "-shm"] {
        let pfad = datenbank.with_file_name(format!(
            "{}{endung}",
            datenbank.file_name().unwrap_or_default().to_string_lossy()
        ));
        let _ = std::fs::remove_file(pfad);
    }
    Ok(true)
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
    fn vormerken_lehnt_eine_unbekannte_sicherung_ab() {
        let dir = tempfile::tempdir().unwrap();
        let fehler = vormerken(dir.path(), "2026-01-01_00-00-00");
        assert!(matches!(fehler, Err(AppError::Validation { .. })), "{fehler:?}");
    }

    #[test]
    fn eine_vorgemerkte_sicherung_wird_beim_start_eingespielt() {
        let dir = tempfile::tempdir().unwrap();
        let datenbank = dir.path().join("daten.db");
        datenbank_anlegen(dir.path(), "aktueller Stand");
        sichern(&datenbank, dir.path(), "2026-08-01_10-00-00").unwrap();

        // Stand ändert sich, dann soll die alte Sicherung zurück.
        datenbank_anlegen(dir.path(), "neuerer, unerwünschter Stand");
        vormerken(dir.path(), "2026-08-01_10-00-00").unwrap();

        let eingespielt =
            vorgemerkte_einspielen(&datenbank, dir.path(), "2026-08-03_12-00-00").unwrap();
        assert!(eingespielt);
        assert_eq!(std::fs::read_to_string(&datenbank).unwrap(), "aktueller Stand");
    }

    #[test]
    fn der_ueberschriebene_stand_bleibt_als_sicherung_erhalten() {
        // Wer den falschen Zeitpunkt anklickt, soll nicht alles verlieren.
        let dir = tempfile::tempdir().unwrap();
        let datenbank = dir.path().join("daten.db");
        datenbank_anlegen(dir.path(), "alt");
        sichern(&datenbank, dir.path(), "2026-08-01_10-00-00").unwrap();
        datenbank_anlegen(dir.path(), "der Stand, der gleich überschrieben wird");

        vormerken(dir.path(), "2026-08-01_10-00-00").unwrap();
        vorgemerkte_einspielen(&datenbank, dir.path(), "2026-08-03_12-00-00").unwrap();

        let rettung = verzeichnis(dir.path()).join("daten-2026-08-03_12-00-00.db");
        assert_eq!(
            std::fs::read_to_string(rettung).unwrap(),
            "der Stand, der gleich überschrieben wird",
        );
    }

    #[test]
    fn ohne_vormerkung_passiert_nichts() {
        let dir = tempfile::tempdir().unwrap();
        let datenbank = dir.path().join("daten.db");
        datenbank_anlegen(dir.path(), "unberührt");

        assert!(!vorgemerkte_einspielen(&datenbank, dir.path(), "2026-08-03_12-00-00").unwrap());
        assert_eq!(std::fs::read_to_string(&datenbank).unwrap(), "unberührt");
    }

    #[test]
    fn wal_und_shm_der_alten_datenbank_werden_entfernt() {
        // Sie gehören zur überschriebenen Datei. Bleiben sie liegen, mischt
        // SQLite Änderungen hinein, die es in der zurückgespielten Datenbank
        // nie gab.
        let dir = tempfile::tempdir().unwrap();
        let datenbank = dir.path().join("daten.db");
        datenbank_anlegen(dir.path(), "alt");
        sichern(&datenbank, dir.path(), "2026-08-01_10-00-00").unwrap();
        datenbank_anlegen(dir.path(), "neu");
        std::fs::write(dir.path().join("daten.db-wal"), "journal").unwrap();
        std::fs::write(dir.path().join("daten.db-shm"), "gemeinsamer speicher").unwrap();

        vormerken(dir.path(), "2026-08-01_10-00-00").unwrap();
        vorgemerkte_einspielen(&datenbank, dir.path(), "2026-08-03_12-00-00").unwrap();

        assert!(!dir.path().join("daten.db-wal").exists());
        assert!(!dir.path().join("daten.db-shm").exists());
    }

    /// Liest die Namen aller Einträge einer Zip zurück, zum Prüfen im Test.
    fn zip_eintraege(bytes: &[u8]) -> Vec<String> {
        let mut archiv = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
        (0..archiv.len())
            .map(|i| archiv.by_index(i).unwrap().name().to_string())
            .collect()
    }

    fn zip_datei(bytes: &[u8], name: &str) -> Vec<u8> {
        let mut archiv = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
        let mut datei = archiv.by_name(name).unwrap();
        let mut inhalt = Vec::new();
        std::io::Read::read_to_end(&mut datei, &mut inhalt).unwrap();
        inhalt
    }

    #[test]
    fn archiv_enthaelt_datenbank_und_belege() {
        // Der eigentliche Befund: Eine Sicherung der Datenbank allein deckt
        // das Belegarchiv nicht ab. Diese Zip muss beides tragen.
        let dir = tempfile::tempdir().unwrap();
        let db = datenbank_anlegen(dir.path(), "datenbankinhalt");
        let belege = crate::dokument::export::belege_verzeichnis(dir.path());
        std::fs::create_dir_all(&belege).unwrap();
        std::fs::write(belege.join("RE-2026-0001.pdf"), b"pdf-inhalt").unwrap();
        std::fs::write(belege.join("RE-2026-0001.xrechnung.xml"), b"xml-inhalt").unwrap();

        let bytes = archiv_bauen(&db, dir.path()).unwrap();

        let namen = zip_eintraege(&bytes);
        assert_eq!(
            namen,
            vec!["daten.db", "Belege/RE-2026-0001.pdf", "Belege/RE-2026-0001.xrechnung.xml"],
        );
        assert_eq!(zip_datei(&bytes, "daten.db"), b"datenbankinhalt");
        assert_eq!(zip_datei(&bytes, "Belege/RE-2026-0001.pdf"), b"pdf-inhalt");
    }

    #[test]
    fn archiv_funktioniert_auch_ohne_belegordner() {
        // Wer noch nie etwas exportiert hat, hat auch noch keinen `Belege`-
        // Ordner. Das darf das Sichern nicht verhindern.
        let dir = tempfile::tempdir().unwrap();
        let db = datenbank_anlegen(dir.path(), "inhalt");

        let bytes = archiv_bauen(&db, dir.path()).unwrap();

        assert_eq!(zip_eintraege(&bytes), vec!["daten.db"]);
    }

    /// Baut eine Test-Zip aus (Name, Inhalt)-Paaren.
    fn zip_bauen(eintraege: &[(&str, &[u8])]) -> Vec<u8> {
        use std::io::Write;
        let mut puffer = Vec::new();
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut puffer));
        let optionen = zip::write::SimpleFileOptions::default();
        for (name, inhalt) in eintraege {
            zip.start_file(*name, optionen).unwrap();
            zip.write_all(inhalt).unwrap();
        }
        zip.finish().unwrap();
        puffer
    }

    fn zip_schreiben(dir: &Path, eintraege: &[(&str, &[u8])]) -> PathBuf {
        let pfad = dir.join("sicherung.zip");
        std::fs::write(&pfad, zip_bauen(eintraege)).unwrap();
        pfad
    }

    /// Bytes einer echten, vollständig migrierten Datenbank — der Import
    /// prüft SQLite-Header und Migrationsstand, Platzhalter-Bytes reichen
    /// dafür nicht mehr.
    async fn echte_datenbank_bytes(dir: &Path) -> Vec<u8> {
        let pfad = dir.join("quelle-fuer-zip.db");
        let pool = crate::db::init_db(&pfad).await.unwrap();
        pool.close().await;
        std::fs::read(&pfad).unwrap()
    }

    #[tokio::test]
    async fn zip_einspielen_merkt_datenbank_vor_und_uebernimmt_belege() {
        let dir = tempfile::tempdir().unwrap();
        let db = echte_datenbank_bytes(dir.path()).await;
        let zip = zip_schreiben(dir.path(), &[
            ("daten.db", db.as_slice()),
            ("Belege/RE-2026-0001.pdf", b"pdf-inhalt"),
        ]);

        let ergebnis = zip_einspielen(&zip, dir.path()).await.unwrap();

        assert_eq!(ergebnis.belege_neu, 1);
        assert_eq!(ergebnis.belege_vorhanden, 0);
        assert!(!ergebnis.vormerkung_ersetzt);
        // Die Datenbank ersetzt nicht sofort die laufende, sondern liegt als
        // Vormerkung bereit — eingespielt beim nächsten Start.
        assert_eq!(std::fs::read(dir.path().join(VORMERKUNG)).unwrap(), db);
        let beleg = crate::dokument::export::belege_verzeichnis(dir.path()).join("RE-2026-0001.pdf");
        assert_eq!(std::fs::read(beleg).unwrap(), b"pdf-inhalt");
    }

    /// GoBD-Unveränderbarkeit gilt auch beim Import: Eine bereits archivierte
    /// Datei wird nicht durch die Fassung aus der Zip ersetzt.
    #[tokio::test]
    async fn zip_einspielen_ueberschreibt_vorhandene_belege_nicht() {
        let dir = tempfile::tempdir().unwrap();
        let db = echte_datenbank_bytes(dir.path()).await;
        let belege = crate::dokument::export::belege_verzeichnis(dir.path());
        std::fs::create_dir_all(&belege).unwrap();
        std::fs::write(belege.join("RE-2026-0001.pdf"), b"archivierte fassung").unwrap();
        let zip = zip_schreiben(dir.path(), &[
            ("daten.db", db.as_slice()),
            ("Belege/RE-2026-0001.pdf", b"andere fassung"),
            ("Belege/RE-2026-0002.pdf", b"neu"),
        ]);

        let ergebnis = zip_einspielen(&zip, dir.path()).await.unwrap();

        assert_eq!(ergebnis.belege_vorhanden, 1);
        assert_eq!(ergebnis.belege_neu, 1);
        assert_eq!(std::fs::read(belege.join("RE-2026-0001.pdf")).unwrap(), b"archivierte fassung");
    }

    #[tokio::test]
    async fn zip_ohne_datenbank_wird_abgelehnt_ohne_etwas_zu_schreiben() {
        let dir = tempfile::tempdir().unwrap();
        let zip = zip_schreiben(dir.path(), &[("Belege/RE-2026-0001.pdf", b"pdf")]);

        let fehler = zip_einspielen(&zip, dir.path()).await;
        assert!(matches!(fehler, Err(AppError::Validation { .. })), "{fehler:?}");
        assert!(!dir.path().join(VORMERKUNG).exists());
        assert!(!crate::dokument::export::belege_verzeichnis(dir.path()).exists());
    }

    /// Beliebige Bytes als daten.db dürfen nie zur Vormerkung werden: Beim
    /// nächsten Start würden sie per rename zur Datenbank, und jeder weitere
    /// Start scheiterte. Auch die Belege bleiben dann unangetastet.
    #[tokio::test]
    async fn eine_zip_mit_unbrauchbarer_datenbank_wird_abgelehnt_ohne_etwas_zu_schreiben() {
        let dir = tempfile::tempdir().unwrap();
        let zip = zip_schreiben(dir.path(), &[
            ("daten.db", b"nur text, keine datenbank"),
            ("Belege/RE-2026-0001.pdf", b"pdf"),
        ]);

        let fehler = zip_einspielen(&zip, dir.path()).await;
        assert!(matches!(fehler, Err(AppError::Validation { .. })), "{fehler:?}");
        assert!(!dir.path().join(VORMERKUNG).exists());
        assert!(!crate::dokument::export::belege_verzeichnis(dir.path()).exists());
    }

    /// Eine Sicherung aus einer neueren Programmversion trägt Migrationen,
    /// die diese Version nicht kennt — eingespielt wäre die App dauerhaft
    /// startunfähig. Ablehnen mit klarer Meldung statt stiller Zeitbombe.
    #[tokio::test]
    async fn eine_sicherung_aus_neuerer_programmversion_wird_abgelehnt() {
        let dir = tempfile::tempdir().unwrap();
        // Eine echte Datenbank, in deren Migrationstabelle eine Zukunfts-
        // Migration steht.
        let pfad = dir.path().join("zukunft.db");
        let pool = crate::db::init_db(&pfad).await.unwrap();
        sqlx::query(
            "INSERT INTO _sqlx_migrations (version, description, installed_on, success, checksum, execution_time) \
             VALUES (99990101000000, 'aus der zukunft', CURRENT_TIMESTAMP, 1, x'00', 0)")
            .execute(&pool).await.unwrap();
        crate::db::wal_einfalten(&pool).await.unwrap();
        pool.close().await;
        let db = std::fs::read(&pfad).unwrap();
        let zip = zip_schreiben(dir.path(), &[("daten.db", db.as_slice())]);

        let fehler = zip_einspielen(&zip, dir.path()).await;
        match fehler {
            Err(AppError::Validation { meldung, .. }) => {
                assert!(meldung.contains("neueren Programmversion"), "{meldung}");
            }
            anderes => panic!("unerwartet: {anderes:?}"),
        }
        assert!(!dir.path().join(VORMERKUNG).exists());
    }

    /// Es gibt nur eine Vormerkung — die letzte Entscheidung gewinnt, und das
    /// soll die Oberfläche dem Nutzer sagen können.
    #[tokio::test]
    async fn zip_einspielen_meldet_wenn_eine_vormerkung_ersetzt_wird() {
        let dir = tempfile::tempdir().unwrap();
        let db = echte_datenbank_bytes(dir.path()).await;
        let zip = zip_schreiben(dir.path(), &[("daten.db", db.as_slice())]);

        let erste = zip_einspielen(&zip, dir.path()).await.unwrap();
        assert!(!erste.vormerkung_ersetzt);
        let zweite = zip_einspielen(&zip, dir.path()).await.unwrap();
        assert!(zweite.vormerkung_ersetzt);
    }

    #[tokio::test]
    async fn eine_datei_die_keine_zip_ist_wird_abgelehnt() {
        let dir = tempfile::tempdir().unwrap();
        let pfad = dir.path().join("keine.zip");
        std::fs::write(&pfad, b"nur text").unwrap();
        let fehler = zip_einspielen(&pfad, dir.path()).await;
        assert!(matches!(fehler, Err(AppError::Validation { .. })), "{fehler:?}");
    }

    /// Zip-Slip: Ein präparierter Eintrag darf keine Datei außerhalb des
    /// Programmordners schreiben.
    #[tokio::test]
    async fn zip_einspielen_ignoriert_pfade_ausserhalb_des_belegordners() {
        let dir = tempfile::tempdir().unwrap();
        let db = echte_datenbank_bytes(dir.path()).await;
        let zip = zip_schreiben(dir.path(), &[
            ("daten.db", db.as_slice()),
            ("Belege/../ausbruch.txt", b"boese"),
            ("Belege/unter/ordner.pdf", b"verschachtelt"),
            ("woanders/datei.txt", b"fremd"),
        ]);

        let ergebnis = zip_einspielen(&zip, dir.path()).await.unwrap();

        assert_eq!(ergebnis.belege_neu, 0);
        assert!(!dir.path().join("ausbruch.txt").exists());
        assert!(!dir.path().join("woanders").exists());
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
