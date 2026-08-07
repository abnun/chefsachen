# Umbenennung zu „Chefsachen" — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die App von „Kleinunternehmer-Verwaltung" in „Chefsachen"
umbenennen — sichtbarer Name, Tauri-`identifier`, npm-/Cargo-Paketname —
bei unverändertem GitHub-Repo-Namen und ohne automatische
Datenmigrationslogik.

**Architecture:** Reine Umbenennung ohne Verhaltensänderung. Vier
Teilbereiche, die sich unabhängig testen lassen: (1) Rust-Paket/-Bibliothek
und interne Zeichenketten, (2) Tauri-Konfiguration + npm-Paketname, (3)
E2E-Skripte, die den kompilierten Binärnamen referenzieren, (4) Dokumentation
und Release-Workflow.

**Tech Stack:** Tauri 2 (Rust + React/TypeScript), Cargo, npm, GitHub
Actions.

## Global Constraints

- Neuer Produktname: **„Chefsachen"** (überall, wo der Name als Eigenname im
  Fließtext/UI auftaucht).
- Neuer Tauri-`identifier`: **`de.chefsachen.app`** (ersetzt
  `de.kleinunternehmer.verwaltung` überall, inkl. Pfad-Beispielen in Docs).
- Neuer npm-/Cargo-Paketname: **`chefsachen`** (ersetzt
  `kleinunternehmer-verwaltung`).
- Neuer Cargo-Lib-Name: **`chefsachen_lib`** (ersetzt
  `kleinunternehmer_verwaltung_lib`).
- **GitHub-Repo-Name bleibt `abnun/kleinunternehmer-verwaltung`** — Remote-URL,
  Updater-Endpoint-URL und der lokale Projektordnername werden NICHT
  angefasst.
- **Keine automatische Datenmigration** für das App-Datenverzeichnis bauen —
  das ist eine bewusste Grenze, siehe Spec.
- Icons/Branding, Bundle-Signatur-Mechanik: unverändert.
- Kein Versions-Bump in dieser Plan-Umsetzung (der CHANGELOG-Eintrag verweist
  auf die nächste Version `0.10.3`; das tatsächliche Anheben von
  `package.json`/`tauri.conf.json`/`Cargo.toml` auf `0.10.3` geschieht wie
  bisher als separater `chore: Version 0.10.3`-Schritt beim eigentlichen
  Release, nicht Teil dieses Plans).

---

### Task 1: Rust-Paket und -Bibliothek umbenennen

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/src/protokoll.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/dokument/zugferd.rs`

**Interfaces:**
- Produces: Cargo-Paketname `chefsachen`, Lib-Crate-Name `chefsachen_lib`
  (verwendet vom Bin-Target in `main.rs` und von Task 3's E2E-Skripten, die
  den kompilierten Binärnamen `target/debug/chefsachen` referenzieren).

- [ ] **Schritt 1: `src-tauri/Cargo.toml` anpassen**

```toml
[package]
name = "chefsachen"
version = "0.10.2"
description = "Rechnungen, Angebote und E-Rechnungen für Kleinunternehmer nach § 19 UStG"
authors = ["Markus Müller <abnun@gmx.de>"]
license = "MIT"
readme = "../README.md"
publish = false
edition = "2021"

# See more keys and their definitions at https://doc.rust-lang.org/cargo/reference/manifest.html

