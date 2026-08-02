//! Anbindung an veraPDF, den Referenz-Prüfer für PDF/A.
//!
//! ZUGFeRD verlangt ein PDF/A-3-Dokument mit eingebettetem XML. Die vorhandenen
//! Tests belegten nur, dass die Zeichenfolge „factur-x.xml" irgendwo in den
//! Bytes vorkommt — nicht, dass die Datei den PDF/A-3-Regeln genügt. Genau dort
//! lag der Fehler: Das Dokument behauptete in seinen Metadaten PDF/A-3, war aber
//! ein gewöhnliches PDF 1.7.
//!
//! veraPDF wird wie der KoSIT-Validator in einem gitignorierten Cache abgelegt
//! (`scripts/kosit-vorbereiten.sh` richtet beide ein). Fehlt er oder eine
//! Java-Laufzeit, überspringt sich die Prüfung — mit `KOSIT_PFLICHT` bricht sie
//! stattdessen ab, damit ein Einrichtungsfehler in der CI nicht als bestandener
//! Test durchgeht.

use std::path::{Path, PathBuf};
use std::process::Command;

pub struct Bericht {
    pub konform: bool,
    /// Die verletzten PDF/A-Regeln, jeweils mit Klausel und Beschreibung.
    pub verstoesse: Vec<String>,
}

fn cache_verzeichnis() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join(".validator-cache")
}

fn programm() -> PathBuf {
    cache_verzeichnis().join("verapdf/verapdf")
}

fn java_vorhanden() -> bool {
    Command::new("java")
        .arg("-version")
        .output()
        .map(|a| a.status.success())
        .unwrap_or(false)
}

/// Prüft, ob veraPDF bereitsteht. Gibt bei Fehlen den Grund zurück.
///
/// Wie bei der XRechnung-Prüfung gilt: Ist `KOSIT_PFLICHT` gesetzt, bricht die
/// Funktion ab, statt das Überspringen zuzulassen — ein übersprungener Test ist
/// in der Cargo-Ausgabe sonst nicht von einem bestandenen zu unterscheiden.
pub fn nicht_verfuegbar_weil() -> Option<String> {
    let grund = if !programm().is_file() {
        Some(format!(
            "veraPDF fehlt in {}. Einmalig einrichten mit: ./scripts/kosit-vorbereiten.sh",
            cache_verzeichnis().display()
        ))
    } else if !java_vorhanden() {
        // Das veraPDF-Startskript ruft java auf. Ohne JVM scheitert es mit einer
        // leeren Ausgabe — ohne diese Prüfung liefe der Test in einen
        // Aufruf-Fehler statt sich sauber zu überspringen.
        Some(
            "Keine Java-Laufzeit gefunden — veraPDF benötigt eine \
             (unter macOS z. B. 'brew install openjdk')."
                .into(),
        )
    } else {
        None
    };
    if let Some(grund) = &grund {
        if std::env::var_os("KOSIT_PFLICHT").is_some() {
            panic!("KOSIT_PFLICHT ist gesetzt, aber veraPDF ist nicht einsatzbereit: {grund}");
        }
    }
    grund
}

/// Prüft ein PDF gegen ein PDF/A-Profil (z. B. `"3b"`).
pub fn pruefen(pdf: &[u8], flavour: &str) -> Result<Bericht, String> {
    let arbeitsverzeichnis = tempfile::tempdir().map_err(|e| e.to_string())?;
    let datei = arbeitsverzeichnis.path().join("pruefling.pdf");
    std::fs::write(&datei, pdf).map_err(|e| e.to_string())?;

    let ausgabe = Command::new(programm())
        .arg("--flavour")
        .arg(flavour)
        .arg("--format")
        .arg("xml")
        .arg(&datei)
        .output()
        .map_err(|e| format!("veraPDF ließ sich nicht starten: {e}"))?;

    let bericht = String::from_utf8_lossy(&ausgabe.stdout).into_owned();
    if bericht.trim().is_empty() {
        return Err(format!(
            "veraPDF hat keinen Bericht erzeugt.\nstderr: {}",
            String::from_utf8_lossy(&ausgabe.stderr)
        ));
    }
    Ok(bericht_auswerten(&bericht))
}

