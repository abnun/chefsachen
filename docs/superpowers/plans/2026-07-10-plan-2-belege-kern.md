# Plan 2: Belege-Kern (Angebote & Rechnungen) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Angebote und Rechnungen als Datenmodell mit Status-Workflow (Entwurf → gestellt/versendet → Abschluss), Positionsverwaltung mit automatischer Preisfindung, Angebot→Rechnung-Überführung, Rechnungsstorno und Zahlungserfassung inkl. offener Posten — vollständig nutzbar über die UI, aber **ohne** Dokumentexport (PDF/XRechnung/ZUGFeRD folgt als eigener Plan 3) und **ohne** Dashboard.

**Architecture:** Neues Rust-Modul `domain::beleg` (Rundung/Summenbildung) und `commands::belege` (CRUD + Statuswechsel + Zahlungen) nach dem in Plan 1 etablierten Muster: dünne Tauri-Commands über testbaren freien Funktionen, `AppError` für Validierung, Soft-Delete, `jetzt()`-Zeitstempel. Frontend: eine gemeinsame `BelegEditor`-Komponente für Angebote und Rechnungen (identisches Datenmodell), zwei schlanke Listen-Seiten (`Angebote`, `Rechnungen`), Aktivierung des bereits vorbereiteten "Belege"-Reiters in `KundeDetail`.

**Tech Stack:** Wie Plan 1 — Tauri 2.x, Rust, sqlx 0.8 (SQLite), serde_json (bereits vorhanden); React 18, TypeScript, Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-06-kleinunternehmer-tool-design.md` (Abschnitte "Datenmodell" → Beleg/Belegposition/Zahlung/Nummernkreis, "UI" Punkte 4–5, "Statusmodelle", "Storno").

**Vorbedingung:** Plan 1 ist abgeschlossen und in `main` gemerged (Firma/Kunden/Artikel/Einheiten/Nummernkreise funktionieren, 33 Rust- + 16 Frontend-Tests grün).

## Global Constraints

- Wie Plan 1: UUID-PK, `created_at`/`updated_at` (ISO-8601 UTC via `db::jetzt()`), Soft-Delete via `deleted_at`, Geldbeträge i64-Cent, TDD (Test zuerst, dann Implementierung, Commit je Task).
- **Menge** wird als i64 mit Faktor 1000 gespeichert (z. B. 2,5 Stück = `2500`), analog zu Cent-Beträgen. Neue Frontend-Helfer `parseMenge`/`formatMenge` in `src/geld.ts` (Pendant zu `parseEuro`/`formatCent`).
- **Kaufmännische Rundung:** Positionssumme = Menge × Einzelpreis, gerundet auf ganze Cent (round half up). Implementiert in `domain::beleg::positionssumme_cent`. Belegsumme = Summe der bereits gerundeten Positionssummen (keine erneute Rundung).
- **Unveränderlichkeit nach dem Stellen:** Nur Belege im Status `entwurf` sind editierbar (Stammdaten, Positionen). Jede Mutation prüft das explizit und liefert sonst `AppError::Validation`.
- **Nummernkreise** `angebot` und `rechnung` existieren bereits aus Plan 1 (Seed in `0001_stammdaten.sql`); Stornobelege nutzen denselben Nummernkreis wie reguläre Rechnungen (`naechste_nummer(pool, "rechnung")`), keine eigene Beleg-Art.
- **Zahlungsstatus wird nicht als eigene Spalte gespeichert**, sondern aus `beleg.summe_cent` minus der Summe aktiver `zahlung`-Einträge berechnet (`BelegDetail.bezahlt_cent` / `offener_betrag_cent`). Vermeidet einen zweiten Wahrheits-Quelle-Bug (Status-Spalte könnte nach Zahlungsänderung veraltet sein).
- **`kunde_snapshot`** (JSON-Spalte auf `beleg`) wird beim Stellen befüllt, aber in dieser Phase **nicht** über die Commands nach außen gegeben (kein Feld auf dem `Beleg`-Rückgabetyp) — sie dient als Vorarbeit für Plan 3 (Dokumentgenerierung), wird hier nur geschrieben, nicht gelesen.
- **Beleg-Editor belegt nur das Zahlungsziel aus den Kundenstammdaten vor**, nicht Adresse/Ansprechpartner (Spec nennt beides) — ohne Dokumentexport (Plan 3) hat eine angezeigte Lieferadresse im Editor keinen Zweck; der `kunde_snapshot` beim Stellen erfasst die Standardadresse bereits serverseitig für die spätere PDF-Erzeugung.
- **Explizit außerhalb dieses Plans:** PDF/XRechnung/ZUGFeRD-Export, Dashboard/Umsatzgrenzen-Berechnung, Positions-Umsortierung (Drag&Drop), Rechnungs-Mahnwesen.

---

### Task 1: Migration & Rundungs-Domain

**Files:**
- Create: `src-tauri/migrations/0002_belege.sql`
- Create: `src-tauri/src/domain/beleg.rs`
- Modify: `src-tauri/src/domain/mod.rs`

**Interfaces:**
- Produces: Tabellen `beleg`, `belegposition`, `zahlung`; `domain::beleg::positionssumme_cent(menge_x1000: i64, einzelpreis_cent: i64) -> AppResult<i64>`; `domain::beleg::belegsumme_cent(positionssummen: &[i64]) -> i64`

- [ ] **Step 1: Migration schreiben** — `src-tauri/migrations/0002_belege.sql`:

```sql
CREATE TABLE beleg (
  id TEXT PRIMARY KEY,
  typ TEXT NOT NULL CHECK (typ IN ('angebot','rechnung')),
  nummer TEXT,
  status TEXT NOT NULL DEFAULT 'entwurf',
  kunde_id TEXT NOT NULL REFERENCES kunde(id),
  kunde_snapshot TEXT NOT NULL DEFAULT '',
  datum TEXT NOT NULL,
  leistungsdatum TEXT NOT NULL,
  zahlungsziel_tage INTEGER NOT NULL DEFAULT 14,
  kopftext TEXT NOT NULL DEFAULT '',
  fusstext TEXT NOT NULL DEFAULT '',
  summe_cent INTEGER NOT NULL DEFAULT 0,
  ursprungsangebot_id TEXT REFERENCES beleg(id),
  storno_von_id TEXT REFERENCES beleg(id),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);

CREATE TABLE belegposition (
  id TEXT PRIMARY KEY,
  beleg_id TEXT NOT NULL REFERENCES beleg(id),
  artikel_id TEXT REFERENCES artikel(id),
  bezeichnung TEXT NOT NULL,
  einheit_kuerzel TEXT NOT NULL DEFAULT '',
  einzelpreis_cent INTEGER NOT NULL,
  menge INTEGER NOT NULL,
  positionssumme_cent INTEGER NOT NULL,
  reihenfolge INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);

CREATE TABLE zahlung (
  id TEXT PRIMARY KEY,
  rechnung_id TEXT NOT NULL REFERENCES beleg(id),
  datum TEXT NOT NULL,
  betrag_cent INTEGER NOT NULL,
  notiz TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
```

- [ ] **Step 2: Failing Tests** — `src-tauri/src/domain/beleg.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rundet_kaufmaennisch_auf_und_ab() {
        assert_eq!(positionssumme_cent(1000, 9500).unwrap(), 9500); // 1 * 95,00 €
        assert_eq!(positionssumme_cent(2500, 9500).unwrap(), 23750); // 2,5 * 95,00 € = 237,50 €
        assert_eq!(positionssumme_cent(1333, 1000).unwrap(), 1333); // 1,333 * 10,00 € = 13,33 € (exakt)
        assert_eq!(positionssumme_cent(1, 5).unwrap(), 0); // 0,001 * 0,05 € = 0,00005 € -> 0 Cent
        assert_eq!(positionssumme_cent(500, 1).unwrap(), 1); // 0,5 * 0,01 € = 0,005 € -> rundet kaufmännisch auf 1 Cent
    }

    #[test]
    fn lehnt_ungueltige_menge_und_preis_ab() {
        assert!(positionssumme_cent(0, 100).is_err());
        assert!(positionssumme_cent(1000, -1).is_err());
    }

    #[test]
    fn belegsumme_summiert_positionen() {
        assert_eq!(belegsumme_cent(&[100, 250, 50]), 400);
        assert_eq!(belegsumme_cent(&[]), 0);
    }
}
```

- [ ] **Step 3: Tests schlagen fehl** — Run: `cd src-tauri && cargo test beleg::` → FAIL (Modul/Funktionen existieren nicht).

- [ ] **Step 4: Implementierung** — oberhalb des Testmoduls in derselben Datei:

```rust
use crate::error::{AppError, AppResult};

/// Kaufmännische Rundung (round half up) einer Positionssumme. `menge_x1000`
/// ist die Menge mit Faktor 1000 (2,5 Stück = 2500), `einzelpreis_cent` der
/// Einzelpreis in Cent. Rückgabe: gerundete Cent.
pub fn positionssumme_cent(menge_x1000: i64, einzelpreis_cent: i64) -> AppResult<i64> {
    if menge_x1000 <= 0 {
        return Err(AppError::Validation {
            feld: "menge".into(),
            meldung: "Menge muss größer als 0 sein".into(),
        });
    }
    if einzelpreis_cent < 0 {
        return Err(AppError::Validation {
            feld: "einzelpreis_cent".into(),
            meldung: "Einzelpreis darf nicht negativ sein".into(),
        });
    }
    let rohprodukt = menge_x1000 * einzelpreis_cent; // Cent * 1000
    Ok((rohprodukt + 500) / 1000)
}

/// Belegsumme = Summe der bereits gerundeten Positionssummen (keine erneute Rundung).
pub fn belegsumme_cent(positionssummen: &[i64]) -> i64 {
    positionssummen.iter().sum()
}
```

- [ ] **Step 5: Tests grün** — Run: `cd src-tauri && cargo test beleg::` → PASS (3 Tests).

- [ ] **Step 6: Modul registrieren** — `src-tauri/src/domain/mod.rs`:

```rust
pub mod beleg;
pub mod nummernkreis;
pub mod preisfindung;
```

- [ ] **Step 7: Voller Testlauf** — Run: `cd src-tauri && cargo test` → PASS (33 bestehende + 3 neue = 36 Tests). Die Migration wird dabei automatisch von `sqlx::migrate!` mit angewendet (kein separater Schritt nötig).

- [ ] **Step 8: Commit** — `git add -A && git commit -m "feat: Beleg-Tabellen und kaufmännische Rundung"`

---

### Task 2: Beleg-CRUD (Entwurf)

**Files:**
- Create: `src-tauri/src/commands/belege.rs`
- Modify: `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: Structs `Beleg`, `BelegNeu`, `BelegUpdate`; freie Funktionen `create`, `list`, `get`, `update`, `delete`; Tauri-Commands `beleg_create`, `beleg_list`, `beleg_get`, `beleg_update`, `beleg_delete`

- [ ] **Step 1: Failing Tests** — `src-tauri/src/commands/belege.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::kunden::{create as kunde_create, KundeNeu};

    async fn test_pool() -> (tempfile::TempDir, sqlx::SqlitePool) {
        let dir = tempfile::tempdir().unwrap();
        let p = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        (dir, p)
    }

    async fn kunde_anlegen(pool: &sqlx::SqlitePool) -> String {
        kunde_create(pool, KundeNeu {
            typ: "firma".into(), name: "ACME GmbH".into(), zahlungsziel_tage: 14,
            notizen: "".into(), ust_idnr: "".into(), email: "".into(),
            leitweg_id: "".into(), kaeuferreferenz: "".into(),
        }).await.unwrap().id
    }

    fn beleg_neu(typ: &str, kunde_id: &str) -> BelegNeu {
        BelegNeu { typ: typ.into(), kunde_id: kunde_id.into(), datum: "2026-07-10".into(),
            leistungsdatum: "2026-07-10".into(), zahlungsziel_tage: 14,
            kopftext: "".into(), fusstext: "".into() }
    }

    #[tokio::test]
    async fn create_erzeugt_entwurf_ohne_nummer() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        assert_eq!(beleg.status, "entwurf");
        assert_eq!(beleg.nummer, None);
        assert_eq!(beleg.summe_cent, 0);
    }

    #[tokio::test]
    async fn create_lehnt_unbekannten_kunden_ab() {
        let (_dir, pool) = test_pool().await;
        let err = create(&pool, beleg_neu("angebot", "unbekannt")).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn list_filtert_nach_typ_und_status() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        let angebote = list(&pool, Some("angebot".into()), None).await.unwrap();
        assert_eq!(angebote.len(), 1);
        assert_eq!(angebote[0].typ, "angebot");
        let entwuerfe = list(&pool, None, Some("entwurf".into())).await.unwrap();
        assert_eq!(entwuerfe.len(), 2);
    }

    #[tokio::test]
    async fn update_aendert_entwurf() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        let aktualisiert = update(&pool, BelegUpdate {
            id: beleg.id.clone(), kunde_id: kunde_id.clone(), datum: "2026-07-11".into(),
            leistungsdatum: "2026-07-11".into(), zahlungsziel_tage: 30,
            kopftext: "Hallo".into(), fusstext: "".into(),
        }).await.unwrap();
        assert_eq!(aktualisiert.datum, "2026-07-11");
        assert_eq!(aktualisiert.zahlungsziel_tage, 30);
    }

    #[tokio::test]
    async fn update_lehnt_nicht_entwurf_ab() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        sqlx::query("UPDATE beleg SET status = 'versendet' WHERE id = ?")
            .bind(&beleg.id).execute(&pool).await.unwrap();
        let err = update(&pool, BelegUpdate {
            id: beleg.id, kunde_id, datum: "2026-07-11".into(), leistungsdatum: "2026-07-11".into(),
            zahlungsziel_tage: 14, kopftext: "".into(), fusstext: "".into(),
        }).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn delete_entfernt_entwurf_aber_nicht_gestellten_beleg() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        delete(&pool, beleg.id.clone()).await.unwrap();
        assert!(matches!(get(&pool, beleg.id).await.unwrap_err(), AppError::NichtGefunden));

        let beleg2 = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        sqlx::query("UPDATE beleg SET status = 'versendet' WHERE id = ?")
            .bind(&beleg2.id).execute(&pool).await.unwrap();
        let err = delete(&pool, beleg2.id).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn get_liefert_leere_positionen_und_zahlungen_fuer_neuen_entwurf() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        let detail = get(&pool, beleg.id).await.unwrap();
        assert!(detail.positionen.is_empty());
        assert!(detail.zahlungen.is_empty());
        assert_eq!(detail.offener_betrag_cent, 0);
    }
}
```

