# Kaufmännische Gutschrift — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine kaufmännische Gutschrift als eigene Belegart (`typ = 'gutschrift'`), für nachträgliche Teilkorrekturen mit Rechnungsbezug und für freie Gutschriften ohne Bezug, exportierbar als PDF/A-3b und als E-Rechnung (XRechnung/ZUGFeRD, TypeCode 381).

**Architecture:** Wiederverwendung der bestehenden `beleg`/`belegposition`/`zahlung`-Maschinerie. Neuer Wert in der `beleg.typ`-Spalte, eine nullable Spalte `gutschrift_zu_id` für den optionalen Rechnungsbezug, ein eigener Nummernkreis. Beträge werden — wie beim vorhandenen Vollstorno — negativ gespeichert; Editor erfasst positiv. Das Festschreiben läuft über die vorhandene `stellen`-Funktion (generalisiert), Export über die vorhandene Pipeline (Guards gelockert). Das Vollstorno bleibt unverändert daneben.

**Tech Stack:** Rust (Tauri, sqlx/SQLite, Typst), TypeScript/React (Vite, Vitest, Testing Library), KoSIT-Validator + veraPDF für die Normprüfungen.

**Spec:** `docs/superpowers/specs/2026-09-05-kaufmaennische-gutschrift-design.md`

**Branch:** Dieses Repo arbeitet direkt auf `main`, keine Feature-Branches/Worktrees.

**Test-Harness (WICHTIG):** Die Backend-Tests in `belege.rs` verwenden **nicht**
`#[sqlx::test]`, sondern einen eigenen Helfer:

```rust
async fn test_pool() -> (tempfile::TempDir, sqlx::SqlitePool) { … }  // belege.rs:1206
```

Jeder Testrumpf in diesem Plan ist entsprechend als
`#[tokio::test] async fn name() { let (_dir, pool) = test_pool().await; … }`
zu schreiben — die im Plan gezeigten `#[sqlx::test] async fn name(pool: SqlitePool)`
-Signaturen sind Kurzschreibweise. Für `auswertung.rs`/`dashboard.rs`/`kontext.rs`
den dort jeweils genutzten Pool-Helfer übernehmen (an vorhandenen Tests der Datei
ablesen — Namen variieren).

**Testbefehle:**
- Rust alle: `cd src-tauri && cargo test`
- Rust einzeln: `cd src-tauri && cargo test <name> -- --nocapture`
- Rust mit Normprüfung: `cd src-tauri && KOSIT_PFLICHT=1 cargo test`
- Frontend: `npm test -- --run`
- Frontend einzeln: `npm test -- --run src/pages/Gutschriften.test.tsx`
- E2E: `npm run test:e2e`

---

## File Structure

**Neu:**
- `src-tauri/migrations/0022_gutschrift.sql` — `beleg.typ`-CHECK erweitern, Spalte `gutschrift_zu_id`, Indizes, Nummernkreis-Seed `gutschrift`, Textbaustein-Seeds.
- `src/pages/Gutschriften.tsx` + `src/pages/Gutschriften.test.tsx` — Listenseite, Mirror von `Rechnungen.tsx`.

**Geändert — Backend:**
- `src-tauri/src/commands/belege.rs` — `Beleg.gutschrift_zu_id`, `BELEG_SPALTEN`, alle `INSERT INTO beleg`-Statements, `BelegNeu`, `pruefe_beleg_neu`, `create`, `stellen`, `mit_zahlungsstand`, Positions-Negierung beim Speichern, neue Funktion `gutschrift_aus_rechnung`, neuer Tauri-Wrapper.
- `src-tauri/src/dokument/kontext.rs` — Feld `gutschrift_zu_nummer`, Lookup in `kontext_aus_beleg`.
- `src-tauri/src/dokument/export.rs` — Guard `pruefe_ist_rechnung` → Rechnung **oder** Gutschrift für XRechnung/ZUGFeRD.
- `src-tauri/src/dokument/xrechnung.rs` — `type_code` 381, BG-3 aus generischem Bezug.
- `src-tauri/src/dokument/pdf.rs` — Titel „Gutschrift", Bezugszeile, Girocode-Guard.
- `src-tauri/templates/rechnung.typ` — Titel-/Bezugsausgabe.
- `src-tauri/src/commands/dashboard.rs`, `src-tauri/src/commands/auswertung.rs` — nur neue Tests.

**Geändert — Frontend:**
- `src/api.ts` — `Beleg.gutschrift_zu_id`, `BelegNeu.gutschrift_zu_id`, `belege.list`-Typunion, `belege.gutschriftAusRechnung`, `belege.stellen`-Doku.
- `src/hooks/useBelegListe.tsx` — Typunion `"angebot" | "rechnung" | "gutschrift"`.
- `src/belegStatus.ts` — `GUTSCHRIFT_STATUS`, Labels/Klassen.
- `src/components/Layout.tsx` — Nav-Eintrag „Gutschriften", `Seite`-Typ.
- `src/App.tsx` — Seiten-State, Rendering-Zweig, Editor-Verdrahtung.
- `src/pages/BelegEditor.tsx` — `typ === "gutschrift"`-Zweig.
- `src/pages/Rechnungen.tsx` — Knopf „Gutschrift erstellen" (bzw. im Editor).

---

## Task 1: Migration — Belegart, Bezugsspalte, Nummernkreis

**Files:**
- Create: `src-tauri/migrations/0022_gutschrift.sql`
- Test: `src-tauri/src/commands/belege.rs` (neuer Test im `mod tests`)

Hintergrund: Alle bisherigen `beleg`-Schemaänderungen waren `ALTER TABLE ADD COLUMN`. Der `typ`-CHECK aus `0002_belege.sql` (`CHECK (typ IN ('angebot','rechnung'))`) lässt sich in SQLite nicht per ALTER ändern — es braucht den Tabellen-Neubau (Muster wie `0010_eingangsrechnung_format_pdf.sql`). `DROP TABLE beleg` verwirft auch die Indizes aus `0013` (`idx_beleg_kunde`, `idx_beleg_ursprungsangebot`, `idx_beleg_storno_von`) → mit neu anlegen.

Die vollständige aktuelle Spaltenliste von `beleg` (Basis `0002` + ALTERs `0009`, `0012`, `0016`, `0021`), in Reihenfolge:
`id, typ, nummer, status, kunde_id, kunde_snapshot, datum, leistungsdatum, zahlungsziel_tage, kopftext, fusstext, summe_cent, ursprungsangebot_id, storno_von_id, created_at, updated_at, deleted_at, leistungsdatum_bis, adresse_id, ansprechpartner_id, gueltig_bis, gesamtauftragswert_cent`

- [ ] **Step 1: Failing-Test schreiben** — in `src-tauri/src/commands/belege.rs` im `#[cfg(test)] mod tests`:

```rust
#[sqlx::test]
async fn migration_erlaubt_belegtyp_gutschrift_und_seedet_nummernkreis(pool: SqlitePool) {
    // typ = 'gutschrift' muss einfügbar sein (CHECK erweitert)
    sqlx::query(
        "INSERT INTO beleg (id, typ, nummer, status, kunde_id, kunde_snapshot, datum, leistungsdatum, zahlungsziel_tage, kopftext, fusstext, summe_cent, created_at, updated_at) \
         VALUES ('g-mig', 'gutschrift', NULL, 'entwurf', 'k-x', '', '2026-09-05', '2026-09-05', 14, '', '', 0, '2026-09-05T00:00:00Z', '2026-09-05T00:00:00Z')")
        .execute(&pool).await.expect("typ='gutschrift' muss erlaubt sein");

    // gutschrift_zu_id existiert und ist nullable
    sqlx::query("UPDATE beleg SET gutschrift_zu_id = NULL WHERE id = 'g-mig'")
        .execute(&pool).await.expect("Spalte gutschrift_zu_id muss existieren");

    // Nummernkreis-Seed
    let (format,): (String,) = sqlx::query_as(
        "SELECT format FROM nummernkreis WHERE art = 'gutschrift' AND deleted_at IS NULL")
        .fetch_one(&pool).await.expect("Nummernkreis 'gutschrift' muss geseedet sein");
    assert_eq!(format, "GS-{JJJJ}-{lfd:4}");

    // alter Wert bleibt gültig
    sqlx::query(
        "INSERT INTO beleg (id, typ, status, kunde_id, kunde_snapshot, datum, leistungsdatum, zahlungsziel_tage, kopftext, fusstext, summe_cent, created_at, updated_at) \
         VALUES ('r-mig', 'rechnung', 'entwurf', 'k-x', '', '2026-09-05', '2026-09-05', 14, '', '', 0, '2026-09-05T00:00:00Z', '2026-09-05T00:00:00Z')")
        .execute(&pool).await.expect("typ='rechnung' muss weiter erlaubt sein");

    // ungültiger Typ wird weiter abgewiesen
    let err = sqlx::query(
        "INSERT INTO beleg (id, typ, status, kunde_id, kunde_snapshot, datum, leistungsdatum, zahlungsziel_tage, kopftext, fusstext, summe_cent, created_at, updated_at) \
         VALUES ('b-mig', 'quatsch', 'entwurf', 'k-x', '', '2026-09-05', '2026-09-05', 14, '', '', 0, '2026-09-05T00:00:00Z', '2026-09-05T00:00:00Z')")
        .execute(&pool).await;
    assert!(err.is_err(), "CHECK muss ungültige Typen weiter ablehnen");
}
```

Falls das Repo `#[sqlx::test]` woanders benutzt: bestehendes Test-Muster in `belege.rs` übernehmen (dort ist es `#[sqlx::test]` mit `pool: SqlitePool`, der die Migrationen automatisch anwendet — an vorhandenen Tests in der Datei ablesen und exakt spiegeln).

- [ ] **Step 2: Test ausführen, Fehlschlag prüfen**

Run: `cd src-tauri && cargo test migration_erlaubt_belegtyp_gutschrift -- --nocapture`
Expected: FAIL — `typ='gutschrift'` verstößt gegen CHECK bzw. Nummernkreis fehlt.

- [ ] **Step 3: Migration schreiben** — `src-tauri/migrations/0022_gutschrift.sql`:

