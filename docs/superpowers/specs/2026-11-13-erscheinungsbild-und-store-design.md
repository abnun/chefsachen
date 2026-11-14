# Neues Erscheinungsbild und Store-Reife

Stand: 2026-11-13 · Branch `design-und-store`

Zwei Vorhaben, die zusammengehören: Die App bekommt ein Erscheinungsbild, das
sich wie eine Apple-eigene App anfühlt (Vorgabe aus `PRODUCT.md`), und sie wird
für den Mac App Store und den Microsoft Store baubar. Die Abläufe der App
ändern sich nicht. Der bisherige Vertrieb über GitHub mit eigenem Updater
bleibt unverändert bestehen.

## Teil A: Erscheinungsbild

### Szene

Eine Selbstständige schreibt nachmittags am MacBook im Arbeitszimmer bei
Tageslicht zwei Rechnungen, abends bei Lampenlicht prüft sie den
Zahlungseingang; der Mac folgt dem System-Hell/Dunkel. Daraus: beide Modi sind
gleichwertig, die App folgt dem System, ohne eigenen Schalter.

### Farbstrategie: Zurückhaltend, mit eigenem Akzent

- Neutrale Töne in OKLCH, ganz leicht zum Akzent-Farbton getönt (Chroma
  0,003 bis 0,008). Kein reines Schwarz, kein reines Weiß.
- Akzent: **Petrol** (Farbton um 220, hell oklch(0.49 0.09 220)). Begründung:
  Der bisherige Schieferblau-Akzent lag fast auf dem Farbton des Status
  „gestellt" und war der Branchenreflex (Finanzen = Marineblau). Petrol
  erinnert an Füllertinte, bleibt ruhig und hebt sich klar vom blauen
  Status „offen" ab. Zuerst war Kopierstift-Violett (290) umgesetzt; der
  Betreiber hat es nach Ansicht verworfen. Verglichen wurden außerdem
  Apple-Blau (verschwimmt mit dem Status „offen"), Graphit (zu farblos) und
  Terrakotta (wirkt neben dem Fehler-Rot wie ein Gefahr-Knopf).
- Farbe trägt Bedeutung: Akzent nur für Hauptaktion, aktuelle Auswahl,
  Fokus und Verweise. Statusfarben nur für Status.
- Systemakzent des Nutzers wird bewusst **nicht** übernommen: Bei Gelb oder
  Grafit ließe sich AA-Kontrast für weiße Schrift nicht garantieren.

### Typografie

- Eine Familie: Systemschrift (`-apple-system`, `"Segoe UI Variable"`,
  `"Segoe UI"`, `system-ui`).
- macOS-Maße: Grundtext 13 px, unter Windows 14 px (je über
  `data-plattform` am `<html>`).
- Feste Stufen, Verhältnis rund 1,2: 11 · 13 · 15 · 17 · 22 px. Seitentitel
  22 px / 700 mit leicht negativer Laufweite. Tabellenköpfe 11 px, normal,
  **ohne** Versalien (macOS-Tabellenkopf statt Web-Admin-Look).
- Ziffern in Tabellen und Beträgen immer `tabular-nums`.

### Fenster und Rahmen

- macOS: `titleBarStyle: "Overlay"`, Titel ausgeblendet. Die Seitenleiste
  reicht bis an die Fensteroberkante, die Ampelknöpfe sitzen darauf (oberer
  Innenabstand 52 px). Kein transparentes Fenster und keine Systemunschärfe:
  das bräuchte `macOSPrivateApi` und wäre im Mac App Store ein
  Ablehnungsgrund.
- Ziehbereiche über `data-tauri-drag-region` (Seitenleistenkopf,
  Werkzeugleiste des Inhalts); Berechtigung
  `core:window:allow-start-dragging`.
- Windows: normale Titelleiste, kein Innenabstand für Ampelknöpfe.
- Die Plattform wird beim Start einmal ermittelt (`navigator.userAgent`
  genügt, keine zusätzliche Rust-Abfrage) und als `data-plattform="mac|win|andere"`
  an `<html>` gesetzt.

### Seitenleiste

- Eigene, leicht abgesetzte Fläche (zweite neutrale Ebene), Hairline-Trenner
  zum Inhalt.
- Gruppiert wie in Mail: **Übersicht** oben; Gruppe „Belege" (Angebote,
  Rechnungen, Gutschriften); Gruppe „Eingang" (Eingangsrechnungen); Gruppe
  „Stammdaten" (Kunden, Artikel & Leistungen); „Auswertung"; „Einstellungen"
  unten abgesetzt. Gruppenüberschriften 11 px, gedämpft, semantisch als
  Listenüberschrift (`aria-labelledby`), nicht als Knopf.
