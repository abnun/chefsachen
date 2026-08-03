//! Programmmenü.
//!
//! Ohne eigenes Menü setzt Tauri das Standardmenü der Plattform. Das ist
//! durchgehend englisch und kennt die Anwendung nicht — es fehlt insbesondere
//! der Eintrag „Einstellungen …", den auf macOS jedes Programm an derselben
//! Stelle und unter demselben Kürzel (⌘,) anbietet. Wer ihn dort sucht, findet
//! nichts und muss raten, dass die Stammdaten hinter einem Navigationspunkt
//! links liegen.
//!
//! Der Eintrag schaltet nicht selbst um, sondern schickt ein Ereignis an die
//! Oberfläche — die Seitenverwaltung liegt dort, und zwei Stellen, die sich
//! über die aktuelle Seite einig sein müssten, liefen auseinander.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Runtime};

/// Kennung des Menüeintrags für die Einstellungen.
const EINSTELLUNGEN: &str = "einstellungen";

/// Ereignis, mit dem die Oberfläche zum Einstellungsbereich wechselt.
pub const EREIGNIS_EINSTELLUNGEN: &str = "menue:einstellungen";

/// Baut das Programmmenü und hängt es an die Anwendung.
pub fn einrichten<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let name = app.package_info().name.clone();

    let einstellungen = MenuItem::with_id(
        app,
        EINSTELLUNGEN,
        "Einstellungen …",
        true,
        // Das plattformübliche Kürzel. Auf Windows und Linux gibt es keine
        // vergleichbare Erwartung, dort schadet es aber auch nicht.
        Some("CmdOrCtrl+,"),
    )?;

    let programm = Submenu::with_items(
        app,
        &name,
        true,
        &[
            &PredefinedMenuItem::about(app, Some(&format!("Über {name}")), None)?,
            &PredefinedMenuItem::separator(app)?,
            &einstellungen,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, Some("Dienste"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some(&format!("{name} ausblenden")))?,
            &PredefinedMenuItem::hide_others(app, Some("Andere ausblenden"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some(&format!("{name} beenden")))?,
        ],
    )?;

    // „Bearbeiten" trägt Ausschneiden, Kopieren, Einfügen und Rückgängig. Ohne
    // dieses Menü fehlen unter macOS auch die zugehörigen Tastenkürzel in den
    // Eingabefeldern — ⌘V hörte einfach auf zu funktionieren.
    let bearbeiten = Submenu::with_items(
        app,
        "Bearbeiten",
        true,
        &[
            &PredefinedMenuItem::undo(app, Some("Widerrufen"))?,
            &PredefinedMenuItem::redo(app, Some("Wiederholen"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some("Ausschneiden"))?,
            &PredefinedMenuItem::copy(app, Some("Kopieren"))?,
            &PredefinedMenuItem::paste(app, Some("Einsetzen"))?,
            &PredefinedMenuItem::select_all(app, Some("Alles auswählen"))?,
        ],
    )?;

    let fenster = Submenu::with_items(
        app,
        "Fenster",
        true,
        &[
            &PredefinedMenuItem::minimize(app, Some("Im Dock ablegen"))?,
            &PredefinedMenuItem::fullscreen(app, Some("Vollbild"))?,
        ],
    )?;

    let menue = Menu::with_items(app, &[&programm, &bearbeiten, &fenster])?;
    app.set_menu(menue)?;

    app.on_menu_event(|app, ereignis| {
        if ereignis.id() == EINSTELLUNGEN {
            // Fehlschlag heißt nur, dass kein Fenster horcht — dann gibt es
            // auch nichts umzuschalten.
            let _ = app.emit(EREIGNIS_EINSTELLUNGEN, ());
        }
    });

    Ok(())
}
