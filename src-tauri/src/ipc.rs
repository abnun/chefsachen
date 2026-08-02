//! Durchstich über die IPC-Grenze.
//!
//! Alle übrigen Tests rufen die Befehlsfunktionen unmittelbar auf. Damit prüfen
//! sie, was eine Funktion *tut* — nicht, ob die Oberfläche sie überhaupt
//! erreicht. Zwischen beidem liegen drei Dinge, die jeweils lautlos schiefgehen
//! können:
//!
//! 1. Die Registrierung in `generate_handler!`. Fehlt sie, meldet die Oberfläche
//!    zur Laufzeit „command not found" — im Test ist alles grün.
//! 2. Die Umwandlung der Argumente aus JSON. Ein umbenanntes Feld oder ein
//!    `camelCase`/`snake_case`-Versehen fällt erst beim echten Aufruf auf.
//! 3. Die Berechtigungen in `capabilities/default.json`. Genau daran lag P1.1:
//!    Ohne `fs:allow-write-file` schlug jeder Export im gebauten Programm fehl,
//!    während sämtliche Tests bestanden.
//!
//! Die Tests hier gehen deshalb denselben Weg wie die Oberfläche: über
//! `on_message` des Webviews, mit den echten Berechtigungen aus dem Kontext.

use tauri::test::{get_ipc_response, mock_builder, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/// Baut eine Anwendung mit den echten Befehlen, dem echten Kontext und einer
/// leeren Datenbank in einem temporären Ordner.
///
/// Der Fenstername muss `main` sein — `capabilities/default.json` bindet die
/// Berechtigungen an genau dieses Fenster. Ein anderer Name träfe die
/// Berechtigungen nicht, und der Test prüfte etwas anderes als die Anwendung.
fn test_app() -> (tempfile::TempDir, tauri::WebviewWindow<tauri::test::MockRuntime>) {
    let dir = tempfile::tempdir().unwrap();
    let pool = tauri::async_runtime::block_on(crate::db::init_db(&dir.path().join("t.db"))).unwrap();

    let app = crate::mit_befehlen(crate::mit_plugins(mock_builder()))
        .build(crate::kontext())
        .unwrap();
    app.manage(pool);
    let fenster = WebviewWindowBuilder::new(&app, "main", WebviewUrl::default())
        .build()
        .unwrap();
    (dir, fenster)
}

/// Ruft einen Befehl so auf, wie es die Oberfläche täte.
fn rufe(
    fenster: &tauri::WebviewWindow<tauri::test::MockRuntime>,
    befehl: &str,
    argumente: serde_json::Value,
) -> Result<serde_json::Value, serde_json::Value> {
    get_ipc_response(
        fenster,
        InvokeRequest {
            cmd: befehl.into(),
            callback: tauri::ipc::CallbackFn(0),
            error: tauri::ipc::CallbackFn(1),
            // tauri://localhost ist der Ursprung, unter dem die Oberfläche im
            // gebauten Programm läuft. Von einem fremden Ursprung lehnt Tauri
            // jeden Befehl ab — der Test würde dann nur das prüfen.
            url: "tauri://localhost".parse().unwrap(),
            body: argumente.into(),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_string(),
        },
    )
    .map(|b| b.deserialize().unwrap())
}

#[test]
fn jeder_registrierte_befehl_ist_erreichbar() {
    let (_dir, fenster) = test_app();

    // Ein nicht registrierter Befehl muss abgelehnt werden — sonst wäre der
    // Test unten wertlos, weil er auch bei fehlender Registrierung bestünde.
    let unbekannt = rufe(&fenster, "gibt_es_nicht", serde_json::json!({}));
    assert!(unbekannt.is_err(), "unbekannter Befehl wurde angenommen");

    // Befehle ohne Argumente aus jedem Bereich der Anwendung. Sie decken die
    // Registrierung ab; was sie zurückgeben, prüfen die Tests der Module.
    for befehl in [
        "einheit_list",
        "kunde_list",
        "artikel_list",
        "beleg_list",
        "firma_get",
        "dashboard_laden",
        "offene_posten_list",
        "nummernkreis_list",
        "einstellung_list",
        "eingangsrechnung_list",
        "sicherungen_liste",
        "protokoll_pfad",
    ] {
        let ergebnis = rufe(&fenster, befehl, serde_json::json!({}));
        assert!(ergebnis.is_ok(), "{befehl} nicht erreichbar: {ergebnis:?}");
    }
}

#[test]
fn argumente_kommen_unversehrt_an() {
    let (_dir, fenster) = test_app();

    // Tauri wandelt camelCase aus der Oberfläche in snake_case der Signatur um.
    // Diese Umwandlung ist der zweite lautlose Fehlerherd: Ein falsch benanntes
    // Feld führt nicht zu einem Übersetzungsfehler, sondern zu einem
    // Laufzeitfehler beim Nutzer.
    let angelegt = rufe(
        &fenster,
        "einheit_create",
        serde_json::json!({ "name": "Stunde", "kuerzel": "h" }),
    )
    .expect("einheit_create abgelehnt");
    assert_eq!(angelegt["name"], "Stunde");
    assert_eq!(angelegt["kuerzel"], "h");

    let liste = rufe(&fenster, "einheit_list", serde_json::json!({})).unwrap();
    assert!(
        liste.as_array().unwrap().iter().any(|e| e["kuerzel"] == "h"),
        "angelegte Einheit fehlt in der Liste",
    );
}

#[test]
fn fehler_erreichen_die_oberflaeche_in_auswertbarer_form() {
    let (_dir, fenster) = test_app();

    // Die Oberfläche unterscheidet anhand von `typ`, ob ein Fehler an einem
    // Feld hängt oder als Banner gehört. Ginge die Form auf dem Weg verloren,
    // stünde jede Fehlermeldung an der falschen Stelle.
    let fehler = rufe(
        &fenster,
        "einheit_create",
        serde_json::json!({ "name": "", "kuerzel": "" }),
    )
    .expect_err("leere Einheit wurde angenommen");
    assert_eq!(fehler["typ"], "validation");
    assert!(fehler["feld"].is_string(), "Feldangabe fehlt: {fehler}");
    assert!(fehler["meldung"].is_string(), "Meldung fehlt: {fehler}");

    let fehlend = rufe(
        &fenster,
        "kunde_get",
        serde_json::json!({ "id": "gibt-es-nicht" }),
    )
    .expect_err("unbekannte Kennung wurde angenommen");
    assert_eq!(fehlend["typ"], "nicht_gefunden");
}

/// Jede Plugin-Funktion, die die Oberfläche aufruft, mit dem zugehörigen
/// IPC-Befehl. Neue Aufrufe gehören hier ergänzt — sonst fällt eine fehlende
/// Berechtigung erst dem Nutzer auf.
///
/// Die Liste stammt aus den `@tauri-apps/plugin-*`-Importen im Frontend.
const PLUGIN_AUFRUFE: &[(&str, &str)] = &[
    ("writeFile — jeder Export", "plugin:fs|write_file"),
    ("readFile — Import einer Eingangsrechnung", "plugin:fs|read_file"),
    ("open — Dateiauswahl beim Import", "plugin:dialog|open"),
    ("save — Speicherort für den Export", "plugin:dialog|save"),
    ("check — Suche nach einer Aktualisierung", "plugin:updater|check"),
    ("downloadAndInstall — Aktualisierung einspielen", "plugin:updater|download_and_install"),
    ("relaunch — Neustart nach der Aktualisierung", "plugin:process|restart"),
    ("error — Fehler der Oberfläche protokollieren", "plugin:log|log"),
    ("revealItemInDir — Protokolldatei zeigen", "plugin:opener|reveal_item_in_dir"),
    ("getVersion — Versionsanzeige", "plugin:app|version"),
];

#[test]
fn die_oberflaeche_darf_alles_aufrufen_was_sie_aufruft() {
    // P1.1: `fs:allow-write-file` fehlte in den Berechtigungen. Der Export
    // erzeugte die Bytes fehlerfrei — nur speichern ließen sie sich nicht,
    // weil die Oberfläche `plugin:fs|write_file` nicht aufrufen durfte. Alle
    // Tests waren grün, im gebauten Programm ging kein einziger Export.
    //
    // Gefragt wird hier die Berechtigungsauflösung selbst, statt die Befehle
    // aufzurufen: `process|restart` würde den Testprozess beenden und `dialog`
    // auf ein Fenster warten, das es nicht gibt.
    let mut kontext = crate::kontext::<tauri::test::MockRuntime>();
    let autoritaet = kontext.runtime_authority_mut();

    let mut fehlend = Vec::new();
    for (aufruf, befehl) in PLUGIN_AUFRUFE {
        let erlaubt = autoritaet
            .resolve_access(befehl, "main", "main", &tauri::ipc::Origin::Local)
            .is_some_and(|treffer| !treffer.is_empty());
        if !erlaubt {
            fehlend.push(format!("{aufruf} → {befehl}"));
        }
    }

    assert!(
        fehlend.is_empty(),
        "Die Oberfläche ruft diese Funktionen auf, darf es laut capabilities/default.json \
         aber nicht:\n  {}",
        fehlend.join("\n  "),
    );
}

/// Wie `rufe`, aber mit Rohdaten im Rumpf und Kopffeldern.
///
/// `plugin:fs|write_file` nimmt den Pfad nicht als Argument, sondern als
/// Kopffeld, und die Daten als Rumpf — genauso schickt sie die Oberfläche.
fn rufe_mit_rohdaten(
    fenster: &tauri::WebviewWindow<tauri::test::MockRuntime>,
    befehl: &str,
    pfad: &str,
    daten: Vec<u8>,
) -> Result<serde_json::Value, serde_json::Value> {
    let mut headers = tauri::http::HeaderMap::new();
    headers.insert("path", pfad.parse().unwrap());
    get_ipc_response(
        fenster,
        InvokeRequest {
            cmd: befehl.into(),
            callback: tauri::ipc::CallbackFn(0),
            error: tauri::ipc::CallbackFn(1),
            url: "tauri://localhost".parse().unwrap(),
            body: tauri::ipc::InvokeBody::Raw(daten),
            headers,
            invoke_key: INVOKE_KEY.to_string(),
        },
    )
    .map(|b| b.deserialize().unwrap_or(serde_json::Value::Null))
}

#[test]
fn ein_export_landet_wirklich_auf_der_platte() {
    // Über die Berechtigung hinaus: Der Weg vom Aufruf der Oberfläche bis zur
    // Datei muss vollständig sein. Ein Export, der nur keinen Fehler meldet,
    // ist keiner.
    //
    // Wichtig ist dabei der zweite Riegel, den `fs:allow-write-file` allein
    // nicht öffnet: Der Dateisystem-Geltungsbereich ist anfangs leer, ein
    // beliebiger Pfad wird abgewiesen. Im Programm weitet ihn der
    // Speichern-Dialog aus — `plugin:dialog|save` trägt den gewählten Pfad ein.
    // Deshalb funktioniert der Export nur über den Dialog. Würde jemand ihn
    // später durch einen festen Pfad ersetzen, schlüge das Schreiben fehl,
    // ohne dass sich an den Berechtigungen etwas geändert hätte.
    let (dir, fenster) = test_app();
    let ziel = dir.path().join("RE-2026-0001.pdf");

    let ohne_dialog = rufe_mit_rohdaten(
        &fenster,
        "plugin:fs|write_file",
        ziel.to_str().unwrap(),
        b"%PDF".to_vec(),
    );
    assert!(
        ohne_dialog.is_err(),
        "Ein beliebiger Pfad darf ohne Dialog nicht beschreibbar sein",
    );

    // Das tut der Speichern-Dialog, sobald der Nutzer einen Ort gewählt hat.
    use tauri_plugin_fs::FsExt;
    fenster.app_handle().fs_scope().allow_file(&ziel).unwrap();

    rufe_mit_rohdaten(
        &fenster,
        "plugin:fs|write_file",
        ziel.to_str().unwrap(),
        b"%PDF".to_vec(),
    )
    .expect("Datei konnte nach der Auswahl nicht geschrieben werden");

    assert_eq!(std::fs::read(&ziel).unwrap(), b"%PDF");
}