- [ ] **Step 2: Tests schlagen fehl** — Run: `cd src-tauri && cargo test belege::` → FAIL (Modul existiert nicht).

- [ ] **Step 3: Implementierung** — oberhalb des Testmoduls:

```rust
use crate::db::jetzt;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Beleg {
    pub id: String,
    pub typ: String,
    pub nummer: Option<String>,
    pub status: String,
    pub kunde_id: String,
    pub datum: String,
    pub leistungsdatum: String,
    pub zahlungsziel_tage: i64,
    pub kopftext: String,
    pub fusstext: String,
    pub summe_cent: i64,
    pub ursprungsangebot_id: Option<String>,
    pub storno_von_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BelegNeu {
    pub typ: String,
    pub kunde_id: String,
    pub datum: String,
    pub leistungsdatum: String,
    pub zahlungsziel_tage: i64,
    pub kopftext: String,
    pub fusstext: String,
}

#[derive(Debug, Deserialize)]
pub struct BelegUpdate {
    pub id: String,
    pub kunde_id: String,
    pub datum: String,
    pub leistungsdatum: String,
    pub zahlungsziel_tage: i64,
    pub kopftext: String,
    pub fusstext: String,
}

#[derive(Debug, Serialize)]
pub struct BelegDetail {
    pub beleg: Beleg,
    pub positionen: Vec<Belegposition>,
    pub zahlungen: Vec<Zahlung>,
    pub bezahlt_cent: i64,
    pub offener_betrag_cent: i64,
}

const BELEG_SPALTEN: &str = "id, typ, nummer, status, kunde_id, datum, leistungsdatum, zahlungsziel_tage, kopftext, fusstext, summe_cent, ursprungsangebot_id, storno_von_id";

fn pruefe_beleg_neu(typ: &str, datum: &str, leistungsdatum: &str, zahlungsziel_tage: i64) -> AppResult<()> {
    if !["angebot", "rechnung"].contains(&typ) {
        return Err(AppError::Validation { feld: "typ".into(), meldung: "Ungültiger Belegtyp".into() });
    }
    if datum.trim().is_empty() {
        return Err(AppError::Validation { feld: "datum".into(), meldung: "Datum darf nicht leer sein".into() });
    }
    if leistungsdatum.trim().is_empty() {
        return Err(AppError::Validation { feld: "leistungsdatum".into(), meldung: "Leistungsdatum darf nicht leer sein".into() });
    }
    if zahlungsziel_tage < 0 {
        return Err(AppError::Validation { feld: "zahlungsziel_tage".into(), meldung: "Zahlungsziel darf nicht negativ sein".into() });
    }
    Ok(())
}

async fn lade_beleg(pool: &SqlitePool, id: &str) -> AppResult<Beleg> {
    let sql = format!("SELECT {BELEG_SPALTEN} FROM beleg WHERE id = ? AND deleted_at IS NULL");
    sqlx::query_as(&sql).bind(id).fetch_optional(pool).await?.ok_or(AppError::NichtGefunden)
}

fn pruefe_ist_entwurf(beleg: &Beleg) -> AppResult<()> {
    if beleg.status != "entwurf" {
        return Err(AppError::Validation {
            feld: "status".into(),
            meldung: "Nur Entwurfsbelege können bearbeitet werden".into(),
        });
    }
    Ok(())
}

pub async fn create(pool: &SqlitePool, d: BelegNeu) -> AppResult<Beleg> {
    pruefe_beleg_neu(&d.typ, &d.datum, &d.leistungsdatum, d.zahlungsziel_tage)?;
    let kunde_existiert: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM kunde WHERE id = ? AND deleted_at IS NULL")
        .bind(&d.kunde_id).fetch_one(pool).await?;
    if kunde_existiert.0 == 0 {
        return Err(AppError::Validation { feld: "kunde_id".into(), meldung: "Kunde existiert nicht".into() });
    }
    let beleg = Beleg {
        id: Uuid::new_v4().to_string(), typ: d.typ, nummer: None, status: "entwurf".into(),
        kunde_id: d.kunde_id, datum: d.datum, leistungsdatum: d.leistungsdatum,
        zahlungsziel_tage: d.zahlungsziel_tage, kopftext: d.kopftext, fusstext: d.fusstext,
        summe_cent: 0, ursprungsangebot_id: None, storno_von_id: None,
    };
    sqlx::query("INSERT INTO beleg (id, typ, nummer, status, kunde_id, datum, leistungsdatum, zahlungsziel_tage, kopftext, fusstext, summe_cent, ursprungsangebot_id, storno_von_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(&beleg.id).bind(&beleg.typ).bind(&beleg.nummer).bind(&beleg.status).bind(&beleg.kunde_id)
        .bind(&beleg.datum).bind(&beleg.leistungsdatum).bind(beleg.zahlungsziel_tage)
        .bind(&beleg.kopftext).bind(&beleg.fusstext).bind(beleg.summe_cent)
        .bind(&beleg.ursprungsangebot_id).bind(&beleg.storno_von_id).bind(jetzt()).bind(jetzt())
        .execute(pool).await?;
    Ok(beleg)
}

pub async fn list(pool: &SqlitePool, typ: Option<String>, status: Option<String>) -> AppResult<Vec<Beleg>> {
    let sql = format!(
        "SELECT {BELEG_SPALTEN} FROM beleg WHERE deleted_at IS NULL \
         AND (? IS NULL OR typ = ?) AND (? IS NULL OR status = ?) \
         ORDER BY datum DESC, created_at DESC"
    );
    Ok(sqlx::query_as(&sql)
        .bind(typ.clone()).bind(typ)
        .bind(status.clone()).bind(status)
        .fetch_all(pool).await?)
}

pub async fn get(pool: &SqlitePool, id: String) -> AppResult<BelegDetail> {
    let beleg = lade_beleg(pool, &id).await?;
    let positionen: Vec<Belegposition> = sqlx::query_as(
        "SELECT id, beleg_id, artikel_id, bezeichnung, einheit_kuerzel, einzelpreis_cent, menge, positionssumme_cent, reihenfolge \
         FROM belegposition WHERE beleg_id = ? AND deleted_at IS NULL ORDER BY reihenfolge")
        .bind(&id).fetch_all(pool).await?;
    let zahlungen: Vec<Zahlung> = sqlx::query_as(
        "SELECT id, rechnung_id, datum, betrag_cent, notiz FROM zahlung WHERE rechnung_id = ? AND deleted_at IS NULL ORDER BY datum")
        .bind(&id).fetch_all(pool).await?;
    let bezahlt_cent: i64 = zahlungen.iter().map(|z| z.betrag_cent).sum();
    let offener_betrag_cent = beleg.summe_cent - bezahlt_cent;
    Ok(BelegDetail { beleg, positionen, zahlungen, bezahlt_cent, offener_betrag_cent })
}

pub async fn update(pool: &SqlitePool, d: BelegUpdate) -> AppResult<Beleg> {
    let beleg = lade_beleg(pool, &d.id).await?;
    pruefe_ist_entwurf(&beleg)?;
    pruefe_beleg_neu(&beleg.typ, &d.datum, &d.leistungsdatum, d.zahlungsziel_tage)?;
    sqlx::query("UPDATE beleg SET kunde_id=?, datum=?, leistungsdatum=?, zahlungsziel_tage=?, kopftext=?, fusstext=?, updated_at=? WHERE id=?")
        .bind(&d.kunde_id).bind(&d.datum).bind(&d.leistungsdatum).bind(d.zahlungsziel_tage)
        .bind(&d.kopftext).bind(&d.fusstext).bind(jetzt()).bind(&d.id)
        .execute(pool).await?;
    lade_beleg(pool, &d.id).await
}

pub async fn delete(pool: &SqlitePool, id: String) -> AppResult<()> {
    let beleg = lade_beleg(pool, &id).await?;
    pruefe_ist_entwurf(&beleg)?;
    sqlx::query("UPDATE beleg SET deleted_at = ? WHERE id = ?").bind(jetzt()).bind(&id).execute(pool).await?;
    Ok(())
}

// Dünne Tauri-Wrapper
#[tauri::command]
pub async fn beleg_list(pool: tauri::State<'_, SqlitePool>, typ: Option<String>, status: Option<String>) -> AppResult<Vec<Beleg>> {
    list(&pool, typ, status).await
}
#[tauri::command]
pub async fn beleg_get(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<BelegDetail> {
    get(&pool, id).await
}
#[tauri::command]
pub async fn beleg_create(pool: tauri::State<'_, SqlitePool>, daten: BelegNeu) -> AppResult<Beleg> {
    create(&pool, daten).await
}
#[tauri::command]
pub async fn beleg_update(pool: tauri::State<'_, SqlitePool>, daten: BelegUpdate) -> AppResult<Beleg> {
    update(&pool, daten).await
}
#[tauri::command]
pub async fn beleg_delete(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<()> {
    delete(&pool, id).await
}
```

Hinweis: `Belegposition` und `Zahlung` werden erst in Task 3 bzw. Task 7 definiert — diese Datei kompiliert erst, sobald diese Structs existieren. Bis Task 3 abgeschlossen ist, bleibt `cargo test` für dieses Modul rot; das ist normal, da Task 2 und 3 zusammen eine kompilierbare Einheit bilden. Führe Step 4 unten trotzdem aus, um die Fortschrittsanzeige zu dokumentieren — der eigentliche grüne Testlauf erfolgt am Ende von Task 3.

- [ ] **Step 4: Modul registrieren** — `src-tauri/src/commands/mod.rs`:

```rust
pub mod artikel;
pub mod belege;
pub mod einheiten;
pub mod einstellungen;
pub mod firma;
pub mod kunden;
```

- [ ] **Step 5: Commit (Zwischenstand)** — `git add -A && git commit -m "feat: Beleg-CRUD für Entwurfsbelege (WIP, folgt in Task 3)"`

---

### Task 3: Belegposition-CRUD (automatische Preisfindung + Summenneuberechnung)

**Files:**
- Modify: `src-tauri/src/commands/belege.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: Structs `Belegposition`, `BelegpositionNeu`; freie Funktionen `position_speichern`, `position_loeschen`; Tauri-Commands `belegposition_save`, `belegposition_delete`

- [ ] **Step 1: Failing Tests** — ergänze im Testmodul von `belege.rs`:

```rust
    async fn artikel_anlegen(pool: &sqlx::SqlitePool, standardpreis_cent: i64) -> String {
        crate::commands::artikel::create(pool, crate::commands::artikel::ArtikelNeu {
            bezeichnung: "Beratung".into(), beschreibung: "".into(),
            einheit_id: "e0000000-0000-0000-0000-000000000001".into(),
            standardpreis_cent,
        }).await.unwrap().id
    }

    #[tokio::test]
    async fn position_mit_artikel_ermittelt_preis_automatisch() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 9500).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        let pos = position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 2000,
        }).await.unwrap();
        assert_eq!(pos.einzelpreis_cent, 9500);
        assert_eq!(pos.bezeichnung, "Beratung");
        assert_eq!(pos.positionssumme_cent, 19000);
        let beleg_neu = get(&pool, beleg.id).await.unwrap().beleg;
        assert_eq!(beleg_neu.summe_cent, 19000);
    }

    #[tokio::test]
    async fn freitextposition_ohne_preis_wird_abgelehnt() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        let err = position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id, artikel_id: None,
            bezeichnung: "Sonderleistung".into(), einheit_kuerzel: "Std.".into(),
            einzelpreis_cent: None, menge: 1000,
        }).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn freitextposition_mit_preis_wird_uebernommen() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        let pos = position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id, artikel_id: None,
            bezeichnung: "Sonderleistung".into(), einheit_kuerzel: "Std.".into(),
            einzelpreis_cent: Some(12000), menge: 1000,
        }).await.unwrap();
        assert_eq!(pos.bezeichnung, "Sonderleistung");
        assert_eq!(pos.positionssumme_cent, 12000);
    }

    #[tokio::test]
    async fn loeschen_berechnet_belegsumme_neu() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        let pos1 = position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id.clone()),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        position_loeschen(&pool, pos1.id).await.unwrap();
        let beleg_neu = get(&pool, beleg.id).await.unwrap().beleg;
        assert_eq!(beleg_neu.summe_cent, 5000);
    }

    #[tokio::test]
    async fn position_an_gestelltem_beleg_wird_abgelehnt() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        sqlx::query("UPDATE beleg SET status = 'versendet' WHERE id = ?")
            .bind(&beleg.id).execute(&pool).await.unwrap();
        let err = position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id, artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }
