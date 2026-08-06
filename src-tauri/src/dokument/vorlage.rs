//! Einstellbares am Aussehen von Angebot und Rechnung.
//!
//! Bewusst eine feste Menge von Stellschrauben statt einer frei editierbaren
//! Vorlage. Die PDF ist hier kein reines Layout-Erzeugnis: Sie muss PDF/A-3b
//! sein und die ZUGFeRD-XML als Anhang tragen, das Anschriftfeld muss nach
//! DIN 5008 im Sichtfenster liegen, und die Pflichtangaben nach § 14 UStG
//! müssen darauf stehen. Eine freie Vorlage kann all das verlieren, ohne dass
//! es jemandem auffällt — bis der Empfänger die Rechnung zurückweist.
//!
//! Was hier fehlt, fehlt mit Absicht:
//!
//! * **Menge und Bezeichnung** lassen sich nicht abschalten. Beide sind
//!   Pflichtangaben nach § 14 Abs. 4 Nr. 5 UStG.
//! * Eine **Artikelnummer-Spalte** gibt es nicht. Die Nummer steht am Artikel,
//!   nicht an der Belegposition — in einem archivierten Beleg zeigte sie den
//!   heutigen Stand des Artikels statt den von damals.
//! * Die **Lage des Anschriftfelds** ist nicht verstellbar. Sie folgt DIN 5008;
//!   woanders liegt die Anschrift nicht mehr im Umschlagfenster.

use crate::error::AppResult;
use sqlx::SqlitePool;

/// Wo das Logo steht.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogoPosition {
    Links,
    Rechts,
    Keins,
}

impl LogoPosition {
    fn aus(wert: &str) -> Self {
        match wert {
            "rechts" => Self::Rechts,
            "keins" => Self::Keins,
            _ => Self::Links,
        }
    }

    fn als_str(self) -> &'static str {
        match self {
            Self::Links => "links",
            Self::Rechts => "rechts",
            Self::Keins => "keins",
        }
    }
}

/// Alles, was sich am Aussehen einstellen lässt.
#[derive(Debug, Clone, PartialEq)]
pub struct Vorlage {
    pub logo_position: LogoPosition,
    pub logo_hoehe_mm: f64,
    /// Die kleingedruckte Rücksendeangabe über der Anschrift (DIN 5008).
    pub absenderzeile: bool,
    pub akzentfarbe: String,
    pub spalte_nummer: bool,
    /// Einheit als eigene Spalte statt hinter der Menge.
    pub einheit_eigene_spalte: bool,
    pub spalte_einzelpreis: bool,
    /// Volle Gitterlinien um jede Zelle der Positionstabelle, statt nur einer
    /// Linie unter Kopf- und Positionszeilen — wie eine Buchhaltungstabelle
    /// in Excel. Wer nur wenige Positionen hat, findet die schlanke Vorgabe
    /// oft übersichtlicher; bei vielen Positionen hilft das volle Gitter dem
    /// Auge beim Zeilen-Halten.
    pub tabelle_gitterlinien: bool,
    /// Ob ein SEPA-Girocode (QR-Zahlungscode) auf Rechnung und
    /// Zahlungserinnerung erscheint. Anders als die übrigen Einstellungen
    /// hier standardmäßig aktiv — ausdrücklicher Nutzerwunsch, kein
    /// Bewahren des bisherigen Aussehens.
    pub zeigt_girocode: bool,
    pub rand_oben_mm: f64,
    pub rand_unten_mm: f64,
    pub rand_seitlich_mm: f64,
}

impl Default for Vorlage {
    /// Die Vorgaben bilden das bisherige Aussehen ab. Wer nichts einstellt,
    /// bekommt denselben Beleg wie zuvor — sonst änderte ein Programmupdate
    /// stillschweigend das Erscheinungsbild laufender Geschäftspost.
    fn default() -> Self {
        Self {
            logo_position: LogoPosition::Links,
            logo_hoehe_mm: 20.0,
            absenderzeile: true,
            akzentfarbe: "#1a1a1a".into(),
            spalte_nummer: true,
            einheit_eigene_spalte: false,
            spalte_einzelpreis: true,
            tabelle_gitterlinien: false,
            zeigt_girocode: true,
            rand_oben_mm: 25.0,
            rand_unten_mm: 25.0,
            rand_seitlich_mm: 25.0,
        }
    }
}

/// Ein Maß in Millimetern, auf einen sinnvollen Bereich begrenzt.
///
/// Ohne Begrenzung machte eine vertippte Null aus dem Seitenrand einen
/// Randstreifen von 250 mm — und die Rechnung unbrauchbar, ohne dass jemand
/// sähe, woran es liegt.
fn mm(wert: Option<String>, standard: f64, min: f64, max: f64) -> f64 {
    wert.and_then(|w| w.trim().replace(',', ".").parse::<f64>().ok())
        .filter(|z| z.is_finite())
        .map(|z| z.clamp(min, max))
        .unwrap_or(standard)
}

