# Plan: Neues Erscheinungsbild und Store-Reife

Spec: `docs/superpowers/specs/2026-11-13-erscheinungsbild-und-store-design.md`
Branch: `design-und-store`. Jede Aufgabe endet mit grünem
`npx tsc --noEmit && npm test && npm run lint` (Frontend) bzw.
`cargo test --manifest-path src-tauri/Cargo.toml` (Rust) und einem eigenen
Commit. Neue E2E-Fälle nur ans Ende von `e2e/specs/durchgang.js`.

Reihenfolge: B1 bis B4 (Store-Grundlage) laufen parallel zu A1 bis A5
(Erscheinungsbild), weil sie fast keine Dateien teilen. Berührungspunkte:
`tauri.conf.json` (A2 Fenster, B1 Capabilities) und `Einstellungen.tsx`
(A4 Stil, B2 Ausblenden). Diese Aufgaben laufen nacheinander.

## Teil B: Store

### B1 Vertriebsweg-Feature in Rust
- `Cargo.toml`: `[features] default = ["selbst-aktualisierung"]`,
  `selbst-aktualisierung = ["dep:tauri-plugin-updater", "dep:tauri-plugin-process"]`,
  `mac-app-store = []`, `microsoft-store = []`. Updater/Prozess optional.
- `lib.rs`: Plugins nur unter `cfg(feature = "selbst-aktualisierung")`;
  `aktualisierung.rs` ebenso; Menüeintrag in `menue.rs` ebenso.
- Befehl `vertriebsweg` (neu, in `commands`), in `mit_befehlen` registriert,
  Test über die IPC-Grenze wie bei den anderen Befehlen.
- `compile_error!`, wenn `mac-app-store` oder `microsoft-store` zusammen mit
  `selbst-aktualisierung` aktiv ist.
- Capabilities: Updater/Prozess aus `default.json` in eingebettete
  Capability `aktualisierung` in `tauri.conf.json` verschieben.
- Prüfen: `cargo build`, `cargo build --no-default-features --features mac-app-store`,
  `cargo test` beide Varianten.

### B2 Oberfläche je Vertriebsweg
- `api.ts`: `api.vertriebsweg()`.
- Hook `useVertriebsweg` (einmal laden, Kontext). Bei `!= "github"`:
  `AktualisierungProvider` sucht nicht, `AktualisierungsBenachrichtigung`,
  `Aktualisierung`-Abschnitt, `SpendenHinweis`, `SpendenAbschnitt` rendern
  nichts. Tests für beide Fälle.

### B3 Mac-App-Store-Bau
- `tauri.appstore.conf.json`, `Entitlements.appstore.plist`, `Info.plist`,
  `PrivacyInfo.xcprivacy`, `scripts/mac-app-store.sh`.
- `.gitignore`: `*.provisionprofile`, `private_keys/`.
- Sandbox-Prüfung: grep nach festen Pfaden; Probebau `.app` mit Ad-hoc- bzw.
  Entwicklerzertifikat, falls vorhanden, sonst nur unsigniert bauen und
  `codesign -d --entitlements -` prüfen.

### B4 Microsoft-Store-Bau
- `tauri.microsoftstore.conf.json`, `src-tauri/msix/AppxManifest.xml`,
  `scripts/microsoft-store.ps1`, `.github/workflows/store.yml`
  (`workflow_dispatch`, Artefakt-Upload, Actions per SHA gepinnt wie in
  `release.yml`).

### B5 Umzug: Sicherung im Einrichtungsassistenten einspielen
- Erste Seite von `Einrichtung.tsx`: leiser Knopf „Ich nutze Chefsachen
  schon: Sicherung einspielen" → Dateidialog → `sicherung_aus_datei_einspielen`
  → Firma neu laden. Test. Prüfen, ob der Rust-Befehl vor abgeschlossener
  Einrichtung funktioniert (Datenbank wird ersetzt, App lädt neu).
- `docs/installation.md` um Abschnitt „Umzug in die Store-Fassung".

### B6 Store-Unterlagen
- `docs/store/checkliste.md`, `docs/store/texte.md`.
- `vorschau/screenshots.mjs` (Playwright, 2880×1800 und 1920×1080, hell und
  dunkel), Ausgabe nach `docs/store/screenshots/` (nicht eingecheckt, in
  `.gitignore`).
- README-Abschnitt „Vertriebswege" und CHANGELOG-Eintrag unter neuer
  Version (erst beim Release).

## Teil A: Erscheinungsbild

### A1 Tokens
- `tokens.css` auf OKLCH, neue Palette (Kopierstift-Violett, getönte
  Neutrale, Seitenleistenfläche, Gruppenfläche, Fokusring, Statusfarben neu
  abgestimmt), Typo-Stufen 11/13/15/17/22, Plattformgröße über
  `[data-plattform]`, Bewegungs-Tokens (Dauer, ease-out-quart).
- `kontrast.test.ts`: OKLCH-Parser + Umrechnung nach sRGB, neue Paare.
- Feste Hex-Werte aus `komponenten.css` (`.grenze-*`, Overlay-rgba) in Tokens.

### A2 Fensterrahmen und Seitenleiste
- `tauri.conf.json`: `titleBarStyle: "Overlay"`, `hiddenTitle: true`;
  Capability `core:window:allow-start-dragging`.
- `main.tsx`: `data-plattform` setzen.
- `Layout.tsx`: Gruppen, Gutschrift-Symbol, Ziehbereich, Einstellungen unten.
- Werkzeugleiste des Inhalts (Seitentitel + Aktionen) als gemeinsame
  Komponente; bestehende `seiten-kopf`/`werkzeugleiste` darauf umstellen.

### A3 Tabellen, Knöpfe, Felder, Status
- Stile nach Spec; Zustände vollständig.

### A4 Formulargruppen, Dialoge, Hinweise
- `.karte` → eingesetzte Gruppe; Dialog als Sheet mit Bewegung und
  reduzierter Bewegung; Hinweis-/Fehlerboxen.

### A5 Übersicht und Feinschliff
- Ergebnis der Kritik der Übersicht umsetzen (siehe Abschnitt Kritik).
- Abgleich aller Seiten hell/dunkel per Vorschau-Screenshots.

### A6 App-Icon
- Neues Icon als SVG im macOS-Raster (abgerundetes Quadrat 824/1024 mit
  Rand, Schatten), Motiv Beleg mit Kopierstift-Strich; `npm run tauri icon`
  erzeugt alle Größen; `website/app-icon.png` und `public/app-icon.png`
  nachziehen.