- Zeilen 28 px, Symbole in Akzentfarbe (wie macOS-Seitenleisten), Auswahl als
  gerundete Fläche in Akzent mit geringer Deckkraft, Schrift bleibt Textfarbe.
- Eigenes Symbol für Gutschriften (bisher identisch mit Rechnungen).

### Inhaltsbereich

- Oben eine Werkzeugleiste in Titelleistenhöhe: Seitentitel links, Aktionen
  rechts (Suchfeld, Hauptaktion). Sie bleibt beim Scrollen stehen und bekommt
  erst dann eine Hairline-Unterkante.
- Listen nutzen die volle Breite; Formulare und Lesetext bleiben auf
  ca. 720 px begrenzt.
- Tabellen wie in Numbers/Finder: keine umrandete Karte mehr, Zeilenhöhe
  ca. 30 px, abwechselnd leicht getönte Zeilen, Hover als feine Fläche,
  Spaltenköpfe ohne Versalien, Beträge rechtsbündig.

### Komponenten

- Knöpfe: Höhe 28 px, Radius 6 px, 13 px / 500. Primär gefüllt in Akzent;
  Sekundär auf Fläche mit Hairline und feinem Schatten; Leise ohne Rahmen;
  Gefahr mit roter Schrift. Zustände: hover, active (leicht dunkler/gedrückt),
  focus-visible (macOS-Fokusring: 3 px Akzent mit 40 % Deckkraft außen),
  disabled.
- Eingabefelder: Radius 6 px, Hairline-Rand, Fokus mit demselben Fokusring.
- Formulargruppen: Abschnitte als eingesetzte Gruppe wie in den
  Systemeinstellungen (Radius 10 px, eigene Gruppenfläche, kein Schatten).
  Das ersetzt die bisherige `.karte`. Keine verschachtelten Gruppen.
- Statusmarken: kleine Kapsel, 11 px / 600, getönte Fläche, Text immer
  vorhanden (Status nie nur über Farbe).
- Dialoge: wie macOS-Sheets: von oben eingeblendet (220 ms, ease-out-quart),
  Radius 12 px, Schaltflächen rechts, Hauptaktion ganz rechts. Bei
  `prefers-reduced-motion` nur Einblenden ohne Bewegung.
- Hinweis- und Fehlerboxen: volle Hairline-Umrandung oder getönte Fläche,
  niemals ein farbiger Seitenstreifen.

### Bewegung

Nur zur Zustandsänderung: Hover/Fokus 120 ms, Sheet 220 ms, Auf- und
Zuklappen 180 ms. Keine Layout-Eigenschaften animieren. Keine
Lade-Choreografie.

### Was sich nicht ändert

- Keine Abläufe, keine Texte außer Navigationsgruppen-Überschriften.
- Alle Tests bleiben grün; `kontrast.test.ts` wird auf OKLCH-Werte erweitert
  (Umrechnung OKLCH → sRGB im Test) und um die neuen Paare ergänzt
  (Akzent-Text auf Akzent, Statusmarken, Seitenleistentext auf
  Seitenleistenfläche).

## Teil B: Store-Reife

### Vertriebswege

Ein Rust-Feature bestimmt den Vertriebsweg zur Übersetzungszeit:

| Bau | Cargo-Feature | Updater | Spendenhinweis | Paket |
|---|---|---|---|---|
| GitHub (wie bisher) | `selbst-aktualisierung` (Standard) | ja | ja | dmg, msi, exe |
| Mac App Store | `mac-app-store` (ohne Standard) | nein | nein | pkg |
| Microsoft Store | `microsoft-store` (ohne Standard) | nein | nein | msix |

- `tauri-plugin-updater` und `tauri-plugin-process` werden optionale
  Abhängigkeiten, nur im Feature `selbst-aktualisierung`. Im Store-Bau ist
  kein Selbstaktualisierungscode im Programm (App-Store-Richtlinie 2.4.5,
  Updates nur über den Store).
- Neuer Befehl `vertriebsweg` liefert `"github" | "mac_app_store" |
  "microsoft_store"`. Die Oberfläche blendet danach Aktualisierungssuche,
  Aktualisierungsbenachrichtigung, Menüeintrag „Nach Aktualisierung suchen"
  und Spendenhinweis/-abschnitt aus. Spendenaufrufe außerhalb des
  In-App-Kaufs sind im Mac App Store für Einzelentwickler unzulässig.
