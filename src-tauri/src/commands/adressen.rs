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
    " (+https://abnun.github.io/chefsachen/)"
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
pub fn photon_lesen(json: &str) -> Vec<Adressvorschlag> {
    let Ok(antwort) = serde_json::from_str::<PhotonAntwort>(json) else {
        return Vec::new();
    };
    antwort
        .features
        .into_iter()
        .filter_map(|treffer| {
            let a = treffer.properties;
            if !a.countrycode.as_deref().is_some_and(|c| c.eq_ignore_ascii_case("DE")) {
                return None;
            }
            Some(Adressvorschlag {
                strasse: a.street?,
                hausnummer: a.housenumber.unwrap_or_default(),
                plz: a.postcode?,
                ort: a.city?,
            })
        })
        .collect()
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
    // Derselbe Anbieter wie beim Updater. In der GitHub-Fassung hat ihn
    // vielleicht schon der Updater eingerichtet; dann gilt dessen Wahl.
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let client = reqwest::Client::builder()
        .timeout(ZEITLIMIT)
        .user_agent(USER_AGENT)
        .build()
        .ok()?;
    let antwort = client.get(url).send().await.ok()?;
    if !antwort.status().is_success() {
        return None;
    }
    antwort.text().await.ok()
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

    const ANTWORT: &str = r#"{
        "features": [
            { "properties": { "street": "Paul-Göbel-Straße", "housenumber": "1",
                              "postcode": "74076", "city": "Heilbronn", "countrycode": "DE" } },
            { "properties": { "street": "Paul-Göbel-Straße",
                              "postcode": "74076", "city": "Heilbronn", "countrycode": "DE" } },
            { "properties": { "street": "Nur Straße", "countrycode": "DE" } },
            { "properties": { "street": "Rue de Strasbourg", "housenumber": "3",
                              "postcode": "67000", "city": "Strasbourg", "countrycode": "FR" } }
        ]
    }"#;

    #[test]
    fn liest_strasse_hausnummer_plz_und_ort() {
        let liste = photon_lesen(ANTWORT);
        assert_eq!(
            liste[0],
            Adressvorschlag {
                strasse: "Paul-Göbel-Straße".into(),
                hausnummer: "1".into(),
                plz: "74076".into(),
                ort: "Heilbronn".into(),
            }
        );
    }

    #[test]
    fn fehlende_hausnummer_bleibt_leer() {
        let liste = photon_lesen(ANTWORT);
        assert_eq!(liste[1].hausnummer, "");
    }

    #[test]
    fn unvollstaendige_und_auslaendische_treffer_fallen_weg() {
        let liste = photon_lesen(ANTWORT);
        assert_eq!(liste.len(), 2, "{liste:?}");
        assert!(liste.iter().all(|v| v.ort == "Heilbronn"));
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
        assert_eq!(liste.len(), 2);
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