```

- [ ] **Step 2: Tests schlagen fehl** — Run: `cd src-tauri && cargo test belege::` → FAIL (Compile-Fehler: `Belegposition`, `BelegpositionNeu`, `position_speichern`, `position_loeschen` fehlen).

- [ ] **Step 3: Implementierung** — ergänze in `belege.rs` (Structs vor dem Testmodul, Funktionen nach den bestehenden CRUD-Funktionen):

```rust
use crate::domain::beleg::{belegsumme_cent, positionssumme_cent};
use crate::domain::preisfindung::effektiver_preis;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Belegposition {
    pub id: String,
    pub beleg_id: String,
    pub artikel_id: Option<String>,
    pub bezeichnung: String,
    pub einheit_kuerzel: String,
    pub einzelpreis_cent: i64,
    pub menge: i64,
    pub positionssumme_cent: i64,
    pub reihenfolge: i64,
}

#[derive(Debug, Deserialize)]
pub struct BelegpositionNeu {
    pub id: String,
    pub beleg_id: String,
    pub artikel_id: Option<String>,
    pub bezeichnung: String,
    pub einheit_kuerzel: String,
    pub einzelpreis_cent: Option<i64>,
    pub menge: i64,
}

async fn naechste_reihenfolge(pool: &SqlitePool, beleg_id: &str) -> AppResult<i64> {
    let max: (Option<i64>,) = sqlx::query_as(
        "SELECT MAX(reihenfolge) FROM belegposition WHERE beleg_id = ? AND deleted_at IS NULL")
        .bind(beleg_id).fetch_one(pool).await?;
    Ok(max.0.unwrap_or(-1) + 1)
}

async fn beleg_summe_neu_berechnen(pool: &SqlitePool, beleg_id: &str) -> AppResult<()> {
    let summen: Vec<(i64,)> = sqlx::query_as(
        "SELECT positionssumme_cent FROM belegposition WHERE beleg_id = ? AND deleted_at IS NULL")
        .bind(beleg_id).fetch_all(pool).await?;
    let summe = belegsumme_cent(&summen.iter().map(|s| s.0).collect::<Vec<_>>());
    sqlx::query("UPDATE beleg SET summe_cent = ?, updated_at = ? WHERE id = ?")
        .bind(summe).bind(jetzt()).bind(beleg_id).execute(pool).await?;
    Ok(())
}

pub async fn position_speichern(pool: &SqlitePool, d: BelegpositionNeu) -> AppResult<Belegposition> {
    let beleg = lade_beleg(pool, &d.beleg_id).await?;
    pruefe_ist_entwurf(&beleg)?;
    if d.menge <= 0 {
        return Err(AppError::Validation { feld: "menge".into(), meldung: "Menge muss größer als 0 sein".into() });
    }

    let (bezeichnung, einheit_kuerzel, einzelpreis_cent) = if let Some(artikel_id) = &d.artikel_id {
        let artikel: (String, String) = sqlx::query_as(
            "SELECT a.bezeichnung, e.kuerzel FROM artikel a JOIN einheit e ON e.id = a.einheit_id \
             WHERE a.id = ? AND a.deleted_at IS NULL")
            .bind(artikel_id).fetch_optional(pool).await?
            .ok_or_else(|| AppError::Validation { feld: "artikel_id".into(), meldung: "Artikel existiert nicht".into() })?;
        let preis = match d.einzelpreis_cent {
            Some(p) => p,
            None => effektiver_preis(pool, artikel_id, &beleg.kunde_id, &beleg.datum).await?,
        };
        (artikel.0, artikel.1, preis)
    } else {
        let preis = d.einzelpreis_cent.ok_or_else(|| AppError::Validation {
            feld: "einzelpreis_cent".into(),
            meldung: "Einzelpreis ist bei Freitextpositionen erforderlich".into(),
        })?;
        if d.bezeichnung.trim().is_empty() {
            return Err(AppError::Validation { feld: "bezeichnung".into(), meldung: "Bezeichnung darf nicht leer sein".into() });
        }
        (d.bezeichnung.trim().to_string(), d.einheit_kuerzel.clone(), preis)
    };

    let summe = positionssumme_cent(d.menge, einzelpreis_cent)?;

    let position = if d.id.is_empty() {
        let reihenfolge = naechste_reihenfolge(pool, &d.beleg_id).await?;
        let pos = Belegposition {
            id: Uuid::new_v4().to_string(), beleg_id: d.beleg_id.clone(), artikel_id: d.artikel_id.clone(),
            bezeichnung, einheit_kuerzel, einzelpreis_cent, menge: d.menge,
            positionssumme_cent: summe, reihenfolge,
        };
        sqlx::query("INSERT INTO belegposition (id, beleg_id, artikel_id, bezeichnung, einheit_kuerzel, einzelpreis_cent, menge, positionssumme_cent, reihenfolge, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
            .bind(&pos.id).bind(&pos.beleg_id).bind(&pos.artikel_id).bind(&pos.bezeichnung)
            .bind(&pos.einheit_kuerzel).bind(pos.einzelpreis_cent).bind(pos.menge)
            .bind(pos.positionssumme_cent).bind(pos.reihenfolge).bind(jetzt()).bind(jetzt())
            .execute(pool).await?;
        pos
    } else {
        let bestehende: (i64,) = sqlx::query_as("SELECT reihenfolge FROM belegposition WHERE id = ? AND deleted_at IS NULL")
            .bind(&d.id).fetch_optional(pool).await?.ok_or(AppError::NichtGefunden)?;
        sqlx::query("UPDATE belegposition SET artikel_id=?, bezeichnung=?, einheit_kuerzel=?, einzelpreis_cent=?, menge=?, positionssumme_cent=?, updated_at=? WHERE id=?")
            .bind(&d.artikel_id).bind(&bezeichnung).bind(&einheit_kuerzel).bind(einzelpreis_cent)
            .bind(d.menge).bind(summe).bind(jetzt()).bind(&d.id)
            .execute(pool).await?;
        Belegposition {
            id: d.id.clone(), beleg_id: d.beleg_id.clone(), artikel_id: d.artikel_id.clone(),
            bezeichnung, einheit_kuerzel, einzelpreis_cent, menge: d.menge,
            positionssumme_cent: summe, reihenfolge: bestehende.0,
        }
    };

    beleg_summe_neu_berechnen(pool, &d.beleg_id).await?;
    Ok(position)
}

pub async fn position_loeschen(pool: &SqlitePool, id: String) -> AppResult<()> {
    let row: (String,) = sqlx::query_as("SELECT beleg_id FROM belegposition WHERE id = ? AND deleted_at IS NULL")
        .bind(&id).fetch_optional(pool).await?.ok_or(AppError::NichtGefunden)?;
    let beleg = lade_beleg(pool, &row.0).await?;
    pruefe_ist_entwurf(&beleg)?;
    sqlx::query("UPDATE belegposition SET deleted_at = ? WHERE id = ?").bind(jetzt()).bind(&id).execute(pool).await?;
    beleg_summe_neu_berechnen(pool, &row.0).await?;
    Ok(())
}

// Dünne Tauri-Wrapper (ergänzen die aus Task 2)
#[tauri::command]
pub async fn belegposition_save(pool: tauri::State<'_, SqlitePool>, position: BelegpositionNeu) -> AppResult<Belegposition> {
    position_speichern(&pool, position).await
}
#[tauri::command]
pub async fn belegposition_delete(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<()> {
    position_loeschen(&pool, id).await
}
```

Diese Datei kompiliert weiterhin nicht vollständig, da `Zahlung` (aus `BelegDetail`, Task 2) erst in Task 7 definiert wird. Um Task 2+3 isoliert testbar zu machen, definiere **hier bereits** ein minimales `Zahlung`-Struct (wird in Task 7 um Funktionen ergänzt, nicht verändert):

```rust
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Zahlung {
    pub id: String,
    pub rechnung_id: String,
    pub datum: String,
    pub betrag_cent: i64,
    pub notiz: String,
}
```

- [ ] **Step 4: Modul in `lib.rs` registrieren** — `src-tauri/src/lib.rs`, im `invoke_handler`-Makro die bestehende Liste erweitern (nach den `commands::einstellungen::*`-Einträgen):

```rust
            commands::belege::beleg_list,
            commands::belege::beleg_get,
            commands::belege::beleg_create,
            commands::belege::beleg_update,
            commands::belege::beleg_delete,
            commands::belege::belegposition_save,
            commands::belege::belegposition_delete
```

- [ ] **Step 5: Tests grün** — Run: `cd src-tauri && cargo test` → PASS (alle bisherigen + Beleg-Tests).

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: Belegposition-CRUD mit automatischer Preisfindung"`

---

### Task 4: Beleg stellen & Angebotsstatus

**Files:**
- Modify: `src-tauri/src/commands/belege.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `commands::kunden::get`, `commands::firma::get`, `domain::nummernkreis::naechste_nummer`
- Produces: `stellen(pool, id) -> AppResult<Beleg>`, `setze_angebot_status(pool, id, status) -> AppResult<Beleg>`; Tauri-Commands `beleg_stellen`, `angebot_status_setzen`

- [ ] **Step 1: Failing Tests** — ergänzen:

```rust
    #[tokio::test]
    async fn stellen_vergibt_nummer_und_friert_beleg_ein() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        let gestellt = stellen(&pool, beleg.id).await.unwrap();
        assert_eq!(gestellt.status, "versendet");
        let jahr = chrono::Utc::now().format("%Y").to_string();
        assert_eq!(gestellt.nummer, Some(format!("AN-{jahr}-0001")));
        let err = update(&pool, BelegUpdate {
            id: gestellt.id.clone(), kunde_id, datum: gestellt.datum.clone(),
            leistungsdatum: gestellt.leistungsdatum.clone(), zahlungsziel_tage: 14,
            kopftext: "".into(), fusstext: "".into(),
        }).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }), "gestellter Beleg darf nicht mehr editierbar sein");
    }

    #[tokio::test]
    async fn stellen_ohne_position_wird_abgelehnt() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        let err = stellen(&pool, beleg.id).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn rechnung_stellen_setzt_status_gestellt() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        let gestellt = stellen(&pool, beleg.id).await.unwrap();
        assert_eq!(gestellt.status, "gestellt");
    }

    #[tokio::test]
    async fn angebot_status_setzen_erlaubt_nur_nach_versendet() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        let err = setze_angebot_status(&pool, beleg.id, "angenommen".into()).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn angebot_status_setzen_akzeptiert_gueltigen_status() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        let gestellt = stellen(&pool, beleg.id).await.unwrap();
        let aktualisiert = setze_angebot_status(&pool, gestellt.id, "angenommen".into()).await.unwrap();
        assert_eq!(aktualisiert.status, "angenommen");
    }

    #[tokio::test]
    async fn angebot_status_setzen_lehnt_unbekannten_status_ab() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        let gestellt = stellen(&pool, beleg.id).await.unwrap();
        let err = setze_angebot_status(&pool, gestellt.id, "storniert".into()).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }
```

- [ ] **Step 2: Tests schlagen fehl** — Run: `cd src-tauri && cargo test belege::` → FAIL.

- [ ] **Step 3: Implementierung** — ergänzen in `belege.rs`:

```rust
fn kunde_snapshot_json(
    kunde: &crate::commands::kunden::Kunde,
    adresse: Option<&crate::commands::kunden::Adresse>,
    firma: &crate::commands::firma::Firma,
) -> String {
    serde_json::json!({
        "kunde": { "name": kunde.name, "kundennummer": kunde.kundennummer, "ust_idnr": kunde.ust_idnr },
        "adresse": adresse.map(|a| serde_json::json!({
            "strasse": a.strasse, "plz": a.plz, "ort": a.ort, "land": a.land,
        })),
        "firma": { "name": firma.name, "strasse": firma.strasse, "plz": firma.plz, "ort": firma.ort,
            "steuernummer": firma.steuernummer, "ust_idnr": firma.ust_idnr, "iban": firma.iban, "bic": firma.bic },
    }).to_string()
}

pub async fn stellen(pool: &SqlitePool, id: String) -> AppResult<Beleg> {
    let beleg = lade_beleg(pool, &id).await?;
    pruefe_ist_entwurf(&beleg)?;
    let anzahl_positionen: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM belegposition WHERE beleg_id = ? AND deleted_at IS NULL")
        .bind(&id).fetch_one(pool).await?;
    if anzahl_positionen.0 == 0 {
        return Err(AppError::Validation { feld: "positionen".into(), meldung: "Beleg benötigt mindestens eine Position".into() });
    }

    let kunde = crate::commands::kunden::get(pool, beleg.kunde_id.clone()).await?;
    let standardadresse = kunde.adressen.iter().find(|a| a.typ == "rechnung" && a.ist_standard);
    let firma = crate::commands::firma::get(pool).await?;
    let snapshot = kunde_snapshot_json(&kunde.kunde, standardadresse, &firma);

    let nummer = naechste_nummer(pool, &beleg.typ).await?;
    let neuer_status = if beleg.typ == "angebot" { "versendet" } else { "gestellt" };
    sqlx::query("UPDATE beleg SET nummer=?, status=?, kunde_snapshot=?, updated_at=? WHERE id=?")
        .bind(&nummer).bind(neuer_status).bind(&snapshot).bind(jetzt()).bind(&id)
        .execute(pool).await?;
    lade_beleg(pool, &id).await
}

