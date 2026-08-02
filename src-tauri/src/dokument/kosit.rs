//! Anbindung an den offiziellen KoSIT-Validator für XRechnung.
//!
//! Die übrigen Tests dieses Moduls prüfen nur, ob bestimmte Zeichenketten im
//! erzeugten XML vorkommen. Sie bestätigen damit, dass der Code tut, was er tut
//! — nie, dass das Ergebnis der Norm EN 16931 entspricht. Diese Lücke schließt
//! der amtliche Validator: derselbe, den Rechnungsempfänger einsetzen.
//!
//! Werkzeug und Regelwerk liegen nicht im Repository, sondern in einem lokalen
//! Cache (`src-tauri/.validator-cache`), den `scripts/kosit-vorbereiten.sh`
//! befüllt. Fehlt der Cache oder eine Java-Laufzeit, überspringt sich die
//! Prüfung mit einem Hinweis, statt fehlzuschlagen — sonst könnte niemand ohne
//! Netz und JVM die Testsuite laufen lassen. In der CI ist beides vorhanden,
//! dort läuft die Prüfung bei jedem Durchlauf.

use std::path::{Path, PathBuf};
use std::process::Command;

/// Ergebnis einer Validierung.
pub struct Bericht {
    pub gueltig: bool,
    /// Die gemeldeten Regelverstöße in lesbarer Form.
    pub verstoesse: Vec<String>,
    /// Hinweise unterhalb der Fehlerschwelle. Die KoSIT-Konfiguration nimmt ein
    /// Dokument nur ohne jeden Befund an, eine Warnung führt also ebenfalls zur
    /// Ablehnung — ohne sie auszuweisen stünde im Fehlertext „0 Regeln".
    pub warnungen: Vec<String>,
}

impl Bericht {
    /// Alle Befunde für die Fehlerausgabe, Warnungen als solche gekennzeichnet.
    pub fn befunde(&self) -> Vec<String> {
        self.verstoesse
            .iter()
            .cloned()
            .chain(self.warnungen.iter().map(|w| format!("(Warnung) {w}")))
            .collect()
    }
}

fn cache_verzeichnis() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join(".validator-cache")
}

fn java_vorhanden() -> bool {
    Command::new("java")
        .arg("-version")
        .output()
        .map(|a| a.status.success())
        .unwrap_or(false)
}

/// Prüft, ob Validator, Regelwerk und Java-Laufzeit bereitstehen.
/// Gibt bei Fehlen den Grund zurück, damit der Test ihn ausgeben kann.
///
/// Ist die Umgebungsvariable `KOSIT_PFLICHT` gesetzt, bricht die Funktion
/// stattdessen ab. Grund: Cargo verschluckt die Ausgabe bestehender Tests, ein
/// übersprungener Test ist also von einem bestandenen nicht zu unterscheiden.
/// In der CI, wo Validator und JVM vorhanden sein müssen, würde ein Fehler in
/// der Einrichtung sonst dazu führen, dass wir uns validiert glauben, ohne es
/// zu sein — genau die falsche Sicherheit, gegen die dieser Test antritt.
pub fn nicht_verfuegbar_weil() -> Option<String> {
    let grund = pruefe_verfuegbarkeit();
    if let Some(grund) = &grund {
        if std::env::var_os("KOSIT_PFLICHT").is_some() {
            panic!(
                "KOSIT_PFLICHT ist gesetzt, aber die Validierung ist nicht einsatzbereit: {grund}"
            );
        }
    }
    grund
}

fn pruefe_verfuegbarkeit() -> Option<String> {
    let cache = cache_verzeichnis();
    if !cache.join("validator.jar").is_file() || !cache.join("config/scenarios.xml").is_file() {
        return Some(format!(
            "KoSIT-Validator fehlt in {}. Einmalig einrichten mit: ./scripts/kosit-vorbereiten.sh",
            cache.display()
        ));
    }
    if !java_vorhanden() {
        return Some(
            "Keine Java-Laufzeit gefunden — der KoSIT-Validator benötigt eine \
             (unter macOS z. B. 'brew install openjdk')."
                .into(),
        );
    }
    None
}