[lib]
# The `_lib` suffix may seem redundant but it is necessary
# to make the lib name unique and wouldn't conflict with the bin name.
# This seems to be only an issue on Windows, see https://github.com/rust-lang/cargo/issues/8519
name = "chefsachen_lib"
crate-type = ["staticlib", "cdylib", "rlib"]
```

Nur `[package].name` (Zeile 2) und `[lib].name` (Zeile 17) ändern sich —
alle anderen Zeilen (Beschreibung, Autoren, Dependencies etc.) bleiben exakt
wie vorher.

- [ ] **Schritt 2: `src-tauri/src/main.rs` anpassen**

Vorher:
```rust
fn main() {
    kleinunternehmer_verwaltung_lib::run()
}
```

Nachher:
```rust
fn main() {
    chefsachen_lib::run()
}
```

- [ ] **Schritt 3: `src-tauri/src/protokoll.rs` anpassen — Konstante und Tests**

Die Konstante (Zeile 17):

Vorher:
```rust
pub const DATEINAME: &str = "kleinunternehmer-verwaltung";
```

Nachher:
```rust
pub const DATEINAME: &str = "chefsachen";
```

Die beiden Testassertions (im Test `eigene_meldungen_werden_aufgezeichnet`):

Vorher:
```rust
    #[test]
    fn eigene_meldungen_werden_aufgezeichnet() {
        assert!(soll_protokollieren("kleinunternehmer_verwaltung_lib", Level::Info));
        assert!(soll_protokollieren("kleinunternehmer_verwaltung_lib::protokoll", Level::Debug));
    }
```

Nachher:
```rust
    #[test]
    fn eigene_meldungen_werden_aufgezeichnet() {
        assert!(soll_protokollieren("chefsachen_lib", Level::Info));
        assert!(soll_protokollieren("chefsachen_lib::protokoll", Level::Debug));
    }
```

- [ ] **Schritt 4: `src-tauri/src/lib.rs` anpassen — Fehlerdialog-Titel**

Vorher:
```rust
        .title("Kleinunternehmer-Verwaltung kann nicht starten")
```

Nachher:
```rust
        .title("Chefsachen kann nicht starten")
```

- [ ] **Schritt 5: `src-tauri/src/dokument/zugferd.rs` anpassen — XMP-Creator**

Vorher:
```rust
    xmp.creator(["Kleinunternehmer-Verwaltung"]);
```

Nachher:
```rust
    xmp.creator(["Chefsachen"]);
```

- [ ] **Schritt 6: Bauen und Tests laufen lassen**

Run: `cd src-tauri && cargo build && cargo test`
Expected: Baut ohne Fehler (Binärname jetzt `target/debug/chefsachen`,
Lib-Name `chefsachen_lib`), alle bestehenden Tests grün — insbesondere
`protokoll::tests::eigene_meldungen_werden_aufgezeichnet` und
`protokoll::tests::abfragen_der_datenbankschicht_bleiben_draussen`.

- [ ] **Schritt 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/main.rs src-tauri/src/protokoll.rs src-tauri/src/lib.rs src-tauri/src/dokument/zugferd.rs
git commit -m "chore: Rust-Paket und -Bibliothek zu chefsachen umbenannt"
```

---

### Task 2: Tauri-Konfiguration und npm-Paketname

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: Nichts von Task 1 (unabhängige Datei-Gruppe, kann parallel zu
  Task 1 verstanden werden — Cargo-Name und Tauri-`productName` sind
  getrennte Konzepte in Tauri 2).
