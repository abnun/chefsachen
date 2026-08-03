//! Prüfung der Aktualisierungssuche gegen den echten Endpunkt.
//!
//! Die Suche ist die einzige Funktion der Anwendung, deren Gegenstelle nicht
//! im Programm liegt: Sie fragt eine Datei auf GitHub ab, die von einem
//! Arbeitsablauf erzeugt wird. Alles daran kann stimmen — Konfiguration,
//! Berechtigungen, Oberfläche — und die Suche trotzdem nichts finden, weil das
//! Manifest anders aussieht als erwartet oder gar nicht ausgeliefert wird.
//!
//! Genau das ist passiert: Die Anwendung meldete „auf dem neuesten Stand",
//! während längst eine neuere Version veröffentlicht war. Kein Test hätte das
//! bemerkt, weil keiner über den Programmrand hinausging.
//!
//! Diese Tests brauchen deshalb ein Netz und laufen nur auf Zuruf:
//!
//! ```text
//! cargo test --manifest-path src-tauri/Cargo.toml -- --ignored aktualisierung
//! ```

#[cfg(test)]
mod tests {
    use tauri::test::mock_builder;
    use tauri_plugin_updater::UpdaterExt;

    /// Baut eine Anwendung, die sich für die angegebene Version hält.
    ///
    /// Die Version entscheidet über das Ergebnis der Suche — der Updater
    /// vergleicht sie mit der aus dem Manifest. Sie stammt sonst aus
    /// `tauri.conf.json` und wäre damit immer die gerade gebaute.
    fn app_mit_version(version: &str) -> tauri::App<tauri::test::MockRuntime> {
        let mut kontext = crate::kontext();
        kontext.package_info_mut().version = version.parse().unwrap();
        mock_builder()
            .plugin(tauri_plugin_updater::Builder::new().build())
            .build(kontext)
            .unwrap()
    }

    #[test]
    #[ignore = "braucht Netz und die veröffentlichte Fassung auf GitHub"]
    fn findet_eine_neuere_veroeffentlichte_version() {
        let app = app_mit_version("0.0.1");
        let ergebnis = tauri::async_runtime::block_on(async {
            app.updater().unwrap().check().await
        });

        match ergebnis {
            Ok(Some(update)) => {
                println!("gefunden: {} ({})", update.version, update.download_url);
            }
            Ok(None) => panic!(
                "Der Updater fand nichts, obwohl die Anwendung sich für 0.0.1 hält. \
                 Entweder liefert der Endpunkt das Manifest nicht aus, oder es steht \
                 nur an einem Entwurf."
            ),
            Err(e) => panic!("Die Suche schlug fehl: {e}"),
        }
    }

    #[test]
    #[ignore = "braucht Netz und die veröffentlichte Fassung auf GitHub"]
    fn haelt_die_eigene_version_fuer_aktuell() {
        // Gegenprobe: Ohne sie belegte der Test oben nur, dass irgendetwas
        // zurückkommt — nicht, dass verglichen wird.
        let app = app_mit_version("99.0.0");
        let ergebnis = tauri::async_runtime::block_on(async {
            app.updater().unwrap().check().await
        });
        match ergebnis {
            Ok(None) => {}
            Ok(Some(u)) => panic!("Version 99.0.0 fand angeblich die neuere {}", u.version),
            Err(e) => panic!("Die Suche schlug fehl: {e}"),
        }
    }
}