const ANGEBOT_ABSCHLUSS_STATUS: [&str; 3] = ["angenommen", "abgelehnt", "abgelaufen"];

pub async fn setze_angebot_status(pool: &SqlitePool, id: String, status: String) -> AppResult<Beleg> {
    let beleg = lade_beleg(pool, &id).await?;
    if beleg.typ != "angebot" {
        return Err(AppError::Validation { feld: "typ".into(), meldung: "Nur Angebote haben diesen Status".into() });
    }
    if beleg.status != "versendet" {
        return Err(AppError::Validation { feld: "status".into(), meldung: "Nur versendete Angebote können einen Abschlussstatus erhalten".into() });
    }
    if !ANGEBOT_ABSCHLUSS_STATUS.contains(&status.as_str()) {
        return Err(AppError::Validation { feld: "status".into(), meldung: "Ungültiger Angebotsstatus".into() });
    }
    sqlx::query("UPDATE beleg SET status=?, updated_at=? WHERE id=?")
        .bind(&status).bind(jetzt()).bind(&id).execute(pool).await?;
    lade_beleg(pool, &id).await
}

// Dünne Tauri-Wrapper (ergänzen die aus Task 2/3)
#[tauri::command]
pub async fn beleg_stellen(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<Beleg> {
    stellen(&pool, id).await
}
#[tauri::command]
pub async fn angebot_status_setzen(pool: tauri::State<'_, SqlitePool>, id: String, status: String) -> AppResult<Beleg> {
    setze_angebot_status(&pool, id, status).await
}
```

Nummernkreis "naechste_nummer" wird mit `&beleg.typ` aufgerufen — die Werte `"angebot"`/`"rechnung"` entsprechen exakt den in Plan 1 geseedeten `art`-Spalten (`AN-{JJJJ}-{lfd:4}` bzw. `RE-{JJJJ}-{lfd:4}`), keine weitere Zuordnung nötig.

- [ ] **Step 4: `lib.rs` erweitern**:

```rust
            commands::belege::beleg_stellen,
            commands::belege::angebot_status_setzen
```

- [ ] **Step 5: Tests grün** — Run: `cd src-tauri && cargo test` → PASS.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: Beleg stellen mit Nummernvergabe und Angebotsstatus"`

---

### Task 5: Angebot → Rechnung überführen

**Files:**
- Modify: `src-tauri/src/commands/belege.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `angebot_ueberfuehren(pool, angebot_id) -> AppResult<Beleg>`; Tauri-Command `angebot_in_rechnung_ueberfuehren`

- [ ] **Step 1: Failing Tests** — ergänzen:

```rust
    #[tokio::test]
    async fn angebot_ueberfuehrung_kopiert_positionen_und_summe() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let angebot = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: angebot.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 2000,
        }).await.unwrap();
        let gestellt = stellen(&pool, angebot.id).await.unwrap();

        let rechnung = angebot_ueberfuehren(&pool, gestellt.id.clone()).await.unwrap();
        assert_eq!(rechnung.typ, "rechnung");
        assert_eq!(rechnung.status, "entwurf");
        assert_eq!(rechnung.summe_cent, 10000);
        assert_eq!(rechnung.ursprungsangebot_id, Some(gestellt.id));

        let detail = get(&pool, rechnung.id).await.unwrap();
        assert_eq!(detail.positionen.len(), 1);
        assert_eq!(detail.positionen[0].positionssumme_cent, 10000);
    }

    #[tokio::test]
    async fn ueberfuehrung_lehnt_entwurfs_angebot_ab() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let angebot = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        let err = angebot_ueberfuehren(&pool, angebot.id).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn ueberfuehrung_lehnt_rechnung_als_quelle_ab() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let rechnung = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        let err = angebot_ueberfuehren(&pool, rechnung.id).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }
```

- [ ] **Step 2: Tests schlagen fehl** — Run: `cd src-tauri && cargo test belege::` → FAIL.

- [ ] **Step 3: Implementierung** — ergänzen in `belege.rs`:

```rust
pub async fn angebot_ueberfuehren(pool: &SqlitePool, angebot_id: String) -> AppResult<Beleg> {
    let angebot = lade_beleg(pool, &angebot_id).await?;
    if angebot.typ != "angebot" {
        return Err(AppError::Validation { feld: "typ".into(), meldung: "Nur Angebote können in Rechnungen überführt werden".into() });
    }
    if !["versendet", "angenommen"].contains(&angebot.status.as_str()) {
        return Err(AppError::Validation { feld: "status".into(), meldung: "Nur versendete oder angenommene Angebote können überführt werden".into() });
    }

    let heute = jetzt()[..10].to_string();
    let rechnung = Beleg {
        id: Uuid::new_v4().to_string(), typ: "rechnung".into(), nummer: None, status: "entwurf".into(),
        kunde_id: angebot.kunde_id.clone(), datum: heute, leistungsdatum: angebot.leistungsdatum.clone(),
        zahlungsziel_tage: angebot.zahlungsziel_tage, kopftext: angebot.kopftext.clone(), fusstext: angebot.fusstext.clone(),
        summe_cent: angebot.summe_cent, ursprungsangebot_id: Some(angebot.id.clone()), storno_von_id: None,
    };
    sqlx::query("INSERT INTO beleg (id, typ, nummer, status, kunde_id, datum, leistungsdatum, zahlungsziel_tage, kopftext, fusstext, summe_cent, ursprungsangebot_id, storno_von_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(&rechnung.id).bind(&rechnung.typ).bind(&rechnung.nummer).bind(&rechnung.status).bind(&rechnung.kunde_id)
        .bind(&rechnung.datum).bind(&rechnung.leistungsdatum).bind(rechnung.zahlungsziel_tage)
        .bind(&rechnung.kopftext).bind(&rechnung.fusstext).bind(rechnung.summe_cent)
        .bind(&rechnung.ursprungsangebot_id).bind(&rechnung.storno_von_id).bind(jetzt()).bind(jetzt())
        .execute(pool).await?;

    let positionen: Vec<Belegposition> = sqlx::query_as(
        "SELECT id, beleg_id, artikel_id, bezeichnung, einheit_kuerzel, einzelpreis_cent, menge, positionssumme_cent, reihenfolge \
         FROM belegposition WHERE beleg_id = ? AND deleted_at IS NULL ORDER BY reihenfolge")
        .bind(&angebot_id).fetch_all(pool).await?;
    for pos in positionen {
        sqlx::query("INSERT INTO belegposition (id, beleg_id, artikel_id, bezeichnung, einheit_kuerzel, einzelpreis_cent, menge, positionssumme_cent, reihenfolge, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
            .bind(Uuid::new_v4().to_string()).bind(&rechnung.id).bind(&pos.artikel_id).bind(&pos.bezeichnung)
            .bind(&pos.einheit_kuerzel).bind(pos.einzelpreis_cent).bind(pos.menge)
            .bind(pos.positionssumme_cent).bind(pos.reihenfolge).bind(jetzt()).bind(jetzt())
            .execute(pool).await?;
    }
    Ok(rechnung)
}

// Dünner Tauri-Wrapper (ergänzt die aus Task 2/3/4)
#[tauri::command]
pub async fn angebot_in_rechnung_ueberfuehren(pool: tauri::State<'_, SqlitePool>, angebot_id: String) -> AppResult<Beleg> {
    angebot_ueberfuehren(&pool, angebot_id).await
}
```

`jetzt()[..10]` schneidet die ersten 10 Zeichen des ISO-8601-Zeitstempels (`YYYY-MM-DD`) ab — sicher, da das Format ausschließlich aus ASCII-Ziffern und `-`/`T`/`Z` besteht.

- [ ] **Step 4: `lib.rs` erweitern**:

```rust
            commands::belege::angebot_in_rechnung_ueberfuehren
```

- [ ] **Step 5: Tests grün** — Run: `cd src-tauri && cargo test` → PASS.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: Angebot in Rechnung überführen"`

---

### Task 6: Rechnung stornieren

**Files:**
- Modify: `src-tauri/src/commands/belege.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `storniere_rechnung(pool, id) -> AppResult<Beleg>`; Tauri-Command `rechnung_stornieren`

- [ ] **Step 1: Failing Tests** — ergänzen:

```rust
    #[tokio::test]
    async fn storno_erzeugt_gegenbeleg_und_markiert_ursprung() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let rechnung = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: rechnung.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        let gestellt = stellen(&pool, rechnung.id).await.unwrap();

        let storno = storniere_rechnung(&pool, gestellt.id.clone()).await.unwrap();
        assert_eq!(storno.summe_cent, -5000);
        assert_eq!(storno.storno_von_id, Some(gestellt.id.clone()));
        assert_ne!(storno.nummer, gestellt.nummer);

        let ursprung = get(&pool, gestellt.id).await.unwrap().beleg;
        assert_eq!(ursprung.status, "storniert");

        let storno_detail = get(&pool, storno.id).await.unwrap();
        assert_eq!(storno_detail.positionen[0].positionssumme_cent, -5000);
    }

    #[tokio::test]
    async fn storno_lehnt_entwurf_und_doppelstorno_ab() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let rechnung = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        let err = storniere_rechnung(&pool, rechnung.id.clone()).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn storno_lehnt_angebot_ab() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let angebot = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        let err = storniere_rechnung(&pool, angebot.id).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }
