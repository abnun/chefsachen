//! Straßenvorschläge aus dem Internet, nur nach ausdrücklicher Einwilligung.
//!
//! Chefsachen verspricht, dass nichts den Rechner verlässt. Diese Funktion ist
//! die einzige Ausnahme, und sie ist nach der Installation aus: Erst wenn der
//! Nutzer in den Einstellungen „Adressvorschläge aus dem Internet" einschaltet,
//! geht der getippte Text an den Dienst Photon von komoot.
//!
//! Die Anfrage läuft hier in Rust und nicht im Webview. So bleibt die
//! Inhaltsrichtlinie der Oberfläche unverändert streng (`connect-src 'self'`),
//! und die Einwilligung wird an der Stelle geprüft, an der die Verbindung
//! tatsächlich entsteht. Fragt die Oberfläche trotz ausgeschalteter Einstellung
//! (ein Fehler dort, ein veralteter Zustand), passiert trotzdem nichts.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::future::Future;
use std::sync::OnceLock;
use std::time::Duration;

/// Schlüssel der Einwilligung. Nur der Wert `"true"` erlaubt eine Anfrage.
pub const SCHLUESSEL_ONLINE: &str = "adressen.online_vorschlaege";

/// Unter drei Zeichen ergäbe die Suche nur Rauschen, und jeder Tastendruck
/// wäre eine Anfrage mehr an einen fremden Dienst.
const MINDESTLAENGE: usize = 3;

const ZEITLIMIT: Duration = Duration::from_secs(5);

/// Kennt den Programmnamen und die Projektseite, sonst nichts: keine
/// Kennung des Rechners, keine Firmendaten. Photon bittet darum, sich
/// erkennbar zu machen; mehr braucht es dafür nicht.
const USER_AGENT: &str = concat!(
    "Chefsachen/",
    env!("CARGO_PKG_VERSION"),
    " (+https://www.chef-sachen.de/)"
);

/// Rechteck um Deutschland (Länge/Breite links unten, rechts oben). Begrenzt
/// die Treffer auf das Land, für das die Vorschläge gedacht sind.
const BBOX_DEUTSCHLAND: &str = "5.86,47.27,15.04,55.06";

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct Adressvorschlag {
    pub strasse: String,
    pub hausnummer: String,
    pub plz: String,
    pub ort: String,
}

#[derive(Debug, Deserialize)]
struct PhotonAntwort {
    #[serde(default)]
    features: Vec<PhotonTreffer>,
}

#[derive(Debug, Deserialize)]
struct PhotonTreffer {
    #[serde(default)]
    properties: PhotonAngaben,
}

#[derive(Debug, Deserialize, Default)]
struct PhotonAngaben {
    /// Art des Treffers: `"street"` für eine Straße als Ganzes, `"house"`
    /// für eine Anschrift mit Hausnummer, daneben Orte, Bezirke und mehr.
    #[serde(rename = "type")]
    art: Option<String>,
    name: Option<String>,
    street: Option<String>,
    housenumber: Option<String>,
    postcode: Option<String>,
    city: Option<String>,
    countrycode: Option<String>,
}

/// Liest eine Photon-Antwort (GeoJSON) in eine flache Vorschlagsliste.
///
/// Übersprungen wird, was für eine Anschrift nicht taugt: Treffer ohne
/// Straße, PLZ oder Ort, und Treffer außerhalb Deutschlands (das Rechteck um
/// Deutschland schneidet Teile der Nachbarländer an). Ungültiges JSON ergibt
/// eine leere Liste statt eines Fehlers, wie jeder andere Fehlschlag hier.
///
/// Photon liefert dieselbe Straße oft mehrfach, je OSM-Abschnitt einmal, und
/// für den Nutzer sähen die Einträge gleich aus. Doppelte fallen deshalb weg;
/// die Reihenfolge bleibt, weil Photon die besten Treffer zuerst nennt.
pub fn photon_lesen(json: &str) -> Vec<Adressvorschlag> {
    let Ok(antwort) = serde_json::from_str::<PhotonAntwort>(json) else {
        return Vec::new();
    };
    let mut liste: Vec<Adressvorschlag> = Vec::new();
    for treffer in antwort.features {
        let a = treffer.properties;
        if !a.countrycode.as_deref().is_some_and(|c| c.eq_ignore_ascii_case("DE")) {
            continue;
        }
        // Eine Straße als Ganzes trägt ihren Namen in `name`, `street` ist dort
        // leer. Bei allen anderen Arten ist `name` der Name des Gebäudes oder
        // Geschäfts („Bäckerei Beispiel") und taugt nicht als Straße.
        let strasse = if a.art.as_deref() == Some("street") {
            a.street.or(a.name)
        } else {
            a.street
        };
        let (Some(strasse), Some(plz), Some(ort)) = (strasse, a.postcode, a.city) else {
            continue;
        };
        let vorschlag = Adressvorschlag {
            strasse,
            hausnummer: a.housenumber.unwrap_or_default(),
            plz,
            ort,
        };
        // Höchstens fünf Treffer: Ein linearer Vergleich ist hier billiger
        // und erhält die Reihenfolge ohne Umweg.
        if !liste.contains(&vorschlag) {
            liste.push(vorschlag);
        }
    }
    liste
}