- Produces: Fenstertitel „Chefsachen", `identifier` `de.chefsachen.app`
  (Task 4's Doku-Beispiele für den Datenordner-Pfad verwenden diesen Wert).

- [ ] **Schritt 1: `src-tauri/tauri.conf.json` anpassen**

Vier Stellen ändern sich (Zeilennummern beziehen sich auf den Stand vor
dieser Änderung):

Zeile 3, vorher:
```json
  "productName": "Kleinunternehmer-Verwaltung",
```
nachher:
```json
  "productName": "Chefsachen",
```

Zeile 5, vorher:
```json
  "identifier": "de.kleinunternehmer.verwaltung",
```
nachher:
```json
  "identifier": "de.chefsachen.app",
```

Zeile 15 (im `windows`-Array, Feld `title`), vorher:
```json
        "title": "Kleinunternehmer-Verwaltung",
```
nachher:
```json
        "title": "Chefsachen",
```

Zeile 33 (`bundle.longDescription`), vorher:
```json
    "longDescription": "Kleinunternehmer-Verwaltung erstellt Rechnungen und Angebote mit allen Pflichtangaben nach § 14 UStG, gibt sie als PDF/A-3b sowie als XRechnung und ZUGFeRD aus und archiviert eingehende E-Rechnungen unveränderlich. Die Umsatzgrenzen der Kleinunternehmerregelung nach § 19 UStG werden laufend überwacht und ihre finanziellen Folgen erläutert. Alle Daten bleiben lokal auf dem eigenen Rechner.",
```
nachher:
```json
    "longDescription": "Chefsachen erstellt Rechnungen und Angebote mit allen Pflichtangaben nach § 14 UStG, gibt sie als PDF/A-3b sowie als XRechnung und ZUGFeRD aus und archiviert eingehende E-Rechnungen unveränderlich. Die Umsatzgrenzen der Kleinunternehmerregelung nach § 19 UStG werden laufend überwacht und ihre finanziellen Folgen erläutert. Alle Daten bleiben lokal auf dem eigenen Rechner.",
```

Die `plugins.updater.endpoints`-URL
(`https://github.com/abnun/kleinunternehmer-verwaltung/releases/latest/download/latest.json`)
bleibt **unverändert** — das Repo wird nicht umbenannt.

- [ ] **Schritt 2: `package.json` anpassen**

Vorher (Zeile 2):
```json
  "name": "kleinunternehmer-verwaltung",
```
Nachher:
```json
  "name": "chefsachen",
```

- [ ] **Schritt 3: Prüfen**

Run: `npx tsc --noEmit && npm run build`
Expected: Baut ohne Fehler (der npm-Paketname wird von Vite/TS nicht
inhaltlich ausgewertet, dies stellt nur sicher, dass die JSON-Dateien valide
bleiben).

Run: `cat src-tauri/tauri.conf.json | python3 -c "import json,sys; json.load(sys.stdin)"`
Expected: Kein Fehler (valides JSON).

- [ ] **Schritt 4: Commit**

```bash
git add src-tauri/tauri.conf.json package.json
git commit -m "chore: Tauri-Konfiguration und npm-Paketname zu Chefsachen umbenannt"
```

---

### Task 3: E2E-Skripte an neuen Binärnamen anpassen

**Files:**
- Modify: `e2e/lauf.sh`
- Modify: `e2e/wdio.conf.js`
- Modify: `e2e/package.json`

**Interfaces:**
- Consumes: Binärname `chefsachen` aus Task 1 (der von `cargo build`/`tauri
  build` erzeugte Dateiname unter `target/debug/` bzw. `target/release/`
  ändert sich mit dem in Task 1 geänderten Cargo-Paketnamen).

- [ ] **Schritt 1: `e2e/lauf.sh` anpassen**

Vorher (Zeile 47):
```bash
ZIEL="${CARGO_TARGET_DIR:-src-tauri/target}/debug/kleinunternehmer-verwaltung"
```
Nachher:
```bash
ZIEL="${CARGO_TARGET_DIR:-src-tauri/target}/debug/chefsachen"
```

Die Umgebungsvariable `KUV_BINARY` (Zeile 49) bleibt unverändert — sie ist
nur ein interner Variablenname, keine Referenz auf den Produktnamen, und
wird von `wdio.conf.js` als fester Name gelesen.

- [ ] **Schritt 2: `e2e/wdio.conf.js` anpassen**

Vorher (Zeile 15):
```javascript
const ANWENDUNG = process.env.KUV_BINARY ?? "../src-tauri/target/debug/kleinunternehmer-verwaltung";
```
Nachher:
```javascript
const ANWENDUNG = process.env.KUV_BINARY ?? "../src-tauri/target/debug/chefsachen";
```

- [ ] **Schritt 3: `e2e/package.json` anpassen**

Vorher (Zeile 2):
```json
  "name": "kleinunternehmer-verwaltung-e2e",
```
Nachher:
```json
  "name": "chefsachen-e2e",
```

- [ ] **Schritt 4: Grep-Verifikation**

Run: `grep -rn "kleinunternehmer" e2e/lauf.sh e2e/wdio.conf.js e2e/package.json`
Expected: Kein Treffer mehr außer ggf. in Kommentaren, die den alten Namen
nicht mehr erwähnen sollten — leere Ausgabe.

**Hinweis für den Implementierer:** Der eigentliche browsergetriebene
Durchstich (`./e2e/docker-lauf.sh`) läuft nur unter Linux mit Docker und
kann in dieser Aufgabe nicht lokal verifiziert werden, falls die
Entwicklungsumgebung macOS/Windows ist — das prüft der `e2e`-Job in
`.github/workflows/ci.yml` bei jedem Push automatisch. Diese Aufgabe gilt
als abgeschlossen, wenn die Grep-Verifikation sauber ist und (falls Docker
lokal verfügbar ist) `./e2e/docker-lauf.sh` durchläuft.

- [ ] **Schritt 5: Commit**

```bash
git add e2e/lauf.sh e2e/wdio.conf.js e2e/package.json
git commit -m "chore: E2E-Skripte auf neuen Binärnamen chefsachen umgestellt"
```

---

### Task 4: Dokumentation und Release-Workflow

**Files:**
- Modify: `README.md`
- Modify: `docs/installation-freunde.md`
- Modify: `.github/workflows/release.yml`
- Modify: `docs/CHANGELOG.md`

**Interfaces:**
- Consumes: `de.chefsachen.app` (Task 2) für die Datenordner-Pfad-Beispiele.

- [ ] **Schritt 1: `README.md` anpassen**

Überschrift (Zeile 1), vorher:
```markdown
# Kleinunternehmer-Verwaltung
```
nachher:
```markdown
# Chefsachen
```

Datenordner-Tabelle (Abschnitt „Wo die Daten liegen"), vorher:
```markdown
| System | Pfad |
|---|---|
| macOS | `~/Library/Application Support/de.kleinunternehmer.verwaltung/daten.db` |
| Windows | `%APPDATA%\de.kleinunternehmer.verwaltung\daten.db` |
| Linux | `~/.local/share/de.kleinunternehmer.verwaltung/daten.db` |
```
nachher:
```markdown
| System | Pfad |
|---|---|
| macOS | `~/Library/Application Support/de.chefsachen.app/daten.db` |
| Windows | `%APPDATA%\de.chefsachen.app\daten.db` |
| Linux | `~/.local/share/de.chefsachen.app/daten.db` |
```

- [ ] **Schritt 2: `docs/installation-freunde.md` anpassen**

Installer-Dateiname macOS, vorher:
```markdown
1. Lade die Datei `Kleinunternehmer-Verwaltung_x.y.z_universal.dmg` herunter und
```
nachher:
```markdown
1. Lade die Datei `Chefsachen_x.y.z_universal.dmg` herunter und
```

Installer-Dateiname Windows, vorher:
```markdown
1. Lade die Datei `Kleinunternehmer-Verwaltung_x.y.z_x64-setup.exe` (oder die
```
nachher:
```markdown
1. Lade die Datei `Chefsachen_x.y.z_x64-setup.exe` (oder die
```

Datenordner-Tabelle, vorher:
```markdown
| System | Ordner |
|---|---|
| macOS | `~/Library/Application Support/de.kleinunternehmer.verwaltung` |
| Windows | `%APPDATA%\de.kleinunternehmer.verwaltung` |
```
nachher:
```markdown
| System | Ordner |
|---|---|
| macOS | `~/Library/Application Support/de.chefsachen.app` |
| Windows | `%APPDATA%\de.chefsachen.app` |
```

- [ ] **Schritt 3: `.github/workflows/release.yml` anpassen**

Vorher (Zeile 115):
```yaml
          releaseName: "Kleinunternehmer-Verwaltung ${{ github.ref_name }}"
```
Nachher:
```yaml
          releaseName: "Chefsachen ${{ github.ref_name }}"
```

Der Kommentar-Block oben in der Datei (Zeile 22, Updater-URL) bleibt
**unverändert** — verweist auf das unveränderte Repo
`abnun/kleinunternehmer-verwaltung`.

- [ ] **Schritt 4: `docs/CHANGELOG.md` — neuen Abschnitt ergänzen**

Direkt nach der einleitenden Erklärung und vor `## 0.10.2` einfügen:

```markdown
## 0.10.3

**Neuer Name**
- Die App heißt jetzt **Chefsachen** statt „Kleinunternehmer-Verwaltung" —
  reine Umbenennung, an der Funktionsweise ändert sich nichts. Wer die App
  bereits installiert hat, findet nach dem Update ein neues
  Datenverzeichnis vor (macOS: `~/Library/Application Support/de.chefsachen.app`,
  Windows: `%APPDATA%\de.chefsachen.app`); der bisherige Datenordner unter
  `de.kleinunternehmer.verwaltung` bleibt unangetastet erhalten und lässt
  sich bei Bedarf von Hand in den neuen Ordner kopieren.
```

Dieser Abschnitt beschreibt bewusst die für Nutzer sichtbare Konsequenz des
identifier-Wechsels (siehe Spec, Abschnitt „Bewusst unverändert").

- [ ] **Schritt 5: Grep-Verifikation über das ganze Repo**

Run:
```bash
grep -rln "Kleinunternehmer-Verwaltung\|kleinunternehmer-verwaltung\|kleinunternehmer_verwaltung\|de\.kleinunternehmer\.verwaltung" \
  --include="*.rs" --include="*.toml" --include="*.json" --include="*.md" --include="*.yml" --include="*.sh" --include="*.js" . \
  | grep -v node_modules | grep -v target | grep -v Cargo.lock | grep -v package-lock.json \
  | grep -v docs/superpowers/specs | grep -v docs/superpowers/plans \
  | grep -v docs/2026-08-02-mvp-review.md
```
Expected: Leere Ausgabe — bis auf die bewusst ausgenommenen historischen
Dokumente (Spec/Plan-Dateien dieser Umbenennung selbst, der alte MVP-Review
als Zeitdokument) und `docs/TODO.md` Zeile mit dem Pfad zum
Signaturschlüssel `~/.tauri/kleinunternehmer-verwaltung.key` — dieser Pfad
verweist auf eine tatsächlich existierende, außerhalb des Repos liegende
Datei und wird **nicht** angepasst (siehe Spec-Abschnitt „Bewusst
unverändert" bzw. Global Constraints — die physische Schlüsseldatei wird von
dieser Umbenennung nicht berührt).

Falls die Ausgabe weitere, hier nicht aufgeführte Treffer zeigt: jeden
einzeln bewerten (echter Rest-Verweis auf den alten Namen vs. bewusst
ausgenommene Datei) und bei echten Treffern nachbessern.

- [ ] **Schritt 6: Commit**

```bash
git add README.md docs/installation-freunde.md .github/workflows/release.yml docs/CHANGELOG.md
git commit -m "docs: Umbenennung zu Chefsachen in Dokumentation und Release-Workflow"
```

---

## Verifikation (gesamt)

1. `cd src-tauri && cargo build && cargo test && cargo clippy --all-targets -- -D warnings`
2. `npx tsc --noEmit && npm run build && npm test -- --run`
3. Grep-Verifikation aus Task 4, Schritt 5 — leer bis auf die dokumentierten
   Ausnahmen.
4. Empfohlen, aber nicht Teil dieses Plans: Nutzer prüft nach `npm run tauri
   dev` selbst den neuen Fenstertitel „Chefsachen" visuell (in dieser
   Entwicklungsumgebung war das bereits einmal wegen eines gesperrten
   Bildschirms nicht automatisiert möglich).
5. `./e2e/docker-lauf.sh`, falls Docker lokal verfügbar ist — sonst prüft
   das der `e2e`-Job in `.github/workflows/ci.yml` beim Push.
6. CHANGELOG (bereits in Task 4 ergänzt), README (bereits in Task 4
   angepasst) — kein zusätzlicher Schritt nötig.

Kein Tag/Release ohne Rückfrage — der eigentliche Versions-Bump auf 0.10.3
und die Release-Veröffentlichung folgen erst auf expliziten Wunsch, wie bei
allen vorherigen Release-Zyklen dieser Session.