```sql
-- no-transaction
-- Kaufmännische Gutschrift als eigene Belegart.
--
-- Erste Zeile `-- no-transaction`: nötig, damit PRAGMA foreign_keys = OFF
-- wirkt (innerhalb einer Transaktion ist es ein No-op). Ohne das kann der
-- Tabellen-Neubau bei Nutzern mit vorhandenen Belegen an den FK-Constraints
-- der Kindtabellen scheitern.
--
-- Zwei Einstiege: nachträgliche Teilkorrektur mit Rechnungsbezug
-- (gutschrift_zu_id gesetzt) und freie Gutschrift ohne Bezug (NULL).
-- Beträge werden — wie beim Vollstorno — negativ gespeichert. Das Vollstorno
-- (status 'storniert' am Ursprung + Gegenbeleg) bleibt unverändert daneben.
--
-- SQLite kann eine CHECK-Bedingung nicht per ALTER ändern, deshalb der Umweg
-- über eine neue Tabelle. Die Spaltenliste entspricht dem Stand nach
-- Migration 0021. DROP TABLE verwirft die Indizes aus 0013 — unten neu.

PRAGMA foreign_keys = OFF;

CREATE TABLE beleg_neu (
  id TEXT PRIMARY KEY,
  typ TEXT NOT NULL CHECK (typ IN ('angebot','rechnung','gutschrift')),
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
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  leistungsdatum_bis TEXT,
  adresse_id TEXT REFERENCES adresse(id),
  ansprechpartner_id TEXT REFERENCES ansprechpartner(id),
  gueltig_bis TEXT,
  gesamtauftragswert_cent INTEGER,
  gutschrift_zu_id TEXT REFERENCES beleg(id)
);

INSERT INTO beleg_neu (
  id, typ, nummer, status, kunde_id, kunde_snapshot, datum, leistungsdatum,
  zahlungsziel_tage, kopftext, fusstext, summe_cent, ursprungsangebot_id,
  storno_von_id, created_at, updated_at, deleted_at, leistungsdatum_bis,
  adresse_id, ansprechpartner_id, gueltig_bis, gesamtauftragswert_cent
)
SELECT
  id, typ, nummer, status, kunde_id, kunde_snapshot, datum, leistungsdatum,
  zahlungsziel_tage, kopftext, fusstext, summe_cent, ursprungsangebot_id,
  storno_von_id, created_at, updated_at, deleted_at, leistungsdatum_bis,
  adresse_id, ansprechpartner_id, gueltig_bis, gesamtauftragswert_cent
FROM beleg;

DROP TABLE beleg;
ALTER TABLE beleg_neu RENAME TO beleg;

-- Indizes aus 0013 neu anlegen (plus der neue Fremdschlüssel).
CREATE INDEX idx_beleg_kunde ON beleg(kunde_id, deleted_at);
CREATE INDEX idx_beleg_ursprungsangebot ON beleg(ursprungsangebot_id);
CREATE INDEX idx_beleg_storno_von ON beleg(storno_von_id);
CREATE INDEX idx_beleg_gutschrift_zu ON beleg(gutschrift_zu_id);

PRAGMA foreign_keys = ON;

-- Eigener Nummernkreis, jahresweise zurücksetzbar wie Rechnung und Angebot.
INSERT INTO nummernkreis (id, art, format, zaehler, jahres_reset, jahr, created_at, updated_at) VALUES
 ('a0000000-0000-0000-0000-000000000005','gutschrift','GS-{JJJJ}-{lfd:4}',0,1,
  CAST(strftime('%Y','now') AS INTEGER),
  strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'));

-- Textbausteine für die Gutschrift (analog text.rechnung.kopf/fuss).
INSERT OR IGNORE INTO einstellung (key, value, created_at, updated_at) VALUES
 ('text.gutschrift.kopf', '',
  strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
 ('text.gutschrift.fuss', 'Der ausgewiesene Betrag wird Ihnen erstattet bzw. mit der nächsten Rechnung verrechnet.',
  strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'));
```

Vor dem Schreiben prüfen: Stimmt die `einstellung`-Spaltenliste (`key, value, created_at, updated_at`) mit `0016`/`0001` überein? Falls abweichend, an `0016_angebot_gueltigkeit.sql` ausrichten.

`build.rs` gibt bereits `cargo:rerun-if-changed=migrations` aus (siehe `0006`-Kommentar) — kein zusätzlicher Schritt nötig.

**Wichtig — FK-Erzwingung beim Tabellen-Neubau:** `beleg` hat, anders als
`eingangsrechnung` in `0010`, gefüllte Kindtabellen bei echten Nutzer-Upgrades
(`belegposition.beleg_id`, `zahlung.rechnung_id`). `PRAGMA foreign_keys` ist
innerhalb einer Transaktion wirkungslos; die frischen Test-DBs haben keine
Daten und verdecken das Problem. Deshalb die Migrationsdatei mit der
sqlx-Annotation **`-- no-transaction`** als allererste Zeile beginnen, damit
`PRAGMA foreign_keys = OFF` tatsächlich greift. Dann ist die Reihenfolge
`CREATE beleg_neu / INSERT / DROP beleg / RENAME` sicher (dokumentierte
12-Schritt-ALTER-Prozedur; die Kind-FKs lösen `beleg` per Name zur Query-Zeit
neu auf).

`-- no-transaction` heißt: bricht die Migration mittendrin ab, gibt es kein
Rollback. Das ist vertretbar, weil die App vor jeder Migration eine
automatische Sicherung anlegt (TODO-Archiv P3.7) — ein Fehlschlag ist aus der
Sicherung wiederherstellbar. Die Migration selbst hält die Schrittfolge
minimal und deterministisch.

Die Datenerhaltung bei echten Upgrades lässt sich nicht automatisiert testen
(Migrationen laufen immer auf leerer DB vor dem Testcode). Absicherung: die
`INSERT INTO beleg_neu (…) SELECT (…)` mit **explizit ausgeschriebener,
identischer Spaltenliste** (kein `SELECT *`) — beim Review Spalte für Spalte
gegen `0002` + ALTERs abgleichen. Der Reviewer prüft die Migration zusätzlich
manuell an einer per Hand mit Daten gefüllten Kopie.

- [ ] **Step 4: Test ausführen, Erfolg prüfen**

Run: `cd src-tauri && cargo test migration_erlaubt_belegtyp_gutschrift -- --nocapture`
Expected: PASS

- [ ] **Step 5: Volle Testsuite (Migrationskette absichern)**

Run: `cd src-tauri && cargo test`
Expected: PASS — keine bestehende Migration/Test gebrochen. Bei Fehlern in unbezogenen Tests: Spaltenliste des Tabellen-Neubaus gegen `.schema beleg` einer frisch migrierten DB abgleichen.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/migrations/0022_gutschrift.sql src-tauri/src/commands/belege.rs
git commit -m "feat(gutschrift): Migration — Belegart, Bezugsspalte, Nummernkreis"
```

---

## Task 2: Beleg-Struct und BELEG_SPALTEN um `gutschrift_zu_id`

**Files:**
- Modify: `src-tauri/src/commands/belege.rs` (Struct `Beleg`, `BELEG_SPALTEN`, alle `INSERT INTO beleg`, alle `Beleg { … }`-Literale)
- Test: `src-tauri/src/commands/belege.rs`

- [ ] **Step 1: Failing-Test** — in `mod tests`:

```rust
#[sqlx::test]
async fn beleg_get_liefert_gutschrift_zu_id(pool: SqlitePool) {
    kunde_anlegen(&pool, "k1").await; // vorhandenen Test-Helfer der Datei benutzen
    sqlx::query(
        "INSERT INTO beleg (id, typ, status, kunde_id, kunde_snapshot, datum, leistungsdatum, zahlungsziel_tage, kopftext, fusstext, summe_cent, gutschrift_zu_id, created_at, updated_at) \
         VALUES ('g1','gutschrift','entwurf','k1','', '2026-09-05','2026-09-05',14,'','',0,'r1','2026-09-05T00:00:00Z','2026-09-05T00:00:00Z')")
        .execute(&pool).await.unwrap();
    let d = get(&pool, "g1".into()).await.unwrap();
    assert_eq!(d.beleg.gutschrift_zu_id.as_deref(), Some("r1"));
}
```

Den Kunden-Anlege-Helfer der Datei verwenden (an bestehenden Tests ablesen, z. B. `kunde_anlegen`/`test_kunde`); falls keiner existiert, Kunden per `INSERT INTO kunde` inline anlegen wie andere Tests es tun.

- [ ] **Step 2: Fehlschlag prüfen**

Run: `cd src-tauri && cargo test beleg_get_liefert_gutschrift_zu_id -- --nocapture`
Expected: FAIL — Feld existiert nicht / wird nicht selektiert.

- [ ] **Step 3: Struct + Spalten + Literale**

In `struct Beleg` nach `gesamtauftragswert_cent` ergänzen:

```rust
    /// Bezug auf die Ursprungsrechnung einer kaufmännischen Gutschrift.
    /// `None` bei einer freien Gutschrift ohne Rechnungsbezug und bei jeder
    /// anderen Belegart. Steuert BG-3 in der E-Rechnung und die Bezugszeile
    /// auf dem PDF.
    #[sqlx(default)]
    #[serde(default)]
    pub gutschrift_zu_id: Option<String>,
```

In `BELEG_SPALTEN` `, gutschrift_zu_id` ans Ende der Liste anhängen.

Alle `Beleg { … }`-Struct-Literale in der Datei (in `create`, `duplizieren`, `angebot_ueberfuehren`, `storniere_rechnung`, ggf. Tests) um `gutschrift_zu_id: None,` ergänzen — der Compiler listet jede Fehlstelle.

Alle `INSERT INTO beleg (…) VALUES (…)` in der Datei, die `BELEG_SPALTEN`-nah einfügen: Spalte `gutschrift_zu_id` + Bind-Wert ergänzen. Betrifft:
- `create` → `d.gutschrift_zu_id` (Task 3) bzw. vorerst `None::<String>`
- `angebot_in_rechnung_ueberfuehren` → `None::<String>` (eine überführte Rechnung ist keine Gutschrift)
- `storniere_rechnung` → `None::<String>` (ein Storno ist keine Gutschrift)
- `duplizieren` → `None::<String>` (eine Kopie ist ein bezugsloser Entwurf)

- [ ] **Step 4: Erfolg prüfen**

Run: `cd src-tauri && cargo test -- --nocapture`
Expected: PASS (alle Tests der Datei).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/belege.rs
git commit -m "feat(gutschrift): gutschrift_zu_id im Beleg-Modell"
```

---

## Task 3: `create` und `pruefe_beleg_neu` für die freie Gutschrift

**Files:**
- Modify: `src-tauri/src/commands/belege.rs` (`pruefe_beleg_neu`, `create`, `BelegNeu`)
- Test: `src-tauri/src/commands/belege.rs`

- [ ] **Step 1: Failing-Test**

```rust
#[sqlx::test]
async fn create_legt_freie_gutschrift_ohne_bezug_an(pool: SqlitePool) {
    kunde_anlegen(&pool, "k1").await;
    let b = create(&pool, BelegNeu {
        typ: "gutschrift".into(), kunde_id: "k1".into(),
        datum: "2026-09-05".into(), leistungsdatum: "2026-09-05".into(),
        leistungsdatum_bis: None, zahlungsziel_tage: 0,
        kopftext: "".into(), fusstext: "".into(), gutschrift_zu_id: None,
    }).await.unwrap();
    assert_eq!(b.typ, "gutschrift");
    assert_eq!(b.status, "entwurf");
    assert!(b.nummer.is_none());
    assert!(b.gueltig_bis.is_none()); // nur Angebote bekommen eine Gültigkeit
}
```

`BelegNeu` hat das neue Feld `gutschrift_zu_id` noch nicht — Test kompiliert erst nach Step 3.

- [ ] **Step 2: Fehlschlag prüfen**