/// Baut die Anfrage-URL. Getrennt von der Anfrage selbst, damit sich prüfen
/// lässt, was übertragen würde, ohne etwas zu übertragen.
pub fn photon_url(text: &str, plz: Option<&str>, ort: Option<&str>) -> String {
    // PLZ und Ort grenzen die Suche ein, wenn sie schon dastehen: „Hauptstraße"
    // allein gibt es tausendfach.
    let suchtext = [Some(text), plz, ort]
        .into_iter()
        .flatten()
        .map(str::trim)
        .filter(|teil| !teil.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    url::Url::parse_with_params(
        "https://photon.komoot.io/api/",
        [
            ("q", suchtext.as_str()),
            ("lang", "de"),
            ("limit", "5"),
            ("bbox", BBOX_DEUTSCHLAND),
        ],
    )
    .map(String::from)
    .unwrap_or_default()
}

/// Der eigentliche Ablauf, mit austauschbarem Abruf: Im Programm geht er
/// über das Netz, in den Tests an eine Attrappe, die nur mitzählt. So lässt
/// sich belegen, dass ohne Einwilligung gar kein Abruf stattfindet, statt nur
/// darauf zu vertrauen.
pub async fn vorschlagen_mit<F, Fut>(
    pool: &SqlitePool,
    text: &str,
    plz: Option<&str>,
    ort: Option<&str>,
    abrufen: F,
) -> Vec<Adressvorschlag>
where
    F: FnOnce(String) -> Fut,
    Fut: Future<Output = Option<String>>,
{
    if text.trim().chars().count() < MINDESTLAENGE {
        return Vec::new();
    }
    // Ein Lesefehler zählt wie „nicht eingewilligt": Im Zweifel bleibt der
    // Rechner still.
    let eingewilligt = crate::commands::einstellungen::get(pool, SCHLUESSEL_ONLINE.into())
        .await
        .ok()
        .flatten()
        .is_some_and(|wert| wert == "true");
    if !eingewilligt {
        return Vec::new();
    }
    match abrufen(photon_url(text, plz, ort)).await {
        Some(antwort) => photon_lesen(&antwort),
        None => Vec::new(),
    }
}

/// Holt eine Antwort von Photon. Jeder Fehlschlag (keine Verbindung,
/// Zeitüberschreitung, Fehlerstatus) ergibt `None`: Ein Vorschlag ist eine
/// Bequemlichkeit, und ohne ihn tippt man die Anschrift eben selbst. Eine
/// Fehlermeldung beim Tippen wäre lästiger als der fehlende Vorschlag.
async fn photon_abrufen(url: String) -> Option<String> {
    let antwort = photon_client()?.get(url).send().await.ok()?;
    if !antwort.status().is_success() {
        return None;
    }
    antwort.text().await.ok()
}

/// Ein Client für alle Anfragen: Er hält Verbindungen offen, und beim Tippen
/// folgen die Anfragen dicht aufeinander. Ein neuer Client je Anfrage hieße
/// jedes Mal einen neuen TLS-Handschlag mit komoot.
fn photon_client() -> Option<&'static reqwest::Client> {
    static CLIENT: OnceLock<Option<reqwest::Client>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            // Derselbe Anbieter wie beim Updater. In der GitHub-Fassung hat ihn
            // vielleicht schon der Updater eingerichtet; dann gilt dessen Wahl.
            if rustls::crypto::CryptoProvider::get_default().is_none() {
                let _ = rustls::crypto::ring::default_provider().install_default();
            }
            reqwest::Client::builder()
                .timeout(ZEITLIMIT)
                .user_agent(USER_AGENT)
                .build()
                .ok()
        })
        .as_ref()
}