- Berechtigungen: `capabilities/default.json` ohne Updater/Prozess. Die
  Updater-Rechte (`updater:default`, `process:allow-restart`) stehen als
  eingebettete Capability `aktualisierung` in `tauri.conf.json` unter
  `app.security.capabilities` neben `"default"`. Die Store-Überlagerungen
  ersetzen diese Liste durch `["default"]`. Eine eigene Datei im Ordner
  `capabilities/` ginge nicht: Der Build liest alle Dateien dort und würde im
  Store-Bau an der unbekannten Updater-Berechtigung scheitern. **Vor der
  Umsetzung per Probebau verifizieren**; falls Tauri eingebettete
  Capabilities anders behandelt, ist der Ausweichweg eine eigene
  Capability-Datei, die per Überlagerung je Bau ausgewählt wird.
  *Verifiziert (B1):* Ohne Überlagerung scheitert der Store-Bau in
  `generate_context!` mit `UnknownManifest { key: "updater" }`, mit
  Überlagerung (`tauri build --config …` bzw. `TAURI_CONFIG` für reines
  `cargo build`/`cargo test`/`clippy`) baut und testet er grün. Der Ansatz
  trägt; der Ausweichweg wird nicht gebraucht.

### Mac App Store

- `src-tauri/tauri.appstore.conf.json` (Überlagerung):
  `bundle.createUpdaterArtifacts: false`, `plugins.updater` entfernt,
  `bundle.macOS.entitlements: "./Entitlements.appstore.plist"`,
  `bundle.macOS.files` mit `embedded.provisionprofile` (Datei liegt **nicht**
  im Repo, sondern wird lokal bzw. aus einem CI-Secret abgelegt) und
  `PrivacyInfo.xcprivacy`, `bundle.macOS.minimumSystemVersion: "12.0"`,
  `bundle.category: "Business"`.
- `src-tauri/Entitlements.appstore.plist`: `app-sandbox`,
  `files.user-selected.read-write`, `application-identifier` und
  `team-identifier` (Team-ID als Platzhalter `TEAM_ID`, wird vom Betreiber
  eingesetzt).
- `src-tauri/Info.plist`: `ITSAppUsesNonExemptEncryption = false`,
  `LSApplicationCategoryType = public.app-category.business`.
- `src-tauri/PrivacyInfo.xcprivacy`: keine Datensammlung, kein Tracking;
  begründete API-Nutzung für Dateizeitstempel (C617.1) und UserDefaults
  (CA92.1, durch WebKit).
- Sandbox-Prüfung im Code: Datenbank, Sicherungen und Protokoll liegen unter
  `app_data_dir` bzw. dem Protokollverzeichnis und landen damit automatisch im
  Container. Dateien werden nur über Dialoge gewählt (Sicherheitsbereich
  durch `user-selected`). Schriften sind eingebettet. Zu prüfen bleiben: jedes
  Lesen/Schreiben außerhalb dieser Wege (`grep` nach festen Pfaden, `HOME`,
  `/tmp`).
- Skript `scripts/mac-app-store.sh`: baut mit
  `--config src-tauri/tauri.appstore.conf.json --target universal-apple-darwin --bundles app -- --no-default-features --features mac-app-store`,
  signiert das Paket mit `xcrun productbuild --sign "3rd Party Mac Developer Installer: …"`,
  und lädt optional mit `xcrun altool` hoch. Namen von Zertifikaten und
  Schlüsseln kommen aus Umgebungsvariablen, nichts davon im Repo.

### Umzug vorhandener Daten

Der Store-Bau liegt im Sandbox-Container und sieht die Daten der
GitHub-Fassung nicht. Der Einrichtungsassistent bekommt deshalb auf der ersten
Seite den Weg „Ich nutze Chefsachen schon: Sicherung einspielen", der den
bestehenden Befehl `sicherung_aus_datei_einspielen` nutzt. Die Anleitung in
`docs/installation.md` beschreibt: in der alten Fassung „Sicherung
exportieren", in der Store-Fassung einspielen.

### Microsoft Store

- Paketformat **MSIX**, unsigniert hochgeladen; der Store signiert selbst.
  Damit entfällt ein kostenpflichtiges Code-Signing-Zertifikat, das ein
  EXE/MSI-Eintrag verlangen würde.
- `src-tauri/msix/AppxManifest.xml` als Vorlage mit Platzhaltern für
  `Identity Name`, `Publisher` und `PublisherDisplayName` aus dem Partner
  Center; `runFullTrust`; `Windows.FullTrustApplication`; Mindestversion
  Windows 10 1809; Logos aus den vorhandenen `Square*Logo.png`/`StoreLogo.png`.