```

- [ ] **Step 2: Tests schlagen fehl** — Run: `cd src-tauri && cargo test belege::` → FAIL.

- [ ] **Step 3: Implementierung** — ergänzen in `belege.rs`:

```rust
pub async fn storniere_rechnung(pool: &SqlitePool, id: String) -> AppResult<Beleg> {
    let rechnung = lade_beleg(pool, &id).await?;
    if rechnung.typ != "rechnung" {
        return Err(AppError::Validation { feld: "typ".into(), meldung: "Nur Rechnungen können storniert werden".into() });
    }
    if rechnung.status != "gestellt" {
        return Err(AppError::Validation { feld: "status".into(), meldung: "Nur gestellte Rechnungen können storniert werden".into() });
    }

    let heute = jetzt()[..10].to_string();
    let nummer = naechste_nummer(pool, "rechnung").await?;
    let snapshot: (String,) = sqlx::query_as("SELECT kunde_snapshot FROM beleg WHERE id = ?")
        .bind(&rechnung.id).fetch_one(pool).await?;
    let storno = Beleg {
        id: Uuid::new_v4().to_string(), typ: "rechnung".into(), nummer: Some(nummer), status: "gestellt".into(),
        kunde_id: rechnung.kunde_id.clone(), datum: heute, leistungsdatum: rechnung.leistungsdatum.clone(),
        zahlungsziel_tage: rechnung.zahlungsziel_tage, kopftext: rechnung.kopftext.clone(),
        fusstext: format!("Stornierung zu Rechnung {}", rechnung.nummer.clone().unwrap_or_default()),
        summe_cent: -rechnung.summe_cent, ursprungsangebot_id: None, storno_von_id: Some(rechnung.id.clone()),
    };
    sqlx::query("INSERT INTO beleg (id, typ, nummer, status, kunde_id, datum, leistungsdatum, zahlungsziel_tage, kopftext, fusstext, summe_cent, ursprungsangebot_id, storno_von_id, kunde_snapshot, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(&storno.id).bind(&storno.typ).bind(&storno.nummer).bind(&storno.status).bind(&storno.kunde_id)
        .bind(&storno.datum).bind(&storno.leistungsdatum).bind(storno.zahlungsziel_tage)
        .bind(&storno.kopftext).bind(&storno.fusstext).bind(storno.summe_cent)
        .bind(&storno.ursprungsangebot_id).bind(&storno.storno_von_id).bind(&snapshot.0).bind(jetzt()).bind(jetzt())
        .execute(pool).await?;

    let positionen: Vec<Belegposition> = sqlx::query_as(
        "SELECT id, beleg_id, artikel_id, bezeichnung, einheit_kuerzel, einzelpreis_cent, menge, positionssumme_cent, reihenfolge \
         FROM belegposition WHERE beleg_id = ? AND deleted_at IS NULL ORDER BY reihenfolge")
        .bind(&id).fetch_all(pool).await?;
    for pos in positionen {
        sqlx::query("INSERT INTO belegposition (id, beleg_id, artikel_id, bezeichnung, einheit_kuerzel, einzelpreis_cent, menge, positionssumme_cent, reihenfolge, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
            .bind(Uuid::new_v4().to_string()).bind(&storno.id).bind(&pos.artikel_id).bind(&pos.bezeichnung)
            .bind(&pos.einheit_kuerzel).bind(-pos.einzelpreis_cent).bind(pos.menge)
            .bind(-pos.positionssumme_cent).bind(pos.reihenfolge).bind(jetzt()).bind(jetzt())
            .execute(pool).await?;
    }

    sqlx::query("UPDATE beleg SET status = 'storniert', updated_at = ? WHERE id = ?")
        .bind(jetzt()).bind(&id).execute(pool).await?;

    Ok(storno)
}

// Dünner Tauri-Wrapper (ergänzt die aus Task 2/3/4/5)
#[tauri::command]
pub async fn rechnung_stornieren(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<Beleg> {
    storniere_rechnung(&pool, id).await
}
```

Stornopositionen negieren `einzelpreis_cent` und `positionssumme_cent` direkt (die `menge` bleibt positiv) und werden per direktem `INSERT` angelegt — sie durchlaufen bewusst nicht `position_speichern`, dessen Validierung (`einzelpreis_cent < 0` wird abgelehnt) für reguläre Positionen gilt, nicht für automatisch erzeugte Korrekturpositionen eines Stornobelegs.

- [ ] **Step 4: `lib.rs` erweitern**:

```rust
            commands::belege::rechnung_stornieren
```

- [ ] **Step 5: Tests grün** — Run: `cd src-tauri && cargo test` → PASS.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: Rechnungsstorno mit Gegenbeleg"`

---

### Task 7: Zahlungserfassung & offene Posten

**Files:**
- Modify: `src-tauri/src/commands/belege.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: Struct `ZahlungNeu`, `OffenerPosten`; `erfasse_zahlung`, `zahlung_loeschen`, `offene_posten`; Tauri-Commands `zahlung_erfassen`, `zahlung_delete`, `offene_posten_list`

- [ ] **Step 1: Failing Tests** — ergänzen:

```rust
    #[tokio::test]
    async fn zahlung_erfassen_und_offener_betrag_sinkt() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 10000).await;
        let rechnung = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: rechnung.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        let gestellt = stellen(&pool, rechnung.id).await.unwrap();

        erfasse_zahlung(&pool, ZahlungNeu {
            rechnung_id: gestellt.id.clone(), datum: "2026-07-10".into(), betrag_cent: 6000, notiz: "Anzahlung".into(),
        }).await.unwrap();
        let detail = get(&pool, gestellt.id.clone()).await.unwrap();
        assert_eq!(detail.bezahlt_cent, 6000);
        assert_eq!(detail.offener_betrag_cent, 4000);

        erfasse_zahlung(&pool, ZahlungNeu {
            rechnung_id: gestellt.id.clone(), datum: "2026-07-15".into(), betrag_cent: 4000, notiz: "".into(),
        }).await.unwrap();
        let detail2 = get(&pool, gestellt.id).await.unwrap();
        assert_eq!(detail2.offener_betrag_cent, 0);
    }

    #[tokio::test]
    async fn zahlung_lehnt_entwurfsrechnung_ab() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let rechnung = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        let err = erfasse_zahlung(&pool, ZahlungNeu {
            rechnung_id: rechnung.id, datum: "2026-07-10".into(), betrag_cent: 100, notiz: "".into(),
        }).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn erstattung_als_negative_zahlung_erhoeht_offenen_betrag() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 10000).await;
        let rechnung = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: rechnung.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        let gestellt = stellen(&pool, rechnung.id).await.unwrap();
        erfasse_zahlung(&pool, ZahlungNeu {
            rechnung_id: gestellt.id.clone(), datum: "2026-07-10".into(), betrag_cent: 10000, notiz: "".into(),
        }).await.unwrap();
        storniere_rechnung(&pool, gestellt.id.clone()).await.unwrap();
        erfasse_zahlung(&pool, ZahlungNeu {
            rechnung_id: gestellt.id.clone(), datum: "2026-07-20".into(), betrag_cent: -10000, notiz: "Rückzahlung nach Storno".into(),
        }).await.unwrap();
        let detail = get(&pool, gestellt.id).await.unwrap();
        assert_eq!(detail.bezahlt_cent, 0);
    }

    #[tokio::test]
    async fn offene_posten_listet_nur_unvollstaendig_bezahlte_rechnungen() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 10000).await;

        let bezahlt_beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: bezahlt_beleg.id.clone(), artikel_id: Some(artikel_id.clone()),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        let bezahlt_gestellt = stellen(&pool, bezahlt_beleg.id).await.unwrap();
        erfasse_zahlung(&pool, ZahlungNeu {
            rechnung_id: bezahlt_gestellt.id.clone(), datum: "2026-07-10".into(), betrag_cent: 10000, notiz: "".into(),
        }).await.unwrap();

        let offen_beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: offen_beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        let offen_gestellt = stellen(&pool, offen_beleg.id).await.unwrap();

        let posten = offene_posten(&pool).await.unwrap();
        assert_eq!(posten.len(), 1);
        assert_eq!(posten[0].beleg.id, offen_gestellt.id);
        assert_eq!(posten[0].offener_betrag_cent, 10000);
    }
```

- [ ] **Step 2: Tests schlagen fehl** — Run: `cd src-tauri && cargo test belege::` → FAIL.

- [ ] **Step 3: Implementierung** — ergänzen in `belege.rs`:

```rust
#[derive(Debug, Deserialize)]
pub struct ZahlungNeu {
    pub rechnung_id: String,
    pub datum: String,
    pub betrag_cent: i64,
    pub notiz: String,
}

#[derive(Debug, Serialize)]
pub struct OffenerPosten {
    pub beleg: Beleg,
    pub offener_betrag_cent: i64,
}

pub async fn erfasse_zahlung(pool: &SqlitePool, d: ZahlungNeu) -> AppResult<Zahlung> {
    let rechnung = lade_beleg(pool, &d.rechnung_id).await?;
    if rechnung.typ != "rechnung" {
        return Err(AppError::Validation { feld: "rechnung_id".into(), meldung: "Zahlungen sind nur zu Rechnungen möglich".into() });
    }
    if !["gestellt", "storniert"].contains(&rechnung.status.as_str()) {
        return Err(AppError::Validation { feld: "rechnung_id".into(), meldung: "Zahlungen sind nur zu gestellten oder stornierten Rechnungen möglich".into() });
    }
    if d.datum.trim().is_empty() {
        return Err(AppError::Validation { feld: "datum".into(), meldung: "Datum darf nicht leer sein".into() });
    }
    if d.betrag_cent == 0 {
        return Err(AppError::Validation { feld: "betrag_cent".into(), meldung: "Betrag darf nicht 0 sein".into() });
    }
    let zahlung = Zahlung {
        id: Uuid::new_v4().to_string(), rechnung_id: d.rechnung_id, datum: d.datum,
        betrag_cent: d.betrag_cent, notiz: d.notiz,
    };
    sqlx::query("INSERT INTO zahlung (id, rechnung_id, datum, betrag_cent, notiz, created_at, updated_at) VALUES (?,?,?,?,?,?,?)")
        .bind(&zahlung.id).bind(&zahlung.rechnung_id).bind(&zahlung.datum).bind(zahlung.betrag_cent)
        .bind(&zahlung.notiz).bind(jetzt()).bind(jetzt())
        .execute(pool).await?;
    Ok(zahlung)
}

