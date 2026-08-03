use crate::dokument::{kontext::kontext_aus_beleg, pdf, xrechnung, zugferd};
use crate::error::AppResult;
use sqlx::SqlitePool;
use tauri::Manager;

fn dateiname_sicher(nummer: &str) -> String {
    nummer.replace(['/', '\\'], "-")
}

/// Legt eine erzeugte Datei im Belegarchiv ab.
///
/// Eine bereits abgelegte Datei wird **nicht** überschrieben. Ein erneuter
/// Export nach einer Stammdatenänderung würde sonst die archivierte Rechnung
/// durch ein inhaltlich anderes Dokument ersetzen — das Archiv wäre damit
/// veränderlich, was dem Unveränderbarkeitsgrundsatz der GoBD widerspricht.
/// Der Nutzer erhält seine Kopie ohnehin über den Speichern-Dialog; das Archiv
/// bewahrt die Fassung, die beim ersten Export entstanden ist.
fn ablegen(verzeichnis: &std::path::Path, dateiname: &str, bytes: &[u8]) -> AppResult<()> {
    std::fs::create_dir_all(verzeichnis)
        .map_err(|e| crate::error::AppError::Technisch(e.to_string()))?;
    let ziel = verzeichnis.join(dateiname);
    if ziel.exists() {
        return Ok(());
    }
    std::fs::write(&ziel, bytes).map_err(|e| crate::error::AppError::Technisch(e.to_string()))?;
    Ok(())
}

fn im_app_verzeichnis_ablegen<R: tauri::Runtime>(app: &tauri::AppHandle<R>, dateiname: &str, bytes: &[u8]) -> AppResult<()> {
    let verzeichnis = app.path().app_data_dir()
        .map_err(|e| crate::error::AppError::Technisch(e.to_string()))?
        .join("Belege");
    ablegen(&verzeichnis, dateiname, bytes)
}

pub(crate) async fn firma_logo(pool: &SqlitePool) -> AppResult<Option<Vec<u8>>> {
    crate::commands::firma::logo_get(pool).await
}

fn pruefe_ist_rechnung(kontext: &crate::dokument::kontext::BelegKontext) -> AppResult<()> {
    if kontext.beleg.typ != "rechnung" {
        return Err(crate::error::AppError::Validation {
            feld: "typ".into(),
            meldung: "Nur Rechnungen können als XRechnung/ZUGFeRD exportiert werden".into(),
        });
    }
    Ok(())
}

#[tauri::command]
pub async fn beleg_pdf_exportieren<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    pool: tauri::State<'_, SqlitePool>,
    id: String,
) -> AppResult<Vec<u8>> {
    let kontext = kontext_aus_beleg(&pool, id).await?;
    let logo = firma_logo(&pool).await?;
    let vorlage = crate::dokument::vorlage::Vorlage::laden(&pool).await?;
    let bytes = pdf::rendern(&kontext, logo.as_deref(), &vorlage)?;
    let nummer = kontext.beleg.nummer.clone().unwrap_or_else(|| kontext.beleg.id.clone());
    im_app_verzeichnis_ablegen(&app, &format!("{}.pdf", dateiname_sicher(&nummer)), &bytes)?;
    Ok(bytes)
}

#[tauri::command]
pub async fn rechnung_xrechnung_exportieren<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    pool: tauri::State<'_, SqlitePool>,
    id: String,
) -> AppResult<Vec<u8>> {
    let kontext = kontext_aus_beleg(&pool, id).await?;
    pruefe_ist_rechnung(&kontext)?;
    xrechnung::pruefe_exportierbarkeit(&kontext)?;
    let xml = xrechnung::xml_erzeugen(&kontext)?;
    let nummer = kontext.beleg.nummer.clone().unwrap_or_else(|| kontext.beleg.id.clone());
    let bytes = xml.into_bytes();
    im_app_verzeichnis_ablegen(&app, &format!("{}.xrechnung.xml", dateiname_sicher(&nummer)), &bytes)?;
    Ok(bytes)
}

#[tauri::command]
pub async fn rechnung_zugferd_exportieren<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    pool: tauri::State<'_, SqlitePool>,
    id: String,
) -> AppResult<Vec<u8>> {
    let kontext = kontext_aus_beleg(&pool, id).await?;
    pruefe_ist_rechnung(&kontext)?;
    xrechnung::pruefe_exportierbarkeit(&kontext)?;
    let logo = firma_logo(&pool).await?;
    let vorlage = crate::dokument::vorlage::Vorlage::laden(&pool).await?;
    let pdf_bytes = pdf::rendern(&kontext, logo.as_deref(), &vorlage)?;
    let xml = xrechnung::xml_erzeugen(&kontext)?;
    let bytes = zugferd::einbetten(pdf_bytes, &xml)?;
    let nummer = kontext.beleg.nummer.clone().unwrap_or_else(|| kontext.beleg.id.clone());
    im_app_verzeichnis_ablegen(&app, &format!("{}.zugferd.pdf", dateiname_sicher(&nummer)), &bytes)?;
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dateiname_sicher_ersetzt_schraegstriche() {
        assert_eq!(dateiname_sicher("RE-2026/0001"), "RE-2026-0001");
        assert_eq!(dateiname_sicher("RE-2026-0001"), "RE-2026-0001");
    }

    /// GoBD-Unveränderbarkeit: Wird eine Rechnung nach einer Stammdatenänderung
    /// erneut exportiert, darf die archivierte Fassung nicht durch ein
    /// inhaltlich anderes Dokument ersetzt werden.
    #[test]
    fn ablegen_ueberschreibt_eine_vorhandene_datei_nicht() {
        let dir = tempfile::tempdir().unwrap();
        ablegen(dir.path(), "RE-2026-0001.pdf", b"urspruengliche fassung").unwrap();
        ablegen(dir.path(), "RE-2026-0001.pdf", b"spaeter geaenderte fassung").unwrap();

        let inhalt = std::fs::read(dir.path().join("RE-2026-0001.pdf")).unwrap();
        assert_eq!(inhalt, b"urspruengliche fassung");
    }

    #[test]
    fn ablegen_legt_verzeichnis_an_und_schreibt_neue_dateien() {
        let dir = tempfile::tempdir().unwrap();
        let unterordner = dir.path().join("Belege");
        ablegen(&unterordner, "RE-2026-0002.pdf", b"inhalt").unwrap();
        assert_eq!(std::fs::read(unterordner.join("RE-2026-0002.pdf")).unwrap(), b"inhalt");
    }
}
