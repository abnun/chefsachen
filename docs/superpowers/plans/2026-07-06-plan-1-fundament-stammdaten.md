# Plan 1: Fundament & Stammdaten — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lauffähige Tauri-2-App mit SQLite-Datenschicht, Seed-Daten und vollständiger Stammdatenverwaltung (Einheiten, Nummernkreise, Firma, Kunden mit Adressen/Ansprechpartnern, Artikel mit Kundenpreisen) inkl. Ersteinrichtungs-Assistent.

**Architecture:** Rust-Kern (`src-tauri/`) mit drei Modulen: `db` (Pool + Migrations), `domain` (Nummernkreise, Preisfindung), `commands` (typisierte Tauri-Commands je Entität). Frontend React + TypeScript + Vite, spricht ausschließlich über `invoke`-Wrapper in `src/api.ts`. Alle Entitäten: UUID-PK, `created_at`/`updated_at` (ISO-8601 UTC), Soft-Delete via `deleted_at`. Geldbeträge als i64-Cent, Mengen später als i64 (×1000).

**Tech Stack:** Tauri 2.x, Rust, sqlx 0.8 (SQLite, runtime-tokio), uuid, chrono, thiserror, serde; React 18, TypeScript, Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-06-kleinunternehmer-tool-design.md`

## Global Constraints

- Geldbeträge: durchgängig i64 in Cent, keine Fließkommazahlen
- Alle Entitäten: UUID (TEXT), `created_at`/`updated_at` (ISO-8601 UTC), Soft-Delete (`deleted_at`)
- Unique-Constraints schließen soft-gelöschte Zeilen ein (kein partieller Index auf `deleted_at IS NULL` für Nummern)
- UI-Sprache Deutsch; alle sichtbaren Strings über `src/i18n.ts`
- Datenbank liegt im OS-Anwendungsdatenverzeichnis (Tauri `app_data_dir()`), nie im Projekt-/Sync-Ordner
- Nummernvergabe atomar (Transaktion), Format-Template z. B. `KD-{lfd:4}`, `RE-{JJJJ}-{lfd:4}`
- Preisfindung: Kundenpreis (gültig zum Belegdatum) vor Standardpreis
- Fehler aus Commands als typisiertes `AppError`-JSON (`{ typ: "validation", feld, meldung }` | `{ typ: "technisch", meldung }`)
- TDD: jeder Task erst Test, dann Implementierung; Commit je Task

---

### Task 1: Projekt-Scaffold

**Files:**
- Create: gesamtes Tauri-Scaffold via Generator (`src-tauri/`, `src/`, `package.json`, `vite.config.ts`)
- Modify: `src-tauri/tauri.conf.json` (productName, identifier)
- Create: `.gitignore`

**Interfaces:**
- Produces: lauffähiges `npm run tauri dev` / `cargo test` Grundgerüst; App-Identifier `de.kleinunternehmer.verwaltung`

- [ ] **Step 1: Scaffold erzeugen**

```bash
cd "/Users/mark.mueller/Library/Mobile Documents/com~apple~CloudDocs/Projekte/kleinunternehmer-verwaltung"
npm create tauri-app@latest . -- --template react-ts --manager npm --yes
npm install
```

Falls der Generator ein leeres Verzeichnis verlangt: in Unterordner generieren und Inhalte (außer `.git`, `docs/`) ins Projektwurzelverzeichnis verschieben.

- [ ] **Step 2: Konfiguration anpassen**

In `src-tauri/tauri.conf.json`: `"productName": "Kleinunternehmer-Verwaltung"`, `"identifier": "de.kleinunternehmer.verwaltung"`.

- [ ] **Step 3: Build verifizieren**

Run: `cd src-tauri && cargo check` → Expected: kompiliert ohne Fehler.
Run: `npm run build` → Expected: Vite-Build erfolgreich.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: Tauri-2-Scaffold (React + TypeScript)"
```

---

### Task 2: Datenbank-Modul mit Migrations

**Files:**
- Create: `src-tauri/src/db.rs`
- Create: `src-tauri/src/error.rs`
- Create: `src-tauri/migrations/0001_stammdaten.sql`
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `db::init_db(path: &Path) -> Result<SqlitePool, sqlx::Error>`; `error::AppError` (enum `Validation { feld, meldung }`, `NichtGefunden`, `Technisch(String)`), `impl From<sqlx::Error>`, `impl serde::Serialize`; Tauri-State `SqlitePool`

- [ ] **Step 1: Dependencies ergänzen**

In `src-tauri/Cargo.toml` unter `[dependencies]`:

```toml
sqlx = { version = "0.8", features = ["runtime-tokio", "sqlite", "migrate", "chrono"] }
tokio = { version = "1", features = ["full"] }
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
thiserror = "2"
```

Unter `[dev-dependencies]`: `tempfile = "3"`.