/// Eine Farbe in der Form `#rrggbb`.
///
/// Alles andere fällt auf die Vorgabe zurück: Typst bricht bei einer
/// unlesbaren Farbe die Erzeugung ab, und dann ließe sich gar keine Rechnung
/// mehr schreiben.
fn farbe(wert: Option<String>, standard: &str) -> String {
    wert.filter(|w| {
        let w = w.trim();
        w.len() == 7
            && w.starts_with('#')
            && w[1..].chars().all(|c| c.is_ascii_hexdigit())
    })
    .map(|w| w.trim().to_string())
    .unwrap_or_else(|| standard.to_string())
}

fn ja(wert: Option<String>, standard: bool) -> bool {
    match wert.as_deref() {
        Some("ja") => true,
        Some("nein") => false,
        _ => standard,
    }
}

impl Vorlage {
    /// Liest die Einstellungen. Fehlende oder unbrauchbare Werte fallen auf die
    /// Vorgabe zurück — eine kaputte Einstellung darf den Beleg nicht verhindern.
    pub async fn laden(pool: &SqlitePool) -> AppResult<Self> {
        let alle = crate::commands::einstellungen::list(pool).await?;
        Ok(Self::aus_paaren(&alle))
    }

    /// Wie [`Self::laden`], aber aus einer übergebenen Liste.
    ///
    /// Die Vorschau zeigt Einstellungen, die noch gar nicht gespeichert sind —
    /// sonst müsste man erst speichern, um zu sehen, was man einstellt, und
    /// jeder Versuch änderte die laufende Geschäftspost.
    pub fn aus_paaren(paare: &[(String, String)]) -> Self {
        let hole = |schluessel: &str| {
            paare
                .iter()
                .find(|(k, _)| k == schluessel)
                .map(|(_, v)| v.clone())
        };
        let standard = Self::default();
        Self {
            logo_position: hole("vorlage.logo_position")
                .map(|w| LogoPosition::aus(&w))
                .unwrap_or(standard.logo_position),
            logo_hoehe_mm: mm(hole("vorlage.logo_hoehe_mm"), standard.logo_hoehe_mm, 5.0, 50.0),
            absenderzeile: ja(hole("vorlage.absenderzeile"), standard.absenderzeile),
            akzentfarbe: farbe(hole("vorlage.akzentfarbe"), &standard.akzentfarbe),
            spalte_nummer: ja(hole("vorlage.spalte_nummer"), standard.spalte_nummer),
            einheit_eigene_spalte: ja(
                hole("vorlage.einheit_eigene_spalte"),
                standard.einheit_eigene_spalte,
            ),
            spalte_einzelpreis: ja(hole("vorlage.spalte_einzelpreis"), standard.spalte_einzelpreis),
            tabelle_gitterlinien: ja(
                hole("vorlage.tabelle_gitterlinien"),
                standard.tabelle_gitterlinien,
            ),
            zeigt_girocode: ja(hole("vorlage.zeigt_girocode"), standard.zeigt_girocode),
            // Der obere Rand geht nicht unter 20 mm: Darunter überschnitte der
            // Briefkopf das Anschriftfeld, das bei 45 mm beginnt.
            rand_oben_mm: mm(hole("vorlage.rand_oben_mm"), standard.rand_oben_mm, 20.0, 40.0),
            rand_unten_mm: mm(hole("vorlage.rand_unten_mm"), standard.rand_unten_mm, 25.0, 40.0),
            // Seitlich höchstens 30 mm: Das Anschriftfeld beginnt nach DIN bei
            // 20 mm und ist 85 mm breit; ein breiterer Rand schöbe den Textblock
            // daneben weiter nach innen als das Fenster.
            rand_seitlich_mm: mm(
                hole("vorlage.rand_seitlich_mm"),
                standard.rand_seitlich_mm,
                15.0,
                30.0,
            ),
        }
    }

    /// Als Eingaben für die Typst-Vorlage.
    pub fn als_eingaben(&self) -> Vec<(&'static str, String)> {
        vec![
            ("v_logo_position", self.logo_position.als_str().to_string()),
            ("v_logo_hoehe_mm", self.logo_hoehe_mm.to_string()),
            ("v_absenderzeile", ja_nein(self.absenderzeile)),
            ("v_akzentfarbe", self.akzentfarbe.clone()),
            ("v_spalte_nummer", ja_nein(self.spalte_nummer)),
            ("v_einheit_eigene_spalte", ja_nein(self.einheit_eigene_spalte)),
            ("v_spalte_einzelpreis", ja_nein(self.spalte_einzelpreis)),
            ("v_tabelle_gitterlinien", ja_nein(self.tabelle_gitterlinien)),
            ("v_zeigt_girocode", ja_nein(self.zeigt_girocode)),
            ("v_rand_oben_mm", self.rand_oben_mm.to_string()),
            ("v_rand_unten_mm", self.rand_unten_mm.to_string()),
            ("v_rand_seitlich_mm", self.rand_seitlich_mm.to_string()),
        ]
    }
}