/// Validiert ein XRechnung-Dokument gegen die amtlichen Regeln.
///
/// Setzt voraus, dass `nicht_verfuegbar_weil()` `None` liefert.
pub fn validieren(xml: &str) -> Result<Bericht, String> {
    let cache = cache_verzeichnis();
    let arbeitsverzeichnis = tempfile::tempdir().map_err(|e| e.to_string())?;
    let eingabe = arbeitsverzeichnis.path().join("rechnung.xml");
    std::fs::write(&eingabe, xml).map_err(|e| e.to_string())?;

    let ausgabe = Command::new("java")
        .arg("-jar")
        .arg(cache.join("validator.jar"))
        .arg("-s")
        .arg(cache.join("config/scenarios.xml"))
        .arg("-r")
        .arg(cache.join("config"))
        .arg("-o")
        .arg(arbeitsverzeichnis.path())
        .arg(&eingabe)
        .output()
        .map_err(|e| format!("Validator ließ sich nicht starten: {e}"))?;

    let bericht_pfad = arbeitsverzeichnis.path().join("rechnung-report.xml");
    if !bericht_pfad.is_file() {
        return Err(format!(
            "Der Validator hat keinen Bericht erzeugt.\nstdout: {}\nstderr: {}",
            String::from_utf8_lossy(&ausgabe.stdout),
            String::from_utf8_lossy(&ausgabe.stderr)
        ));
    }
    let bericht = std::fs::read_to_string(&bericht_pfad).map_err(|e| e.to_string())?;
    Ok(bericht_auswerten(&bericht))
}

/// Liest das Gesamturteil und die Regelverstöße aus dem Prüfbericht.
///
/// Maßgeblich ist das `valid`-Attribut am Wurzelelement `<rep:report>` — das
/// ist die Aussage, die der Validator selbst trifft. Die Einzelverstöße stehen
/// als `<svrl:failed-assert>` mit dem Regeltext im `<svrl:text>`-Kind.
///
/// Sonderfall `<rep:noScenarioMatched>`: Dann konnte der Validator das Dokument
/// keinem Szenario zuordnen und hat die Regeln gar nicht erst angewandt. Es gibt
/// dann keine Einzelverstöße, obwohl das Dokument unbrauchbar ist — ohne
/// gesonderte Behandlung stünde im Fehlertext „verstößt gegen 0 Regeln", was
/// niemandem weiterhilft.
fn bericht_auswerten(bericht: &str) -> Bericht {
    let gueltig = kopf_attribut_valid(bericht).unwrap_or(false);

    let mut verstoesse = Vec::new();
    let mut warnungen: Vec<String> = Vec::new();
    if bericht.contains("noScenarioMatched") {
        verstoesse.push(
            "Kein Prüfszenario passte auf das Dokument — der Validator konnte es nicht als \
             XRechnung erkennen. Üblicher Grund: rsm:ExchangedDocumentContext mit der \
             Profilkennung (BT-24) fehlt oder ist falsch."
                .into(),
        );
    }

    // Der Validator meldet Einzelbefunde als <rep:message level="..." code="...">.
    // Nur `error` entscheidet über Gültigkeit; `warning` wird gesammelt, aber
    // getrennt ausgewiesen, damit eine Warnung keinen Test rot färbt.
    for teil in bericht.split("<rep:message").skip(1) {
        let Some(kopf_ende) = teil.find('>') else { continue };
        let attribute = &teil[..kopf_ende];
        let rest = &teil[kopf_ende + 1..];
        let Some(text_ende) = rest.find("</rep:message>") else { continue };
        let text = entschaerfe(rest[..text_ende].trim());
        if text.is_empty() {
            continue;
        }
        match attribut(attribute, "level").as_deref() {
            Some("error") => verstoesse.push(text),
            Some("warning") => warnungen.push(text),
            _ => {}
        }
    }
    verstoesse.dedup();
    warnungen.dedup();
    Bericht { gueltig, verstoesse, warnungen }
}

