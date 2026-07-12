use crate::dokument::{kontext::kontext_aus_beleg, pdf, xrechnung, zugferd};
use crate::error::AppResult;
use sqlx::SqlitePool;
use tauri::Manager;

fn dateiname_sicher(nummer: &str) -> String {
    nummer.replace(['/', '\\'], "-")
}

fn im_app_verzeichnis_ablegen(app: &tauri::AppHandle, dateiname: &str, bytes: &[u8]) -> AppResult<()> {
    let verzeichnis = app.path().app_data_dir()
        .map_err(|e| crate::error::AppError::Technisch(e.to_string()))?
        .join("Belege");
    std::fs::create_dir_all(&verzeichnis)
        .map_err(|e| crate::error::AppError::Technisch(e.to_string()))?;
    std::fs::write(verzeichnis.join(dateiname), bytes)
        .map_err(|e| crate::error::AppError::Technisch(e.to_string()))?;
    Ok(())
}

async fn firma_logo(pool: &SqlitePool) -> AppResult<Option<Vec<u8>>> {
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
pub async fn beleg_pdf_exportieren(
    app: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    id: String,
) -> AppResult<Vec<u8>> {
    let kontext = kontext_aus_beleg(&pool, id).await?;
    let logo = firma_logo(&pool).await?;
    let bytes = pdf::rendern(&kontext, logo.as_deref())?;
    let nummer = kontext.beleg.nummer.clone().unwrap_or_else(|| kontext.beleg.id.clone());
    im_app_verzeichnis_ablegen(&app, &format!("{}.pdf", dateiname_sicher(&nummer)), &bytes)?;
    Ok(bytes)
}

#[tauri::command]
pub async fn rechnung_xrechnung_exportieren(
    app: tauri::AppHandle,
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
pub async fn rechnung_zugferd_exportieren(
    app: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    id: String,
) -> AppResult<Vec<u8>> {
    let kontext = kontext_aus_beleg(&pool, id).await?;
    pruefe_ist_rechnung(&kontext)?;
    xrechnung::pruefe_exportierbarkeit(&kontext)?;
    let logo = firma_logo(&pool).await?;
    let pdf_bytes = pdf::rendern(&kontext, logo.as_deref())?;
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
}