- Skript `scripts/microsoft-store.ps1`: baut mit
  `--no-bundle -- --no-default-features --features microsoft-store`,
  setzt das Layoutverzeichnis zusammen, ersetzt Platzhalter aus
  Umgebungsvariablen, packt mit `makeappx pack`.
- Neuer manueller Workflow `.github/workflows/store.yml`
  (`workflow_dispatch`): baut das MSIX auf `windows-latest` und lädt es als
  Artefakt hoch; der Mac-Store-Bau läuft lokal, weil Zertifikate und
  Provisioning-Profil beim Betreiber liegen.

### Store-Einträge

`docs/store/` mit:

- `checkliste.md`: Schritt-für-Schritt für App Store Connect (App-ID,
  Zertifikate „3rd Party Mac Developer Application/Installer",
  Provisioning-Profil, API-Schlüssel für altool, Datenschutzangaben „Keine
  Daten erfasst", Exportkonformität, Altersfreigabe, Preis kostenlos) und für
  das Partner Center (Konto, Namen reservieren, Identität ins Manifest,
  MSIX hochladen, Altersfreigabe IARC, Datenschutzrichtlinie).
- `texte.md`: Name, Untertitel (30 Zeichen), Werbetext, Beschreibung,
  Stichwörter (100 Zeichen), Neuerungen, Support- und Datenschutz-URL
  (`website/datenschutz.html`), jeweils Deutsch.
- Screenshots: aus der Vorschau (`vorschau/`) mit Playwright in 2880×1800
  (Mac) und 1920×1080 (Windows), hell und dunkel, Skript
  `vorschau/screenshots.mjs`.

## Nicht im Umfang

- Einreichung selbst (braucht die Konten und Entscheidungen des Betreibers).
- iOS/iPadOS.
- Übernahme des Systemakzents, eigener Hell/Dunkel-Schalter.
- In-App-Käufe oder Trinkgeld über den Store.

## Anhang: Kritik des Ist-Zustands und Folgerungen (Vorschau-Screenshots)

| Befund | Folgerung |
|---|---|
| Inhalt auf 960 px gedeckelt, rechts ein Drittel leer; Kundennamen brechen in Listen dreizeilig um | Listen volle Breite; Formulare/Lesetext max. 720 px |
| Jeder Abschnitt in einer Karte, ca. 40 px Leerraum über jeder Überschrift; Tabelle mit eigenem Kopfband in der Karte | Tabellen ohne Karte direkt auf der Inhaltsfläche; Abschnitte über Überschrift + Abstand gegliedert; Gruppenfläche nur für Formulare |
| Versalien-Spaltenköpfe | 11 px, normal, gedämpft, keine Versalien |
| „Rundgang" auf jeder Seite oben rechts, Hauptaktion darunter; Filter mit eigener Beschriftung über dem Feld | Werkzeugleiste: Titel links; rechts Suchfeld (Platzhalter + `aria-label` statt sichtbarer Beschriftung), Filter-Popup, Hauptaktion; „Rundgang" als leiser Hilfe-Knopf (Fragezeichen-Symbol mit `aria-label="Rundgang"` und Tooltip) |
| Belegnummer grau, Beträge linksbündig | Nummer in Textfarbe, `tabular-nums`; Betragsspalten rechtsbündig (Klasse `zahl` an `th`/`td`) |
| Status und Zahlung als zwei gleich laute Pillen, auch im Normalfall | Normalfall leise (neutrale Marke), Ausnahmen (Entwurf, offen/überfällig, storniert) farbig; Text bleibt immer |
| Editor: sechs gleichrangige Knöpfe, „Stornieren" neben „ZUGFeRD" | Exporte als zusammenhängende Knopfgruppe „PDF · XRechnung · ZUGFeRD"; Weitere Aktionen; „Stornieren" abgesetzt am Ende als Gefahr-Knopf |
| Editor-Stammdaten als lose Absätze, Summe außerhalb der Gruppe | Zweispaltige Beschriftung/Wert-Liste (`dl`); Summe als Fußzeile der Positionstabelle |
| Einstellungen: lange einspaltige Liste, PLZ/Land 900 px breit | Formulargruppen, Raster: Straße; PLZ + Ort; Land; Feldbreiten nach Inhalt |
| Übersicht: große Umsatzzahl allein in einer Karte (Kennzahlen-Klischee) | Kopfzeile „Vereinnahmt 2026" mit Betrag in 22 px neben Vorjahr, darunter direkt die Umsatzgrenzen; keine eigene Karte |
| Seitenleiste ohne Gruppen; Akzent im Dunkelmodus kontrastschwach | Gruppen nach Spec; Akzent-Tokens je Modus auf ≥ 4,5:1 geprüft |