/// Liest `valid="true|false"` aus dem öffnenden `<rep:report>`-Element.
fn kopf_attribut_valid(bericht: &str) -> Option<bool> {
    let start = bericht.find("<rep:report")?;
    let ende = bericht[start..].find('>')? + start;
    Some(attribut(&bericht[start..ende], "valid")? == "true")
}

/// Liest den Wert eines Attributs aus einem Element-Kopf.
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

/// Macht XML-Entities im Regeltext wieder lesbar.
fn entschaerfe(text: &str) -> String {
    text.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bericht_auswerten_erkennt_annahme() {
        let bericht = r#"<rep:report xmlns:rep="x" varlVersion="1.0.0" valid="true">
            <rep:assessment><rep:accept/></rep:assessment></rep:report>"#;
        let ergebnis = bericht_auswerten(bericht);
        assert!(ergebnis.gueltig);
        assert!(ergebnis.verstoesse.is_empty());
    }

    #[test]
    fn bericht_auswerten_sammelt_regelverstoesse() {
        let bericht = r#"<rep:report xmlns:rep="x" valid="false">
            <rep:assessment><rep:reject/></rep:assessment>
            <rep:message id="a" level="error" code="BR-01">[BR-01] Eine Rechnung muss
            eine Nummer haben.</rep:message>
            <rep:message id="b" level="error" code="BR-02">[BR-02] Fehlt auch.</rep:message>
            <rep:message id="c" level="warning" code="BR-03">Nur ein Hinweis.</rep:message>
            </rep:report>"#;
        let ergebnis = bericht_auswerten(bericht);
        assert!(!ergebnis.gueltig);
        // Die Warnung darf nicht als Verstoß zählen, aber auch nicht verschwinden.
        assert_eq!(ergebnis.warnungen, vec!["Nur ein Hinweis."]);
        assert_eq!(ergebnis.befunde().len(), 3);
        assert_eq!(ergebnis.verstoesse.len(), 2);
        assert_eq!(ergebnis.verstoesse[0], "[BR-01] Eine Rechnung muss eine Nummer haben.");
        assert_eq!(ergebnis.verstoesse[1], "[BR-02] Fehlt auch.");
    }

    /// Ohne diesen Sonderfall meldete der Test „verstößt gegen 0 Regel(n)" —
    /// technisch richtig und praktisch wertlos. Dieser Bericht stammt aus einem
    /// echten Lauf gegen die damals erzeugte XRechnung.
    #[test]
    fn bericht_auswerten_erklaert_fehlendes_szenario() {
        let bericht = r#"<rep:report xmlns:rep="x" valid="false">
            <rep:noScenarioMatched><rep:validationStepResult id="val-xml" valid="true"/>
            </rep:noScenarioMatched>
            <rep:assessment><rep:reject/></rep:assessment></rep:report>"#;
        let ergebnis = bericht_auswerten(bericht);
        assert!(!ergebnis.gueltig);
        assert_eq!(ergebnis.verstoesse.len(), 1);
        assert!(ergebnis.verstoesse[0].contains("Kein Prüfszenario"));
        assert!(ergebnis.verstoesse[0].contains("BT-24"));
    }

    #[test]
    fn attribut_liest_werte_und_lehnt_unquotierte_ab() {
        assert_eq!(attribut(r#"<x level="error" code="BR-1">"#, "level").as_deref(), Some("error"));
        assert_eq!(attribut(r#"<x code='BR-1'>"#, "code").as_deref(), Some("BR-1"));
        assert_eq!(attribut("<x level=error>", "level"), None);
        assert_eq!(attribut("<x>", "level"), None);
    }

    #[test]
    fn kopf_attribut_valid_liest_das_urteil() {
        assert_eq!(kopf_attribut_valid(r#"<rep:report valid="true">"#), Some(true));
        assert_eq!(kopf_attribut_valid(r#"<rep:report a="1" valid="false" b="2">"#), Some(false));
        assert_eq!(kopf_attribut_valid("<rep:report>"), None);
        assert_eq!(kopf_attribut_valid("kein Bericht"), None);
    }

    #[test]
    fn entschaerfe_macht_entities_lesbar() {
        assert_eq!(entschaerfe("a &lt;b&gt; &amp; c"), "a <b> & c");
    }
}