/// Straßenvorschläge zum getippten Text. Ohne Einwilligung leer, ohne dass
/// eine Verbindung entsteht.
#[tauri::command]
pub async fn adresse_vorschlagen(
    pool: tauri::State<'_, SqlitePool>,
    text: String,
    plz: Option<String>,
    ort: Option<String>,
) -> Result<Vec<Adressvorschlag>, ()> {
    Ok(vorschlagen_mit(&pool, &text, plz.as_deref(), ort.as_deref(), photon_abrufen).await)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    async fn test_pool() -> (tempfile::TempDir, SqlitePool) {
        let dir = tempfile::tempdir().unwrap();
        let p = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        (dir, p)
    }

    /// Nachgebaut nach echten Photon-Antworten: Eine Straße als Ganzes kommt
    /// als `type: "street"` mit dem Namen in `name` und ohne `street`, und
    /// oft mehrfach, je OSM-Abschnitt einmal. Ein Haus trägt `street` und
    /// `housenumber`; ein Geschäft darin hat seinen eigenen Namen in `name`,
    /// der keine Straße ist.
    const ANTWORT: &str = r#"{
        "features": [
            { "properties": { "type": "street", "osm_key": "highway", "name": "Karl-Heine-Straße",
                              "street": null, "housenumber": null,
                              "postcode": "04229", "city": "Leipzig", "countrycode": "DE" } },
            { "properties": { "type": "street", "osm_key": "highway", "name": "Karl-Heine-Straße",
                              "street": null, "housenumber": null,
                              "postcode": "04229", "city": "Leipzig", "countrycode": "DE" } },
            { "properties": { "type": "house", "osm_key": "building", "street": "Paul-Göbel-Straße",
                              "housenumber": "1", "postcode": "74076", "city": "Heilbronn",
                              "countrycode": "DE" } },
            { "properties": { "type": "house", "osm_key": "shop", "name": "Bäckerei Beispiel",
                              "street": "Paul-Göbel-Straße", "housenumber": "3",
                              "postcode": "74076", "city": "Heilbronn", "countrycode": "DE" } },
            { "properties": { "type": "city", "osm_key": "place", "name": "Leipzig",
                              "postcode": "04109", "city": "Leipzig", "countrycode": "DE" } },
            { "properties": { "type": "street", "osm_key": "highway", "name": "Rue de Strasbourg",
                              "postcode": "67000", "city": "Strasbourg", "countrycode": "FR" } }
        ]
    }"#;

    fn vorschlag(strasse: &str, hausnummer: &str, plz: &str, ort: &str) -> Adressvorschlag {
        Adressvorschlag {
            strasse: strasse.into(),
            hausnummer: hausnummer.into(),
            plz: plz.into(),
            ort: ort.into(),
        }
    }

    #[test]
    fn liest_strassen_und_haeuser_ohne_doppelte_in_der_reihenfolge_der_antwort() {
        assert_eq!(
            photon_lesen(ANTWORT),
            vec![
                vorschlag("Karl-Heine-Straße", "", "04229", "Leipzig"),
                vorschlag("Paul-Göbel-Straße", "1", "74076", "Heilbronn"),
                vorschlag("Paul-Göbel-Straße", "3", "74076", "Heilbronn"),
            ]
        );
    }

    #[test]
    fn eine_strasse_als_ganzes_nimmt_den_namen_ohne_hausnummer() {
        let liste = photon_lesen(ANTWORT);
        assert_eq!(liste[0].strasse, "Karl-Heine-Straße");
        assert_eq!(liste[0].hausnummer, "");
    }

    #[test]
    fn der_name_eines_geschaefts_wird_keine_strasse() {
        let liste = photon_lesen(ANTWORT);
        assert!(liste.iter().all(|v| v.strasse != "Bäckerei Beispiel"), "{liste:?}");
    }

    #[test]
    fn orte_und_auslaendische_treffer_fallen_weg() {
        let liste = photon_lesen(ANTWORT);
        assert!(liste.iter().all(|v| v.strasse != "Leipzig" && v.ort != "Strasbourg"), "{liste:?}");
    }

    #[test]
    fn ungueltiges_json_ergibt_leere_liste() {
        assert!(photon_lesen("kein json").is_empty());
        assert!(photon_lesen("{}").is_empty());
    }

    #[test]
    fn url_geht_an_photon_mit_sprache_grenze_und_deutschland() {
        let url = photon_url("Paul-Göbel", Some("74076"), Some("Heilbronn"));
        assert!(url.starts_with("https://photon.komoot.io/api/?"), "{url}");
        assert!(url.contains("lang=de"), "{url}");
        assert!(url.contains("limit=5"), "{url}");
        assert!(url.contains("bbox=5.86%2C47.27%2C15.04%2C55.06"), "{url}");
        // Der Text ist kodiert, PLZ und Ort hängen am Suchtext.
        assert!(url.contains("q=Paul-G%C3%B6bel+74076+Heilbronn"), "{url}");
    }

    #[test]
    fn url_ohne_plz_und_ort_enthaelt_nur_den_text() {
        let url = photon_url("Hauptstraße", None, Some("  "));
        assert!(url.contains("q=Hauptstra%C3%9Fe&"), "{url}");
    }

    /// Zählt Abrufe und liefert eine feste Antwort.
    fn attrappe(zaehler: Arc<AtomicUsize>, antwort: Option<&'static str>) -> impl FnOnce(String) -> std::future::Ready<Option<String>> {
        move |_url| {
            zaehler.fetch_add(1, Ordering::SeqCst);
            std::future::ready(antwort.map(String::from))
        }
    }

    #[tokio::test]
    async fn ohne_einwilligung_kein_abruf() {
        let (_dir, pool) = test_pool().await;
        let zaehler = Arc::new(AtomicUsize::new(0));
        let liste = vorschlagen_mit(&pool, "Hauptstraße", None, None, attrappe(zaehler.clone(), Some(ANTWORT))).await;
        assert!(liste.is_empty());
        assert_eq!(zaehler.load(Ordering::SeqCst), 0, "Abruf trotz fehlender Einwilligung");
    }

    #[tokio::test]
    async fn ausgeschaltet_heisst_kein_abruf() {
        let (_dir, pool) = test_pool().await;
        crate::commands::einstellungen::set(&pool, SCHLUESSEL_ONLINE.into(), "false".into()).await.unwrap();
        let zaehler = Arc::new(AtomicUsize::new(0));
        let liste = vorschlagen_mit(&pool, "Hauptstraße", None, None, attrappe(zaehler.clone(), Some(ANTWORT))).await;
        assert!(liste.is_empty());
        assert_eq!(zaehler.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn mit_einwilligung_wird_abgerufen_und_gelesen() {
        let (_dir, pool) = test_pool().await;
        crate::commands::einstellungen::set(&pool, SCHLUESSEL_ONLINE.into(), "true".into()).await.unwrap();
        let zaehler = Arc::new(AtomicUsize::new(0));
        let liste = vorschlagen_mit(&pool, "Paul-Göbel", None, None, attrappe(zaehler.clone(), Some(ANTWORT))).await;
        assert_eq!(zaehler.load(Ordering::SeqCst), 1);
        assert_eq!(liste.len(), 3);
    }

    /// Die Ersteinrichtung bietet die Vorschläge schon an, bevor die Firma
    /// gespeichert ist. Weder das Speichern der Einwilligung noch der Abruf
    /// dürfen dafür eine eingerichtete Firma voraussetzen.
    #[tokio::test]
    async fn einwilligung_wirkt_schon_vor_der_einrichtung() {
        let (_dir, pool) = test_pool().await;
        assert!(!crate::commands::firma::get(&pool).await.unwrap().eingerichtet);
        crate::commands::einstellungen::set(&pool, SCHLUESSEL_ONLINE.into(), "true".into()).await.unwrap();
        let zaehler = Arc::new(AtomicUsize::new(0));
        let liste = vorschlagen_mit(&pool, "Paul-Göbel", None, None, attrappe(zaehler.clone(), Some(ANTWORT))).await;
        assert_eq!(zaehler.load(Ordering::SeqCst), 1);
        assert_eq!(liste.len(), 3);
    }

    #[tokio::test]
    async fn zu_kurzer_text_loest_keinen_abruf_aus() {
        let (_dir, pool) = test_pool().await;
        crate::commands::einstellungen::set(&pool, SCHLUESSEL_ONLINE.into(), "true".into()).await.unwrap();
        let zaehler = Arc::new(AtomicUsize::new(0));
        let liste = vorschlagen_mit(&pool, " Ha ", None, None, attrappe(zaehler.clone(), Some(ANTWORT))).await;
        assert!(liste.is_empty());
        assert_eq!(zaehler.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn fehlgeschlagener_abruf_ergibt_leere_liste() {
        let (_dir, pool) = test_pool().await;
        crate::commands::einstellungen::set(&pool, SCHLUESSEL_ONLINE.into(), "true".into()).await.unwrap();
        let zaehler = Arc::new(AtomicUsize::new(0));
        let liste = vorschlagen_mit(&pool, "Hauptstraße", None, None, attrappe(zaehler.clone(), None)).await;
        assert!(liste.is_empty());
        assert_eq!(zaehler.load(Ordering::SeqCst), 1);
    }
}