- [ ] **Step 2: Failing Test schreiben** (in `src-tauri/src/db.rs` als `#[cfg(test)]`-Modul)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn init_db_legt_datei_an_und_migriert() {
        let dir = tempfile::tempdir().unwrap();
        let pool = init_db(&dir.path().join("test.db")).await.unwrap();
        let n: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM einheit")
            .fetch_one(&pool).await.unwrap();
        assert!(n.0 >= 5, "Seed-Einheiten fehlen");
    }
}
```

- [ ] **Step 3: Test läuft und schlägt fehl**

Run: `cd src-tauri && cargo test` → Expected: FAIL (Modul/Funktion existiert nicht).

- [ ] **Step 4: Migration schreiben** — `src-tauri/migrations/0001_stammdaten.sql`:

```sql
CREATE TABLE einheit (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, kuerzel TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE nummernkreis (
  id TEXT PRIMARY KEY, art TEXT NOT NULL UNIQUE, format TEXT NOT NULL,
  zaehler INTEGER NOT NULL DEFAULT 0, jahres_reset INTEGER NOT NULL DEFAULT 0,
  jahr INTEGER NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE firma (
  id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', strasse TEXT NOT NULL DEFAULT '',
  plz TEXT NOT NULL DEFAULT '', ort TEXT NOT NULL DEFAULT '', land TEXT NOT NULL DEFAULT 'DE',
  steuernummer TEXT NOT NULL DEFAULT '', ust_idnr TEXT NOT NULL DEFAULT '',
  iban TEXT NOT NULL DEFAULT '', bic TEXT NOT NULL DEFAULT '',
  logo BLOB, kleinunternehmer INTEGER NOT NULL DEFAULT 1,
  eingerichtet INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE kunde (
  id TEXT PRIMARY KEY, typ TEXT NOT NULL CHECK (typ IN ('firma','privat')),
  name TEXT NOT NULL, kundennummer TEXT NOT NULL UNIQUE,
  zahlungsziel_tage INTEGER NOT NULL DEFAULT 14, notizen TEXT NOT NULL DEFAULT '',
  ust_idnr TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
  leitweg_id TEXT NOT NULL DEFAULT '', kaeuferreferenz TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE adresse (
  id TEXT PRIMARY KEY, kunde_id TEXT NOT NULL REFERENCES kunde(id),
  typ TEXT NOT NULL CHECK (typ IN ('rechnung','lieferung')),
  strasse TEXT NOT NULL, plz TEXT NOT NULL, ort TEXT NOT NULL, land TEXT NOT NULL DEFAULT 'DE',
  ist_standard INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE ansprechpartner (
  id TEXT PRIMARY KEY, kunde_id TEXT NOT NULL REFERENCES kunde(id),
  name TEXT NOT NULL, rolle TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '', telefon TEXT NOT NULL DEFAULT '',
  ist_standard INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE artikel (
  id TEXT PRIMARY KEY, artikelnummer TEXT NOT NULL UNIQUE,
  bezeichnung TEXT NOT NULL, beschreibung TEXT NOT NULL DEFAULT '',
  einheit_id TEXT NOT NULL REFERENCES einheit(id),
  standardpreis_cent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE kundenpreis (
  id TEXT PRIMARY KEY,
  artikel_id TEXT NOT NULL REFERENCES artikel(id),
  kunde_id TEXT NOT NULL REFERENCES kunde(id),
  preis_cent INTEGER NOT NULL, gueltig_ab TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
-- Kein UNIQUE auf (artikel_id, kunde_id, gueltig_ab): SQLite behandelt NULLs als
-- verschieden, und Soft-Delete würde mit einem DB-Constraint kollidieren.
-- Eindeutigkeit wird stattdessen in kundenpreis_save geprüft (Task 6).
CREATE TABLE einstellung (
  key TEXT PRIMARY KEY, value TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

-- Seed: Einheiten
INSERT INTO einheit (id, name, kuerzel, created_at, updated_at) VALUES
 ('e0000000-0000-0000-0000-000000000001','Stunde','Std.',datetime('now'),datetime('now')),
 ('e0000000-0000-0000-0000-000000000002','Stück','Stk.',datetime('now'),datetime('now')),
 ('e0000000-0000-0000-0000-000000000003','Tag','Tag',datetime('now'),datetime('now')),
 ('e0000000-0000-0000-0000-000000000004','Pauschale','pausch.',datetime('now'),datetime('now')),
 ('e0000000-0000-0000-0000-000000000005','Kilometer','km',datetime('now'),datetime('now'));

-- Seed: Nummernkreise
INSERT INTO nummernkreis (id, art, format, zaehler, jahres_reset, jahr, created_at, updated_at) VALUES
 ('a0000000-0000-0000-0000-000000000001','kunde','KD-{lfd:4}',0,0,CAST(strftime('%Y','now') AS INTEGER),datetime('now'),datetime('now')),
 ('a0000000-0000-0000-0000-000000000002','artikel','ART-{lfd:4}',0,0,CAST(strftime('%Y','now') AS INTEGER),datetime('now'),datetime('now')),
 ('a0000000-0000-0000-0000-000000000003','angebot','AN-{JJJJ}-{lfd:4}',0,1,CAST(strftime('%Y','now') AS INTEGER),datetime('now'),datetime('now')),
 ('a0000000-0000-0000-0000-000000000004','rechnung','RE-{JJJJ}-{lfd:4}',0,1,CAST(strftime('%Y','now') AS INTEGER),datetime('now'),datetime('now'));

-- Seed: Firma (leerer Einzeldatensatz, wird im Assistenten befüllt)
INSERT INTO firma (id, created_at, updated_at) VALUES
 ('f0000000-0000-0000-0000-000000000001',datetime('now'),datetime('now'));

-- Seed: Textbausteine & Defaults
INSERT INTO einstellung (key, value, created_at, updated_at) VALUES
 ('text.kleinunternehmer','Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',datetime('now'),datetime('now')),
 ('text.rechnung.fuss','Vielen Dank für Ihren Auftrag. Bitte überweisen Sie den Betrag innerhalb der Zahlungsfrist auf das unten genannte Konto.',datetime('now'),datetime('now')),
 ('text.angebot.fuss','Wir freuen uns auf Ihre Rückmeldung. Dieses Angebot ist 30 Tage gültig.',datetime('now'),datetime('now')),
 ('default.zahlungsziel_tage','14',datetime('now'),datetime('now'));
```

- [ ] **Step 5: `error.rs` und `db.rs` implementieren**

`src-tauri/src/error.rs`:

```rust
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{meldung}")]
    Validation { feld: String, meldung: String },
    #[error("Datensatz nicht gefunden")]
    NichtGefunden,
    #[error("{0}")]
    Technisch(String),
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        match e {
            sqlx::Error::RowNotFound => AppError::NichtGefunden,
            other => AppError::Technisch(other.to_string()),
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        let mut m = s.serialize_map(None)?;
        match self {
            AppError::Validation { feld, meldung } => {
                m.serialize_entry("typ", "validation")?;
                m.serialize_entry("feld", feld)?;
                m.serialize_entry("meldung", meldung)?;
            }
            AppError::NichtGefunden => {
                m.serialize_entry("typ", "nicht_gefunden")?;
                m.serialize_entry("meldung", "Datensatz nicht gefunden")?;
            }
            AppError::Technisch(msg) => {
                m.serialize_entry("typ", "technisch")?;
                m.serialize_entry("meldung", msg)?;
            }
        }
        m.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;
```

`src-tauri/src/db.rs`:

```rust
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use std::path::Path;

pub async fn init_db(path: &Path) -> Result<SqlitePool, sqlx::Error> {
    let opts = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .foreign_keys(true);
    // WICHTIG: max_connections(1) ist tragend! Die Nummernkreis-Vergabe (Task 3)
    // macht Read-then-Update in einer Transaktion; die Einzelverbindung
    // serialisiert alle Schreibzugriffe. Nicht erhöhen ohne die Vergabe auf
    // "UPDATE ... RETURNING" umzustellen.
    let pool = SqlitePoolOptions::new().max_connections(1).connect_with(opts).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
}

/// ISO-8601-UTC-Zeitstempel für created_at/updated_at.
pub fn jetzt() -> String {
    chrono::Utc::now().to_rfc3339()
}
```

In `src-tauri/src/lib.rs`: Module registrieren (`mod db; mod error;`) und im `run()`-Setup den Pool erzeugen und als State verwalten:

```rust
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir().expect("app_data_dir");
            std::fs::create_dir_all(&dir)?;
            let pool = tauri::async_runtime::block_on(db::init_db(&dir.join("daten.db")))?;
            app.manage(pool);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Fehler beim Start");
}
```

- [ ] **Step 6: Test läuft durch**

Run: `cd src-tauri && cargo test` → Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: SQLite-Datenschicht mit Migrations, Seed-Daten und AppError"
```

---

### Task 3: Nummernkreis-Logik

**Files:**
- Create: `src-tauri/src/domain/mod.rs`, `src-tauri/src/domain/nummernkreis.rs`
- Modify: `src-tauri/src/lib.rs` (`mod domain;`)

**Interfaces:**
- Consumes: `SqlitePool`, `AppError`
- Produces: `domain::nummernkreis::naechste_nummer(pool: &SqlitePool, art: &str) -> AppResult<String>`; `format_nummer(template: &str, jahr: i32, lfd: i64) -> String`

- [ ] **Step 1: Failing Tests**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_ersetzt_jahr_und_laufende_nummer() {
        assert_eq!(format_nummer("RE-{JJJJ}-{lfd:4}", 2026, 7), "RE-2026-0007");
        assert_eq!(format_nummer("KD-{lfd:4}", 2026, 12), "KD-0012");
    }

    #[tokio::test]
    async fn naechste_nummer_zaehlt_hoch_und_ist_eindeutig() {
        let dir = tempfile::tempdir().unwrap();
        let pool = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        let a = naechste_nummer(&pool, "kunde").await.unwrap();
        let b = naechste_nummer(&pool, "kunde").await.unwrap();
        assert_eq!(a, "KD-0001");
        assert_eq!(b, "KD-0002");
    }

    #[tokio::test]
    async fn jahres_reset_setzt_zaehler_zurueck() {
        let dir = tempfile::tempdir().unwrap();
        let pool = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        sqlx::query("UPDATE nummernkreis SET jahr = jahr - 1, zaehler = 99 WHERE art = 'rechnung'")
            .execute(&pool).await.unwrap();
        let n = naechste_nummer(&pool, "rechnung").await.unwrap();
        let jahr = chrono::Utc::now().format("%Y").to_string();
        assert_eq!(n, format!("RE-{jahr}-0001"));
    }
}
```

- [ ] **Step 2: Tests schlagen fehl** — Run: `cargo test nummernkreis` → FAIL.

- [ ] **Step 3: Implementierung**

```rust
use crate::db::jetzt;
use crate::error::{AppError, AppResult};
use sqlx::SqlitePool;

pub fn format_nummer(template: &str, jahr: i32, lfd: i64) -> String {
    let mut s = template.replace("{JJJJ}", &jahr.to_string());
    while let Some(start) = s.find("{lfd") {
        let end = s[start..].find('}').map(|e| start + e).unwrap_or(s.len() - 1);
        let breite: usize = s[start + 4..end].trim_start_matches(':').parse().unwrap_or(1);
        s.replace_range(start..=end, &format!("{lfd:0breite$}"));
    }
    s
}

pub async fn naechste_nummer(pool: &SqlitePool, art: &str) -> AppResult<String> {
    let mut tx = pool.begin().await?;
    let row: (String, i64, i64, i64) = sqlx::query_as(
        "SELECT format, zaehler, jahres_reset, jahr FROM nummernkreis WHERE art = ? AND deleted_at IS NULL",
    )
    .bind(art)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::Technisch(format!("Nummernkreis '{art}' fehlt")))?;

    let aktuelles_jahr: i32 = chrono::Utc::now().format("%Y").to_string().parse().unwrap();
    let (format, mut zaehler, jahres_reset, jahr) = row;
    if jahres_reset != 0 && (jahr as i32) != aktuelles_jahr {
        zaehler = 0;
    }
    zaehler += 1;
    sqlx::query("UPDATE nummernkreis SET zaehler = ?, jahr = ?, updated_at = ? WHERE art = ?")
        .bind(zaehler).bind(aktuelles_jahr).bind(jetzt()).bind(art)
        .execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(format_nummer(&format, aktuelles_jahr, zaehler))
}
```

- [ ] **Step 4: Tests grün** — Run: `cargo test nummernkreis` → PASS (3 Tests).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: Nummernkreis-Logik mit Jahresreset"`

---

### Task 4: Einheiten-Commands (CRUD-Muster)

Dieser Task etabliert das CRUD-Muster, das Task 5–7 wiederverwenden.

**Files:**
- Create: `src-tauri/src/commands/mod.rs`, `src-tauri/src/commands/einheiten.rs`
- Modify: `src-tauri/src/lib.rs` (Module + `invoke_handler`)

**Interfaces:**
- Consumes: `SqlitePool` (Tauri-State), `AppError`, `db::jetzt()`
- Produces: Tauri-Commands `einheit_list() -> Vec<Einheit>`, `einheit_create(name: String, kuerzel: String) -> Einheit`, `einheit_update(id: String, name: String, kuerzel: String) -> Einheit`, `einheit_delete(id: String)`. Struct `Einheit { id, name, kuerzel: String }` (serde camelCase nicht nötig — Felder sind schon lowercase)

- [ ] **Step 1: Failing Tests** (Kernlogik als freie Funktionen testen, Commands sind dünne Wrapper)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    /// Gibt (Guard, Pool) zurück — der Guard hält das Temp-Verzeichnis am Leben
    /// und räumt es am Testende auf. Dieses Muster in allen Command-Tests verwenden.
    async fn test_pool() -> (tempfile::TempDir, sqlx::SqlitePool) {
        let dir = tempfile::tempdir().unwrap();
        let p = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        (dir, p)
    }

    #[tokio::test]
    async fn create_list_update_delete() {
        let (_dir, pool) = test_pool().await;
        let e = create(&pool, "Minute".into(), "Min.".into()).await.unwrap();
        assert!(list(&pool).await.unwrap().iter().any(|x| x.id == e.id));
        let e2 = update(&pool, e.id.clone(), "Minuten".into(), "Min.".into()).await.unwrap();
        assert_eq!(e2.name, "Minuten");
        delete(&pool, e.id.clone()).await.unwrap();
        assert!(!list(&pool).await.unwrap().iter().any(|x| x.id == e.id));
    }

    #[tokio::test]
    async fn leerer_name_gibt_validierungsfehler() {
        let (_dir, pool) = test_pool().await;
        let err = create(&pool, "  ".into(), "x".into()).await.unwrap_err();
        matches!(err, crate::error::AppError::Validation { .. })
            .then_some(()).expect("Validation erwartet");
    }
}
```

- [ ] **Step 2: Tests schlagen fehl** — Run: `cargo test einheiten` → FAIL.

- [ ] **Step 3: Implementierung** — `src-tauri/src/commands/einheiten.rs`:

```rust
use crate::db::jetzt;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Einheit {
    pub id: String,
    pub name: String,
    pub kuerzel: String,
}

fn pruefe_name(name: &str) -> AppResult<()> {
    if name.trim().is_empty() {
        return Err(AppError::Validation {
            feld: "name".into(),
            meldung: "Name darf nicht leer sein".into(),
        });
    }
    Ok(())
}

pub async fn list(pool: &SqlitePool) -> AppResult<Vec<Einheit>> {
    Ok(sqlx::query_as("SELECT id, name, kuerzel FROM einheit WHERE deleted_at IS NULL ORDER BY name")
        .fetch_all(pool).await?)
}

pub async fn create(pool: &SqlitePool, name: String, kuerzel: String) -> AppResult<Einheit> {
    pruefe_name(&name)?;
    let e = Einheit { id: Uuid::new_v4().to_string(), name: name.trim().into(), kuerzel };
    sqlx::query("INSERT INTO einheit (id, name, kuerzel, created_at, updated_at) VALUES (?,?,?,?,?)")
        .bind(&e.id).bind(&e.name).bind(&e.kuerzel).bind(jetzt()).bind(jetzt())
        .execute(pool).await?;
    Ok(e)
}

pub async fn update(pool: &SqlitePool, id: String, name: String, kuerzel: String) -> AppResult<Einheit> {
    pruefe_name(&name)?;
    let r = sqlx::query("UPDATE einheit SET name = ?, kuerzel = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(name.trim()).bind(&kuerzel).bind(jetzt()).bind(&id)
        .execute(pool).await?;
    if r.rows_affected() == 0 { return Err(AppError::NichtGefunden); }
    Ok(Einheit { id, name: name.trim().into(), kuerzel })
}

pub async fn delete(pool: &SqlitePool, id: String) -> AppResult<()> {
    let r = sqlx::query("UPDATE einheit SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(jetzt()).bind(&id).execute(pool).await?;
    if r.rows_affected() == 0 { return Err(AppError::NichtGefunden); }
    Ok(())
}

// Dünne Tauri-Wrapper
#[tauri::command]
pub async fn einheit_list(pool: tauri::State<'_, SqlitePool>) -> AppResult<Vec<Einheit>> {
    list(&pool).await
}
#[tauri::command]
pub async fn einheit_create(pool: tauri::State<'_, SqlitePool>, name: String, kuerzel: String) -> AppResult<Einheit> {
    create(&pool, name, kuerzel).await
}
#[tauri::command]
pub async fn einheit_update(pool: tauri::State<'_, SqlitePool>, id: String, name: String, kuerzel: String) -> AppResult<Einheit> {
    update(&pool, id, name, kuerzel).await
}
#[tauri::command]
pub async fn einheit_delete(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<()> {
    delete(&pool, id).await
}
```

In `lib.rs` beim Builder: `.invoke_handler(tauri::generate_handler![commands::einheiten::einheit_list, commands::einheiten::einheit_create, commands::einheiten::einheit_update, commands::einheiten::einheit_delete])`.

- [ ] **Step 4: Tests grün** — Run: `cargo test einheiten` → PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: Einheiten-CRUD als Command-Muster"`

---

### Task 5: Kunden-Commands (mit Adressen & Ansprechpartnern)

**Files:**
- Create: `src-tauri/src/commands/kunden.rs`
- Modify: `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs` (invoke_handler erweitern)

**Interfaces:**
- Consumes: `naechste_nummer(pool, "kunde")`, CRUD-Muster aus Task 4
- Produces: Structs `Kunde { id, typ, name, kundennummer, zahlungsziel_tage: i64, notizen, ust_idnr, email, leitweg_id, kaeuferreferenz }`, `Adresse { id, kunde_id, typ, strasse, plz, ort, land, ist_standard: bool }`, `Ansprechpartner { id, kunde_id, name, rolle, email, telefon, ist_standard: bool }`, `KundeDetail { kunde: Kunde, adressen: Vec<Adresse>, ansprechpartner: Vec<Ansprechpartner> }`.
  Commands: `kunde_list(suche: Option<String>) -> Vec<Kunde>`, `kunde_get(id) -> KundeDetail`, `kunde_create(daten: KundeNeu) -> Kunde` (`KundeNeu` = Kunde ohne id/kundennummer; Nummer wird vergeben), `kunde_update(kunde: Kunde) -> Kunde`, `kunde_delete(id)`, `adresse_save(adresse: Adresse) -> Adresse` (leere id ⇒ Insert; `ist_standard=true` setzt Standard-Flag der anderen Adressen gleichen Typs zurück), `adresse_delete(id)`, `ansprechpartner_save(ap: Ansprechpartner) -> Ansprechpartner` (gleiches Muster), `ansprechpartner_delete(id)`

- [ ] **Step 1: Failing Tests**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    async fn test_pool() -> (tempfile::TempDir, sqlx::SqlitePool) {
        let dir = tempfile::tempdir().unwrap();
        let p = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        (dir, p)
    }

    fn neu(name: &str) -> KundeNeu {
        KundeNeu { typ: "firma".into(), name: name.into(), zahlungsziel_tage: 14,
            notizen: "".into(), ust_idnr: "".into(), email: "".into(),
            leitweg_id: "".into(), kaeuferreferenz: "".into() }
    }

    #[tokio::test]
    async fn create_vergibt_kundennummer() {
        let (_dir, pool) = test_pool().await;
        let k1 = create(&pool, neu("ACME GmbH")).await.unwrap();
        let k2 = create(&pool, neu("Beta AG")).await.unwrap();
        assert_eq!(k1.kundennummer, "KD-0001");
        assert_eq!(k2.kundennummer, "KD-0002");
    }

    #[tokio::test]
    async fn suche_filtert_nach_name() {
        let (_dir, pool) = test_pool().await;
        create(&pool, neu("ACME GmbH")).await.unwrap();
        create(&pool, neu("Beta AG")).await.unwrap();
        let treffer = list(&pool, Some("acme".into())).await.unwrap();
        assert_eq!(treffer.len(), 1);
        assert_eq!(treffer[0].name, "ACME GmbH");
    }

    #[tokio::test]
    async fn standard_adresse_ist_exklusiv_je_typ() {
        let (_dir, pool) = test_pool().await;
        let k = create(&pool, neu("ACME GmbH")).await.unwrap();
        let a1 = adresse_speichern(&pool, Adresse { id: "".into(), kunde_id: k.id.clone(),
            typ: "rechnung".into(), strasse: "Weg 1".into(), plz: "10115".into(),
            ort: "Berlin".into(), land: "DE".into(), ist_standard: true }).await.unwrap();
        let _a2 = adresse_speichern(&pool, Adresse { id: "".into(), kunde_id: k.id.clone(),
            typ: "rechnung".into(), strasse: "Weg 2".into(), plz: "10115".into(),
            ort: "Berlin".into(), land: "DE".into(), ist_standard: true }).await.unwrap();
        let detail = get(&pool, k.id.clone()).await.unwrap();
        let standards: Vec<_> = detail.adressen.iter()
            .filter(|a| a.typ == "rechnung" && a.ist_standard).collect();
        assert_eq!(standards.len(), 1);
        assert_ne!(standards[0].id, a1.id);
    }
}
```

- [ ] **Step 2: Tests schlagen fehl** — Run: `cargo test kunden` → FAIL.

- [ ] **Step 3: Implementierung** (Auszug der Kernfunktionen; CRUD-Boilerplate wie Task 4):

```rust
use crate::db::jetzt;
use crate::domain::nummernkreis::naechste_nummer;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Kunde {
    pub id: String, pub typ: String, pub name: String, pub kundennummer: String,
    pub zahlungsziel_tage: i64, pub notizen: String, pub ust_idnr: String,
    pub email: String, pub leitweg_id: String, pub kaeuferreferenz: String,
}

#[derive(Debug, Deserialize)]
pub struct KundeNeu {
    pub typ: String, pub name: String, pub zahlungsziel_tage: i64, pub notizen: String,
    pub ust_idnr: String, pub email: String, pub leitweg_id: String, pub kaeuferreferenz: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Adresse {
    pub id: String, pub kunde_id: String, pub typ: String, pub strasse: String,
    pub plz: String, pub ort: String, pub land: String, pub ist_standard: bool,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Ansprechpartner {
    pub id: String, pub kunde_id: String, pub name: String, pub rolle: String,
    pub email: String, pub telefon: String, pub ist_standard: bool,
}

#[derive(Debug, Serialize)]
pub struct KundeDetail {
    pub kunde: Kunde,
    pub adressen: Vec<Adresse>,
    pub ansprechpartner: Vec<Ansprechpartner>,
}

pub async fn create(pool: &SqlitePool, d: KundeNeu) -> AppResult<Kunde> {
    if d.name.trim().is_empty() {
        return Err(AppError::Validation { feld: "name".into(), meldung: "Name darf nicht leer sein".into() });
    }
    if !["firma", "privat"].contains(&d.typ.as_str()) {
        return Err(AppError::Validation { feld: "typ".into(), meldung: "Ungültiger Kundentyp".into() });
    }
    let kundennummer = naechste_nummer(pool, "kunde").await?;
    let k = Kunde { id: Uuid::new_v4().to_string(), typ: d.typ, name: d.name.trim().into(),
        kundennummer, zahlungsziel_tage: d.zahlungsziel_tage, notizen: d.notizen,
        ust_idnr: d.ust_idnr, email: d.email, leitweg_id: d.leitweg_id,
        kaeuferreferenz: d.kaeuferreferenz };
    sqlx::query("INSERT INTO kunde (id, typ, name, kundennummer, zahlungsziel_tage, notizen, ust_idnr, email, leitweg_id, kaeuferreferenz, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(&k.id).bind(&k.typ).bind(&k.name).bind(&k.kundennummer)
        .bind(k.zahlungsziel_tage).bind(&k.notizen).bind(&k.ust_idnr).bind(&k.email)
        .bind(&k.leitweg_id).bind(&k.kaeuferreferenz).bind(jetzt()).bind(jetzt())
        .execute(pool).await?;
    Ok(k)
}

pub async fn list(pool: &SqlitePool, suche: Option<String>) -> AppResult<Vec<Kunde>> {
    let muster = format!("%{}%", suche.unwrap_or_default().to_lowercase());
    Ok(sqlx::query_as(
        "SELECT id, typ, name, kundennummer, zahlungsziel_tage, notizen, ust_idnr, email, leitweg_id, kaeuferreferenz \
         FROM kunde WHERE deleted_at IS NULL AND (lower(name) LIKE ? OR lower(kundennummer) LIKE ?) ORDER BY name")
        .bind(&muster).bind(&muster).fetch_all(pool).await?)
}

pub async fn get(pool: &SqlitePool, id: String) -> AppResult<KundeDetail> {
    let kunde: Kunde = sqlx::query_as(
        "SELECT id, typ, name, kundennummer, zahlungsziel_tage, notizen, ust_idnr, email, leitweg_id, kaeuferreferenz \
         FROM kunde WHERE id = ? AND deleted_at IS NULL")
        .bind(&id).fetch_optional(pool).await?.ok_or(AppError::NichtGefunden)?;
    let adressen = sqlx::query_as(
        "SELECT id, kunde_id, typ, strasse, plz, ort, land, ist_standard FROM adresse WHERE kunde_id = ? AND deleted_at IS NULL")
        .bind(&id).fetch_all(pool).await?;
    let ansprechpartner = sqlx::query_as(
        "SELECT id, kunde_id, name, rolle, email, telefon, ist_standard FROM ansprechpartner WHERE kunde_id = ? AND deleted_at IS NULL")
        .bind(&id).fetch_all(pool).await?;
    Ok(KundeDetail { kunde, adressen, ansprechpartner })
}

pub async fn adresse_speichern(pool: &SqlitePool, mut a: Adresse) -> AppResult<Adresse> {
    let mut tx = pool.begin().await?;
    if a.ist_standard {
        sqlx::query("UPDATE adresse SET ist_standard = 0, updated_at = ? WHERE kunde_id = ? AND typ = ? AND deleted_at IS NULL")
            .bind(jetzt()).bind(&a.kunde_id).bind(&a.typ).execute(&mut *tx).await?;
    }
    if a.id.is_empty() {
        a.id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO adresse (id, kunde_id, typ, strasse, plz, ort, land, ist_standard, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
            .bind(&a.id).bind(&a.kunde_id).bind(&a.typ).bind(&a.strasse).bind(&a.plz)
            .bind(&a.ort).bind(&a.land).bind(a.ist_standard).bind(jetzt()).bind(jetzt())
            .execute(&mut *tx).await?;
    } else {
        sqlx::query("UPDATE adresse SET typ=?, strasse=?, plz=?, ort=?, land=?, ist_standard=?, updated_at=? WHERE id=? AND deleted_at IS NULL")
            .bind(&a.typ).bind(&a.strasse).bind(&a.plz).bind(&a.ort).bind(&a.land)
            .bind(a.ist_standard).bind(jetzt()).bind(&a.id).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(a)
}
```

`update`/`delete` für Kunde sowie `ansprechpartner_speichern`/`_delete` folgen exakt dem Muster von `adresse_speichern` bzw. Task 4 (`delete` = Soft-Delete). Tauri-Wrapper (`#[tauri::command]`) für alle Funktionen wie in Task 4, Namen: `kunde_list`, `kunde_get`, `kunde_create`, `kunde_update`, `kunde_delete`, `adresse_save`, `adresse_delete`, `ansprechpartner_save`, `ansprechpartner_delete`; alle im `invoke_handler` registrieren.

- [ ] **Step 4: Tests grün** — Run: `cargo test kunden` → PASS (3 Tests).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: Kunden mit Adressen und Ansprechpartnern"`

---

### Task 6: Artikel-Commands mit Kundenpreisen & Preisfindung

**Files:**
- Create: `src-tauri/src/commands/artikel.rs`, `src-tauri/src/domain/preisfindung.rs`
- Modify: `src-tauri/src/domain/mod.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `naechste_nummer(pool, "artikel")`, CRUD-Muster
- Produces: `Artikel { id, artikelnummer, bezeichnung, beschreibung, einheit_id, standardpreis_cent: i64 }`, `ArtikelNeu` (= Artikel ohne id/artikelnummer), `Kundenpreis { id, artikel_id, kunde_id, preis_cent: i64, gueltig_ab: Option<String> }`.
  Commands: `artikel_list(suche) -> Vec<Artikel>`, `artikel_create/update/delete`, `kundenpreis_list(artikel_id) -> Vec<Kundenpreis>`, `kundenpreis_save(kp) -> Kundenpreis`, `kundenpreis_delete(id)`.
  Domain: `preisfindung::effektiver_preis(pool, artikel_id: &str, kunde_id: &str, belegdatum: &str) -> AppResult<i64>` (Belegdatum `YYYY-MM-DD`)

- [ ] **Step 1: Failing Tests** (Fokus Preisfindung)

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::artikel::{create as artikel_create, kundenpreis_speichern, ArtikelNeu, Kundenpreis};
    use crate::commands::kunden::{create as kunde_create, KundeNeu};

    async fn test_pool() -> (tempfile::TempDir, sqlx::SqlitePool) {
        let dir = tempfile::tempdir().unwrap();
        let p = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        (dir, p)
    }

    /// Legt Kunde + Artikel (Standardpreis 9500 Cent, Einheit "Stunde" aus Seed) an.
    async fn setup(pool: &sqlx::SqlitePool) -> (String, String) {
        let kunde = kunde_create(pool, KundeNeu {
            typ: "firma".into(), name: "ACME GmbH".into(), zahlungsziel_tage: 14,
            notizen: "".into(), ust_idnr: "".into(), email: "".into(),
            leitweg_id: "".into(), kaeuferreferenz: "".into(),
        }).await.unwrap();
        let artikel = artikel_create(pool, ArtikelNeu {
            bezeichnung: "Beratung".into(), beschreibung: "".into(),
            einheit_id: "e0000000-0000-0000-0000-000000000001".into(),
            standardpreis_cent: 9500,
        }).await.unwrap();
        (artikel.id, kunde.id)
    }

    async fn preis_anlegen(pool: &sqlx::SqlitePool, artikel_id: &str, kunde_id: &str, cent: i64, ab: Option<&str>) {
        kundenpreis_speichern(pool, Kundenpreis {
            id: "".into(), artikel_id: artikel_id.into(), kunde_id: kunde_id.into(),
            preis_cent: cent, gueltig_ab: ab.map(String::from),
        }).await.unwrap();
    }

    #[tokio::test]
    async fn ohne_kundenpreis_gilt_standardpreis() {
        let (_dir, pool) = test_pool().await;
        let (artikel_id, kunde_id) = setup(&pool).await;
        assert_eq!(effektiver_preis(&pool, &artikel_id, &kunde_id, "2026-07-06").await.unwrap(), 9500);
    }

    #[tokio::test]
    async fn kundenpreis_ohne_datum_gilt_immer() {
        let (_dir, pool) = test_pool().await;
        let (artikel_id, kunde_id) = setup(&pool).await;
        preis_anlegen(&pool, &artikel_id, &kunde_id, 8000, None).await;
        assert_eq!(effektiver_preis(&pool, &artikel_id, &kunde_id, "2026-07-06").await.unwrap(), 8000);
    }

    #[tokio::test]
    async fn gueltig_ab_wird_am_belegdatum_gemessen() {
        let (_dir, pool) = test_pool().await;
        let (artikel_id, kunde_id) = setup(&pool).await;
        preis_anlegen(&pool, &artikel_id, &kunde_id, 8000, Some("2026-01-01")).await;
        preis_anlegen(&pool, &artikel_id, &kunde_id, 7000, Some("2026-08-01")).await;
        assert_eq!(effektiver_preis(&pool, &artikel_id, &kunde_id, "2026-07-06").await.unwrap(), 8000);
        assert_eq!(effektiver_preis(&pool, &artikel_id, &kunde_id, "2026-09-01").await.unwrap(), 7000);
    }

    #[tokio::test]
    async fn doppelter_kundenpreis_gleiches_gueltig_ab_wird_abgelehnt() {
        let (_dir, pool) = test_pool().await;
        let (artikel_id, kunde_id) = setup(&pool).await;
        preis_anlegen(&pool, &artikel_id, &kunde_id, 8000, None).await;
        let err = kundenpreis_speichern(&pool, Kundenpreis {
            id: "".into(), artikel_id: artikel_id.clone(), kunde_id: kunde_id.clone(),
            preis_cent: 7500, gueltig_ab: None,
        }).await.unwrap_err();
        assert!(matches!(err, crate::error::AppError::Validation { .. }));
    }
}
```

`ArtikelNeu` = `Artikel` ohne `id`/`artikelnummer` (analog `KundeNeu`). `kundenpreis_speichern` prüft vor dem Insert per `SELECT COUNT(*)`, ob für (`artikel_id`, `kunde_id`, `gueltig_ab`) bereits ein nicht gelöschter Eintrag existiert (NULL-Vergleich mit `IS`), und gibt dann `AppError::Validation { feld: "gueltig_ab", … }` zurück — die DB hat bewusst keinen Unique-Constraint (siehe Migration, Task 2).

- [ ] **Step 2: Tests schlagen fehl** — Run: `cargo test preisfindung` → FAIL.

- [ ] **Step 3: Implementierung** — `domain/preisfindung.rs`:

```rust
use crate::error::AppResult;
use sqlx::SqlitePool;

pub async fn effektiver_preis(pool: &SqlitePool, artikel_id: &str, kunde_id: &str, belegdatum: &str) -> AppResult<i64> {
    let kp: Option<(i64,)> = sqlx::query_as(
        "SELECT preis_cent FROM kundenpreis \
         WHERE artikel_id = ? AND kunde_id = ? AND deleted_at IS NULL \
           AND (gueltig_ab IS NULL OR gueltig_ab <= ?) \
         ORDER BY gueltig_ab IS NULL, gueltig_ab DESC LIMIT 1")
        .bind(artikel_id).bind(kunde_id).bind(belegdatum)
        .fetch_optional(pool).await?;
    if let Some((preis,)) = kp { return Ok(preis); }
    let std: (i64,) = sqlx::query_as("SELECT standardpreis_cent FROM artikel WHERE id = ?")
        .bind(artikel_id).fetch_one(pool).await?;
    Ok(std.0)
}
```

`commands/artikel.rs`: CRUD exakt nach dem Muster aus Task 4/5 (Artikelnummer via `naechste_nummer(pool, "artikel")`, Validierung: Bezeichnung nicht leer, `standardpreis_cent >= 0`, `einheit_id` muss existieren). `kundenpreis_save` nach dem Insert-or-Update-Muster von `adresse_speichern`. Zusätzlicher Command `preis_ermitteln(artikel_id, kunde_id, belegdatum) -> i64` als Wrapper um `effektiver_preis` (wird im Beleg-Editor in Plan 2 gebraucht und ist hier schon testbar).

- [ ] **Step 4: Tests grün** — Run: `cargo test artikel && cargo test preisfindung` → PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: Artikel, Kundenpreise und Preisfindung"`

---

### Task 7: Firma- & Einstellungs-Commands

**Files:**
- Create: `src-tauri/src/commands/firma.rs`, `src-tauri/src/commands/einstellungen.rs`
- Modify: `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `Firma { id, name, strasse, plz, ort, land, steuernummer, ust_idnr, iban, bic, kleinunternehmer: bool, eingerichtet: bool }` (Logo separat: `firma_logo_set(bytes: Vec<u8>)`, `firma_logo_get() -> Option<Vec<u8>>`).
  Commands: `firma_get() -> Firma`, `firma_save(firma: Firma) -> Firma` (setzt `eingerichtet = true`, Validierung: `name` nicht leer; `steuernummer` ODER `ust_idnr` muss gefüllt sein — § 14 UStG), `einstellung_get(key: String) -> Option<String>`, `einstellung_set(key: String, value: String)`, `einstellung_list() -> Vec<(String, String)>`, `nummernkreis_list() -> Vec<Nummernkreis>` mit `Nummernkreis { art: String, format: String, zaehler: i64, jahres_reset: bool }`, `nummernkreis_update(art: String, format: String, jahres_reset: bool)` (Zähler ist nicht editierbar)

- [ ] **Step 1: Failing Tests**

```rust
#[tokio::test]
async fn firma_save_erfordert_steuernummer_oder_ustid() {
    let (_dir, pool) = test_pool().await; // Helfer wie in Task 4
    let mut f = get(&pool).await.unwrap();
    f.name = "Test GmbH".into();
    // beides leer → Validierungsfehler
    assert!(save(&pool, f.clone()).await.is_err());
    f.steuernummer = "12/345/67890".into();
    let gespeichert = save(&pool, f).await.unwrap();
    assert!(gespeichert.eingerichtet);
}
```

- [ ] **Step 2: FAIL verifizieren** — `cargo test firma` → FAIL.

- [ ] **Step 3: Implementierung** nach dem etablierten Muster: `firma`-Tabelle hat genau eine Zeile (Seed-ID `f0000000-…-0001`), `get` liest sie, `save` updated sie. `firma_logo_set(bytes)` schreibt die `logo`-BLOB-Spalte, `firma_logo_get()` liest sie (`SELECT logo FROM firma`); beide als eigene Commands, da das Logo nicht in jedem `firma_get` mitgeladen werden soll. Einstellungen: einfaches Key-Value-Upsert (`INSERT … ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).

- [ ] **Step 4: PASS verifizieren** — `cargo test firma && cargo test einstellungen` → PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: Firmendaten, Einstellungen und Nummernkreis-Pflege"`

---

### Task 8: Frontend-Fundament (API-Layer, i18n, Layout)

**Files:**
- Create: `src/api.ts`, `src/i18n.ts`, `src/components/Layout.tsx`, `src/components/Fehler.tsx`
- Modify: `src/App.tsx`, `src/main.tsx`
- Test: `src/api.test.ts` (Vitest)

**Interfaces:**
- Consumes: alle Commands aus Task 4–7
- Produces: typisierte API `api.einheiten.list(): Promise<Einheit[]>` usw. (ein Namespace je Entität, Signaturen 1:1 zu den Rust-Commands); TypeScript-Typen `Einheit`, `Kunde`, `KundeNeu`, `KundeDetail`, `Adresse`, `Ansprechpartner`, `Artikel`, `Kundenpreis`, `Firma`, `Nummernkreis`, `AppFehler`; `Layout` mit Seitennavigation (Kunden, Artikel & Leistungen, Einstellungen — Dashboard/Belege folgen in späteren Plänen); `istValidierungsfehler(e): e is { typ: 'validation', feld: string, meldung: string }`

- [ ] **Step 1: Vitest einrichten**

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

`package.json` scripts: `"test": "vitest run"`. In `vite.config.ts` `test: { environment: "jsdom" }` ergänzen.

- [ ] **Step 2: Failing Test** — `src/api.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([]) }));
import { invoke } from "@tauri-apps/api/core";
import { api, istValidierungsfehler } from "./api";

describe("api", () => {
  it("ruft einheit_list per invoke auf", async () => {
    await api.einheiten.list();
    expect(invoke).toHaveBeenCalledWith("einheit_list");
  });
  it("erkennt Validierungsfehler", () => {
    expect(istValidierungsfehler({ typ: "validation", feld: "name", meldung: "x" })).toBe(true);
    expect(istValidierungsfehler({ typ: "technisch", meldung: "x" })).toBe(false);
  });
});
```

- [ ] **Step 3: FAIL verifizieren** — `npm test` → FAIL (api.ts fehlt).

- [ ] **Step 4: `src/api.ts` implementieren**

```typescript
import { invoke } from "@tauri-apps/api/core";

export interface Einheit { id: string; name: string; kuerzel: string }
export interface Kunde {
  id: string; typ: "firma" | "privat"; name: string; kundennummer: string;
  zahlungsziel_tage: number; notizen: string; ust_idnr: string; email: string;
  leitweg_id: string; kaeuferreferenz: string;
}
export type KundeNeu = Omit<Kunde, "id" | "kundennummer">;
export interface Adresse {
  id: string; kunde_id: string; typ: "rechnung" | "lieferung";
  strasse: string; plz: string; ort: string; land: string; ist_standard: boolean;
}
export interface Ansprechpartner {
  id: string; kunde_id: string; name: string; rolle: string;
  email: string; telefon: string; ist_standard: boolean;
}
export interface KundeDetail { kunde: Kunde; adressen: Adresse[]; ansprechpartner: Ansprechpartner[] }
export interface Artikel {
  id: string; artikelnummer: string; bezeichnung: string; beschreibung: string;
  einheit_id: string; standardpreis_cent: number;
}
export interface Kundenpreis {
  id: string; artikel_id: string; kunde_id: string; preis_cent: number; gueltig_ab: string | null;
}
export interface Firma {
  id: string; name: string; strasse: string; plz: string; ort: string; land: string;
  steuernummer: string; ust_idnr: string; iban: string; bic: string;
  kleinunternehmer: boolean; eingerichtet: boolean;
}
export interface Nummernkreis { art: string; format: string; zaehler: number; jahres_reset: boolean }
export type AppFehler =
  | { typ: "validation"; feld: string; meldung: string }
  | { typ: "nicht_gefunden"; meldung: string }
  | { typ: "technisch"; meldung: string };

export function istValidierungsfehler(e: unknown): e is Extract<AppFehler, { typ: "validation" }> {
  return typeof e === "object" && e !== null && (e as AppFehler).typ === "validation";
}

export const api = {
  einheiten: {
    list: () => invoke<Einheit[]>("einheit_list"),
    create: (name: string, kuerzel: string) => invoke<Einheit>("einheit_create", { name, kuerzel }),
    update: (e: Einheit) => invoke<Einheit>("einheit_update", { id: e.id, name: e.name, kuerzel: e.kuerzel }),
    delete: (id: string) => invoke<void>("einheit_delete", { id }),
  },
  kunden: {
    list: (suche?: string) => invoke<Kunde[]>("kunde_list", { suche: suche ?? null }),
    get: (id: string) => invoke<KundeDetail>("kunde_get", { id }),
    create: (daten: KundeNeu) => invoke<Kunde>("kunde_create", { daten }),
    update: (kunde: Kunde) => invoke<Kunde>("kunde_update", { kunde }),
    delete: (id: string) => invoke<void>("kunde_delete", { id }),
    adresseSave: (adresse: Adresse) => invoke<Adresse>("adresse_save", { adresse }),
    adresseDelete: (id: string) => invoke<void>("adresse_delete", { id }),
    ansprechpartnerSave: (ap: Ansprechpartner) => invoke<Ansprechpartner>("ansprechpartner_save", { ap }),
    ansprechpartnerDelete: (id: string) => invoke<void>("ansprechpartner_delete", { id }),
  },
  artikel: {
    list: (suche?: string) => invoke<Artikel[]>("artikel_list", { suche: suche ?? null }),
    create: (a: Omit<Artikel, "id" | "artikelnummer">) => invoke<Artikel>("artikel_create", { daten: a }),
    update: (a: Artikel) => invoke<Artikel>("artikel_update", { artikel: a }),
    delete: (id: string) => invoke<void>("artikel_delete", { id }),
    kundenpreise: (artikelId: string) => invoke<Kundenpreis[]>("kundenpreis_list", { artikelId }),
    kundenpreisSave: (kp: Kundenpreis) => invoke<Kundenpreis>("kundenpreis_save", { kp }),
    kundenpreisDelete: (id: string) => invoke<void>("kundenpreis_delete", { id }),
  },
  firma: {
    get: () => invoke<Firma>("firma_get"),
    save: (firma: Firma) => invoke<Firma>("firma_save", { firma }),
  },
  einstellungen: {
    get: (key: string) => invoke<string | null>("einstellung_get", { key }),
    set: (key: string, value: string) => invoke<void>("einstellung_set", { key, value }),
    nummernkreise: () => invoke<Nummernkreis[]>("nummernkreis_list"),
    nummernkreisUpdate: (art: string, format: string, jahresReset: boolean) =>
      invoke<void>("nummernkreis_update", { art, format, jahresReset }),
  },
};
```

`src/i18n.ts`: flaches Objekt `t = { "nav.kunden": "Kunden", "nav.artikel": "Artikel & Leistungen", "nav.einstellungen": "Einstellungen", … }` mit Zugriffsfunktion `t(key)`. `Layout.tsx`: Flexbox mit fester linker Navigation (drei Links, aktiver Zustand) und Content-Bereich; simples State-Routing über `useState<Seite>` in `App.tsx` (kein Router nötig bei 3 Seiten — Router-Entscheidung fällt in Plan 2 neu, wenn Belege dazukommen). `Fehler.tsx`: zeigt `AppFehler` als rote Meldung, bei `technisch` mit `<details>` aufklappbar.

- [ ] **Step 5: PASS verifizieren** — `npm test` → PASS. `npm run build` → kompiliert.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: typisierter API-Layer, i18n und App-Layout"`

---

### Task 9: Seiten Einstellungen, Kunden, Artikel

**Files:**
- Create: `src/pages/Einstellungen.tsx`, `src/pages/Kunden.tsx`, `src/pages/KundeDetail.tsx`, `src/pages/Artikel.tsx`
- Modify: `src/App.tsx`
- Test: `src/pages/Kunden.test.tsx`

**Interfaces:**
- Consumes: `api.*` aus Task 8
- Produces: benutzbare UI für alle Stammdaten

- [ ] **Step 1: Failing Komponententest** — `src/pages/Kunden.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  api: { kunden: { list: vi.fn().mockResolvedValue([
    { id: "1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
      zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
      leitweg_id: "", kaeuferreferenz: "" },
  ]) } },
  istValidierungsfehler: () => false,
}));
import { Kunden } from "./Kunden";

describe("Kunden", () => {
  it("zeigt Kundenliste mit Nummer und Name", async () => {
    render(<Kunden onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("ACME GmbH")).toBeTruthy());
    expect(screen.getByText("KD-0001")).toBeTruthy();
  });
});
```

- [ ] **Step 2: FAIL** — `npm test` → FAIL.

- [ ] **Step 3: Seiten implementieren.** Muster für alle vier Seiten (Liste laden via `useEffect`, Formular-Modal bzw. Inline-Formular, Fehleranzeige über `Fehler.tsx`, Validierungsfehler feldbezogen):

  - **Einstellungen.tsx** — drei Abschnitte: Firmendaten-Formular (`api.firma`), Einheiten-Tabelle mit Inline-CRUD (`api.einheiten`), Nummernkreise (Format-Textfeld + Jahresreset-Checkbox je Art, Zähler read-only), Textbausteine (`text.*`-Keys als Textareas).
  - **Kunden.tsx** — Suchfeld (Debounce 300 ms), Tabelle (Nummer, Name, Typ), Button „Neuer Kunde" (Formular für `KundeNeu`), Zeilenklick ruft `onOeffnen(id)`.
  - **KundeDetail.tsx** — lädt `api.kunden.get(id)`, Reiter: Stammdaten (Kunde-Formular inkl. E-Rechnungsfeldern), Adressen (Tabelle + Formular, Standard-Checkbox je Typ), Ansprechpartner (analog). Reiter „Sonderpreise" und „Belege" folgen in Plan 2 — hier als deaktivierte Reiter mit Hinweistext anlegen.
  - **Artikel.tsx** — Tabelle (Nummer, Bezeichnung, Einheit-Kürzel, Standardpreis als `(cent / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })`), Formular mit Einheiten-Dropdown, aufklappbarer Bereich „Kundenpreise" je Artikel (Kunde-Dropdown, Preis, Gültig-ab-Datum).

  Preis-Eingabe überall als Text mit deutschem Komma, Konvertierung über zwei Hilfsfunktionen in `src/geld.ts`: `parseEuro("95,50") === 9550` und `formatCent(9550) === "95,50 €"` — mit eigenem Vitest (Randfälle: `"95"`, `"95,5"`, `"1.095,50"`, ungültige Eingabe → `null`).

- [ ] **Step 4: PASS** — `npm test` → alle Tests grün. `npm run build` → kompiliert.

- [ ] **Step 5: Manueller Smoke-Test** — `npm run tauri dev`: Einheit anlegen, Kunde mit Adresse anlegen, Artikel mit Kundenpreis anlegen, App neu starten → Daten sind persistent.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: Stammdaten-UI (Einstellungen, Kunden, Artikel)"`

---

### Task 10: Ersteinrichtungs-Assistent

**Files:**
- Create: `src/pages/Einrichtung.tsx`
- Modify: `src/App.tsx`
- Test: `src/pages/Einrichtung.test.tsx`

**Interfaces:**
- Consumes: `api.firma`, `api.einstellungen`
- Produces: App zeigt beim Start den Assistenten, solange `firma.eingerichtet === false`

- [ ] **Step 1: Failing Test**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  api: { firma: { get: vi.fn().mockResolvedValue({ eingerichtet: false, name: "",
    strasse: "", plz: "", ort: "", land: "DE", steuernummer: "", ust_idnr: "",
    iban: "", bic: "", kleinunternehmer: true, id: "f1" }) } },
  istValidierungsfehler: () => false,
}));
import { Einrichtung } from "./Einrichtung";

describe("Einrichtung", () => {
  it("startet mit Schritt Firmendaten", async () => {
    render(<Einrichtung onFertig={() => {}} />);
    await waitFor(() => expect(screen.getByText("Firmendaten")).toBeTruthy());
  });
});
```

- [ ] **Step 2: FAIL** — `npm test` → FAIL.

- [ ] **Step 3: Dialog-Plugin installieren** (für die Logo-Dateiauswahl):

```bash
npm install @tauri-apps/plugin-dialog @tauri-apps/plugin-fs
cd src-tauri && cargo add tauri-plugin-dialog tauri-plugin-fs
```

Im Builder (`lib.rs`): `.plugin(tauri_plugin_dialog::init()).plugin(tauri_plugin_fs::init())`; in `src-tauri/capabilities/default.json` die Permissions `dialog:default` und `fs:allow-read-file` ergänzen.

- [ ] **Step 4: Implementierung** — vier Schritte als Wizard (Zustand `schritt: 1..4`, Zurück/Weiter):
  1. **Firmendaten**: Name, Adresse, Steuernummer/USt-IdNr., IBAN/BIC
  2. **Logo** (optional): Datei wählen (`open()` aus plugin-dialog, Bytes via plugin-fs lesen, `api.firma` um `logoSet(bytes)` erweitern → `firma_logo_set`), Vorschau, überspringbar
  3. **Kleinunternehmer-Bestätigung**: Checkbox mit Erklärtext (§ 19 UStG, Grenzen 25.000/100.000 €)
  4. **Nummernkreise**: vorbelegte Formate anzeigen, editierbar
  Abschluss ruft `api.firma.save` (setzt `eingerichtet`) und `onFertig()`. `App.tsx`: beim Start `api.firma.get()`; solange `!eingerichtet`, wird statt `Layout` der Assistent gerendert.

- [ ] **Step 5: PASS** — `npm test` → grün.

- [ ] **Step 6: Manueller Durchlauf** — DB-Datei im App-Datenordner löschen, `npm run tauri dev`: Assistent erscheint, durchklicken, danach normale App; Neustart → Assistent kommt nicht mehr.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: Ersteinrichtungs-Assistent"`

---

## Abschluss Plan 1

Nach Task 10: `cargo test` (alle Rust-Tests), `npm test`, `npm run build`, manueller Smoke-Test. Danach entsteht Plan 2 (Belege) auf Basis des realen Codes.
