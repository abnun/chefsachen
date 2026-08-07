# Chefsachen

Eine Desktop-Anwendung für die Rechnungsstellung von Kleinunternehmern nach
§ 19 UStG. Alle Daten bleiben lokal auf dem eigenen Rechner — kein Server,
kein Konto, keine Cloud.

> **Keine Steuerberatung.** Die Anwendung erstellt Belege und weist auf die
> Umsatzgrenzen der Kleinunternehmerregelung hin. Sie ersetzt weder eine
> steuerliche Beratung noch eine Buchhaltungssoftware, und sie erstellt weder
> Umsatzsteuer-Voranmeldung noch EÜR. Für die Richtigkeit der abgegebenen
> Erklärungen bleibt der Nutzer verantwortlich.

## Was die Anwendung kann

- **Rechnungen und Angebote** mit fortlaufender, lückenloser Nummerierung
  (getrennte, jahresweise zurücksetzbare Nummernkreise)
- **PDF-Ausgabe** mit allen Pflichtangaben nach § 14 UStG, erzeugt als
  PDF/A-3b — dem Format, das für die revisionssichere Aufbewahrung taugt
- **E-Rechnung im Ausgang**: XRechnung 3.0.2 (CII) und ZUGFeRD, beide gegen
  die amtlichen Regelwerke geprüft (siehe [Prüfwerkzeuge](#prüfwerkzeuge))
- **E-Rechnung im Eingang**: Import von XRechnung und ZUGFeRD mit
  Feldübernahme, Duplikatwarnung und unveränderlicher Archivierung der
  Originaldatei. Reine PDF-Rechnungen ohne eingebettete Daten werden ebenfalls
  archiviert, die Angaben dazu von Hand erfasst.
- **Umsatzgrenzen nach § 19 UStG**: Übersicht über die 25.000-€-Grenze des
  Vorjahres und die 100.000-€-Grenze des laufenden Jahres, mit einer
  Erläuterung der finanziellen Folgen — inklusive der Umsatzsteuer, die bei
  einem Überschreiten fällig würde
- **Regelbesteuerung nach dem Überschreiten der Grenze**: Ohne das
  Kleinunternehmer-Häkchen weisen neue Belege die Umsatzsteuer aus — Satz je
  Artikel (19/7/0 %), Preise bleiben brutto, die enthaltene Steuer wird je
  Satz aufgeschlüsselt (§ 14 Abs. 4 Nr. 7–8 UStG). Festgeschriebene Belege
  behalten ihren damaligen Steuermodus; XRechnung/ZUGFeRD tragen Kategorie
  S bzw. Z, geprüft gegen den KoSIT-Validator. §-4-Steuerbefreiungen mit
  Befreiungsgrund (Kategorie E außerhalb von § 19) sind nicht abgedeckt.
- **Kunden und Artikel** mit kundenspezifischen Preisen
- **Zahlungen** mit Teilzahlungen und abgeleitetem Zahlungsstand
- **Zahlungserinnerung** als PDF für überfällige Rechnungen, mit Fälligkeit,
  Tagen im Verzug und offenem Betrag
- **Girocode** (SEPA-QR-Code zum Bezahlen per Smartphone) auf Rechnung und
  Zahlungserinnerung, sofern eine IBAN hinterlegt ist — standardmäßig aktiv,
  abschaltbar in den Einstellungen
- **Abschlagsrechnungen** mit optionalem Gesamt-Auftragswert: weist auf dem
  Beleg zusätzlich auf den Gesamtwert des Auftrags hin, von dem die
  Abschlagsrechnung nur einen Teil abrechnet
- **Angebote mit Gültigkeitsdatum** (Vorgabe einstellbar); Abgelaufenes
  verschwindet von selbst aus den offenen Posten
- **Belege duplizieren**: ein festgeschriebener Beleg dient als Vorlage für
  den nächsten fast gleichen Vorgang
- **Jahresauswertung** der vereinnahmten Zahlungen (Zuflussprinzip) mit
  CSV-Export für Excel und die Steuerberater-Zuarbeit
- **Automatische Sicherungen** der Datenbank bei jedem Start (die letzten
  zehn bleiben erhalten); der manuelle Export bündelt Datenbank und
  Belegarchiv als Zip und lässt sich in der App wieder einspielen
- **Tastenkürzel** auf den Listenseiten: ⌘N/Strg+N legt einen neuen Eintrag
  an, ⌘F/Strg+F springt ins Suchfeld
- **Aktualisierung** über signierte Update-Pakete, angestoßen vom Nutzer
- **Protokolldatei** für die Ferndiagnose — bewusst ohne Kunden- und
  Rechnungsdaten, damit sie sich weitergeben lässt

Die Belegarchivierung folgt den GoBD: Festgeschriebene Belege lassen sich
nicht mehr ändern, Korrekturen an importierten Eingangsrechnungen werden mit
altem und neuem Wert protokolliert.

## Was die Anwendung bewusst nicht kann

**Sie verschickt keine E-Mails.** Ein Beleg wird festgeschrieben, als PDF (und
bei Rechnungen als XRechnung/ZUGFeRD) exportiert — verschickt wird er vom
Nutzer selbst, per Mail, Post oder wie auch immer. Das ist keine Lücke,
sondern eine bewusste Entscheidung: Die Anwendung kennt weder ein Mailkonto
noch einen Versandweg, und ein Beleg als „verschickt" zu markieren, ohne dass
tatsächlich etwas verschickt wurde, wäre eine Zustellillusion. Der Wortlaut
im Programm sagt das an jeder Stelle ausdrücklich („Verschickt wird nichts").

## Installation (für Anwender)

Fertige Installationspakete werden über die Releases verteilt. Die Anleitung
inklusive der Sicherheitswarnung beim ersten Start steht in
[docs/installation-freunde.md](docs/installation-freunde.md).

Die App ist bewusst **nicht** mit einem Plattform-Zertifikat signiert: Eine
Apple Developer ID kostet 99 $/Jahr, ein Windows-Zertifikat ähnlich viel. Für
die Weitergabe im kleinen Kreis lohnt sich das nicht — die Warnung ist dafür
einmalig zu bestätigen.

Die **Update-Pakete** sind davon unabhängig sehr wohl signiert, mit einem
eigenen minisign-Schlüsselpaar. Ein Paket, dessen Signatur nicht zum in
`tauri.conf.json` hinterlegten öffentlichen Schlüssel passt, wird abgelehnt.

### Eine neue Version veröffentlichen

```bash
# Version in package.json, src-tauri/Cargo.toml und tauri.conf.json anheben
# und einen Abschnitt "## <Version>" in docs/CHANGELOG.md anlegen
git tag v0.2.0 && git push origin v0.2.0
```

Der CHANGELOG-Abschnitt ist Pflicht: `release.yml` liest ihn beim Bauen aus
und legt ihn als Release-Text in die `latest.json` — **fehlt er, schlägt der
Release-Build hart fehl.** Die Überschrift muss exakt `## <Version>` lauten
(so wie die Version in `tauri.conf.json` steht).

Der Workflow `release.yml` baut Installer für macOS und Windows und legt einen
**Release-Entwurf** an. Der Updater fragt
`releases/latest/download/latest.json` ab — diese Adresse zeigt nur auf
veröffentlichte Releases. **Der Entwurf muss auf GitHub also noch
veröffentlicht werden**, sonst erfährt kein Bestandsnutzer von der Version.

Voraussetzung dafür ist das Repository-Secret `TAURI_SIGNING_PRIVATE_KEY` mit
dem privaten Signaturschlüssel. Er liegt **nicht** im Repository; geht er
verloren, lassen sich für bestehende Installationen keine Updates mehr
ausliefern.

## Entwicklung

### Voraussetzungen

- [Node.js](https://nodejs.org/) 20 oder neuer
- [Rust](https://rustup.rs/) (stabile Toolchain)
- Die Systemabhängigkeiten von Tauri 2 — siehe
  [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)

### Loslegen

```bash
npm install
npm run tauri dev      # Anwendung im Entwicklungsmodus starten
```

### Prüfen

```bash
npx tsc --noEmit                                            # Typen
npm test                                                    # Frontend (Vitest)
cd src-tauri && cargo clippy --all-targets -- -D warnings   # Lint
cd src-tauri && cargo test                                  # Backend, inkl. IPC-Durchstich
./e2e/docker-lauf.sh                                        # Durchstich im echten Fenster
```

Der letzte Punkt braucht Docker und läuft nur unter Linux — siehe
[e2e/README.md](e2e/README.md).

Dieselben Prüfungen laufen in `.github/workflows/ci.yml` bei jedem Push und
jedem Pull Request.

### Prüfwerkzeuge

Ein Teil der Tests prüft die erzeugten Dateien nicht gegen eigene Annahmen,
sondern gegen die amtlichen Regelwerke:

- **KoSIT-Validator** (Koordinierungsstelle für IT-Standards) für XRechnung
- **veraPDF** für PDF/A-3b

Beide sind Java-Programme und liegen nicht im Repository. Einrichtung:

```bash
brew install openjdk        # oder ein anderes JDK 17+
./scripts/kosit-vorbereiten.sh
```

Ohne diese Werkzeuge überspringen sich die betroffenen Tests. Weil ein
übersprungener Test in Cargos Ausgabe nicht von einem bestandenen zu
unterscheiden ist, erzwingt die Umgebungsvariable `KOSIT_PFLICHT=1` ihr
Ausführen — in der CI ist sie gesetzt.

### Aufbau

```
src/                     React-Oberfläche (TypeScript, Vite)
  pages/                 Je eine Datei pro Ansicht, Tests daneben
  components/            Wiederverwendete Bausteine
  api.ts                 Typisierte Hülle um die Tauri-Befehle
src-tauri/
  src/commands/          Tauri-Befehle, die Schnittstelle zum Frontend
  src/domain/            Fachlogik ohne Datenbank- oder UI-Bezug
  src/dokument/          PDF-, XRechnung- und ZUGFeRD-Erzeugung, Import
  migrations/            Versionierte SQL-Migrationen (sqlx)
  templates/             Typst-Vorlagen für die PDF-Ausgabe
```

Grundsätze, die sich durch den Code ziehen:

- **Geldbeträge sind ganzzahlige Cent**, Mengen Festkomma (`menge_x1000`).
  Fließkomma kommt in Beträgen nirgends vor.
- **Deutsche Bezeichner** für alles Fachliche — die Domäne ist deutsches
  Steuerrecht, eine Übersetzung würde die Begriffe nur verwischen.
- **Tests zuerst**, und zwar mit einem verifizierten Fehlschlag: Ein Test, der
  nie rot war, beweist nichts.

### Wo die Daten liegen

Die Datenbank liegt im Anwendungsdatenordner des Betriebssystems:

| System | Pfad |
|---|---|
| macOS | `~/Library/Application Support/de.chefsachen.app/daten.db` |
| Windows | `%APPDATA%\de.chefsachen.app\daten.db` |
| Linux | `~/.local/share/de.chefsachen.app/daten.db` |

Daneben liegt der Ordner `Sicherungen` mit den automatischen Kopien.

## Stand

Die Anwendung ist noch nicht fertig. Die offenen Punkte stehen priorisiert in
[docs/TODO.md](docs/TODO.md), die Begründungen dazu im
[MVP-Review](docs/2026-08-02-mvp-review.md).

## Lizenz

[MIT](LICENSE) — © 2026 Markus Müller