/// Liest Urteil und Regelverstöße aus dem veraPDF-Bericht.
///
/// Maßgeblich ist `isCompliant` am `<validationReport>`-Element. Die
/// Einzelverstöße stehen als `<rule ... status="FAILED">` mit `clause`,
/// `testNumber` und einer `<description>`.
fn bericht_auswerten(bericht: &str) -> Bericht {
    let konform = attribut_im_element(bericht, "<validationReport", "isCompliant")
        .map(|w| w == "true")
        .unwrap_or(false);

    let mut verstoesse = Vec::new();
    for teil in bericht.split("<rule ").skip(1) {
        let Some(kopf_ende) = teil.find('>') else { continue };
        let kopf = &teil[..kopf_ende];
        // veraPDF schreibt den Status klein ("failed"); ein Vergleich auf
        // Großschreibung ließe jeden Verstoß unbemerkt durchgehen.
        if !attribut(kopf, "status").is_some_and(|s| s.eq_ignore_ascii_case("failed")) {
            continue;
        }
        let klausel = attribut(kopf, "clause").unwrap_or_default();
        let test = attribut(kopf, "testNumber").unwrap_or_default();
        let beschreibung = zwischen(&teil[kopf_ende..], "<description>", "</description>")
            .unwrap_or_else(|| "(ohne Beschreibung)".into());
        verstoesse.push(format!(
            "{} (Test {}): {}",
            klausel,
            test,
            normalisiere(&beschreibung)
        ));
    }
    verstoesse.dedup();
    Bericht { konform, verstoesse }
}

fn attribut_im_element(text: &str, element: &str, name: &str) -> Option<String> {
    let start = text.find(element)?;
    let ende = text[start..].find('>')? + start;
    attribut(&text[start..ende], name)
}

fn attribut(kopf: &str, name: &str) -> Option<String> {
    let muster = format!("{name}=");
    let pos = kopf.find(&muster)?;
    let rest = &kopf[pos + muster.len()..];
    let trenner = rest.chars().next()?;
    if trenner != '"' && trenner != '\'' {
        return None;
    }
    let wert_ende = rest[1..].find(trenner)? + 1;
    Some(rest[1..wert_ende].to_string())
}

fn zwischen(text: &str, von: &str, bis: &str) -> Option<String> {
    let start = text.find(von)? + von.len();
    let ende = text[start..].find(bis)? + start;
    Some(text[start..ende].to_string())
}

fn normalisiere(text: &str) -> String {
    text.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bericht_auswerten_erkennt_konformitaet() {
        let bericht = r#"<report><validationReport profileName="PDF/A-3B" isCompliant="true">
            </validationReport></report>"#;
        let ergebnis = bericht_auswerten(bericht);
        assert!(ergebnis.konform);
        assert!(ergebnis.verstoesse.is_empty());
    }

    #[test]
    fn bericht_auswerten_sammelt_fehlgeschlagene_regeln() {
        let bericht = r#"<report><validationReport isCompliant="false">
            <rule specification="ISO 19005-3" clause="6.1.2" testNumber="1" status="failed" failedChecks="1">
              <description>Der Dateikopf muss eine Version enthalten.</description>
            </rule>
            <rule specification="ISO 19005-3" clause="6.2.2" testNumber="2" status="passed" failedChecks="0">
              <description>Wird nicht gemeldet.</description>
            </rule>
            </validationReport></report>"#;
        let ergebnis = bericht_auswerten(bericht);
        assert!(!ergebnis.konform);
        assert_eq!(ergebnis.verstoesse.len(), 1);
        assert!(ergebnis.verstoesse[0].starts_with("6.1.2 (Test 1):"));
        assert!(ergebnis.verstoesse[0].contains("Dateikopf"));
    }

    #[test]
    fn fehlender_bericht_gilt_nicht_als_konform() {
        assert!(!bericht_auswerten("").konform);
    }
}
