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

/// Wo laut DIN 5008 Form B das Anschriftfenster beginnt — muss mit dem
/// Literal `45mm` in `templates/rechnung.typ` übereinstimmen.
const ANSCHRIFTFENSTER_START_MM: f64 = 45.0;
/// Mindestabstand zwischen Logo-Unterkante und Anschriftfenster bei „Oben
/// links"/„Oben rechts" (gestapelt) — dort steht das Logo im Textfluss
/// direkt über der Firmenanschrift, während das Fenster fest positioniert
/// ist und nicht mitwandert.
const LOGO_SICHERHEITSPUFFER_MM: f64 = 5.0;
/// Technische Mindesthöhe des Logos — als Boden in [`logo_hoehe_max_mm`] und
/// als `min` im `mm(...)`-Aufruf für `logo_hoehe_mm` verwendet. Eine
/// gemeinsame Konstante statt zweier unabhängiger Literale, damit beide
/// Stellen nicht auseinanderlaufen können.
const LOGO_HOEHE_MIN_MM: f64 = 5.0;

/// Größte Logohöhe, die beim gegebenen oberen Rand noch Sicherheitsabstand
/// zum Anschriftfenster lässt.
///
/// `.max(LOGO_HOEHE_MIN_MM)`: Bei sehr großem oberen Rand (nahe 40 mm) läge
/// das rechnerische Maximum unter der technischen Mindesthöhe — ein
/// ungültiger Bereich für `mm()` (`min > max`), der dort abstürzen würde.
/// Der Boden verhindert das; in diesem Extremfall bleibt kein Puffer mehr,
/// aber die App bleibt funktionsfähig statt abzustürzen.
fn logo_hoehe_max_mm(rand_oben_mm: f64) -> f64 {
    (ANSCHRIFTFENSTER_START_MM - rand_oben_mm - LOGO_SICHERHEITSPUFFER_MM).max(LOGO_HOEHE_MIN_MM)
}

/// Wo das Logo steht.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogoPosition {
    Links,
    Rechts,
    /// Logo rechts, Firmenanschrift unverändert rechtsbündig darunter —
    /// Spiegelbild von `Links`. Anders als `Rechts` stehen Logo und
    /// Anschrift nicht nebeneinander, sondern übereinander.
    RechtsOben,
    Keins,
}

impl LogoPosition {
    fn aus(wert: &str) -> Self {
        match wert {
            "rechts" => Self::Rechts,
            "rechts_oben" => Self::RechtsOben,
            "keins" => Self::Keins,
            _ => Self::Links,
        }
    }

    fn als_str(self) -> &'static str {
        match self {
            Self::Links => "links",
            Self::Rechts => "rechts",
            Self::RechtsOben => "rechts_oben",
            Self::Keins => "keins",
        }
    }
}

/// Worauf die Akzentfarbe wirkt.
///
/// Vorher wirkte sie fest auf beides. Das ist deshalb einstellbar, weil die
/// zwei Einsätze gegenläufige Ansprüche an die Farbe stellen: Als Farbe der
/// Überschrift muss sie dunkel genug bleiben, um auf Papier lesbar zu sein;
/// als reine Linienfarbe darf sie beliebig hell sein. Wer sich für „nur
/// Linien" entscheidet, bekommt eine tiefschwarze Überschrift und ist bei der
/// Farbwahl frei.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AkzentVerwendung {
    Linien,
    Ueberschrift,
    Beides,
}

impl AkzentVerwendung {
    fn aus(wert: &str) -> Self {
        match wert {
            "linien" => Self::Linien,
            "ueberschrift" => Self::Ueberschrift,
            _ => Self::Beides,
        }
    }