Run: `cd src-tauri && cargo test create_legt_freie_gutschrift -- --nocapture`
Expected: FAIL (Kompilierfehler `BelegNeu` bzw. `pruefe_beleg_neu` weist `gutschrift` ab: „Ungültiger Belegtyp").

- [ ] **Step 3: Implementierung**

`BelegNeu` (Definition in `belege.rs` suchen) um `#[serde(default)] pub gutschrift_zu_id: Option<String>,` ergänzen.

In `pruefe_beleg_neu` die Typprüfung erweitern:

```rust
    if !["angebot", "rechnung", "gutschrift"].contains(&typ) {
        return Err(AppError::Validation { feld: "typ".into(), meldung: "Ungültiger Belegtyp".into() });
    }
```

In `create`:
- Der `gueltig_bis`-Block bleibt: `if d.typ == "angebot" { … } else { None }` deckt Gutschrift korrekt ab (kein Ablaufdatum).
- Im `Beleg { … }`-Literal `gutschrift_zu_id: d.gutschrift_zu_id.clone(),` setzen (bei der freien Gutschrift `None`; die referenzierte Gutschrift entsteht in Task 6 über einen eigenen Pfad, nicht über `create`).
- Das `INSERT INTO beleg` in `create` um Spalte + Bind `gutschrift_zu_id` erweitern (falls in Task 2 noch nicht geschehen).

Hinweis: `create` erlaubt damit auch `typ = "rechnung"` **mit** `gutschrift_zu_id` — das ist unsinnig, aber `create` wird vom Frontend nur mit `None` für Nicht-Gutschriften aufgerufen. Eine harte Prüfung ist unnötige Komplexität (YAGNI); optional ein `debug_assert`.

- [ ] **Step 4: Erfolg prüfen**

Run: `cd src-tauri && cargo test -- --nocapture`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/belege.rs
git commit -m "feat(gutschrift): freie Gutschrift über create anlegen"
```

---

## Task 4: `stellen` und `mit_zahlungsstand` generalisieren

**Files:**
- Modify: `src-tauri/src/commands/belege.rs` (`stellen`, `mit_zahlungsstand`)
- Test: `src-tauri/src/commands/belege.rs`

Ziel: Eine festgeschriebene Gutschrift bekommt ihre Nummer aus dem Kreis `gutschrift`, Status `festgeschrieben`, Kunden-Snapshot eingefroren, Adresse ist Pflicht (§ 14). Kein Fälligkeitsdatum.

- [ ] **Step 1: Failing-Test**

```rust
#[sqlx::test]
async fn stellen_schreibt_gutschrift_fest_mit_eigener_nummer(pool: SqlitePool) {
    kunde_mit_rechnungsadresse(&pool, "k1").await; // Helfer der Datei; sonst inline
    let g = create(&pool, BelegNeu {
        typ: "gutschrift".into(), kunde_id: "k1".into(),
        datum: "2026-09-05".into(), leistungsdatum: "2026-09-05".into(),
        leistungsdatum_bis: None, zahlungsziel_tage: 0,
        kopftext: "".into(), fusstext: "".into(), gutschrift_zu_id: None,
    }).await.unwrap();
    position_speichern(&pool, /* passende BelegpositionNeu, menge 1, preis 5000, satz 19 */).await.unwrap();

    let fest = stellen(&pool, g.id.clone()).await.unwrap();
    assert_eq!(fest.status, "festgeschrieben");
    assert!(fest.nummer.unwrap().starts_with("GS-"));
    assert!(fest.faellig_am.is_none(), "eine Gutschrift hat kein Zahlungsziel");

    // Nummernkreis 'gutschrift' wurde hochgezählt, 'rechnung' nicht
    let (rz,): (i64,) = sqlx::query_as("SELECT zaehler FROM nummernkreis WHERE art='rechnung'").fetch_one(&pool).await.unwrap();
    assert_eq!(rz, 0);
}

#[sqlx::test]
async fn stellen_verlangt_rechnungsadresse_auch_bei_gutschrift(pool: SqlitePool) {
    kunde_ohne_adresse(&pool, "k2").await;
    let g = create(&pool, BelegNeu { typ: "gutschrift".into(), kunde_id: "k2".into(),
        datum: "2026-09-05".into(), leistungsdatum: "2026-09-05".into(), leistungsdatum_bis: None,
        zahlungsziel_tage: 0, kopftext: "".into(), fusstext: "".into(), gutschrift_zu_id: None }).await.unwrap();
    position_speichern(&pool, /* eine Position */).await.unwrap();
    let err = stellen(&pool, g.id).await.unwrap_err();
    assert!(matches!(err, AppError::Validation { feld, .. } if feld == "adresse"));
}
```

Die genauen `BelegpositionNeu`-Felder und Kunden-Helfer aus bestehenden Tests der Datei übernehmen (dort gibt es schon Tests, die eine Rechnung stellen).

- [ ] **Step 2: Fehlschlag prüfen**

Run: `cd src-tauri && cargo test stellen_schreibt_gutschrift_fest stellen_verlangt_rechnungsadresse_auch_bei_gutschrift -- --nocapture`
Expected: FAIL — Status wird „gestellt" statt „festgeschrieben", bzw. Adressprüfung greift nicht.

- [ ] **Step 3: Implementierung in `stellen`**

`naechste_nummer(&mut tx, &beleg.typ, Some(&beleg.datum))` bleibt — mit `beleg.typ == "gutschrift"` trifft es automatisch den Kreis `gutschrift`.

Statuszeile ändern:

```rust
    // Rechnungen sind mit dem Festschreiben tatsächlich gestellt; Angebote und
    // Gutschriften bekommen nur eine Nummer und werden unveränderbar.
    let neuer_status = if beleg.typ == "rechnung" { "gestellt" } else { "festgeschrieben" };
```

Adressprüfung erweitern:

```rust
    if matches!(beleg.typ.as_str(), "rechnung" | "gutschrift") && standardadresse.is_none() {
        return Err(AppError::Validation {
            feld: "adresse".into(),
            meldung: format!(
                "Für „{}\" ist keine Rechnungsadresse als Standard hinterlegt. \
                 Auch eine Gutschrift muss die vollständige Anschrift des Empfängers enthalten (§ 14 UStG).",
                kunde.kunde.name
            ),
        });
    }
```

(Wortlaut der Meldung darf allgemein bleiben; wenn einfacher, den bestehenden Rechnungs-Text unverändert lassen.)

- [ ] **Step 4: `mit_zahlungsstand` erweitern**

```rust
fn mit_zahlungsstand(mut beleg: Beleg) -> Beleg {
    let hat_zahlungslage = matches!(beleg.typ.as_str(), "rechnung" | "gutschrift") && beleg.status != "entwurf";
    if hat_zahlungslage {
        beleg.zahlungsstand = Some(crate::domain::beleg::zahlungsstand(beleg.summe_cent, beleg.bezahlt_cent));
        // Weder ein Stornobeleg noch eine Gutschrift ist eine Forderung — kein Zahlungsziel.
        if beleg.storno_von_id.is_none() && beleg.typ != "gutschrift" {
            beleg.faellig_am = chrono::NaiveDate::parse_from_str(&beleg.datum, "%Y-%m-%d")
                .ok()
                .and_then(|d| d.checked_add_signed(chrono::Duration::days(beleg.zahlungsziel_tage)))
                .map(|d| d.to_string());
        }
    }
    beleg
}
```

- [ ] **Step 5: Erfolg prüfen**

Run: `cd src-tauri && cargo test -- --nocapture`
Expected: PASS (alle Tests; besonders die vorhandenen `stellen`/`storno`-Tests dürfen nicht brechen).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/belege.rs
git commit -m "feat(gutschrift): stellen und Zahlungslage für Gutschriften"
```

---

## Task 5: Positionsbeträge einer Gutschrift negativ speichern

**Files:**
- Modify: `src-tauri/src/commands/belege.rs` (Positions-Speicherpfad — `position_speichern`/`belegposition_save`)
- Test: `src-tauri/src/commands/belege.rs`

Der Editor erfasst positive Brutto-Einzelpreise und Mengen; bei einer Gutschrift werden `einzelpreis_cent` und `positionssumme_cent` negativ abgelegt (`ust_satz_prozent` bleibt positiv), damit `beleg.summe_cent` negativ wird — analog zu `storniere_rechnung` (`belege.rs:1038`).

- [ ] **Step 1: Failing-Test**

```rust
#[sqlx::test]
async fn gutschrift_position_wird_negativ_gespeichert(pool: SqlitePool) {
    kunde_mit_rechnungsadresse(&pool, "k1").await;
    let g = create(&pool, BelegNeu { typ: "gutschrift".into(), kunde_id: "k1".into(),
        datum: "2026-09-05".into(), leistungsdatum: "2026-09-05".into(), leistungsdatum_bis: None,
        zahlungsziel_tage: 0, kopftext: "".into(), fusstext: "".into(), gutschrift_zu_id: None }).await.unwrap();

    // positiv erfasst (menge 1, einzelpreis 5000, satz 19)
    let pos = position_speichern(&pool, /* BelegpositionNeu für g.id */).await.unwrap();
    assert_eq!(pos.einzelpreis_cent, -5000);
    assert_eq!(pos.positionssumme_cent, -5000);
    assert_eq!(pos.ust_satz_prozent, 19);

    let d = get(&pool, g.id).await.unwrap();
    assert_eq!(d.beleg.summe_cent, -5000);
}
```

- [ ] **Step 2: Fehlschlag prüfen**

Run: `cd src-tauri && cargo test gutschrift_position_wird_negativ_gespeichert -- --nocapture`
Expected: FAIL — Beträge sind positiv.

- [ ] **Step 3: Implementierung**

Im Positions-Speicherpfad: nach der Berechnung von `positionssumme_cent` (über `positionssumme_cent(menge_x1000, einzelpreis_cent)`, das positive Eingaben verlangt) das Vorzeichen abhängig vom Belegtyp drehen. Muster:

```rust
    let beleg_typ: (String,) = sqlx::query_as("SELECT typ FROM beleg WHERE id = ?")
        .bind(&position.beleg_id).fetch_one(pool).await?;
    let vorzeichen: i64 = if beleg_typ.0 == "gutschrift" { -1 } else { 1 };
    let einzelpreis_gespeichert = position.einzelpreis_cent * vorzeichen;
    let positionssumme_gespeichert = roh_positionssumme * vorzeichen;
```

`roh_positionssumme` ist das positive Ergebnis von `positionssumme_cent(...)`. `belegsumme_cent` summiert danach die (negativen) Positionssummen unverändert.

Die genaue Stelle: in `belege.rs` nach `fn position_speichern`/`belegposition_save` suchen; das Muster in `storniere_rechnung` (`-pos.einzelpreis_cent`, `-pos.positionssumme_cent`) als Vorlage. `menge` bleibt positiv.

Prüfen: Wird `summe_cent` am Beleg nach jedem Positions-Speichern neu berechnet? (In `storniere_rechnung` wird `summe_cent` direkt gesetzt.) Der vorhandene Pfad für Rechnungen aktualisiert `beleg.summe_cent` — dieselbe Stelle nutzt jetzt die negativen Positionssummen und ergibt automatisch die negative Belegsumme.

- [ ] **Step 4: Erfolg prüfen**

Run: `cd src-tauri && cargo test -- --nocapture`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/belege.rs
git commit -m "feat(gutschrift): Positionsbeträge negativ speichern"
```

---

## Task 6: `gutschrift_aus_rechnung` — Gutschrift mit Rechnungsbezug

**Files:**
- Modify: `src-tauri/src/commands/belege.rs` (neue Funktion + Tauri-Wrapper)
- Modify: `src-tauri/src/ipc.rs` (Wrapper registrieren)
- Test: `src-tauri/src/commands/belege.rs`

- [ ] **Step 1: Failing-Test**

```rust
#[sqlx::test]
async fn gutschrift_aus_rechnung_uebernimmt_kunde_adresse_kopftext_positionen(pool: SqlitePool) {
    kunde_mit_rechnungsadresse(&pool, "k1").await;
    let r = rechnung_gestellt_mit_positionen(&pool, "k1", &[(1, 5000, 19), (2, 1000, 7)]).await; // Helfer/inline

    let g = gutschrift_aus_rechnung(&pool, r.id.clone()).await.unwrap();
    assert_eq!(g.typ, "gutschrift");
    assert_eq!(g.status, "entwurf");
    assert_eq!(g.kunde_id, "k1");
    assert_eq!(g.gutschrift_zu_id.as_deref(), Some(r.id.as_str()));

    let d = get(&pool, g.id).await.unwrap();
    assert_eq!(d.positionen.len(), 2);
    // im Entwurf positiv dargestellt? Entscheidung: Positionen werden bei der
    // referenzierten Gutschrift ebenfalls positiv kopiert und erst beim
    // Neu-Speichern/Stellen negiert. -> hier prüfen wie kopiert:
    assert!(d.positionen.iter().all(|p| p.positionssumme_cent > 0));
}

#[sqlx::test]
async fn gutschrift_aus_rechnung_lehnt_angebot_storno_entwurf_ab(pool: SqlitePool) {
    kunde_mit_rechnungsadresse(&pool, "k1").await;
    let entwurf = create(&pool, BelegNeu { typ: "rechnung".into(), kunde_id: "k1".into(),
        datum: "2026-09-05".into(), leistungsdatum: "2026-09-05".into(), leistungsdatum_bis: None,
        zahlungsziel_tage: 14, kopftext: "".into(), fusstext: "".into(), gutschrift_zu_id: None }).await.unwrap();
    let err = gutschrift_aus_rechnung(&pool, entwurf.id).await.unwrap_err();
    assert!(matches!(err, AppError::Validation { feld, .. } if feld == "gutschrift_zu_id"));

    // stornierte Rechnung
    let r = rechnung_gestellt_mit_positionen(&pool, "k1", &[(1, 5000, 19)]).await;
    storniere_rechnung(&pool, r.id.clone()).await.unwrap();
    let err2 = gutschrift_aus_rechnung(&pool, r.id).await.unwrap_err();
    assert!(matches!(err2, AppError::Validation { feld, .. } if feld == "gutschrift_zu_id"));
}

#[sqlx::test]
async fn mehrere_gutschriften_zur_selben_rechnung_erlaubt(pool: SqlitePool) {
    kunde_mit_rechnungsadresse(&pool, "k1").await;
    let r = rechnung_gestellt_mit_positionen(&pool, "k1", &[(1, 5000, 19)]).await;
    gutschrift_aus_rechnung(&pool, r.id.clone()).await.unwrap();
    gutschrift_aus_rechnung(&pool, r.id.clone()).await.unwrap(); // kein Fehler
}
```

**Entscheidung (im Test fixiert):** Positionen werden **positiv** in den Entwurf kopiert (wie bei `duplizieren`); die Negierung passiert erst beim Neu-Speichern einer Position bzw. spätestens ist die Summe beim Stellen negativ. Damit der Editor konsistent „positiv rein" zeigt. Achtung: Wenn eine Position im Editor **nicht** angefasst wird, bleibt sie positiv und `beleg.summe_cent` stimmt nicht. → **Besser:** direkt negativ kopieren (Vorzeichen wie ein gestellter Storno), und der Editor stellt für die Anzeige/Bearbeitung den Betrag positiv dar (`Math.abs`). Das ist die robustere Wahl. Test entsprechend auf `positionssumme_cent < 0` und `beleg.summe_cent < 0` ändern und in Task 15 den Editor `Math.abs` für Gutschrift-Positionen anzeigen lassen.

**→ Diese Entscheidung im eigenen Review (nach dem Plan) endgültig festklopfen und Test + Task 15 danach ausrichten. Default dieser Plan: negativ kopieren.**

- [ ] **Step 2: Fehlschlag prüfen**

Run: `cd src-tauri && cargo test gutschrift_aus_rechnung mehrere_gutschriften -- --nocapture`
Expected: FAIL — Funktion existiert nicht.

- [ ] **Step 3: Implementierung**

```rust
/// Legt einen Gutschrift-Entwurf mit Bezug auf eine gestellte Rechnung an.
/// Kunde, Rechnungsadresse/Ansprechpartner und Kopftext werden übernommen,
/// die Positionen als Vorlage kopiert (Beträge negiert — eine Gutschrift ist
/// eine Rückabwicklung). Der Nutzer kürzt/löscht im Editor.
pub async fn gutschrift_aus_rechnung(pool: &SqlitePool, rechnung_id: String) -> AppResult<Beleg> {
    let rechnung = lade_beleg(pool, &rechnung_id).await?;
    // Bezug nur auf eine echte, gestellte Rechnung (nicht Storno, nicht Entwurf,
    // nicht storniert, kein Angebot).
    let bezug_gueltig = rechnung.typ == "rechnung"
        && rechnung.storno_von_id.is_none()
        && matches!(rechnung.status.as_str(), "gestellt");
    // Hinweis: 'bezahlt'/'teilbezahlt' sind KEINE eigenen DB-Status — der Status
    // einer gestellten Rechnung bleibt 'gestellt', die Zahlungslage ist abgeleitet.
    // 'storniert' ist ein echter Status und wird hier ausgeschlossen.
    if !bezug_gueltig {
        return Err(AppError::Validation {
            feld: "gutschrift_zu_id".into(),
            meldung: "Eine Gutschrift kann sich nur auf eine gestellte, nicht stornierte Rechnung beziehen".into(),
        });
    }

    let mut tx = pool.begin().await?;
    let id = Uuid::new_v4().to_string();
    let heute = heute();
    sqlx::query(
        "INSERT INTO beleg (id, typ, nummer, status, kunde_id, kunde_snapshot, datum, leistungsdatum, \
         zahlungsziel_tage, kopftext, fusstext, summe_cent, gutschrift_zu_id, adresse_id, ansprechpartner_id, created_at, updated_at) \
         VALUES (?, 'gutschrift', NULL, 'entwurf', ?, '', ?, ?, 0, ?, ?, 0, ?, ?, ?, ?, ?)")
        .bind(&id).bind(&rechnung.kunde_id).bind(&heute).bind(&heute)
        .bind(&rechnung.kopftext)
        .bind(gutschrift_fusstext_baustein(pool).await?) // text.gutschrift.fuss, sonst ""
        .bind(&rechnung_id)
        .bind(&rechnung.adresse_id).bind(&rechnung.ansprechpartner_id)
        .bind(jetzt()).bind(jetzt())
        .execute(&mut *tx).await?;

    let positionen: Vec<Belegposition> = sqlx::query_as(
        &format!("SELECT {BELEGPOSITION_SPALTEN} FROM belegposition WHERE beleg_id = ? AND deleted_at IS NULL ORDER BY reihenfolge"))
        .bind(&rechnung_id).fetch_all(&mut *tx).await?;
    for pos in &positionen {
        sqlx::query(
            "INSERT INTO belegposition (id, beleg_id, artikel_id, bezeichnung, einheit_kuerzel, einzelpreis_cent, menge, positionssumme_cent, ust_satz_prozent, reihenfolge, created_at, updated_at) \
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
            .bind(Uuid::new_v4().to_string()).bind(&id).bind(&pos.artikel_id).bind(&pos.bezeichnung)
            .bind(&pos.einheit_kuerzel).bind(-pos.einzelpreis_cent.abs()).bind(pos.menge)
            .bind(-pos.positionssumme_cent.abs()).bind(pos.ust_satz_prozent).bind(pos.reihenfolge)
            .bind(jetzt()).bind(jetzt())
            .execute(&mut *tx).await?;
    }
    let summe: i64 = positionen.iter().map(|p| -p.positionssumme_cent.abs()).sum();
    sqlx::query("UPDATE beleg SET summe_cent = ?, updated_at = ? WHERE id = ?")
        .bind(summe).bind(jetzt()).bind(&id).execute(&mut *tx).await?;

    tx.commit().await?;
    lade_beleg(pool, &id).await
}

#[tauri::command]
pub async fn gutschrift_aus_rechnung_anlegen(pool: tauri::State<'_, SqlitePool>, rechnungId: String) -> AppResult<Beleg> {
    gutschrift_aus_rechnung(&pool, rechnungId).await
}
```

`gutschrift_fusstext_baustein` klein halten: `einstellungen::get(pool, "text.gutschrift.fuss")` → `.unwrap_or_default()`. Falls es die Helferstruktur nicht wert ist, inline in die Funktion ziehen.

Den Tauri-Wrapper in `src-tauri/src/ipc.rs` in die `invoke_handler!`/Command-Liste eintragen (bei den anderen `gutschrift`-/`rechnung_`-Wrappern; Namensschema `gutschrift_aus_rechnung_anlegen`). Prüfen, wie die Wrapper dort registriert sind (Liste in `ipc.rs:~86`).

- [ ] **Step 4: Erfolg prüfen**

Run: `cd src-tauri && cargo test -- --nocapture`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/belege.rs src-tauri/src/ipc.rs
git commit -m "feat(gutschrift): gutschrift_aus_rechnung mit Positionsübernahme"
```

---

## Task 6b: `erfasse_zahlung` für Gutschrift-Erstattungen

**Files:**
- Modify: `src-tauri/src/commands/belege.rs` (`erfasse_zahlung`)
- Test: `src-tauri/src/commands/belege.rs`

`erfasse_zahlung` weist heute alles ab, was nicht `typ == "rechnung"` ist. Ein
Stornobeleg ist eine Rechnung (mit `storno_von_id`) und kommt durch; eine
Gutschrift (`typ == "gutschrift"`) nicht. Für die Erstattungserfassung
(negativer Betrag, wie beim Storno) muss der Typ mit rein.

- [ ] **Step 1: Failing-Test**

```rust
#[tokio::test]
async fn erstattung_zu_festgeschriebener_gutschrift_moeglich() {
    let (_dir, pool) = test_pool().await;
    kunde_mit_rechnungsadresse(&pool, "k1").await;
    let g = /* Gutschrift anlegen, Position, stellen -> festgeschrieben */;
    let z = erfasse_zahlung(&pool, ZahlungNeu {
        rechnung_id: g.id.clone(), datum: "2026-09-06".into(),
        betrag_cent: -3000, notiz: "Erstattung".into(),
    }).await.unwrap();
    assert_eq!(z.betrag_cent, -3000);

    let d = get(&pool, g.id).await.unwrap();
    assert_eq!(d.offener_betrag_cent, -2000); // summe -5000, erstattet -3000
}

#[tokio::test]
async fn zahlung_zu_gutschrift_entwurf_wird_abgewiesen() {
    let (_dir, pool) = test_pool().await;
    kunde_mit_rechnungsadresse(&pool, "k1").await;
    let g = create(&pool, BelegNeu { typ: "gutschrift".into(), kunde_id: "k1".into(),
        datum: "2026-09-06".into(), leistungsdatum: "2026-09-06".into(), leistungsdatum_bis: None,
        zahlungsziel_tage: 0, kopftext: "".into(), fusstext: "".into(), gutschrift_zu_id: None }).await.unwrap();
    let err = erfasse_zahlung(&pool, ZahlungNeu {
        rechnung_id: g.id, datum: "2026-09-06".into(), betrag_cent: -100, notiz: "".into(),
    }).await.unwrap_err();
    assert!(matches!(err, AppError::Validation { .. }));
}
```

- [ ] **Step 2: Fehlschlag prüfen**

Run: `cd src-tauri && cargo test erstattung_zu_festgeschriebener_gutschrift zahlung_zu_gutschrift_entwurf -- --nocapture`
Expected: FAIL — „Zahlungen sind nur zu Rechnungen möglich".

- [ ] **Step 3: Implementierung** in `erfasse_zahlung`:

```rust
    let beleg = lade_beleg(pool, &d.rechnung_id).await?;
    let ist_rechnung = beleg.typ == "rechnung";
    let ist_gutschrift = beleg.typ == "gutschrift";
    if !ist_rechnung && !ist_gutschrift {
        return Err(AppError::Validation { feld: "rechnung_id".into(),
            meldung: "Zahlungen sind nur zu Rechnungen und Gutschriften möglich".into() });
    }
    let status_ok = if ist_rechnung {
        ["gestellt", "storniert"].contains(&beleg.status.as_str())
    } else {
        beleg.status == "festgeschrieben"
    };
    if !status_ok {
        return Err(AppError::Validation { feld: "rechnung_id".into(),
            meldung: "Zahlungen sind nur zu festgeschriebenen/gestellten Belegen möglich".into() });
    }
```

(Variablennamen `rechnung` → `beleg` in der Funktion mitziehen. `zahlung_loeschen` prüft den Typ nicht — kein Handlungsbedarf.)

- [ ] **Step 4: Erfolg prüfen**

Run: `cd src-tauri && cargo test -- --nocapture`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/belege.rs
git commit -m "feat(gutschrift): Erstattungen als negative Zahlung erfassen"
```

---

## Task 7: Kontext — `gutschrift_zu_nummer` für Export

**Files:**
- Modify: `src-tauri/src/dokument/kontext.rs` (`BelegKontext`, `kontext_aus_beleg`, Test-Kontext-Helfer)
- Test: `src-tauri/src/dokument/kontext.rs`

- [ ] **Step 1: Failing-Test**

```rust
#[sqlx::test]
async fn kontext_liefert_gutschrift_zu_nummer(pool: SqlitePool) {
    // Rechnung r mit Nummer RE-2026-0001 stellen, Gutschrift g mit Bezug festschreiben
    // (Helfer analog vorhandener kontext-Tests)
    let k = kontext_aus_beleg(&pool, g_id).await.unwrap();
    assert_eq!(k.gutschrift_zu_nummer.as_deref(), Some("RE-2026-0001"));
    assert!(k.storno_von_nummer.is_none());
}
```

- [ ] **Step 2: Fehlschlag prüfen**

Run: `cd src-tauri && cargo test kontext_liefert_gutschrift_zu_nummer -- --nocapture`
Expected: FAIL — Feld existiert nicht.

- [ ] **Step 3: Implementierung**

In `struct BelegKontext` nach `storno_von_nummer`:

```rust
    /// Nummer der Ursprungsrechnung einer kaufmännischen Gutschrift. Steuert
    /// BG-3 in der E-Rechnung (TypeCode 381) und die Bezugszeile auf dem PDF.
    /// `None` bei freier Gutschrift und bei jeder anderen Belegart.
    pub gutschrift_zu_nummer: Option<String>,
```

In `kontext_aus_beleg`, analog zum `storno_von_nummer`-Block:

```rust
    let gutschrift_zu_nummer = match &detail.beleg.gutschrift_zu_id {
        Some(id) => {
            let zeile: Option<(Option<String>,)> =
                sqlx::query_as("SELECT nummer FROM beleg WHERE id = ?").bind(id).fetch_optional(pool).await?;
            zeile.and_then(|z| z.0)
        }
        None => None,
    };
```

Im `Ok(BelegKontext { … })`-Literal `gutschrift_zu_nummer,` ergänzen. Alle Test-Kontext-Konstruktoren in `kontext.rs`, `pdf.rs` (`kontext` in Tests), `xrechnung.rs` (`test_kontext`, `regelbesteuert_kontext`) um `gutschrift_zu_nummer: None,` erweitern — der Compiler listet sie.

- [ ] **Step 4: Erfolg prüfen**

Run: `cd src-tauri && cargo test -- --nocapture`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/dokument/kontext.rs src-tauri/src/dokument/pdf.rs src-tauri/src/dokument/xrechnung.rs
git commit -m "feat(gutschrift): gutschrift_zu_nummer im Belegkontext"
```

---

## Task 8: Export-Guards lockern + XRechnung TypeCode 381 + BG-3

**Files:**
- Modify: `src-tauri/src/dokument/export.rs` (`pruefe_ist_rechnung` → Rechnung oder Gutschrift; nur für XRechnung/ZUGFeRD, **nicht** für die Zahlungserinnerung)
- Modify: `src-tauri/src/dokument/xrechnung.rs` (`type_code`, BG-3-Block)
- Test: `src-tauri/src/dokument/xrechnung.rs`

- [ ] **Step 1: Failing-Test** — in `xrechnung.rs` `mod tests`:

```rust
#[test]
fn xml_erzeugen_setzt_typecode_381_fuer_gutschrift() {
    let mut k = test_kontext(None, -5000);
    k.beleg.typ = "gutschrift".into();
    let xml = xml_erzeugen(&k).unwrap();
    assert!(xml.contains("<ram:TypeCode>381</ram:TypeCode>"));
}

#[test]
fn gutschrift_mit_bezug_schreibt_bg3() {
    let mut k = test_kontext(None, -5000);
    k.beleg.typ = "gutschrift".into();
    k.gutschrift_zu_nummer = Some("RE-2026-0001".into());
    let xml = xml_erzeugen(&k).unwrap();
    assert!(xml.contains("<ram:InvoiceReferencedDocument>"));
    assert!(xml.contains("RE-2026-0001"));
}

#[test]
fn freie_gutschrift_ohne_bezug_schreibt_kein_bg3() {
    let mut k = test_kontext(None, -5000);
    k.beleg.typ = "gutschrift".into();
    let xml = xml_erzeugen(&k).unwrap();
    assert!(!xml.contains("<ram:InvoiceReferencedDocument>"));
}
```

- [ ] **Step 2: Fehlschlag prüfen**

Run: `cd src-tauri && cargo test xml_erzeugen_setzt_typecode_381 gutschrift_mit_bezug_schreibt_bg3 freie_gutschrift_ohne_bezug -- --nocapture`
Expected: FAIL — TypeCode ist 380, BG-3 hängt an `storno_von_nummer`.

- [ ] **Step 3: `type_code` in `xml_erzeugen`**

```rust
    let type_code = if kontext.beleg.typ == "gutschrift" {
        "381"
    } else if kontext.beleg.storno_von_id.is_some() {
        "384"
    } else {
        "380"
    };
```

Die `.abs()`-Behandlung der Beträge ist bereits unbedingt (nicht an `storno_von_id` gekoppelt) — negative Gutschriftbeträge landen damit automatisch als Positivwerte im XML.

- [ ] **Step 4: BG-3-Block generisch machen**

Ersetzen:

```rust
    // BG-3: Verweis auf die Vorrechnung — bei einer Korrektur (384) und bei
    // einer Gutschrift mit Rechnungsbezug (381).
    let bezug_nummer = kontext.storno_von_nummer.as_ref().or(kontext.gutschrift_zu_nummer.as_ref());
    if let Some(nummer) = bezug_nummer {
        xml.auf("ram:InvoiceReferencedDocument");
        xml.feld("ram:IssuerAssignedID", nummer);
        xml.zu("ram:InvoiceReferencedDocument");
    }
```

- [ ] **Step 5: Export-Guard in `export.rs`**

`pruefe_ist_rechnung` umbenennen/erweitern zu `pruefe_ist_rechnung_oder_gutschrift`:

```rust
fn pruefe_ist_rechnung_oder_gutschrift(kontext: &crate::dokument::kontext::BelegKontext) -> AppResult<()> {
    if !matches!(kontext.beleg.typ.as_str(), "rechnung" | "gutschrift") {
        return Err(crate::error::AppError::Validation {
            feld: "typ".into(),
            meldung: "Nur Rechnungen und Gutschriften können als XRechnung/ZUGFeRD exportiert werden".into(),
        });
    }
    Ok(())
}
```

Aufrufe in `rechnung_xrechnung_exportieren` und `rechnung_zugferd_exportieren` umstellen. **`pruefe_kann_erinnert_werden` behält den strengen `pruefe_ist_rechnung`-Check** — dafür eine private `fn nur_rechnung(kontext)` belassen oder den Typvergleich inline (`kontext.beleg.typ != "rechnung"`). Eine Gutschrift bekommt keine Zahlungserinnerung.

- [ ] **Step 6: Erfolg prüfen**

Run: `cd src-tauri && cargo test -- --nocapture`
Expected: PASS (inkl. bestehender Storno-XRechnung-Tests — `storno_von_nummer` bleibt funktional).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/dokument/export.rs src-tauri/src/dokument/xrechnung.rs
git commit -m "feat(gutschrift): XRechnung TypeCode 381, BG-3, Export-Guards"
```

---

## Task 9: Spike + KoSIT-Normtests für die Gutschrift-XRechnung

**Files:**
- Modify: `src-tauri/src/dokument/xrechnung.rs` (`mod tests` — Normtests; ggf. `pruefe_exportierbarkeit`)
- Test: dieselbe Datei

**Spike zuerst (nicht committen):** Klären, ob der KoSIT-CIUS (XRechnung 3.0.2, CII) für `TypeCode 381` den BG-3-Verweis **zwingend** verlangt.

- [ ] **Step 1: Spike** — einen `#[ignore]`-Test schreiben, der eine freie Gutschrift (ohne `gutschrift_zu_nummer`) durch den vorhandenen KoSIT-Validierungs-Helfer schickt (Muster: `storno_xrechnung_ist_normkonform`, nutzt `KOSIT_PFLICHT`/den `kosit`-Helfer):

```rust
#[test]
fn spike_freie_gutschrift_kosit() {
    let mut k = regelbesteuert_kontext(None, &[(19, 5000)]);
    k.beleg.typ = "gutschrift".into();
    k.beleg.nummer = Some("GS-2026-0001".into());
    let xml = xml_erzeugen(&k).unwrap();
    let befunde = crate::dokument::kosit::pruefe(&xml).unwrap();
    println!("BEFUNDE freie Gutschrift: {befunde:#?}");
    // kein assert — nur Beobachtung
}
```

Run: `cd src-tauri && KOSIT_PFLICHT=1 cargo test spike_freie_gutschrift_kosit -- --nocapture --include-ignored`
Beobachten: Meckert der Validator über einen fehlenden `InvoiceReferencedDocument`/BG-3 bei 381?

- [ ] **Step 2: Ergebnis umsetzen**

**Fall A — BG-3 ist für 381 optional:** Spike-Test löschen. Zwei echte Normtests:

```rust
#[test]
fn gutschrift_mit_bezug_xrechnung_ist_normkonform() {
    let mut k = regelbesteuert_kontext(None, &[(19, 5000), (7, 1000)]);
    k.beleg.typ = "gutschrift".into();
    k.beleg.nummer = Some("GS-2026-0001".into());
    k.gutschrift_zu_nummer = Some("RE-2026-0001".into());
    let xml = xml_erzeugen(&k).unwrap();
    let befunde = crate::dokument::kosit::pruefe(&xml).unwrap();
    assert!(befunde.is_empty(), "Gutschrift-XRechnung abgelehnt:\n{befunde:#?}");
}

#[test]
fn freie_gutschrift_xrechnung_ist_normkonform() {
    let mut k = regelbesteuert_kontext(None, &[(19, 5000)]);
    k.beleg.typ = "gutschrift".into();
    k.beleg.nummer = Some("GS-2026-0002".into());
    let xml = xml_erzeugen(&k).unwrap();
    let befunde = crate::dokument::kosit::pruefe(&xml).unwrap();
    assert!(befunde.is_empty(), "Freie Gutschrift-XRechnung abgelehnt:\n{befunde:#?}");
}
```

Plus je ein Kleinunternehmer-Pendant (Kategorie E) über `test_kontext`.

**Fall B — BG-3 ist für 381 Pflicht:** `xrechnung::pruefe_exportierbarkeit` erweitern:

```rust
    if kontext.beleg.typ == "gutschrift" && kontext.gutschrift_zu_nummer.is_none() {
        return Err(AppError::Validation {
            feld: "gutschrift_zu_id".into(),
            meldung: "Eine Gutschrift ohne Bezug auf eine Rechnung lässt sich nicht als E-Rechnung \
                      exportieren (die Norm verlangt den Rechnungsverweis). Als PDF ist sie möglich.".into(),
        });
    }
```

Normtest nur für die Gutschrift **mit** Bezug (Fall A, erster Test) + ein Test, der bei fehlendem Bezug `pruefe_exportierbarkeit` als `Err` erwartet. Der genaue `pruefe_exportierbarkeit`-Signaturkontext ist aus der Datei zu übernehmen.

- [ ] **Step 3: Ausführen**

Run: `cd src-tauri && KOSIT_PFLICHT=1 cargo test gutschrift -- --nocapture`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/dokument/xrechnung.rs
git commit -m "test(gutschrift): KoSIT-Normtests für die Gutschrift-XRechnung"
```

---

## Task 10: PDF — Titel „Gutschrift", Bezugszeile, kein Girocode

**Files:**
- Modify: `src-tauri/src/dokument/pdf.rs` (`dokument_bauen` Titel; Kontext-Übergabe `gutschrift_zu_nummer`; Girocode-Guard)
- Modify: `src-tauri/templates/rechnung.typ` (Titel-Logik, Bezugszeile)
- Test: `src-tauri/src/dokument/pdf.rs`

- [ ] **Step 1: Failing-Test**

```rust
#[test]
fn gutschrift_pdf_traegt_titel_und_bezug() {
    let mut kontext = /* test-kontext wie rendern_storno... */;
    kontext.beleg.typ = "gutschrift".into();
    kontext.beleg.gutschrift_zu_id = Some("r1".into());
    kontext.gutschrift_zu_nummer = Some("RE-2026-0007".into());
    let t = pdf_text(&kontext); // vorhandener Text-Extraktions-Helfer der Datei
    assert!(t.contains("Gutschrift"));
    assert!(t.contains("RE-2026-0007"));
    assert!(!t.contains("GiroCode"));
}
```

- [ ] **Step 2: Fehlschlag prüfen**

Run: `cd src-tauri && cargo test gutschrift_pdf_traegt_titel_und_bezug -- --nocapture`
Expected: FAIL

- [ ] **Step 3: `dokument_bauen` — Titel**

```rust
    let titel = if kontext.beleg.typ == "angebot" {
        "Angebot"
    } else if kontext.beleg.typ == "gutschrift" {
        "Gutschrift"
    } else if kontext.beleg.storno_von_id.is_some() {
        "Rechnungskorrektur"
    } else {
        "Rechnung"
    };
```

- [ ] **Step 4: Kontext an Typst übergeben** — bei den `sys.inputs` (in `pdf.rs`, Bereich mit `("storno_von_nummer", …)`):

```rust
        ("gutschrift_zu_nummer", kontext.gutschrift_zu_nummer.clone().unwrap_or_default()),
```

- [ ] **Step 5: Girocode-Guard** in `pdf.rs`:

```rust
    let girocode_json = if kontext.beleg.typ == "rechnung" && kontext.beleg.storno_von_id.is_none() {
```

bleibt korrekt (Gutschrift ist `typ != "rechnung"`) — **keine Änderung nötig**, aber im Test absichern (Step 1 tut das).

- [ ] **Step 6: `rechnung.typ`** — die vorhandene Storno-Bezugszeile (`#if ist_gesetzt(sys.inputs.storno_von_nummer)` → „Storno zu Rechnung …") um einen Gutschrift-Zweig ergänzen:

```typ
#if ist_gesetzt(sys.inputs.at("gutschrift_zu_nummer", default: "")) [
  #v(0.3em)
  Gutschrift zu Rechnung #sys.inputs.gutschrift_zu_nummer
]
```

Den Titel-Text der Vorlage prüfen: Wird er aus einem `sys.inputs`-Wert gesetzt oder aus `dokument_bauen`? Falls die Vorlage den Titel selbst aus `beleg.typ` ableitet, dort den `gutschrift`-Fall ergänzen. (An der Stelle orientieren, wo „Angebot"/„Rechnung" in `rechnung.typ` steht.)

- [ ] **Step 7: Erfolg prüfen**

Run: `cd src-tauri && cargo test -- --nocapture`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/dokument/pdf.rs src-tauri/templates/rechnung.typ
git commit -m "feat(gutschrift): PDF-Titel, Bezugszeile, kein Girocode"
```

---

## Task 11: veraPDF — Gutschrift-PDF ist PDF/A-3b

**Files:**
- Modify: `src-tauri/src/dokument/pdf.rs` oder `verapdf.rs` (`mod tests`)
- Test: dort

- [ ] **Step 1: Test** (Muster: vorhandener veraPDF-Test für die Rechnung):

```rust
#[test]
fn gutschrift_pdf_ist_pdfa3b() {
    let mut kontext = /* regelbesteuerter Gutschrift-Kontext, 2 Positionen, negativ */;
    kontext.beleg.typ = "gutschrift".into();
    kontext.beleg.nummer = Some("GS-2026-0001".into());
    let bytes = pdf::rendern(&kontext, None, &Vorlage::standard()).unwrap();
    let befunde = crate::dokument::verapdf::pruefe(&bytes).unwrap();
    assert!(befunde.is_empty(), "veraPDF-Befunde:\n{befunde:#?}");
}
```

Signaturen (`verapdf::pruefe`, `Vorlage::standard`/`::default`) aus dem vorhandenen Rechnungs-Test übernehmen.

- [ ] **Step 2: Ausführen**

Run: `cd src-tauri && cargo test gutschrift_pdf_ist_pdfa3b -- --nocapture`
Expected: PASS (die Vorlage ist dieselbe; sollte ohne Codeänderung grün sein). Falls rot: Befund analysieren, meist ein Vorlagen-Detail.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/dokument/
git commit -m "test(gutschrift): veraPDF-Normtest für die Gutschrift-PDF"
```

---

## Task 12: Auswertung & Dashboard — Tests

**Files:**
- Modify: `src-tauri/src/commands/auswertung.rs` (`mod tests`), `src-tauri/src/commands/dashboard.rs` (`mod tests`)

Kein Produktivcode: `jahresauswertung` summiert `zahlung.betrag_cent` über alle Belegarten, `dashboard`-Umsatz ebenso, `offene_posten` filtert bereits `typ = 'rechnung'`. Nur absichern.

- [ ] **Step 1: Auswertungs-Test**

```rust
#[sqlx::test]
async fn erstattung_auf_gutschrift_mindert_die_jahresauswertung(pool: SqlitePool) {
    // Rechnung stellen, Zahlung +10000 am 2026-03-01
    // Gutschrift festschreiben, Erstattung -3000 am 2026-04-01 (zahlung mit negativem Betrag)
    let a = jahresauswertung(&pool, 2026).await.unwrap();
    assert_eq!(a.summe_cent, 7_000_00 - 0); // 10000 - 3000 => hier in Cent anpassen
    assert_eq!(a.summe_cent, 700000);
}
```

Zahlungserfassung mit negativem Betrag geht über `erfasse_zahlung` (vorhandener Test `… "Rückzahlung nach Storno"` als Vorlage; `rechnung_id` zeigt auf die Gutschrift).

- [ ] **Step 2: Dashboard-Test**

```rust
#[sqlx::test]
async fn erstattung_auf_gutschrift_senkt_den_laufenden_umsatz(pool: SqlitePool) {
    // analog: Zahlung +10000 im laufenden Jahr, Erstattung -3000
    // dashboard-Umsatzabfrage prüfen -> 7000,00 €
}

#[sqlx::test]
async fn gutschrift_ist_kein_offener_posten(pool: SqlitePool) {
    // festgeschriebene Gutschrift mit negativer Summe, keine Erstattung
    let posten = offene_posten(&pool).await.unwrap();
    assert!(posten.iter().all(|p| p.beleg.typ == "rechnung"));
}
```

- [ ] **Step 3: Ausführen**

Run: `cd src-tauri && cargo test erstattung_auf_gutschrift gutschrift_ist_kein_offener_posten -- --nocapture`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/auswertung.rs src-tauri/src/commands/dashboard.rs
git commit -m "test(gutschrift): Auswertung, Umsatz, Offene Posten"
```

---

## Task 13: Frontend — Typen, API, Hooks, Status

**Files:**
- Modify: `src/api.ts` (`Beleg`, `BelegNeu`, `belege.list`, `belege.gutschriftAusRechnung`)
- Modify: `src/hooks/useBelegListe.tsx` (Typunion)
- Modify: `src/belegStatus.ts` (`GUTSCHRIFT_STATUS`, Labels/Klassen)
- Test: `src/belegStatus.test.ts` falls vorhanden, sonst neuer Test

- [ ] **Step 1: Failing-Test** — `src/belegStatus.test.ts` (neu oder erweitern):

```ts
import { describe, it, expect } from "vitest";
import { statusLabel, GUTSCHRIFT_STATUS } from "./belegStatus";

describe("Gutschrift-Status", () => {
  it("kennt entwurf und festgeschrieben", () => {
    expect(GUTSCHRIFT_STATUS).toEqual(["entwurf", "festgeschrieben", "storniert"]);
    expect(statusLabel("festgeschrieben")).toBe("Festgeschrieben");
  });
});
```

(„storniert" bleibt drin, falls eine Gutschrift später doch stornierbar sein soll — vorerst ungenutzt, schadet aber nicht. Wenn der Reviewer das als YAGNI streicht: `["entwurf", "festgeschrieben"]`.)

- [ ] **Step 2: Fehlschlag prüfen**

Run: `npm test -- --run src/belegStatus.test.ts`
Expected: FAIL — `GUTSCHRIFT_STATUS` nicht exportiert.

- [ ] **Step 3: Implementierung**

`src/belegStatus.ts`:

```ts
/** Statuswerte, die eine Gutschrift annehmen kann. */
export const GUTSCHRIFT_STATUS = ["entwurf", "festgeschrieben", "storniert"] as const;
```

`LABEL`/`KLASSE` decken `entwurf`/`festgeschrieben`/`storniert` bereits ab — nichts weiter nötig.

`src/api.ts`:
- `interface Beleg` → `gutschrift_zu_id?: string | null;`
- `BelegNeu` → `gutschrift_zu_id?: string | null;` und `typ: "angebot" | "rechnung" | "gutschrift";`
- `belege.list` Signatur: `typ?: "angebot" | "rechnung" | "gutschrift"`
- neu in `belege`:

```ts
    gutschriftAusRechnung: (rechnungId: string) =>
      invoke<Beleg>("gutschrift_aus_rechnung_anlegen", { rechnungId }),
```

- `belege.stellen`-Doku ergänzen: „Bei einer Gutschrift Status → festgeschrieben."

`src/hooks/useBelegListe.tsx`:
- `export function useBelegListe(typ: "angebot" | "rechnung" | "gutschrift", …)`
- Der `anlegen`-Pfad liest `text.${typ}.kopf`/`.fuss` — für `gutschrift` liefert Task 1 die Seeds. `api.belege.create({ typ, … })` bekommt implizit `gutschrift_zu_id: undefined` → Backend behandelt das als `None`. Passt.

- [ ] **Step 4: Erfolg prüfen**

Run: `npm test -- --run src/belegStatus.test.ts && npm run build`
Expected: PASS + TypeScript kompiliert.

- [ ] **Step 5: Commit**

```bash
git add src/api.ts src/hooks/useBelegListe.tsx src/belegStatus.ts src/belegStatus.test.ts
git commit -m "feat(gutschrift): Frontend-Typen, API, Status"
```

---

## Task 14: Frontend — Seite „Gutschriften" + Navigation

**Files:**
- Create: `src/pages/Gutschriften.tsx`, `src/pages/Gutschriften.test.tsx`
- Modify: `src/components/Layout.tsx` (`Seite`-Typ, `NAV_EINTRAEGE`)
- Modify: `src/App.tsx` (State, `navigiere`-Reset, Render-Zweig)

- [ ] **Step 1: Failing-Test** — `src/pages/Gutschriften.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Gutschriften } from "./Gutschriften";
import { api } from "../api";

vi.mock("../api");

beforeEach(() => {
  vi.mocked(api.belege.list).mockResolvedValue([]);
  vi.mocked(api.kunden.list).mockResolvedValue([]);
});

describe("Gutschriften", () => {
  it("zeigt den leeren Zustand als Hinweisbox", async () => {
    render(<Gutschriften onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Noch keine Gutschriften/)).toBeTruthy());
  });

  it("ruft die Liste mit typ='gutschrift' ab", async () => {
    render(<Gutschriften onOeffnen={() => {}} />);
    await waitFor(() => expect(api.belege.list).toHaveBeenCalledWith("gutschrift", undefined, undefined));
  });
});
```

Mock-Details (`vi.mock`, `clearAllMocks` in `beforeEach`) an `src/pages/Rechnungen.test.tsx` ausrichten — dieselbe Struktur.

- [ ] **Step 2: Fehlschlag prüfen**

Run: `npm test -- --run src/pages/Gutschriften.test.tsx`
Expected: FAIL — Modul fehlt.

- [ ] **Step 3: `src/pages/Gutschriften.tsx`** — Mirror von `Rechnungen.tsx`, reduziert (keine Fälligkeitsspalte, „offen" = „Erstattung offen"):

```tsx
import { useRef, useState } from "react";
import { BelegAnlegen } from "../components/BelegAnlegen";
import { Fehler } from "../components/Fehler";
import { ZeilenKnopf } from "../components/ZeilenKnopf";
import { Blaettern } from "../components/Blaettern";
import { Hinweis } from "../components/Hinweis";
import { Laden } from "../components/Laden";
import { SortierKopf } from "../components/SortierKopf";
import { StatusMarke } from "../components/StatusMarke";
import { Werkzeugleiste } from "../components/Werkzeugleiste";
import { GUTSCHRIFT_STATUS, statusAuswahl } from "../belegStatus";
import { datumDeutsch } from "../datum";
import { formatCent } from "../geld";
import { useBelegListe } from "../hooks/useBelegListe";
import { useListenTastenkuerzel } from "../hooks/useListenTastenkuerzel";
import { type Zahlungsstand } from "../api";