pub async fn zahlung_loeschen(pool: &SqlitePool, id: String) -> AppResult<()> {
    let r = sqlx::query("UPDATE zahlung SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(jetzt()).bind(&id).execute(pool).await?;
    if r.rows_affected() == 0 { return Err(AppError::NichtGefunden); }
    Ok(())
}

pub async fn offene_posten(pool: &SqlitePool) -> AppResult<Vec<OffenerPosten>> {
    let sql = format!("SELECT {BELEG_SPALTEN} FROM beleg WHERE deleted_at IS NULL AND typ = 'rechnung' AND status = 'gestellt' ORDER BY datum");
    let rechnungen: Vec<Beleg> = sqlx::query_as(&sql).fetch_all(pool).await?;
    let mut ergebnis = Vec::new();
    for rechnung in rechnungen {
        let bezahlt: (Option<i64>,) = sqlx::query_as(
            "SELECT SUM(betrag_cent) FROM zahlung WHERE rechnung_id = ? AND deleted_at IS NULL")
            .bind(&rechnung.id).fetch_one(pool).await?;
        let offener_betrag_cent = rechnung.summe_cent - bezahlt.0.unwrap_or(0);
        if offener_betrag_cent != 0 {
            ergebnis.push(OffenerPosten { beleg: rechnung, offener_betrag_cent });
        }
    }
    Ok(ergebnis)
}

// Dünne Tauri-Wrapper (ergänzen die aus Task 2/3/4/5/6)
#[tauri::command]
pub async fn zahlung_erfassen(pool: tauri::State<'_, SqlitePool>, daten: ZahlungNeu) -> AppResult<Zahlung> {
    erfasse_zahlung(&pool, daten).await
}
#[tauri::command]
pub async fn zahlung_delete(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<()> {
    zahlung_loeschen(&pool, id).await
}
#[tauri::command]
pub async fn offene_posten_list(pool: tauri::State<'_, SqlitePool>) -> AppResult<Vec<OffenerPosten>> {
    offene_posten(&pool).await
}
```

- [ ] **Step 4: `lib.rs` erweitern**:

```rust
            commands::belege::zahlung_erfassen,
            commands::belege::zahlung_delete,
            commands::belege::offene_posten_list
```

- [ ] **Step 5: Voller Testlauf** — Run: `cd src-tauri && cargo test` → PASS (alle Rust-Tests dieses Plans + Plan 1 grün).

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: Zahlungserfassung und offene Posten"`

---

### Task 8: Frontend-Fundament erweitern (api.ts, i18n, geld.ts)

**Files:**
- Modify: `src/api.ts`, `src/i18n.ts`, `src/geld.ts`
- Test: `src/geld.test.ts` (erweitern), `src/api.test.ts` (erweitern)

**Interfaces:**
- Produces: TS-Typen `Beleg`, `BelegNeu`, `BelegUpdate`, `Belegposition`, `BelegpositionNeu`, `BelegDetail`, `Zahlung`, `ZahlungNeu`, `OffenerPosten`; `api.belege.*`; `parseMenge`, `formatMenge`; i18n-Keys `nav.angebote`, `nav.rechnungen`

- [ ] **Step 1: Failing Tests** — ergänzen in `src/geld.test.ts`:

```typescript
import { formatCent, formatMenge, parseEuro, parseMenge } from "./geld";

describe("parseMenge", () => {
  it("parst ganze und Komma-Mengen", () => {
    expect(parseMenge("2")).toBe(2000);
    expect(parseMenge("2,5")).toBe(2500);
    expect(parseMenge("1,333")).toBe(1333);
  });
  it("lehnt ungültige Eingaben ab", () => {
    expect(parseMenge("")).toBeNull();
    expect(parseMenge("abc")).toBeNull();
    expect(parseMenge("1,2345")).toBeNull();
  });
});

describe("formatMenge", () => {
  it("formatiert Tausendstel als deutsche Dezimalzahl", () => {
    expect(formatMenge(2500)).toBe("2,5");
    expect(formatMenge(1000)).toBe("1");
    expect(formatMenge(1333)).toBe("1,333");
  });
});
```

Ergänze außerdem in `src/api.test.ts` (im bestehenden `describe("api", ...)`-Block):

```typescript
  it("ruft beleg_list per invoke auf", async () => {
    await api.belege.list();
    expect(invoke).toHaveBeenCalledWith("beleg_list", { typ: null, status: null });
  });
```

- [ ] **Step 2: Tests schlagen fehl** — Run: `npm test` → FAIL (`parseMenge`/`formatMenge`/`api.belege` existieren nicht).

- [ ] **Step 3: `geld.ts` erweitern**:

```typescript
/**
 * Parst eine deutsch formatierte Mengenangabe ("2,5", "10", "1,333") in
 * Tausendstel (Faktor 1000) als ganzzahligen Wert. Gibt `null` zurück bei
 * ungültiger Eingabe (leer, nicht-numerisch, mehr als drei Nachkommastellen).
 */
export function parseMenge(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") {
    return null;
  }
  const muster = /^\d+(,\d{1,3})?$/;
  if (!muster.test(trimmed)) {
    return null;
  }
  const [ganzzahlTeil, nachkommaRoh] = trimmed.split(",");
  const nachkomma = (nachkommaRoh ?? "").padEnd(3, "0");
  return parseInt(ganzzahlTeil, 10) * 1000 + parseInt(nachkomma, 10);
}

/**
 * Formatiert eine Menge mit Faktor 1000 als deutsche Dezimalzahl, z. B.
 * 2500 -> "2,5", 1000 -> "1".
 */
export function formatMenge(mengeX1000: number): string {
  return (mengeX1000 / 1000).toLocaleString("de-DE", { maximumFractionDigits: 3 });
}
```

- [ ] **Step 4: `api.ts` erweitern** — Typen ergänzen (nach `Nummernkreis`):

```typescript
export interface Beleg {
  id: string;
  typ: "angebot" | "rechnung";
  nummer: string | null;
  status: string;
  kunde_id: string;
  datum: string;
  leistungsdatum: string;
  zahlungsziel_tage: number;
  kopftext: string;
  fusstext: string;
  summe_cent: number;
  ursprungsangebot_id: string | null;
  storno_von_id: string | null;
}
export type BelegNeu = Pick<
  Beleg,
  "typ" | "kunde_id" | "datum" | "leistungsdatum" | "zahlungsziel_tage" | "kopftext" | "fusstext"
>;
export interface BelegUpdate {
  id: string;
  kunde_id: string;
  datum: string;
  leistungsdatum: string;
  zahlungsziel_tage: number;
  kopftext: string;
  fusstext: string;
}
export interface Belegposition {
  id: string;
  beleg_id: string;
  artikel_id: string | null;
  bezeichnung: string;
  einheit_kuerzel: string;
  einzelpreis_cent: number;
  menge: number;
  positionssumme_cent: number;
  reihenfolge: number;
}
export interface BelegpositionNeu {
  id: string;
  beleg_id: string;
  artikel_id: string | null;
  bezeichnung: string;
  einheit_kuerzel: string;
  einzelpreis_cent: number | null;
  menge: number;
}
export interface Zahlung {
  id: string;
  rechnung_id: string;
  datum: string;
  betrag_cent: number;
  notiz: string;
}
export type ZahlungNeu = Omit<Zahlung, "id">;
export interface BelegDetail {
  beleg: Beleg;
  positionen: Belegposition[];
  zahlungen: Zahlung[];
  bezahlt_cent: number;
  offener_betrag_cent: number;
}
export interface OffenerPosten {
  beleg: Beleg;
  offener_betrag_cent: number;
}
```

Ergänze das `api`-Objekt um den Namensraum `belege` (nach `einstellungen`):

```typescript
  belege: {
    list: (typ?: "angebot" | "rechnung", status?: string) =>
      invoke<Beleg[]>("beleg_list", { typ: typ ?? null, status: status ?? null }),
    get: (id: string) => invoke<BelegDetail>("beleg_get", { id }),
    create: (daten: BelegNeu) => invoke<Beleg>("beleg_create", { daten }),
    update: (daten: BelegUpdate) => invoke<Beleg>("beleg_update", { daten }),
    delete: (id: string) => invoke<void>("beleg_delete", { id }),
    positionSave: (position: BelegpositionNeu) => invoke<Belegposition>("belegposition_save", { position }),
    positionDelete: (id: string) => invoke<void>("belegposition_delete", { id }),
    stellen: (id: string) => invoke<Beleg>("beleg_stellen", { id }),
    angebotStatusSetzen: (id: string, status: string) => invoke<Beleg>("angebot_status_setzen", { id, status }),
    angebotInRechnungUeberfuehren: (angebotId: string) =>
      invoke<Beleg>("angebot_in_rechnung_ueberfuehren", { angebot_id: angebotId }),
    rechnungStornieren: (id: string) => invoke<Beleg>("rechnung_stornieren", { id }),
    zahlungErfassen: (daten: ZahlungNeu) => invoke<Zahlung>("zahlung_erfassen", { daten }),
    zahlungDelete: (id: string) => invoke<void>("zahlung_delete", { id }),
    offenePosten: () => invoke<OffenerPosten[]>("offene_posten_list"),
  },
```

- [ ] **Step 5: `i18n.ts` erweitern** — im `translations`-Objekt ergänzen:

```typescript
  "nav.angebote": "Angebote",
  "nav.rechnungen": "Rechnungen",
```

- [ ] **Step 6: Tests grün** — Run: `npm test` → PASS. `npm run build` → kompiliert.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: Frontend-API und Menge-Helfer für Belege"`

---

### Task 9: BelegEditor-Komponente (gemeinsam für Angebot/Rechnung)

**Files:**
- Create: `src/pages/BelegEditor.tsx`
- Test: `src/pages/BelegEditor.test.tsx`

**Interfaces:**
- Consumes: `api.belege.*`, `api.kunden.list`, `api.artikel.list`, `parseEuro`/`formatCent`/`parseMenge`/`formatMenge`
- Produces: `BelegEditor({ id, onGeaendert? })` — lädt einen `BelegDetail`, zeigt Stammdaten, Positionen, Statuswechsel-Aktionen und (für Rechnungen) Zahlungen

- [ ] **Step 1: Failing Test** — `src/pages/BelegEditor.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  api: {
    belege: {
      get: vi.fn().mockResolvedValue({
        beleg: {
          id: "b1", typ: "angebot", nummer: null, status: "entwurf", kunde_id: "k1",
          datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
          kopftext: "", fusstext: "", summe_cent: 0, ursprungsangebot_id: null, storno_von_id: null,
        },
        positionen: [],
        zahlungen: [],
        bezahlt_cent: 0,
        offener_betrag_cent: 0,
      }),
    },
    kunden: { list: vi.fn().mockResolvedValue([]) },
    artikel: { list: vi.fn().mockResolvedValue([]) },
  },
}));
import { BelegEditor } from "./BelegEditor";

describe("BelegEditor", () => {
  it("zeigt Status eines Entwurfs und deaktiviert Stellen ohne Positionen", async () => {
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("Status: entwurf")).toBeTruthy());
    const stellenButton = screen.getByRole("button", { name: "Stellen" });
    expect(stellenButton).toBeDisabled();
  });
});
```

- [ ] **Step 2: FAIL verifizieren** — `npm test` → FAIL (`BelegEditor.tsx` fehlt).

- [ ] **Step 3: Implementierung** — `src/pages/BelegEditor.tsx`:

```tsx
import { useEffect, useState } from "react";
import {
  api,
  type AppFehler,
  type Artikel,
  type Beleg,
  type BelegDetail,
  type Belegposition,
  type Kunde,
  type Zahlung,
} from "../api";
import { Fehler } from "../components/Fehler";
import { formatCent, formatMenge, parseEuro, parseMenge } from "../geld";

interface BelegEditorProps {
  id: string;
  onGeaendert?: () => void;
}

const ANGEBOT_ABSCHLUSS_STATUS = [
  { wert: "angenommen", label: "Angenommen" },
  { wert: "abgelehnt", label: "Abgelehnt" },
  { wert: "abgelaufen", label: "Abgelaufen" },
];

/**
 * Editor für Angebote und Rechnungen — beide teilen sich Datenmodell,
 * Status-Workflow (Entwurf → gestellt) und Positions-Verwaltung, daher eine
 * gemeinsame Komponente statt zweier Kopien.
 */
export function BelegEditor({ id, onGeaendert }: BelegEditorProps) {
  const [detail, setDetail] = useState<BelegDetail | null>(null);
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [artikelListe, setArtikelListe] = useState<Artikel[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);

  function laden() {
    api.belege
      .get(id)
      .then((d) => {
        setDetail(d);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }

  useEffect(laden, [id]);
  useEffect(() => {
    api.kunden.list().then(setKunden).catch(() => {});
    api.artikel.list().then(setArtikelListe).catch(() => {});
  }, []);

  if (!detail) {
    return <main>{fehler && <Fehler fehler={fehler} />}</main>;
  }

  const { beleg, positionen, zahlungen, offener_betrag_cent } = detail;
  const istEntwurf = beleg.status === "entwurf";

  async function stammdatenSpeichern(felder: {
    datum: string;
    leistungsdatum: string;
    zahlungsziel_tage: number;
    kopftext: string;
    fusstext: string;
  }) {
    setFehler(null);
    try {
      await api.belege.update({ id: beleg.id, kunde_id: beleg.kunde_id, ...felder });
      laden();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function stellen() {
    setFehler(null);
    try {
      await api.belege.stellen(beleg.id);
      laden();
      onGeaendert?.();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function angebotStatus(status: string) {
    setFehler(null);
    try {
      await api.belege.angebotStatusSetzen(beleg.id, status);
      laden();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function inRechnungUeberfuehren() {
    setFehler(null);
    try {
      await api.belege.angebotInRechnungUeberfuehren(beleg.id);
      laden();
      onGeaendert?.();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function stornieren() {
    setFehler(null);
    try {
      await api.belege.rechnungStornieren(beleg.id);
      laden();
      onGeaendert?.();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function positionLoeschen(positionId: string) {
    setFehler(null);
    try {
      await api.belege.positionDelete(positionId);
      laden();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  return (
    <main>
      <h1>
        {beleg.typ === "angebot" ? "Angebot" : "Rechnung"} {beleg.nummer ?? "(Entwurf)"}
      </h1>
      <p>Status: {beleg.status}</p>
      {fehler && <Fehler fehler={fehler} />}

      <StammdatenAbschnitt
        beleg={beleg}
        kunden={kunden}
        bearbeitbar={istEntwurf}
        onSpeichern={stammdatenSpeichern}
      />

      <PositionenAbschnitt
        belegId={beleg.id}
        positionen={positionen}
        artikelListe={artikelListe}
        bearbeitbar={istEntwurf}
        onGeaendert={laden}
        onLoeschen={positionLoeschen}
      />

      <p>Summe: {formatCent(beleg.summe_cent)}</p>

      {istEntwurf && (
        <button type="button" disabled={positionen.length === 0} onClick={stellen}>
          Stellen
        </button>
      )}

      {beleg.typ === "angebot" && beleg.status === "versendet" && (
        <section>
          <h2>Abschluss</h2>
          {ANGEBOT_ABSCHLUSS_STATUS.map((s) => (
            <button key={s.wert} type="button" onClick={() => angebotStatus(s.wert)}>
              {s.label}
            </button>
          ))}
        </section>
      )}

      {beleg.typ === "angebot" && ["versendet", "angenommen"].includes(beleg.status) && (
        <button type="button" onClick={inRechnungUeberfuehren}>
          In Rechnung überführen
        </button>
      )}

      {beleg.typ === "rechnung" && beleg.status === "gestellt" && (
        <button type="button" onClick={stornieren}>
          Stornieren
        </button>
      )}
      {beleg.typ === "rechnung" && beleg.status === "storniert" && <p>Diese Rechnung wurde storniert.</p>}

      {beleg.typ === "rechnung" && ["gestellt", "storniert"].includes(beleg.status) && (
        <ZahlungenAbschnitt
          rechnungId={beleg.id}
          zahlungen={zahlungen}
          offenerBetragCent={offener_betrag_cent}
          onGeaendert={laden}
        />
      )}
    </main>
  );
}

interface StammdatenAbschnittProps {
  beleg: Beleg;
  kunden: Kunde[];
  bearbeitbar: boolean;
  onSpeichern: (felder: {
    datum: string;
    leistungsdatum: string;
    zahlungsziel_tage: number;
    kopftext: string;
    fusstext: string;
  }) => void;
}

function StammdatenAbschnitt({ beleg, kunden, bearbeitbar, onSpeichern }: StammdatenAbschnittProps) {
  const [datum, setDatum] = useState(beleg.datum);
  const [leistungsdatum, setLeistungsdatum] = useState(beleg.leistungsdatum);
  const [zahlungszielTage, setZahlungszielTage] = useState(beleg.zahlungsziel_tage);
  const [kopftext, setKopftext] = useState(beleg.kopftext);
  const [fusstext, setFusstext] = useState(beleg.fusstext);

  const kunde = kunden.find((k) => k.id === beleg.kunde_id);

  if (!bearbeitbar) {
    return (
      <section>
        <h2>Stammdaten</h2>
        <p>Kunde: {kunde?.name ?? beleg.kunde_id}</p>
        <p>Datum: {beleg.datum}</p>
        <p>Leistungsdatum: {beleg.leistungsdatum}</p>
        <p>Zahlungsziel: {beleg.zahlungsziel_tage} Tage</p>
      </section>
    );
  }

  return (
    <section>
      <h2>Stammdaten</h2>
      <p>Kunde: {kunde?.name ?? beleg.kunde_id}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSpeichern({ datum, leistungsdatum, zahlungsziel_tage: zahlungszielTage, kopftext, fusstext });
        }}
      >
        <label>
          Datum
          <input type="date" value={datum} onChange={(e) => setDatum(e.currentTarget.value)} />
        </label>
        <label>
          Leistungsdatum
          <input type="date" value={leistungsdatum} onChange={(e) => setLeistungsdatum(e.currentTarget.value)} />
        </label>
        <label>
          Zahlungsziel (Tage)
          <input
            type="number"
            value={zahlungszielTage}
            onChange={(e) => setZahlungszielTage(Number(e.currentTarget.value))}
          />
        </label>
        <label>
          Kopftext
          <textarea value={kopftext} onChange={(e) => setKopftext(e.currentTarget.value)} />
        </label>
        <label>
          Fußtext
          <textarea value={fusstext} onChange={(e) => setFusstext(e.currentTarget.value)} />
        </label>
        <button type="submit">Speichern</button>
      </form>
    </section>
  );
}

interface PositionenAbschnittProps {
  belegId: string;
  positionen: Belegposition[];
  artikelListe: Artikel[];
  bearbeitbar: boolean;
  onGeaendert: () => void;
  onLoeschen: (id: string) => void;
}

function PositionenAbschnitt({
  belegId,
  artikelListe,
  positionen,
  bearbeitbar,
  onGeaendert,
  onLoeschen,
}: PositionenAbschnittProps) {
  const [artikelId, setArtikelId] = useState("");
  const [freitext, setFreitext] = useState(false);
  const [bezeichnung, setBezeichnung] = useState("");
  const [einheitKuerzel, setEinheitKuerzel] = useState("");
  const [einzelpreis, setEinzelpreis] = useState("");
  const [menge, setMenge] = useState("1");
  const [fehler, setFehler] = useState<AppFehler | null>(null);

  async function hinzufuegen() {
    setFehler(null);
    const mengeX1000 = parseMenge(menge);
    if (mengeX1000 === null) {
      setFehler({ typ: "validation", feld: "menge", meldung: "Ungültige Menge" });
      return;
    }
    const einzelpreisCent = einzelpreis.trim() === "" ? null : parseEuro(einzelpreis);
    if (einzelpreis.trim() !== "" && einzelpreisCent === null) {
      setFehler({ typ: "validation", feld: "einzelpreis_cent", meldung: "Ungültiger Preis" });
      return;
    }
    try {
      await api.belege.positionSave({
        id: "",
        beleg_id: belegId,
        artikel_id: freitext ? null : artikelId || null,
        bezeichnung: freitext ? bezeichnung : "",
        einheit_kuerzel: freitext ? einheitKuerzel : "",
        einzelpreis_cent: einzelpreisCent,
        menge: mengeX1000,
      });
      setBezeichnung("");
      setEinheitKuerzel("");
      setEinzelpreis("");
      setMenge("1");
      setArtikelId("");
      onGeaendert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  return (
    <section>
      <h2>Positionen</h2>
      {fehler && <Fehler fehler={fehler} />}
      <table>
        <thead>
          <tr>
            <th>Bezeichnung</th>
            <th>Menge</th>
            <th>Einheit</th>
            <th>Einzelpreis</th>
            <th>Summe</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {positionen.map((p) => (
            <tr key={p.id}>
              <td>{p.bezeichnung}</td>
              <td>{formatMenge(p.menge)}</td>
              <td>{p.einheit_kuerzel}</td>
              <td>{formatCent(p.einzelpreis_cent)}</td>
              <td>{formatCent(p.positionssumme_cent)}</td>
              <td>
                {bearbeitbar && (
                  <button type="button" onClick={() => onLoeschen(p.id)}>
                    Löschen
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {bearbeitbar && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            hinzufuegen();
          }}
        >
          <label>
            <input type="checkbox" checked={freitext} onChange={(e) => setFreitext(e.currentTarget.checked)} />
            Freitextposition
          </label>
          {freitext ? (
            <>
              <label>
                Bezeichnung
                <input value={bezeichnung} onChange={(e) => setBezeichnung(e.currentTarget.value)} />
              </label>
              <label>
                Einheit
                <input value={einheitKuerzel} onChange={(e) => setEinheitKuerzel(e.currentTarget.value)} />
              </label>
              <label>
                Einzelpreis
                <input value={einzelpreis} onChange={(e) => setEinzelpreis(e.currentTarget.value)} placeholder="95,00" />
              </label>
            </>
          ) : (
            <>
              <label>
                Artikel
                <select value={artikelId} onChange={(e) => setArtikelId(e.currentTarget.value)}>
                  <option value="">– wählen –</option>
                  {artikelListe.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.bezeichnung}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Preis überschreiben (optional)
                <input value={einzelpreis} onChange={(e) => setEinzelpreis(e.currentTarget.value)} placeholder="automatisch" />
              </label>
            </>
          )}
          <label>
            Menge
            <input value={menge} onChange={(e) => setMenge(e.currentTarget.value)} />
          </label>
          <button type="submit">Position hinzufügen</button>
        </form>
      )}
    </section>
  );
}

interface ZahlungenAbschnittProps {
  rechnungId: string;
  zahlungen: Zahlung[];
  offenerBetragCent: number;
  onGeaendert: () => void;
}

function ZahlungenAbschnitt({ rechnungId, zahlungen, offenerBetragCent, onGeaendert }: ZahlungenAbschnittProps) {
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [betrag, setBetrag] = useState("");
  const [erstattung, setErstattung] = useState(false);
  const [notiz, setNotiz] = useState("");
  const [fehler, setFehler] = useState<AppFehler | null>(null);

  async function erfassen() {
    setFehler(null);
    const betragCent = parseEuro(betrag);
    if (betragCent === null) {
      setFehler({ typ: "validation", feld: "betrag_cent", meldung: "Ungültiger Betrag" });
      return;
    }
    try {
      await api.belege.zahlungErfassen({
        rechnung_id: rechnungId,
        datum,
        betrag_cent: erstattung ? -betragCent : betragCent,
        notiz,
      });
      setBetrag("");
      setNotiz("");
      onGeaendert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  return (
    <section>
      <h2>Zahlungen</h2>
      {fehler && <Fehler fehler={fehler} />}
      <p>Offener Betrag: {formatCent(offenerBetragCent)}</p>
      <table>
        <thead>
          <tr>
            <th>Datum</th>
            <th>Betrag</th>
            <th>Notiz</th>
          </tr>
        </thead>
        <tbody>
          {zahlungen.map((z) => (
            <tr key={z.id}>
              <td>{z.datum}</td>
              <td>{formatCent(z.betrag_cent)}</td>
              <td>{z.notiz}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          erfassen();
        }}
      >
        <label>
          Datum
          <input type="date" value={datum} onChange={(e) => setDatum(e.currentTarget.value)} />
        </label>
        <label>
          Betrag
          <input value={betrag} onChange={(e) => setBetrag(e.currentTarget.value)} placeholder="95,00" />
        </label>
        <label>
          <input type="checkbox" checked={erstattung} onChange={(e) => setErstattung(e.currentTarget.checked)} />
          Erstattung (negativer Betrag)
        </label>
        <label>
          Notiz
          <input value={notiz} onChange={(e) => setNotiz(e.currentTarget.value)} />
        </label>
        <button type="submit">Zahlung erfassen</button>
      </form>
    </section>
  );
}
```

- [ ] **Step 4: PASS verifizieren** — `npm test` → PASS. `npm run build` → kompiliert.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: BelegEditor für Angebote und Rechnungen"`

---

### Task 10: Angebote-Seite

**Files:**
- Create: `src/pages/Angebote.tsx`
- Test: `src/pages/Angebote.test.tsx`

**Interfaces:**
- Consumes: `api.belege.list`, `api.belege.create`, `api.kunden.list`, `api.einstellungen.get`
- Produces: `Angebote({ onOeffnen })` — Liste mit Statusfilter + Formular für neue Angebote

- [ ] **Step 1: Failing Test** — `src/pages/Angebote.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  api: {
    belege: {
      list: vi.fn().mockResolvedValue([
        { id: "1", typ: "angebot", nummer: "AN-2026-0001", status: "versendet", kunde_id: "k1",
          datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
          kopftext: "", fusstext: "", summe_cent: 9500, ursprungsangebot_id: null, storno_von_id: null },
      ]),
    },
    kunden: {
      list: vi.fn().mockResolvedValue([
        { id: "k1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001", zahlungsziel_tage: 14,
          notizen: "", ust_idnr: "", email: "", leitweg_id: "", kaeuferreferenz: "" },
      ]),
    },
    einstellungen: { get: vi.fn().mockResolvedValue("") },
  },
}));
import { Angebote } from "./Angebote";

describe("Angebote", () => {
  it("zeigt Angebotsliste mit Nummer und Kunde", async () => {
    render(<Angebote onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("AN-2026-0001")).toBeTruthy());
    expect(screen.getByText("ACME GmbH")).toBeTruthy();
  });
});
```

- [ ] **Step 2: FAIL verifizieren** — `npm test` → FAIL.

- [ ] **Step 3: Implementierung** — `src/pages/Angebote.tsx`:

```tsx
import { useEffect, useState } from "react";
import { api, type AppFehler, type Beleg, type Kunde } from "../api";
import { Fehler } from "../components/Fehler";
import { formatCent } from "../geld";

interface AngeboteProps {
  onOeffnen: (id: string) => void;
}

const STATUS_LABEL: Record<string, string> = {
  entwurf: "Entwurf",
  versendet: "Versendet",
  angenommen: "Angenommen",
  abgelehnt: "Abgelehnt",
  abgelaufen: "Abgelaufen",
};

export function Angebote({ onOeffnen }: AngeboteProps) {
  const [angebote, setAngebote] = useState<Beleg[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [zeigeFormular, setZeigeFormular] = useState(false);
  const [kundeId, setKundeId] = useState("");
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [formFehler, setFormFehler] = useState<AppFehler | null>(null);

  function laden() {
    api.belege
      .list("angebot", statusFilter || undefined)
      .then((liste) => {
        setAngebote(liste);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }

  useEffect(laden, [statusFilter]);
  useEffect(() => {
    api.kunden.list().then(setKunden).catch(() => {});
  }, []);

  async function anlegen() {
    setFormFehler(null);
    const kunde = kunden.find((k) => k.id === kundeId);
    if (!kunde) {
      setFormFehler({ typ: "validation", feld: "kunde_id", meldung: "Bitte einen Kunden wählen" });
      return;
    }
    try {
      const fusstext = (await api.einstellungen.get("text.angebot.fuss")) ?? "";
      const beleg = await api.belege.create({
        typ: "angebot",
        kunde_id: kundeId,
        datum,
        leistungsdatum: datum,
        zahlungsziel_tage: kunde.zahlungsziel_tage,
        kopftext: "",
        fusstext,
      });
      setZeigeFormular(false);
      onOeffnen(beleg.id);
    } catch (e) {
      setFormFehler(e as AppFehler);
    }
  }

  return (
    <div>
      <h1>Angebote</h1>
      {fehler && <Fehler fehler={fehler} />}
      <label>
        Status
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.currentTarget.value)}>
          <option value="">Alle</option>
          {Object.entries(STATUS_LABEL).map(([wert, label]) => (
            <option key={wert} value={wert}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <table>
        <thead>
          <tr>
            <th>Nummer</th>
            <th>Kunde</th>
            <th>Datum</th>
            <th>Status</th>
            <th>Summe</th>
          </tr>
        </thead>
        <tbody>
          {angebote.map((a) => (
            <tr key={a.id} onClick={() => onOeffnen(a.id)} style={{ cursor: "pointer" }}>
              <td>{a.nummer ?? "Entwurf"}</td>
              <td>{kunden.find((k) => k.id === a.kunde_id)?.name ?? a.kunde_id}</td>
              <td>{a.datum}</td>
              <td>{STATUS_LABEL[a.status] ?? a.status}</td>
              <td>{formatCent(a.summe_cent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {zeigeFormular ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            anlegen();
          }}
        >
          {formFehler && <Fehler fehler={formFehler} />}
          <label>
            Kunde
            <select value={kundeId} onChange={(e) => setKundeId(e.currentTarget.value)}>
              <option value="">– wählen –</option>
              {kunden.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Datum
            <input type="date" value={datum} onChange={(e) => setDatum(e.currentTarget.value)} />
          </label>
          <button type="submit">Anlegen</button>
        </form>
      ) : (
        <button type="button" onClick={() => setZeigeFormular(true)}>
          Neues Angebot
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: PASS verifizieren** — `npm test` → PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: Angebote-Seite mit Statusfilter und Neuanlage"`

---

### Task 11: Rechnungen-Seite

**Files:**
- Create: `src/pages/Rechnungen.tsx`
- Test: `src/pages/Rechnungen.test.tsx`

**Interfaces:**
- Consumes: `api.belege.list`, `api.belege.create`, `api.kunden.list`, `api.einstellungen.get`
- Produces: `Rechnungen({ onOeffnen })` — Liste mit Statusfilter + Formular für neue Rechnungen (Aktionen Stellen/Zahlung erfassen/Stornieren leben im `BelegEditor`, s. Task 9)

- [ ] **Step 1: Failing Test** — `src/pages/Rechnungen.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  api: {
    belege: {
      list: vi.fn().mockResolvedValue([
        { id: "1", typ: "rechnung", nummer: "RE-2026-0001", status: "gestellt", kunde_id: "k1",
          datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
          kopftext: "", fusstext: "", summe_cent: 9500, ursprungsangebot_id: null, storno_von_id: null },
      ]),
    },
    kunden: {
      list: vi.fn().mockResolvedValue([
        { id: "k1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001", zahlungsziel_tage: 14,
          notizen: "", ust_idnr: "", email: "", leitweg_id: "", kaeuferreferenz: "" },
      ]),
    },
    einstellungen: { get: vi.fn().mockResolvedValue("") },
  },
}));
import { Rechnungen } from "./Rechnungen";

describe("Rechnungen", () => {
  it("zeigt Rechnungsliste mit Nummer und Kunde", async () => {
    render(<Rechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("RE-2026-0001")).toBeTruthy());
    expect(screen.getByText("ACME GmbH")).toBeTruthy();
  });
});
```

- [ ] **Step 2: FAIL verifizieren** — `npm test` → FAIL.

- [ ] **Step 3: Implementierung** — `src/pages/Rechnungen.tsx`:

```tsx
import { useEffect, useState } from "react";
import { api, type AppFehler, type Beleg, type Kunde } from "../api";
import { Fehler } from "../components/Fehler";
import { formatCent } from "../geld";

interface RechnungenProps {
  onOeffnen: (id: string) => void;
}

const STATUS_LABEL: Record<string, string> = {
  entwurf: "Entwurf",
  gestellt: "Gestellt",
  storniert: "Storniert",
};

export function Rechnungen({ onOeffnen }: RechnungenProps) {
  const [rechnungen, setRechnungen] = useState<Beleg[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [zeigeFormular, setZeigeFormular] = useState(false);
  const [kundeId, setKundeId] = useState("");
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [formFehler, setFormFehler] = useState<AppFehler | null>(null);

  function laden() {
    api.belege
      .list("rechnung", statusFilter || undefined)
      .then((liste) => {
        setRechnungen(liste);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }

  useEffect(laden, [statusFilter]);
  useEffect(() => {
    api.kunden.list().then(setKunden).catch(() => {});
  }, []);

  async function anlegen() {
    setFormFehler(null);
    const kunde = kunden.find((k) => k.id === kundeId);
    if (!kunde) {
      setFormFehler({ typ: "validation", feld: "kunde_id", meldung: "Bitte einen Kunden wählen" });
      return;
    }
    try {
      const fusstext = (await api.einstellungen.get("text.rechnung.fuss")) ?? "";
      const beleg = await api.belege.create({
        typ: "rechnung",
        kunde_id: kundeId,
        datum,
        leistungsdatum: datum,
        zahlungsziel_tage: kunde.zahlungsziel_tage,
        kopftext: "",
        fusstext,
      });
      setZeigeFormular(false);
      onOeffnen(beleg.id);
    } catch (e) {
      setFormFehler(e as AppFehler);
    }
  }

  return (
    <div>
      <h1>Rechnungen</h1>
      {fehler && <Fehler fehler={fehler} />}
      <label>
        Status
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.currentTarget.value)}>
          <option value="">Alle</option>
          {Object.entries(STATUS_LABEL).map(([wert, label]) => (
            <option key={wert} value={wert}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <table>
        <thead>
          <tr>
            <th>Nummer</th>
            <th>Kunde</th>
            <th>Datum</th>
            <th>Status</th>
            <th>Summe</th>
          </tr>
        </thead>
        <tbody>
          {rechnungen.map((r) => (
            <tr key={r.id} onClick={() => onOeffnen(r.id)} style={{ cursor: "pointer" }}>
              <td>{r.nummer ?? "Entwurf"}</td>
              <td>{kunden.find((k) => k.id === r.kunde_id)?.name ?? r.kunde_id}</td>
              <td>{r.datum}</td>
              <td>{STATUS_LABEL[r.status] ?? r.status}</td>
              <td>{formatCent(r.summe_cent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {zeigeFormular ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            anlegen();
          }}
        >
          {formFehler && <Fehler fehler={formFehler} />}
          <label>
            Kunde
            <select value={kundeId} onChange={(e) => setKundeId(e.currentTarget.value)}>
              <option value="">– wählen –</option>
              {kunden.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Datum
            <input type="date" value={datum} onChange={(e) => setDatum(e.currentTarget.value)} />
          </label>
          <button type="submit">Anlegen</button>
        </form>
      ) : (
        <button type="button" onClick={() => setZeigeFormular(true)}>
          Neue Rechnung
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: PASS verifizieren** — `npm test` → PASS. `npm run build` → kompiliert.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: Rechnungen-Seite mit Statusfilter und Neuanlage"`

---

### Task 12: KundeDetail — Belege-Reiter aktivieren

**Files:**
- Modify: `src/pages/KundeDetail.tsx`

**Interfaces:**
- Consumes: `api.belege.list`
- Produces: aktiver "Belege"-Reiter mit einer Liste der Belege dieses Kunden

**Hinweis:** `beleg_list` filtert serverseitig nur nach `typ`/`status`, nicht nach `kunde_id`. Bei den für einen Kleinunternehmer realistischen Belegmengen (niedrige Hunderterzahl) ist eine Filterung im Frontend über die vollständige Liste ausreichend performant und spart eine weitere Backend-Signaturänderung.

- [ ] **Step 1: Failing Test** — ergänze in `src/pages/KundeDetail.test.tsx` (Datei existiert bereits aus Plan 1; `describe`-Block erweitern, `vi.mock("../api", ...)` um `belege.list` ergänzen):

```tsx
vi.mock("../api", () => ({
  api: {
    kunden: { get: vi.fn().mockResolvedValue({
      kunde: { id: "1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
        zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "", leitweg_id: "", kaeuferreferenz: "" },
      adressen: [], ansprechpartner: [],
    }) },
    belege: { list: vi.fn().mockResolvedValue([
      { id: "b1", typ: "rechnung", nummer: "RE-2026-0001", status: "gestellt", kunde_id: "1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9500, ursprungsangebot_id: null, storno_von_id: null },
      { id: "b2", typ: "angebot", nummer: "AN-2026-0003", status: "versendet", kunde_id: "anderer-kunde",
        datum: "2026-07-01", leistungsdatum: "2026-07-01", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 5000, ursprungsangebot_id: null, storno_von_id: null },
    ]) },
  },
  istValidierungsfehler: () => false,
}));
import { KundeDetail } from "./KundeDetail";

describe("KundeDetail Belege-Reiter", () => {
  it("zeigt nur Belege dieses Kunden", async () => {
    render(<KundeDetail id="1" />);
    await waitFor(() => expect(screen.getByText("ACME GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Belege" }));
    await waitFor(() => expect(screen.getByText("RE-2026-0001")).toBeTruthy());
    expect(screen.queryByText("AN-2026-0003")).toBeNull();
  });
});
```

`fireEvent` und `waitFor` aus `@testing-library/react` importieren (`render, screen, waitFor, fireEvent`).

- [ ] **Step 2: FAIL verifizieren** — `npm test` → FAIL (Reiter ist deaktiviert, `PlatzhalterReiter` zeigt keine Belegdaten).

- [ ] **Step 3: Implementierung** — in `src/pages/KundeDetail.tsx`:

Import-Zeile erweitern:

```tsx
import {
  api,
  istValidierungsfehler,
  type Adresse,
  type Ansprechpartner,
  type AppFehler,
  type Beleg,
  type Kunde,
  type KundeDetail as KundeDetailTyp,
} from "../api";
import { Fehler } from "../components/Fehler";
import { formatCent } from "../geld";
```

`REITER`-Array: `belege`-Eintrag aktivieren:

```tsx
const REITER: { id: Reiter; label: string; aktiv: boolean }[] = [
  { id: "stammdaten", label: "Stammdaten", aktiv: true },
  { id: "adressen", label: "Adressen", aktiv: true },
  { id: "ansprechpartner", label: "Ansprechpartner", aktiv: true },
  { id: "sonderpreise", label: "Sonderpreise", aktiv: false },
  { id: "belege", label: "Belege", aktiv: true },
];
```

Render-Zweig für `belege` ersetzen:

```tsx
      {reiter === "sonderpreise" && <PlatzhalterReiter />}
      {reiter === "belege" && <BelegeReiter kundeId={id} />}
```

Neue Komponente ergänzen (nach `PlatzhalterReiter`):

```tsx
function BelegeReiter({ kundeId }: { kundeId: string }) {
  const [belege, setBelege] = useState<Beleg[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);

  useEffect(() => {
    api.belege
      .list()
      .then((liste) => {
        setBelege(liste.filter((b) => b.kunde_id === kundeId));
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }, [kundeId]);

  return (
    <section>
      <h2>Belege</h2>
      {fehler && <Fehler fehler={fehler} />}
      <table>
        <thead>
          <tr>
            <th>Typ</th>
            <th>Nummer</th>
            <th>Datum</th>
            <th>Status</th>
            <th>Summe</th>
          </tr>
        </thead>
        <tbody>
          {belege.map((b) => (
            <tr key={b.id}>
              <td>{b.typ === "angebot" ? "Angebot" : "Rechnung"}</td>
              <td>{b.nummer ?? "Entwurf"}</td>
              <td>{b.datum}</td>
              <td>{b.status}</td>
              <td>{formatCent(b.summe_cent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

Docstring-Kommentar über `KundeDetail` anpassen (der bisherige Text verweist noch auf "Belege kommen erst in Plan 2"):

```tsx
/**
 * Kundendetailseite mit Reiter-Navigation. "Sonderpreise" wird über die
 * Artikel-Seite gepflegt (Kundenpreise je Artikel, s. Plan 1) und bleibt
 * hier bewusst ein deaktivierter Platzhalter-Reiter.
 */
```

- [ ] **Step 4: PASS verifizieren** — `npm test` → PASS. `npm run build` → kompiliert.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: Belege-Reiter in Kundendetailseite aktivieren"`

---

### Task 13: Navigation erweitern (Layout, App.tsx)

**Files:**
- Modify: `src/components/Layout.tsx`, `src/App.tsx`

**Interfaces:**
- Produces: Seitennavigation mit fünf Einträgen (Kunden, Artikel, Angebote, Rechnungen, Einstellungen); App.tsx routet zu `Angebote`/`BelegEditor` bzw. `Rechnungen`/`BelegEditor` analog zum bestehenden Kunden/KundeDetail-Muster

- [ ] **Step 1: `Layout.tsx` erweitern**:

```tsx
export type Seite = "kunden" | "artikel" | "angebote" | "rechnungen" | "einstellungen";
```

```tsx
const NAV_EINTRAEGE: NavEintrag[] = [
  { seite: "kunden", label: t("nav.kunden") },
  { seite: "artikel", label: t("nav.artikel") },
  { seite: "angebote", label: t("nav.angebote") },
  { seite: "rechnungen", label: t("nav.rechnungen") },
  { seite: "einstellungen", label: t("nav.einstellungen") },
];
```

(Die i18n-Keys `nav.angebote`/`nav.rechnungen` wurden bereits in Task 8 ergänzt.)

- [ ] **Step 2: `App.tsx` erweitern**:

```tsx
import { useEffect, useState } from "react";
import { api, type AppFehler, type Firma } from "./api";
import { Layout, type Seite } from "./components/Layout";
import { Fehler } from "./components/Fehler";
import { Einrichtung } from "./pages/Einrichtung";
import { Einstellungen } from "./pages/Einstellungen";
import { Kunden } from "./pages/Kunden";
import { KundeDetail } from "./pages/KundeDetail";
import { Artikel } from "./pages/Artikel";
import { Angebote } from "./pages/Angebote";
import { Rechnungen } from "./pages/Rechnungen";
import { BelegEditor } from "./pages/BelegEditor";
import "./App.css";

function App() {
  const [firma, setFirma] = useState<Firma | null>(null);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [seite, setSeite] = useState<Seite>("kunden");
  const [ausgewaehlterKunde, setAusgewaehlterKunde] = useState<string | null>(null);
  const [ausgewaehltesAngebot, setAusgewaehltesAngebot] = useState<string | null>(null);
  const [ausgewaehlteRechnung, setAusgewaehlteRechnung] = useState<string | null>(null);

  useEffect(() => {
    api.firma.get().then(setFirma).catch((e) => setFehler(e as AppFehler));
  }, []);

  if (fehler) {
    return <Fehler fehler={fehler} />;
  }

  if (!firma) {
    return null;
  }

  if (!firma.eingerichtet) {
    return <Einrichtung onFertig={() => api.firma.get().then(setFirma)} />;
  }

  function navigiere(neueSeite: Seite) {
    setAusgewaehlterKunde(null);
    setAusgewaehltesAngebot(null);
    setAusgewaehlteRechnung(null);
    setSeite(neueSeite);
  }

  return (
    <Layout aktiveSeite={seite} onNavigiere={navigiere}>
      {seite === "kunden" &&
        (ausgewaehlterKunde ? (
          <KundeDetail id={ausgewaehlterKunde} />
        ) : (
          <Kunden onOeffnen={setAusgewaehlterKunde} />
        ))}
      {seite === "artikel" && <Artikel />}
      {seite === "angebote" &&
        (ausgewaehltesAngebot ? (
          <BelegEditor id={ausgewaehltesAngebot} />
        ) : (
          <Angebote onOeffnen={setAusgewaehltesAngebot} />
        ))}
      {seite === "rechnungen" &&
        (ausgewaehlteRechnung ? (
          <BelegEditor id={ausgewaehlteRechnung} />
        ) : (
          <Rechnungen onOeffnen={setAusgewaehlteRechnung} />
        ))}
      {seite === "einstellungen" && <Einstellungen />}
    </Layout>
  );
}

export default App;
```

Navigation "zurück zur Liste" funktioniert wie bei Kunden/KundeDetail bereits etabliert: erneuter Klick auf denselben Sidebar-Eintrag ruft `navigiere()` auf, das die Auswahl zurücksetzt und wieder die Liste zeigt.

- [ ] **Step 3: PASS verifizieren** — `npm test` → PASS (alle Frontend-Tests). `npm run build` → kompiliert.

- [ ] **Step 4: Manueller Smoke-Test** — `npm run tauri dev`: Kunde vorhanden (aus Plan 1) → Angebot anlegen → Position mit Artikel hinzufügen → Stellen → "In Rechnung überführen" → Rechnung stellen → Zahlung erfassen → offener Betrag sinkt → Stornieren → Gegenbeleg mit negierten Positionen erscheint in der Rechnungsliste.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: Navigation für Angebote und Rechnungen"`

---

## Abschluss Plan 2

Nach Task 13: `cd src-tauri && cargo test` (alle Rust-Tests), `npm test`, `npm run build`, manueller Smoke-Test aus Task 13 Step 4. Danach ist der komplette Workflow "Kunde → Angebot → Rechnung → Zahlung/Storno" nutzbar, aber ohne Dokumentexport. Plan 3 (PDF/XRechnung/ZUGFeRD) und ein späterer Dashboard-Plan bauen auf dem hier entstandenen Datenmodell auf.