fn ja_nein(wert: bool) -> String {
    if wert { "ja".into() } else { "nein".into() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unbrauchbare_masse_fallen_auf_die_vorgabe_zurueck() {
        assert_eq!(mm(None, 25.0, 20.0, 40.0), 25.0);
        assert_eq!(mm(Some("keine Zahl".into()), 25.0, 20.0, 40.0), 25.0);
        assert_eq!(mm(Some("".into()), 25.0, 20.0, 40.0), 25.0);
    }

    #[test]
    fn masse_bleiben_im_zulaessigen_bereich() {
        // Eine vertippte Null machte aus 25 mm sonst 250 mm.
        assert_eq!(mm(Some("250".into()), 25.0, 20.0, 40.0), 40.0);
        assert_eq!(mm(Some("0".into()), 25.0, 20.0, 40.0), 20.0);
    }

    #[test]
    fn versteht_das_deutsche_dezimalkomma() {
        assert_eq!(mm(Some("22,5".into()), 25.0, 20.0, 40.0), 22.5);
    }

    #[test]
    fn nimmt_nur_vollstaendige_farbangaben() {
        // Typst bricht bei einer unlesbaren Farbe ab — dann ließe sich gar keine
        // Rechnung mehr erzeugen.
        assert_eq!(farbe(Some("#aabbcc".into()), "#1a1a1a"), "#aabbcc");
        assert_eq!(farbe(Some("aabbcc".into()), "#1a1a1a"), "#1a1a1a");
        assert_eq!(farbe(Some("#abc".into()), "#1a1a1a"), "#1a1a1a");
        assert_eq!(farbe(Some("#gggggg".into()), "#1a1a1a"), "#1a1a1a");
        assert_eq!(farbe(Some("rot".into()), "#1a1a1a"), "#1a1a1a");
    }

    #[tokio::test]
    async fn ohne_gespeicherte_einstellungen_gilt_das_bisherige_aussehen() {
        // Sonst änderte ein Programmupdate stillschweigend das Aussehen
        // laufender Geschäftspost.
        let dir = tempfile::tempdir().unwrap();
        let pool = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        assert_eq!(Vorlage::laden(&pool).await.unwrap(), Vorlage::default());
    }

    #[tokio::test]
    async fn gespeicherte_einstellungen_wirken() {
        let dir = tempfile::tempdir().unwrap();
        let pool = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        for (k, v) in [
            ("vorlage.logo_position", "rechts"),
            ("vorlage.absenderzeile", "nein"),
            ("vorlage.spalte_einzelpreis", "nein"),
            ("vorlage.tabelle_gitterlinien", "ja"),
            ("vorlage.rand_oben_mm", "30"),
            ("vorlage.zeigt_girocode", "nein"),
        ] {
            crate::commands::einstellungen::set(&pool, k.into(), v.into()).await.unwrap();
        }

        let v = Vorlage::laden(&pool).await.unwrap();
        assert_eq!(v.logo_position, LogoPosition::Rechts);
        assert!(!v.absenderzeile);
        assert!(!v.spalte_einzelpreis);
        assert!(v.tabelle_gitterlinien);
        assert_eq!(v.rand_oben_mm, 30.0);
        assert!(!v.zeigt_girocode);
        // Nicht Gesetztes bleibt bei der Vorgabe.
        assert!(v.spalte_nummer);
    }

    #[tokio::test]
    async fn ohne_einstellung_ist_der_girocode_aktiv() {
        // Bewusste Ausnahme vom sonstigen "neue Einstellungen ändern nichts am
        // bisherigen Aussehen"-Prinzip — ausdrücklicher Nutzerwunsch.
        let dir = tempfile::tempdir().unwrap();
        let pool = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        let v = Vorlage::laden(&pool).await.unwrap();
        assert!(v.zeigt_girocode);
    }

    #[tokio::test]
    async fn rand_unten_hat_platz_fuer_den_geschaeftsfuss() {
        // Ein zu geringer unterer Rand ließe keinen Platz für den dreispaltigen
        // Geschäftsfuß — daher jetzt mindestens 25 statt bisher 15 mm, gleich
        // dem bisherigen Standardwert: Niemand kann mehr unter das gehen, was
        // heute schon funktioniert.
        let dir = tempfile::tempdir().unwrap();
        let pool = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        crate::commands::einstellungen::set(&pool, "vorlage.rand_unten_mm".into(), "5".into()).await.unwrap();
        let v = Vorlage::laden(&pool).await.unwrap();
        assert_eq!(v.rand_unten_mm, 25.0);
    }
}