    /// Die Auswertung, was das konkret färbt, steht bewusst nur in
    /// `rechnung.typ` und nicht zusätzlich hier: Zwei Stellen mit derselben
    /// Regel liefen in diesem Projekt schon auseinander.
    fn als_str(self) -> &'static str {
        match self {
            Self::Linien => "linien",
            Self::Ueberschrift => "ueberschrift",
            Self::Beides => "beides",
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
    pub akzent_verwendung: AkzentVerwendung,
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
    /// Kantenlänge des Girocodes. Wer viel im Fließtext vor dem Girocode
    /// stehen hat, kann ihn verkleinern, um mehr Platz auf der Seite zu
    /// behalten.
    pub girocode_groesse_mm: f64,
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
            logo_hoehe_mm: 15.0,
            absenderzeile: true,
            akzentfarbe: "#1a1a1a".into(),
            akzent_verwendung: AkzentVerwendung::Beides,
            spalte_nummer: true,
            einheit_eigene_spalte: false,
            spalte_einzelpreis: true,
            tabelle_gitterlinien: false,
            zeigt_girocode: true,
            girocode_groesse_mm: 28.0,
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
        .unwrap_or_else(|| standard.clamp(min, max))
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
        // Muss vor `logo_hoehe_mm` berechnet werden: dessen Obergrenze
        // hängt vom oberen Rand ab (siehe logo_hoehe_max_mm).
        let rand_oben_mm = mm(hole("vorlage.rand_oben_mm"), standard.rand_oben_mm, 20.0, 40.0);
        Self {
            logo_position: hole("vorlage.logo_position")
                .map(|w| LogoPosition::aus(&w))
                .unwrap_or(standard.logo_position),
            logo_hoehe_mm: mm(
                hole("vorlage.logo_hoehe_mm"),
                standard.logo_hoehe_mm,
                LOGO_HOEHE_MIN_MM,
                logo_hoehe_max_mm(rand_oben_mm),
            ),
            absenderzeile: ja(hole("vorlage.absenderzeile"), standard.absenderzeile),
            akzentfarbe: farbe(hole("vorlage.akzentfarbe"), &standard.akzentfarbe),
            akzent_verwendung: hole("vorlage.akzent_verwendung")
                .map(|w| AkzentVerwendung::aus(&w))
                .unwrap_or(standard.akzent_verwendung),
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
            girocode_groesse_mm: mm(
                hole("vorlage.girocode_groesse_mm"),
                standard.girocode_groesse_mm,
                20.0,
                32.0,
            ),
            // Der obere Rand geht nicht unter 20 mm: Darunter überschnitte der
            // Briefkopf das Anschriftfeld, das bei 45 mm beginnt.
            rand_oben_mm,
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
            ("v_akzent_verwendung", self.akzent_verwendung.als_str().to_string()),
            ("v_spalte_nummer", ja_nein(self.spalte_nummer)),
            ("v_einheit_eigene_spalte", ja_nein(self.einheit_eigene_spalte)),
            ("v_spalte_einzelpreis", ja_nein(self.spalte_einzelpreis)),
            ("v_tabelle_gitterlinien", ja_nein(self.tabelle_gitterlinien)),
            ("v_zeigt_girocode", ja_nein(self.zeigt_girocode)),
            ("v_girocode_groesse_mm", self.girocode_groesse_mm.to_string()),
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
    fn akzent_verwendung_kommt_aus_den_einstellungen() {
        let v = Vorlage::aus_paaren(&[(
            "vorlage.akzent_verwendung".into(),
            "linien".into(),
        )]);
        assert_eq!(v.akzent_verwendung, AkzentVerwendung::Linien);
    }

    /// Wer nichts einstellt, muss denselben Beleg bekommen wie vor dieser
    /// Einstellung — sonst änderte ein Update stillschweigend laufende Post.
    #[test]
    fn akzent_verwendung_faellt_auf_beides_zurueck() {
        for paare in [vec![], vec![("vorlage.akzent_verwendung".into(), "quatsch".into())]] {
            let v = Vorlage::aus_paaren(&paare);
            assert_eq!(v.akzent_verwendung, AkzentVerwendung::Beides);
        }
    }

    /// Die Typst-Vorlage liest den Wert als Zeichenkette und vergleicht ihn
    /// gegen „linien"/„ueberschrift"/„beides". Weicht eine Schreibweise ab,
    /// griffe stillschweigend nur noch der Vorgabezweig.
    #[test]
    fn akzent_verwendung_geht_als_eingabe_an_die_vorlage() {
        let eingaben = Vorlage {
            akzent_verwendung: AkzentVerwendung::Ueberschrift,
            ..Default::default()
        }
        .als_eingaben();
        let wert = eingaben
            .iter()
            .find(|(k, _)| *k == "v_akzent_verwendung")
            .map(|(_, v)| v.as_str());
        assert_eq!(wert, Some("ueberschrift"));
    }

    /// Vierte Logo-Option: Logo rechts, Firmenanschrift unverändert rechtsbündig
    /// darunter — Spiegelbild von „links".
    #[test]
    fn logo_position_rechts_oben_wird_gelesen() {
        let v = Vorlage::aus_paaren(&[("vorlage.logo_position".into(), "rechts_oben".into())]);
        assert_eq!(v.logo_position, LogoPosition::RechtsOben);
        assert_eq!(v.logo_position.als_str(), "rechts_oben");
    }

    /// Bei den bisherigen Rand-Extremen darf die sichere Logohöhe nie unter die
    /// technische Mindesthöhe (5 mm) fallen — sonst wäre `min > max` in `mm()`
    /// und die Clamp-Funktion würde bei jedem Aufruf mit diesem Rand abstürzen.
    #[test]
    fn logo_hoehe_max_mm_hat_sicherheitsabstand_zum_anschriftfenster() {
        assert_eq!(logo_hoehe_max_mm(20.0), 20.0);
        assert_eq!(logo_hoehe_max_mm(25.0), 15.0);
        // Boden greift: 45 - 40 - 5 = 0, aber die Mindesthöhe ist 5.
        assert_eq!(logo_hoehe_max_mm(40.0), 5.0);
    }

    /// Ein bei kleinem Rand noch gültiger Logohöhen-Wert wird ungültig, sobald
    /// der Rand nachträglich vergrößert wird — die Begrenzung muss dynamisch
    /// mitziehen, nicht nur beim ursprünglichen Speichern gelten.
    #[test]
    fn logo_hoehe_wird_dynamisch_auf_sicheren_bereich_begrenzt() {
        let v = Vorlage::aus_paaren(&[
            ("vorlage.rand_oben_mm".into(), "35".into()),
            ("vorlage.logo_hoehe_mm".into(), "30".into()),
        ]);
        assert_eq!(v.rand_oben_mm, 35.0);
        // Bei 35 mm Rand sind nur noch 5 mm sicher (45 - 35 - 5 = 5).
        assert_eq!(v.logo_hoehe_mm, 5.0);
    }

    /// Deckt genau die Lücke ab, die vorher bestand: Ein leeres oder nicht
    /// gesetztes Logohöhe-Feld fiel im Fallback-Zweig von `mm()` auf den
    /// unclamped Vorgabewert zurück — bei großem oberen Rand blieb die neue
    /// Obergrenze so wirkungslos, obwohl der Wert nie explizit zu hoch
    /// gesetzt wurde. Bildet exakt den Weg über die Oberfläche nach: ein
    /// leeres Feld wird beim Speichern als leerer String persistiert, nicht
    /// weggelassen (siehe Belegvorlage.tsx `speichern()`).
    #[test]
    fn logo_hoehe_faellt_bei_grossem_rand_nicht_auf_unsicheren_vorgabewert_zurueck() {
        let v = Vorlage::aus_paaren(&[
            ("vorlage.rand_oben_mm".into(), "38".into()),
            ("vorlage.logo_hoehe_mm".into(), "".into()),
        ]);
        assert_eq!(v.rand_oben_mm, 38.0);
        // Bei 38 mm Rand sind nur noch 2 mm rechnerisch sicher, die
        // technische Mindesthöhe (5 mm) greift als Boden.
        assert_eq!(v.logo_hoehe_mm, 5.0);
    }

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
    async fn girocode_groesse_bleibt_im_zulaessigen_bereich() {
        let dir = tempfile::tempdir().unwrap();
        let pool = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();

        // Ohne gespeicherte Einstellung gilt das bisherige Aussehen.
        assert_eq!(Vorlage::laden(&pool).await.unwrap().girocode_groesse_mm, 28.0);

        crate::commands::einstellungen::set(&pool, "vorlage.girocode_groesse_mm".into(), "22".into())
            .await
            .unwrap();
        assert_eq!(Vorlage::laden(&pool).await.unwrap().girocode_groesse_mm, 22.0);

        // Eine vertippte Null darf den Girocode nicht unlesbar klein machen.
        crate::commands::einstellungen::set(&pool, "vorlage.girocode_groesse_mm".into(), "0".into())
            .await
            .unwrap();
        assert_eq!(Vorlage::laden(&pool).await.unwrap().girocode_groesse_mm, 20.0);
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