interface GutschriftenProps {
  onOeffnen: (id: string) => void;
}

const ERSTATTUNG_LABEL: Record<Zahlungsstand, string> = {
  offen: "Erstattung offen",
  teilbezahlt: "Teilerstattet",
  bezahlt: "Erstattet",
  ueberzahlt: "Übererstattet",
};

export function Gutschriften({ onOeffnen }: GutschriftenProps) {
  const liste = useBelegListe("gutschrift", onOeffnen);
  const [leerHinweisVersteckt, setLeerHinweisVersteckt] = useState(false);
  const sucheRef = useRef<HTMLInputElement>(null);

  useListenTastenkuerzel({
    neu: () => liste.setZeigeFormular(true),
    sucheFokussieren: () => sucheRef.current?.focus(),
  });

  return (
    <div>
      <h1 data-tour="titel">Gutschriften</h1>
      {liste.fehler && <Fehler fehler={liste.fehler} />}
      <Werkzeugleiste
        filter={
          <>
            <label className="feld">
              Suche
              <input
                ref={sucheRef}
                type="search"
                value={liste.suche}
                onChange={(e) => liste.setSuche(e.currentTarget.value)}
                placeholder="Nummer oder Kunde"
              />
            </label>
            <label className="feld">
              Status
              <select
                value={liste.statusFilter}
                onChange={(e) => liste.setStatusFilter(e.currentTarget.value)}
              >
                <option value="">Alle</option>
                {statusAuswahl(GUTSCHRIFT_STATUS).map(([wert, label]) => (
                  <option key={wert} value={wert}>{label}</option>
                ))}
              </select>
            </label>
          </>
        }
        aktion={
          !liste.zeigeFormular && (
            <button
              type="button"
              className="btn btn-primaer"
              onClick={() => liste.setZeigeFormular(true)}
            >
              Neue Gutschrift
            </button>
          )
        }
      />

      {liste.zeigeFormular ? (
        <BelegAnlegen
          kunden={liste.kunden}
          kundeId={liste.kundeId}
          onKundeId={liste.setKundeId}
          datum={liste.datum}
          onDatum={liste.setDatum}
          fehler={liste.formFehler}
          onAnlegen={liste.anlegen}
        />
      ) : (
        <>
          {!liste.geladen && <Laden was="Gutschriften" />}

          {liste.geladen && liste.belege.length === 0 &&
            !liste.suche && !liste.statusFilter && !leerHinweisVersteckt && (
              <Hinweis onSchliessen={() => setLeerHinweisVersteckt(true)}>
                Noch keine Gutschriften — leg oben eine an oder erstelle eine aus einer Rechnung.
              </Hinweis>
            )}

          {liste.geladen && liste.belege.length === 0 && (liste.suche || liste.statusFilter) && (
            <p>
              {liste.suche
                ? `Keine Gutschriften gefunden für „${liste.suche}".`
                : "Keine Gutschriften mit diesem Status."}
            </p>
          )}

          <table className="tabelle tabelle-klickbar">
            <thead>
              <tr>
                <SortierKopf spalte="nummer" aktiv={liste.sortierung.spalte} richtung={liste.sortierung.richtung} onSortieren={liste.sortieren}>Nummer</SortierKopf>
                <SortierKopf spalte="kunde" aktiv={liste.sortierung.spalte} richtung={liste.sortierung.richtung} onSortieren={liste.sortieren}>Kunde</SortierKopf>
                <SortierKopf spalte="datum" aktiv={liste.sortierung.spalte} richtung={liste.sortierung.richtung} onSortieren={liste.sortieren}>Datum</SortierKopf>
                <SortierKopf spalte="status" aktiv={liste.sortierung.spalte} richtung={liste.sortierung.richtung} onSortieren={liste.sortieren}>Status</SortierKopf>
                <th>Erstattung</th>
                <SortierKopf spalte="summe" aktiv={liste.sortierung.spalte} richtung={liste.sortierung.richtung} onSortieren={liste.sortieren}>Betrag</SortierKopf>
              </tr>
            </thead>
            <tbody>
              {liste.belege.map((g) => (
                <tr key={g.id} onClick={() => onOeffnen(g.id)}>
                  <td className="tabelle-num nicht-umbrechen">
                    <ZeilenKnopf onOeffnen={() => onOeffnen(g.id)}>{g.nummer ?? "Entwurf"}</ZeilenKnopf>
                  </td>
                  <td>{liste.kundeName(g)}</td>
                  <td className="nicht-umbrechen">{datumDeutsch(g.datum)}</td>
                  <td>
                    <StatusMarke status={g.status} />
                    {g.gutschrift_zu_id && <span className="marke">mit Bezug</span>}
                  </td>
                  <td>{g.zahlungsstand ? ERSTATTUNG_LABEL[g.zahlungsstand] : "—"}</td>
                  <td className="nicht-umbrechen">{formatCent(g.summe_cent)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <Blaettern
            seite={liste.seite}
            seitenAnzahl={liste.seitenAnzahl}
            gesamt={liste.trefferAnzahl}
            onSeite={liste.setSeite}
          />
        </>
      )}
    </div>
  );
}
```

Vor dem Schreiben `Rechnungen.tsx` gegenlesen: Falls dort Pflicht-Requisiten an `Werkzeugleiste`/`BelegAnlegen` hängen, die hier fehlen, angleichen. `SeitenkopfMitRundgang` weglassen (kein Rundgang für die neue Seite) oder mit leeren Schritten — an `Eingangsrechnungen.tsx` orientieren, die evtl. auch keinen Rundgang hat.

- [ ] **Step 4: Navigation** — `src/components/Layout.tsx`:
- `export type Seite = … | "gutschriften"` ergänzen (die Union in der Datei suchen).
- In `NAV_EINTRAEGE` **nach** dem Rechnungen-Eintrag:

```tsx
  { seite: "gutschriften", label: "Gutschriften", icon: ICON_RECHNUNGEN },
```

(Eigenes Icon optional — vorerst `ICON_RECHNUNGEN` wiederverwenden oder ein schlichtes neues SVG analog den anderen. Kein Blocker.)

- [ ] **Step 5: `src/App.tsx`**
- Import: `import { Gutschriften } from "./pages/Gutschriften";`
- State: `const [ausgewaehlteGutschrift, setAusgewaehlteGutschrift] = useState<string | null>(null);`
- In `navigiere`: `setAusgewaehlteGutschrift(null);`
- Render-Zweig (nach `rechnungen`):

```tsx
      {seite === "gutschriften" &&
        (ausgewaehlteGutschrift ? (
          <BelegEditor
            id={ausgewaehlteGutschrift}
            onGeloescht={() => setAusgewaehlteGutschrift(null)}
            onZurueck={() => setAusgewaehlteGutschrift(null)}
            onDupliziert={setAusgewaehlteGutschrift}
          />
        ) : (
          <Gutschriften onOeffnen={setAusgewaehlteGutschrift} />
        ))}
```

- [ ] **Step 6: Erfolg prüfen**

Run: `npm test -- --run src/pages/Gutschriften.test.tsx && npm run build`
Expected: PASS + Build grün.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Gutschriften.tsx src/pages/Gutschriften.test.tsx src/components/Layout.tsx src/App.tsx
git commit -m "feat(gutschrift): Listenseite und Navigation"
```

---

## Task 15: Frontend — BelegEditor-Zweig für Gutschriften

**Files:**
- Modify: `src/pages/BelegEditor.tsx`
- Modify: `src/pages/Rechnungen.tsx` (Knopf „Gutschrift erstellen" auf einer gestellten Rechnung — im Editor, nicht in der Liste)
- Test: `src/pages/BelegEditor.test.tsx`

- [ ] **Step 1: Failing-Tests** — in `BelegEditor.test.tsx` (Struktur der Datei übernehmen; `api` gemockt):

```tsx
it("zeigt für eine Gutschrift den Titel und keine Angebots-/Storno-Knöpfe", async () => {
  vi.mocked(api.belege.get).mockResolvedValue(gutschriftDetail({ status: "entwurf" }));
  render(<BelegEditor id="g1" />);
  await waitFor(() => expect(screen.getByRole("heading", { name: /Gutschrift/ })).toBeTruthy());
  expect(screen.queryByRole("button", { name: /Stornieren/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /In Rechnung überführen/ })).toBeNull();
});

it("bietet auf einer gestellten Rechnung „Gutschrift erstellen“", async () => {
  vi.mocked(api.belege.get).mockResolvedValue(rechnungDetail({ status: "gestellt", storno_von_id: null }));
  vi.mocked(api.belege.gutschriftAusRechnung).mockResolvedValue(gutschriftDetail({ status: "entwurf" }).beleg);
  render(<BelegEditor id="r1" />);
  const knopf = await screen.findByRole("button", { name: /Gutschrift erstellen/ });
  fireEvent.click(knopf);
  await waitFor(() => expect(api.belege.gutschriftAusRechnung).toHaveBeenCalledWith("r1"));
});

it("Festschreiben-Dialog einer Gutschrift spricht von Erstattung, nicht von „stellen“", async () => {
  vi.mocked(api.belege.get).mockResolvedValue(gutschriftDetail({ status: "entwurf", positionen: [einePosition()] }));
  render(<BelegEditor id="g1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Festschreiben" }));
  await waitFor(() => expect(screen.getByText(/Gutschrift festschreiben/)).toBeTruthy());
});
```

`gutschriftDetail`/`rechnungDetail`-Helfer analog vorhandener Test-Fixtures der Datei bauen (`beleg.typ = "gutschrift"`, negative `summe_cent`).

- [ ] **Step 2: Fehlschlag prüfen**

Run: `npm test -- --run src/pages/BelegEditor.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implementierung in `BelegEditor.tsx`**

Hilfsvariablen oben:

```tsx
  const istGutschrift = beleg.typ === "gutschrift";
  const istAngebot = beleg.typ === "angebot";
  const istRechnung = beleg.typ === "rechnung";
```

Titel:

```tsx
      <h1 className="seiten-kopf">
        {istAngebot ? "Angebot" : istGutschrift ? "Gutschrift" : "Rechnung"} {beleg.nummer ?? "(Entwurf)"}
      </h1>
```

Bezugszeile unter dem Titel, wenn `beleg.gutschrift_zu_id` gesetzt: die Rechnungsnummer ist im Frontend nicht direkt am Beleg — entweder (a) `BelegDetail` um `gutschrift_zu_nummer` erweitern (Backend `get` liefert es mit; kleiner Zusatz in `belege.rs::get` + `BelegDetail`), oder (b) schlicht „Gutschrift mit Rechnungsbezug" ohne Nummer anzeigen. **Empfehlung: (a)** — `get` lädt die Nummer analog `kontext_aus_beleg`. Ein eigener Mini-Schritt:
  - `BelegDetail` (Rust + `src/api.ts`) → `gutschrift_zu_nummer: Option<String>` / `gutschrift_zu_nummer?: string | null`
  - in `belege.rs::get` nach dem Laden: wenn `beleg.gutschrift_zu_id`, `SELECT nummer FROM beleg WHERE id = ?`.

```tsx
      {istGutschrift && detail.gutschrift_zu_nummer && (
        <p className="beleg-bezug">Gutschrift zu Rechnung {detail.gutschrift_zu_nummer}</p>
      )}
```

`stellen()`-Funktion — Gutschrift-Zweig für Frage + Erfolgsmeldung:

```tsx
    const frage = istAngebot
      ? "Angebot festschreiben? …"
      : istGutschrift
        ? "Gutschrift festschreiben? Sie bekommt eine feste Nummer und ist danach nicht mehr änderbar. " +
          "Verschickt wird nichts — dafür exportierst du sie als PDF/E-Rechnung und schickst sie selbst."
        : "Rechnung stellen? …";
    …
    if (!(await bestaetigen(frage, istRechnung ? "Stellen" : "Festschreiben", vorschau))) return;
    …
    zeigen(istAngebot ? "Angebot festgeschrieben" : istGutschrift ? "Gutschrift festgeschrieben" : "Rechnung gestellt");
```

Knopf-Beschriftung „Festschreiben"/„Stellen": `{istRechnung ? "Stellen" : "Festschreiben"}`.

Aktionsknöpfe absichern — jeweils die Bedingungen an den konkreten Typ binden:
- „In Rechnung überführen": bleibt `beleg.typ === "angebot" && …`
- PDF-Export: `beleg.status !== "entwurf"` — gilt auch für Gutschrift, ok.
- XRechnung/ZUGFeRD: `(istRechnung || istGutschrift) && beleg.status !== "entwurf"` statt nur `beleg.typ === "rechnung"`.
- Zahlungserinnerung: bleibt `istRechnung && …` (Gutschrift bekommt keine).
- Stornieren: bleibt `beleg.typ === "rechnung" && beleg.status === "gestellt" && beleg.storno_von_id === null`.
- **`ZahlungenAbschnitt`** (unten in der Komponente, heute
  `beleg.typ === "rechnung" && ["gestellt", "storniert"].includes(beleg.status)`):
  Zweig für die Gutschrift ergänzen → `istGutschrift && beleg.status === "festgeschrieben"`.
  Damit lässt sich die Erstattung erfassen. Der `ZahlungenAbschnitt` selbst
  kennt keine Typen; prüfen, ob seine Texte („offener Betrag") bei negativen
  Werten sinnvoll klingen — ggf. minimale Anpassung analog `GUTSCHRIFT_LABEL`
  in `Rechnungen.tsx`.
- „Als Kopie anlegen": bleibt verfügbar (dupliziert die Gutschrift als Entwurf ohne Bezug — akzeptabel).
- Neuer Knopf **auf einer gestellten Rechnung** (nicht Storno, nicht Gutschrift):

```tsx
  async function gutschriftErstellen() {
    setFehler(null); setLaeuft(true);
    try {
      const g = await api.belege.gutschriftAusRechnung(beleg.id);
      onGeaendert?.();
      onDupliziert?.(g.id); // öffnet den neuen Entwurf im selben Editor-Slot
      zeigen("Gutschrift-Entwurf erstellt");
    } catch (e) { setFehler(e as AppFehler); } finally { setLaeuft(false); }
  }
```

```tsx
  {istRechnung && beleg.status === "gestellt" && beleg.storno_von_id === null && (
    <button type="button" className="btn" disabled={laeuft} onClick={gutschriftErstellen}>
      Gutschrift erstellen
    </button>
  )}
```

**Achtung `onDupliziert`:** im `rechnungen`-Zweig von `App.tsx` setzt `onDupliziert` `setAusgewaehlteRechnung` — die neue Gutschrift würde dann im Rechnungs-Slot geöffnet. Sauberer: eigenen Callback `onGutschriftErstellt?: (id: string) => void` an `BelegEditor` geben, den `App.tsx` im `rechnungen`-Zweig auf `setSeite("gutschriften"); setAusgewaehlteRechnung(null); setAusgewaehlteGutschrift(id);` setzt (Muster: vorhandenes `onRechnungErstellt` im `angebote`-Zweig). Diesen Callback ergänzen.

Positionen positiv anzeigen: `PositionenAbschnitt` bekommt die (negativen) Positionen. Für die Gutschrift die Beträge zur Anzeige/Bearbeitung positiv reichen. Zwei Optionen:
- **(A)** In `BelegEditor` vor der Übergabe `positionen.map(p => istGutschrift ? {...p, einzelpreis_cent: Math.abs(p.einzelpreis_cent), positionssumme_cent: Math.abs(p.positionssumme_cent)} : p)` und die `beleg.summe_cent`-Anzeige mit `Math.abs` — aber das verschleiert das Vorzeichen des Belegs.
- **(B)** Beträge negativ lassen, `PositionenAbschnitt` zeigt sie negativ. Beim Bearbeiten einer Position tippt der Nutzer aber positiv → Backend negiert erneut (Task 5). Ein bereits negativer, unangetasteter Betrag bleibt negativ; ein neu gespeicherter wird aus positiver Eingabe negiert. Das ist konsistent.

**Empfehlung (B)**, plus die Summenzeile zeigt den negativen Betrag (korrekt: eine Gutschrift ist negativ). `formatCent(-5000)` → „−50,00 €". Der Test aus Task 6 (negativ kopiert) passt dazu. **Im eigenen Review endgültig entscheiden und `PositionenAbschnitt` prüfen**, ob es mit negativen Werten sauber rendert (evtl. kleine Anpassung im Abschnitt, dann als eigener Sub-Schritt).

- [ ] **Step 4: Erfolg prüfen**

Run: `npm test -- --run src/pages/BelegEditor.test.tsx && npm run build`
Expected: PASS + Build grün.

- [ ] **Step 5: Volle Frontend-Suite**

Run: `npm test -- --run`
Expected: PASS — besonders `BelegEditor.test.tsx`, `Rechnungen.test.tsx`, `App.test.tsx` (falls vorhanden) unbeschädigt.

- [ ] **Step 6: Commit**

```bash
git add src/pages/BelegEditor.tsx src/App.tsx src/api.ts src-tauri/src/commands/belege.rs
git commit -m "feat(gutschrift): BelegEditor-Zweig, Gutschrift aus Rechnung erstellen"
```

---

## Task 16: E2E-Durchstich

**Files:**
- Modify/Create: `e2e/` — an vorhandener E2E-Struktur ausrichten (`e2e/*.spec.ts`)

- [ ] **Step 1: Testszenario schreiben** — neuer Spec `e2e/gutschrift.spec.ts` (Muster: bestehender Rechnungs-Durchstich in `e2e/`):

1. App starten, Einrichtung ggf. durchlaufen (vorhandener Helfer).
2. Kunde mit Rechnungsadresse anlegen.
3. Rechnung anlegen, eine Position, stellen.
4. Rechnung öffnen → „Gutschrift erstellen" → landet im Gutschrift-Entwurf mit übernommener Position.
5. Position auf kleinere Menge kürzen, speichern.
6. „Festschreiben" bestätigen → Nummer `GS-…`, Status festgeschrieben.
7. „PDF" exportieren → Datei entsteht (Download-Assertion wie im Rechnungs-Durchstich).
8. „XRechnung" exportieren → Datei entsteht.
9. Navigation „Gutschriften" → die neue Gutschrift steht in der Liste mit negativem Betrag.

- [ ] **Step 2: Ausführen**

Run: `npm run test:e2e -- gutschrift`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add e2e/
git commit -m "test(gutschrift): E2E-Durchstich Rechnung → Gutschrift → Export"
```

---

## Task 17: README und CHANGELOG

**Files:**
- Modify: `README.md` (Abschnitt „Was die Anwendung kann")
- Modify: `docs/CHANGELOG.md` (neuer `## <Version>`-Abschnitt — Pflicht, sonst bricht `release.yml` ab)
- Modify: `docs/TODO.md` (Punkt 5 ins Archiv verschieben)

- [ ] **Step 1: README** — unter den Belegarten ergänzen:

```markdown
- **Kaufmännische Gutschrift** als eigene Belegart: nachträgliche Teilkorrektur
  mit Bezug auf eine Rechnung (Preisnachlass, Mängelrüge, Teilrückgabe) oder
  freie Gutschrift ohne Bezug. Eigener Nummernkreis, negativer Betrag, PDF/A-3b
  und E-Rechnung mit Dokumententyp 381 (bei Bezug mit Verweis auf die
  Ursprungsrechnung, BG-3). Das Vollstorno bleibt daneben bestehen.
```

- [ ] **Step 2: CHANGELOG** — neuen Abschnitt oben (Version nach dem Schema der Datei; Versionssprung mit dem Betreiber klären, hier Platzhalter `## <nächste Version>`):

```markdown
## <nächste Version>

- **Kaufmännische Gutschrift** als eigene Belegart (`typ = 'gutschrift'`).
  Einstieg über „Gutschrift erstellen" auf einer gestellten Rechnung (Kunde,
  Adresse und Positionen werden übernommen) oder als freie Gutschrift über den
  neuen Menüpunkt „Gutschriften". Eigener Nummernkreis `GS-{JJJJ}-{lfd:4}`,
  Beträge negativ, Festschreiben wie bei einer Rechnung, danach unveränderbar.
  Export als PDF/A-3b und XRechnung/ZUGFeRD (TypeCode 381, BG-3 bei Bezug),
  gegen den KoSIT-Validator geprüft. Erstattungen an den Kunden werden wie beim
  Storno als Zahlung mit negativem Betrag erfasst und mindern die
  Jahresauswertung.
```

- [ ] **Step 3: TODO** — Punkt 5 aus „Offen" entfernen, Kurzfassung ins Archiv unter neuem `## Stand (…)`.

- [ ] **Step 4: Prüfen**

Run: `cd src-tauri && cargo test && cd .. && npm test -- --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add README.md docs/CHANGELOG.md docs/TODO.md
git commit -m "docs(gutschrift): README, CHANGELOG, TODO"
```

---

## Self-Review (nach Fertigstellung des Plans, vom Autor auszuführen)

- [ ] **Spec-Abdeckung:** Jede Spec-Sektion → Task? (1 Datenmodell→T1–3; 2 Backend→T3–7; 3 Frontend→T13–15; 4 PDF→T10; 5 E-Rechnung→T8–9; 6 Auswertung→T12; 7 Tests→verteilt.)
- [ ] **Offener Spec-Punkt 1 (CHECK-Erweiterung):** T1 Step 3 baut die Tabelle neu — Muster `0010`. ✓
- [ ] **Offener Spec-Punkt 2 (BG-3 Pflicht für 381?):** T9 Spike entscheidet Fall A/B. ✓
- [ ] **Vorzeichen-Entscheidung** (Positionen negativ kopiert vs. positiv): T6 und T15 müssen zusammenpassen — Default: negativ kopieren, Editor zeigt/erfasst positiv, Backend negiert beim Speichern. Vor T6 endgültig festklopfen.
- [ ] **Namenskonsistenz:** `gutschrift_zu_id` (Spalte/Feld), `gutschrift_zu_nummer` (Kontext/BelegDetail), `gutschrift_aus_rechnung` (Fn), `gutschrift_aus_rechnung_anlegen` (Tauri-Wrapper), `gutschriftAusRechnung` (JS-API), `GUTSCHRIFT_STATUS` (JS). Durchgehend geprüft.
- [ ] **Kein Platzhalter** ohne Code. „an vorhandenem Muster ablesen" ist bewusst — die genauen Test-Helfer/Fixtures existieren im Repo und variieren; Code-Gerüst ist jeweils gegeben.

---

## Execution Handoff

Nach dem Speichern: eigenes gründliches Review von Spec **und** Plan (Projektstandard, siehe Memory `feedback-workflow-plan-review-subagent`), dann **superpowers:subagent-driven-development** — frischer Implementierer-Subagent je Task, danach Spec-Compliance-Review, dann Code-Quality-Review, bis sauber.
