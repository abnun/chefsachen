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

/// Das Belegarchiv: erzeugte PDFs, XRechnungen und ZUGFeRD-Dateien.
///
/// Liegt neben der Datenbank, nicht darin — die Dateien wären sonst BLOBs in
/// einer sonst schlanken Tabelle. Genau deshalb deckt eine Sicherung der
/// Datenbank allein dieses Archiv nicht ab; siehe `backup::archiv_bauen`.
pub(crate) fn belege_verzeichnis(app_data_dir: &std::path::Path) -> std::path::PathBuf {
    app_data_dir.join("Belege")
}

fn im_app_verzeichnis_ablegen<R: tauri::Runtime>(app: &tauri::AppHandle<R>, dateiname: &str, bytes: &[u8]) -> AppResult<()> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| crate::error::AppError::Technisch(e.to_string()))?;
    ablegen(&belege_verzeichnis(&app_data_dir), dateiname, bytes)
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

/// Ohne offenen Betrag gibt es nichts zu erinnern, und ein Stornobeleg ist
/// eine Gutschrift, keine Forderung — `kontext_aus_beleg` lehnt einen Entwurf
/// bereits ab, hier kommen die übrigen Fälle dazu.
///
/// Auch die Fälligkeit gehört hierher: Eine „Erinnerung" vor Ablauf des
/// Zahlungsziels ergäbe einen Kundenbrief mit „Fällig seit … (−14 Tage)" —
/// gemahnt wird erst, wenn der Kunde tatsächlich im Verzug ist, also ab dem
/// Tag *nach* der Fälligkeit.
fn pruefe_kann_erinnert_werden(
    kontext: &crate::dokument::kontext::BelegKontext,
    heute: chrono::NaiveDate,
) -> AppResult<()> {
    pruefe_ist_rechnung(kontext)?;
    if kontext.beleg.status != "gestellt" {
        return Err(crate::error::AppError::Validation {
            feld: "status".into(),
            meldung: "Nur gestellte Rechnungen können eine Zahlungserinnerung erhalten".into(),
        });
    }
    if kontext.offener_betrag_cent <= 0 {
        return Err(crate::error::AppError::Validation {
            feld: "offener_betrag_cent".into(),
            meldung: "Diese Rechnung ist bereits vollständig bezahlt".into(),
        });
    }
    let faellig = chrono::NaiveDate::parse_from_str(&kontext.beleg.datum, "%Y-%m-%d")
        .ok()
        .and_then(|d| d.checked_add_signed(chrono::Duration::days(kontext.beleg.zahlungsziel_tage)))
        .ok_or_else(|| crate::error::AppError::Validation {
            feld: "datum".into(),
            meldung: "Das Belegdatum ist kein gültiges Datum".into(),
        })?;
    if heute <= faellig {
        return Err(crate::error::AppError::Validation {
            feld: "faellig_am".into(),
            meldung: "Diese Rechnung ist noch nicht überfällig".into(),
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

/// Zahlungserinnerung zu einer gestellten, noch nicht vollständig bezahlten
/// Rechnung.
///
/// Anders als PDF/XRechnung/ZUGFeRD wird die Erinnerung **nicht** im
/// Belegarchiv abgelegt: Sie ist inhaltlich vom Tag der Erzeugung abhängig
/// ("3 Tage überfällig" ändert sich täglich), also kein einmal eingefrorenes
/// Dokument — eine archivierte erste Fassung veraltete sofort, während jeder
/// erneute Export etwas anderes zurückgäbe. Sie ist auch keine Pflichtangabe
/// nach GoBD wie eine Rechnung selbst.
#[tauri::command]
pub async fn rechnung_zahlungserinnerung_exportieren(
    pool: tauri::State<'_, SqlitePool>,
    id: String,
) -> AppResult<Vec<u8>> {
    let kontext = kontext_aus_beleg(&pool, id).await?;
    let heute = chrono::Local::now().date_naive();
    pruefe_kann_erinnert_werden(&kontext, heute)?;
    let logo = firma_logo(&pool).await?;
    let vorlage = crate::dokument::vorlage::Vorlage::laden(&pool).await?;
    let erinnerungstext = crate::commands::belege::baustein(&pool, "text.zahlungserinnerung").await?;
    pdf::rendern_zahlungserinnerung(&kontext, logo.as_deref(), &vorlage, heute, &erinnerungstext)
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

    /// Der Testbeleg: datum 2026-07-11, Zahlungsziel 14 Tage → fällig am
    /// 2026-07-25. Ein „heute" danach heißt überfällig.
    fn tag(iso: &str) -> chrono::NaiveDate {
        chrono::NaiveDate::parse_from_str(iso, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn eine_ueberfaellige_rechnung_mit_offenem_betrag_darf_erinnert_werden() {
        let kontext = crate::dokument::pdf::tests::test_kontext();
        assert!(pruefe_kann_erinnert_werden(&kontext, tag("2026-08-04")).is_ok());
    }

    /// Gemahnt wird erst ab dem Tag *nach* der Fälligkeit. Vorher entstünde
    /// ein Kundenbrief mit „Fällig seit … (−14 Tage)".
    #[test]
    fn vor_und_am_faelligkeitstag_gibt_es_keine_zahlungserinnerung() {
        let kontext = crate::dokument::pdf::tests::test_kontext();
        for heute in ["2026-07-11", "2026-07-20", "2026-07-25"] {
            let fehler = pruefe_kann_erinnert_werden(&kontext, tag(heute)).unwrap_err();
            match fehler {
                crate::error::AppError::Validation { feld, .. } => assert_eq!(feld, "faellig_am", "heute = {heute}"),
                anderer => panic!("unerwarteter Fehler: {anderer:?}"),
            }
        }
        // Der erste Tag im Verzug.
        assert!(pruefe_kann_erinnert_werden(&kontext, tag("2026-07-26")).is_ok());
    }

    #[test]
    fn ein_angebot_bekommt_keine_zahlungserinnerung() {
        let mut kontext = crate::dokument::pdf::tests::test_kontext();
        kontext.beleg.typ = "angebot".into();
        let fehler = pruefe_kann_erinnert_werden(&kontext, tag("2026-08-04")).unwrap_err();
        assert!(matches!(fehler, crate::error::AppError::Validation { .. }));
    }

    #[test]
    fn ein_stornobeleg_bekommt_keine_zahlungserinnerung() {
        // Ein Stornobeleg ist eine Gutschrift, keine Forderung.
        let mut kontext = crate::dokument::pdf::tests::test_kontext();
        kontext.beleg.status = "storniert".into();
        let fehler = pruefe_kann_erinnert_werden(&kontext, tag("2026-08-04")).unwrap_err();
        match fehler {
            crate::error::AppError::Validation { feld, .. } => assert_eq!(feld, "status"),
            anderer => panic!("unerwarteter Fehler: {anderer:?}"),
        }
    }

    #[test]
    fn eine_vollstaendig_bezahlte_rechnung_bekommt_keine_zahlungserinnerung() {
        let mut kontext = crate::dokument::pdf::tests::test_kontext();
        kontext.offener_betrag_cent = 0;
        let fehler = pruefe_kann_erinnert_werden(&kontext, tag("2026-08-04")).unwrap_err();
        match fehler {
            crate::error::AppError::Validation { feld, .. } => assert_eq!(feld, "offener_betrag_cent"),
            anderer => panic!("unerwarteter Fehler: {anderer:?}"),
        }
    }

    /// Ein unparsebares Belegdatum darf nicht zu „Fällig seit  (0 Tage)" auf
    /// dem PDF führen, sondern zu einer klaren Meldung.
    #[test]
    fn ein_unlesbares_belegdatum_wird_abgelehnt() {
        let mut kontext = crate::dokument::pdf::tests::test_kontext();
        kontext.beleg.datum = "irgendwann".into();
        let fehler = pruefe_kann_erinnert_werden(&kontext, tag("2026-08-04")).unwrap_err();
        match fehler {
            crate::error::AppError::Validation { feld, .. } => assert_eq!(feld, "datum"),
            anderer => panic!("unerwarteter Fehler: {anderer:?}"),
        }
    }
}
