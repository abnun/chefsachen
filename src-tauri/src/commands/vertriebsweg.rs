//! Über welchen Weg diese Fassung verteilt wird.
//!
//! Die Oberfläche richtet sich danach: Nur die GitHub-Fassung sucht selbst nach
//! Aktualisierungen und bittet um Spenden. In den Stores kommen Updates allein
//! über den Store (App-Store-Richtlinie 2.4.5), und Spendenaufrufe außerhalb des
//! In-App-Kaufs sind dort für Einzelentwickler unzulässig.
//!
//! Festgelegt wird der Weg beim Übersetzen über die Cargo-Features. Die
//! Oberfläche fragt ihn ab, statt ihn selbst zu kennen: Sie ist in allen drei
//! Fassungen dieselbe, und zwei Stellen, die sich über den Weg einig sein
//! müssten, liefen auseinander.

// Zwei Wege zugleich ergäben ein Programm mit Updater, das trotzdem in den
// Store soll, oder eines, das sich für beide Stores hält. Beides fiele erst bei
// der Prüfung durch Apple oder Microsoft auf; hier fällt es sofort auf.
#[cfg(all(
    feature = "selbst-aktualisierung",
    any(feature = "mac-app-store", feature = "microsoft-store")
))]
compile_error!(
    "Ein Store-Bau darf keine Selbstaktualisierung enthalten: \
     mit --no-default-features --features mac-app-store bzw. microsoft-store bauen."
);

#[cfg(all(feature = "mac-app-store", feature = "microsoft-store"))]
compile_error!("Die Features mac-app-store und microsoft-store schließen einander aus.");

#[cfg(not(any(
    feature = "selbst-aktualisierung",
    feature = "mac-app-store",
    feature = "microsoft-store"
)))]
compile_error!(
    "Kein Vertriebsweg gewählt: Standard-Features verwenden oder \
     --features mac-app-store bzw. microsoft-store angeben."
);

/// Der Vertriebsweg dieser Fassung, so wie die Oberfläche ihn erwartet.
pub const fn aktueller() -> &'static str {
    if cfg!(feature = "mac-app-store") {
        "mac_app_store"
    } else if cfg!(feature = "microsoft-store") {
        "microsoft_store"
    } else {
        "github"
    }
}

/// Liefert `"github"`, `"mac_app_store"` oder `"microsoft_store"`.
#[tauri::command]
pub fn vertriebsweg() -> &'static str {
    aktueller()
}

/// Startet das Programm neu, damit eine vorgemerkte Wiederherstellung greift.
///
/// Eigener Befehl statt `relaunch` aus dem Prozess-Plugin: Das Plugin gehört
/// zur Selbstaktualisierung und fehlt in den Store-Fassungen. Der Knopf
/// „Jetzt neu starten" nach dem Einspielen einer Sicherung muss dort aber
/// genauso funktionieren, gerade beim Umzug in die Store-Fassung.
///
/// `request_restart` statt `restart`: Es lässt Tauri erst sauber herunterfahren
/// (Fensterzustand, Protokoll), wie es auch das Plugin tut.
#[tauri::command]
pub fn programm_neu_starten<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    app.request_restart();
}
