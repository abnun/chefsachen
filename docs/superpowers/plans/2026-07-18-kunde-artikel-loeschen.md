# Kunde/Artikel Lösch-UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Neue „Löschen"-Buttons für Kunde (Liste + Detailseite) und Artikel (Liste), mit serverseitigen und clientseitigen Regeln, die verhindern, dass noch benötigte Daten verschwinden.

**Architecture:** Backend bekommt ein neues abgeleitetes Feld `hat_offene_entwuerfe` auf `Kunde` (analog `hat_adresse`) sowie eine Validierung in `kunde_delete`. `artikel_delete` bekommt einen neuen `kundenpreise_mitloeschen`-Parameter für kaskadierendes Löschen. Frontend nutzt den bestehenden `useLoeschBestaetigung`-Hook (Teilprojekt 2) und `useErfolgsHinweis` (Plan 7) an allen drei neuen Stellen.

**Tech Stack:** Rust/sqlx/SQLite (Backend), React/TypeScript/Vitest (Frontend), Tauri 2.

---

### Task 1: Backend — `hat_offene_entwuerfe` auf Kunde

**Files:**
- Modify: `src-tauri/src/commands/kunden.rs`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

An das `mod tests`-Modul in `src-tauri/src/commands/kunden.rs` anhängen (direkt vor der schließenden `}` des Moduls):

```rust
    #[tokio::test]
    async fn list_liefert_hat_offene_entwuerfe_korrekt() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = create(&pool, neu("ACME GmbH")).await.unwrap().id;

        let liste = list(&pool, None).await.unwrap();
        assert!(!liste.iter().find(|k| k.id == kunde_id).unwrap().hat_offene_entwuerfe);

        crate::commands::belege::create(&pool, crate::commands::belege::BelegNeu {
            typ: "angebot".into(), kunde_id: kunde_id.clone(), datum: "2026-07-10".into(),
            leistungsdatum: "2026-07-10".into(), zahlungsziel_tage: 14,
            kopftext: "".into(), fusstext: "".into(),
        }).await.unwrap();

        let liste = list(&pool, None).await.unwrap();
        assert!(liste.iter().find(|k| k.id == kunde_id).unwrap().hat_offene_entwuerfe);
    }
```

- [ ] **Step 2: Test läuft nicht (kompiliert nicht)**

Run: `cd src-tauri && cargo test list_liefert_hat_offene_entwuerfe_korrekt`
Erwartet: Kompilierfehler — `Kunde` hat kein Feld `hat_offene_entwuerfe`.

- [ ] **Step 3: Struct-Feld ergänzen**

Vorher:
```rust
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Kunde {
    pub id: String, pub typ: String, pub name: String, pub kundennummer: String,
    pub zahlungsziel_tage: i64, pub notizen: String, pub ust_idnr: String,
    pub email: String, pub leitweg_id: String, pub kaeuferreferenz: String,
    pub hat_adresse: bool,
}
```

Nachher:
```rust
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Kunde {
    pub id: String, pub typ: String, pub name: String, pub kundennummer: String,
    pub zahlungsziel_tage: i64, pub notizen: String, pub ust_idnr: String,
    pub email: String, pub leitweg_id: String, pub kaeuferreferenz: String,
    pub hat_adresse: bool,
    /// `true`, solange mindestens ein Angebot oder eine Rechnung im Status
    /// "entwurf" diesen Kunden referenziert. Wird von `delete()` genutzt, um
    /// das Löschen serverseitig abzulehnen — siehe Task 2.
    pub hat_offene_entwuerfe: bool,
}
```

- [ ] **Step 4: `create()`-Literal anpassen**

Vorher:
```rust
    let k = Kunde { id: Uuid::new_v4().to_string(), typ: d.typ, name: d.name.trim().into(),
        kundennummer, zahlungsziel_tage: d.zahlungsziel_tage, notizen: d.notizen,
        ust_idnr: d.ust_idnr, email: d.email, leitweg_id: d.leitweg_id,
        kaeuferreferenz: d.kaeuferreferenz, hat_adresse: false };
```

Nachher:
```rust
    let k = Kunde { id: Uuid::new_v4().to_string(), typ: d.typ, name: d.name.trim().into(),
        kundennummer, zahlungsziel_tage: d.zahlungsziel_tage, notizen: d.notizen,
        ust_idnr: d.ust_idnr, email: d.email, leitweg_id: d.leitweg_id,
        kaeuferreferenz: d.kaeuferreferenz, hat_adresse: false, hat_offene_entwuerfe: false };
```

- [ ] **Step 5: `list()`-Query anpassen**

Vorher:
```rust
pub async fn list(pool: &SqlitePool, suche: Option<String>) -> AppResult<Vec<Kunde>> {
    let muster = format!("%{}%", suche.unwrap_or_default().to_lowercase());
    Ok(sqlx::query_as(
        "SELECT k.id, k.typ, k.name, k.kundennummer, k.zahlungsziel_tage, k.notizen, k.ust_idnr, \
                k.email, k.leitweg_id, k.kaeuferreferenz, \
                EXISTS(SELECT 1 FROM adresse a WHERE a.kunde_id = k.id AND a.deleted_at IS NULL) AS hat_adresse \
         FROM kunde k WHERE k.deleted_at IS NULL AND (lower(k.name) LIKE ? OR lower(k.kundennummer) LIKE ?) ORDER BY k.name")
        .bind(&muster).bind(&muster).fetch_all(pool).await?)
}
```

Nachher:
```rust
pub async fn list(pool: &SqlitePool, suche: Option<String>) -> AppResult<Vec<Kunde>> {
    let muster = format!("%{}%", suche.unwrap_or_default().to_lowercase());
    Ok(sqlx::query_as(
        "SELECT k.id, k.typ, k.name, k.kundennummer, k.zahlungsziel_tage, k.notizen, k.ust_idnr, \
                k.email, k.leitweg_id, k.kaeuferreferenz, \
                EXISTS(SELECT 1 FROM adresse a WHERE a.kunde_id = k.id AND a.deleted_at IS NULL) AS hat_adresse, \
                EXISTS(SELECT 1 FROM beleg b WHERE b.kunde_id = k.id AND b.status = 'entwurf' AND b.deleted_at IS NULL) AS hat_offene_entwuerfe \
         FROM kunde k WHERE k.deleted_at IS NULL AND (lower(k.name) LIKE ? OR lower(k.kundennummer) LIKE ?) ORDER BY k.name")
        .bind(&muster).bind(&muster).fetch_all(pool).await?)
}
```

- [ ] **Step 6: `get()`-Query anpassen**

Vorher:
```rust
pub async fn get(pool: &SqlitePool, id: String) -> AppResult<KundeDetail> {
    let kunde: Kunde = sqlx::query_as(
        "SELECT k.id, k.typ, k.name, k.kundennummer, k.zahlungsziel_tage, k.notizen, k.ust_idnr, \
                k.email, k.leitweg_id, k.kaeuferreferenz, \
                EXISTS(SELECT 1 FROM adresse a WHERE a.kunde_id = k.id AND a.deleted_at IS NULL) AS hat_adresse \
         FROM kunde k WHERE k.id = ? AND k.deleted_at IS NULL")
        .bind(&id).fetch_optional(pool).await?.ok_or(AppError::NichtGefunden)?;
```

Nachher:
```rust
pub async fn get(pool: &SqlitePool, id: String) -> AppResult<KundeDetail> {
    let kunde: Kunde = sqlx::query_as(
        "SELECT k.id, k.typ, k.name, k.kundennummer, k.zahlungsziel_tage, k.notizen, k.ust_idnr, \
                k.email, k.leitweg_id, k.kaeuferreferenz, \
                EXISTS(SELECT 1 FROM adresse a WHERE a.kunde_id = k.id AND a.deleted_at IS NULL) AS hat_adresse, \
                EXISTS(SELECT 1 FROM beleg b WHERE b.kunde_id = k.id AND b.status = 'entwurf' AND b.deleted_at IS NULL) AS hat_offene_entwuerfe \
         FROM kunde k WHERE k.id = ? AND k.deleted_at IS NULL")
        .bind(&id).fetch_optional(pool).await?.ok_or(AppError::NichtGefunden)?;
```

- [ ] **Step 7: Test läuft**

Run: `cd src-tauri && cargo test list_liefert_hat_offene_entwuerfe_korrekt`
Erwartet: PASS.

- [ ] **Step 8: Volle Rust-Suite + Build**

Run: `cd src-tauri && cargo test` → 105/105 (104 bisherige + 1 neuer Test)
Run: `cd src-tauri && cargo build` → PASS

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/commands/kunden.rs
git commit -m "feat: hat_offene_entwuerfe auf Kunde ableiten"
```

---

### Task 2: Backend — `kunde_delete` lehnt bei offenen Entwürfen ab

**Files:**
- Modify: `src-tauri/src/commands/kunden.rs`

- [ ] **Step 1: Fehlschlagende Tests schreiben**

An das `mod tests`-Modul anhängen:

```rust
    #[tokio::test]
    async fn delete_lehnt_ab_wenn_entwurf_existiert() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = create(&pool, neu("ACME GmbH")).await.unwrap().id;
        crate::commands::belege::create(&pool, crate::commands::belege::BelegNeu {
            typ: "angebot".into(), kunde_id: kunde_id.clone(), datum: "2026-07-10".into(),
            leistungsdatum: "2026-07-10".into(), zahlungsziel_tage: 14,
            kopftext: "".into(), fusstext: "".into(),
        }).await.unwrap();

        let err = delete(&pool, kunde_id).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn delete_erlaubt_wenn_keine_belege_existieren() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = create(&pool, neu("ACME GmbH")).await.unwrap().id;
        delete(&pool, kunde_id).await.unwrap();
    }

    #[tokio::test]
    async fn delete_erlaubt_wenn_nur_gestellte_belege_existieren() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = create(&pool, neu("ACME GmbH")).await.unwrap().id;
        let artikel_id = crate::commands::artikel::create(&pool, crate::commands::artikel::ArtikelNeu {
            bezeichnung: "Beratung".into(), beschreibung: "".into(),
            einheit_id: "e0000000-0000-0000-0000-000000000001".into(), standardpreis_cent: 5000,
        }).await.unwrap().id;
        let beleg = crate::commands::belege::create(&pool, crate::commands::belege::BelegNeu {
            typ: "angebot".into(), kunde_id: kunde_id.clone(), datum: "2026-07-10".into(),
            leistungsdatum: "2026-07-10".into(), zahlungsziel_tage: 14,
            kopftext: "".into(), fusstext: "".into(),
        }).await.unwrap();
        crate::commands::belege::position_speichern(&pool, crate::commands::belege::BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        crate::commands::belege::stellen(&pool, beleg.id).await.unwrap();

        delete(&pool, kunde_id).await.unwrap();
    }
```

- [ ] **Step 2: Tests laufen nicht**

Run: `cd src-tauri && cargo test delete_lehnt_ab_wenn_entwurf_existiert delete_erlaubt_wenn_keine_belege_existieren delete_erlaubt_wenn_nur_gestellte_belege_existieren`
Erwartet: `delete_lehnt_ab_wenn_entwurf_existiert` FAIL (aktuell lehnt `delete()` nichts ab, der Kunde wird einfach gelöscht statt eines Validierungsfehlers). Die anderen beiden PASS bereits (aktuelles Verhalten erlaubt Löschen ohnehin immer) — das ist normal, TDD verlangt hier nur einen tatsächlich neuen roten Test.

- [ ] **Step 3: `delete()` anpassen**

Vorher:
```rust
pub async fn delete(pool: &SqlitePool, id: String) -> AppResult<()> {
    let r = sqlx::query("UPDATE kunde SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(jetzt()).bind(&id).execute(pool).await?;
    if r.rows_affected() == 0 { return Err(AppError::NichtGefunden); }
    Ok(())
}
```

Nachher:
```rust
pub async fn delete(pool: &SqlitePool, id: String) -> AppResult<()> {
    let hat_entwurf: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM beleg WHERE kunde_id = ? AND status = 'entwurf' AND deleted_at IS NULL")
        .bind(&id).fetch_one(pool).await?;
    if hat_entwurf.0 > 0 {
        return Err(AppError::Validation {
            feld: "id".into(),
            meldung: "Kunde hat noch offene Entwürfe und kann nicht gelöscht werden".into(),
        });
    }
    let r = sqlx::query("UPDATE kunde SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(jetzt()).bind(&id).execute(pool).await?;
    if r.rows_affected() == 0 { return Err(AppError::NichtGefunden); }
    Ok(())
}
```

- [ ] **Step 4: Tests laufen**

Run: `cd src-tauri && cargo test delete_lehnt_ab_wenn_entwurf_existiert delete_erlaubt_wenn_keine_belege_existieren delete_erlaubt_wenn_nur_gestellte_belege_existieren`
Erwartet: PASS (3/3).

- [ ] **Step 5: Volle Rust-Suite + Build**

Run: `cd src-tauri && cargo test` → 108/108 (105 aus Task 1 + 3 neue)
Run: `cd src-tauri && cargo build` → PASS

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/kunden.rs
git commit -m "feat: kunde_delete lehnt bei offenen Entwürfen ab"
```

---

### Task 3: Backend — `artikel_delete` mit Kundenpreise-Kaskade

**Files:**
- Modify: `src-tauri/src/commands/artikel.rs`

- [ ] **Step 1: Fehlschlagende Tests schreiben**

An das `mod tests`-Modul in `src-tauri/src/commands/artikel.rs` anhängen:

```rust
    #[tokio::test]
    async fn delete_loescht_artikel_ohne_kundenpreise() {
        let (_dir, pool) = test_pool().await;
        let a = create(&pool, neu("Beratung")).await.unwrap();
        delete(&pool, a.id, false).await.unwrap();
        let liste = list(&pool, None).await.unwrap();
        assert!(liste.is_empty());
    }

    #[tokio::test]
    async fn delete_lehnt_ab_bei_kundenpreisen_ohne_bestaetigung() {
        let (_dir, pool) = test_pool().await;
        let a = create(&pool, neu("Beratung")).await.unwrap();
        let k = kunde(&pool, "ACME GmbH").await;
        kundenpreis_speichern(&pool, Kundenpreis {
            id: "".into(), artikel_id: a.id.clone(), kunde_id: k, preis_cent: 4000, gueltig_ab: None,
        }).await.unwrap();

        let err = delete(&pool, a.id, false).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn delete_loescht_artikel_und_kundenpreise_gemeinsam_bei_bestaetigung() {
        let (_dir, pool) = test_pool().await;
        let a = create(&pool, neu("Beratung")).await.unwrap();
        let k = kunde(&pool, "ACME GmbH").await;
        let kp = kundenpreis_speichern(&pool, Kundenpreis {
            id: "".into(), artikel_id: a.id.clone(), kunde_id: k, preis_cent: 4000, gueltig_ab: None,
        }).await.unwrap();

        delete(&pool, a.id.clone(), true).await.unwrap();

        let liste = list(&pool, None).await.unwrap();
        assert!(liste.is_empty());
        let roh: (Option<String>,) = sqlx::query_as("SELECT deleted_at FROM kundenpreis WHERE id = ?")
            .bind(&kp.id).fetch_one(&pool).await.unwrap();
        assert!(roh.0.is_some());
    }
```

- [ ] **Step 2: Tests laufen nicht (kompilieren nicht)**

Run: `cd src-tauri && cargo test delete_loescht_artikel_ohne_kundenpreise`
Erwartet: Kompilierfehler — `delete()` erwartet nur zwei Argumente (`pool`, `id`), nicht drei.

- [ ] **Step 3: `delete()` anpassen**

Vorher:
```rust
pub async fn delete(pool: &SqlitePool, id: String) -> AppResult<()> {
    let r = sqlx::query("UPDATE artikel SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(jetzt()).bind(&id).execute(pool).await?;
    if r.rows_affected() == 0 { return Err(AppError::NichtGefunden); }
    Ok(())
}
```

Nachher:
```rust
pub async fn delete(pool: &SqlitePool, id: String, kundenpreise_mitloeschen: bool) -> AppResult<()> {
    let anzahl_kundenpreise: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM kundenpreis WHERE artikel_id = ? AND deleted_at IS NULL")
        .bind(&id).fetch_one(pool).await?;
    if anzahl_kundenpreise.0 > 0 && !kundenpreise_mitloeschen {
        return Err(AppError::Validation {
            feld: "id".into(),
            meldung: format!(
                "Artikel hat {} Kundenpreise — zum Löschen bestätigen, dass sie mitgelöscht werden sollen",
                anzahl_kundenpreise.0
            ),
        });
    }
    let mut tx = pool.begin().await?;
    if anzahl_kundenpreise.0 > 0 {
        sqlx::query("UPDATE kundenpreis SET deleted_at = ? WHERE artikel_id = ? AND deleted_at IS NULL")
            .bind(jetzt()).bind(&id).execute(&mut *tx).await?;
    }
    let r = sqlx::query("UPDATE artikel SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(jetzt()).bind(&id).execute(&mut *tx).await?;
    if r.rows_affected() == 0 { return Err(AppError::NichtGefunden); }
    tx.commit().await?;
    Ok(())
}
```

- [ ] **Step 4: Tauri-Command-Wrapper anpassen**

Vorher:
```rust
#[tauri::command]
pub async fn artikel_delete(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<()> {
    delete(&pool, id).await
}
```

Nachher:
```rust
#[tauri::command]
pub async fn artikel_delete(pool: tauri::State<'_, SqlitePool>, id: String, kundenpreise_mitloeschen: bool) -> AppResult<()> {
    delete(&pool, id, kundenpreise_mitloeschen).await
}
```

- [ ] **Step 5: Tests laufen**

Run: `cd src-tauri && cargo test delete_loescht_artikel_ohne_kundenpreise delete_lehnt_ab_bei_kundenpreisen_ohne_bestaetigung delete_loescht_artikel_und_kundenpreise_gemeinsam_bei_bestaetigung`
Erwartet: PASS (3/3).

- [ ] **Step 6: Volle Rust-Suite + Build**

Run: `cd src-tauri && cargo test` → 111/111 (108 aus Task 2 + 3 neue)
Run: `cd src-tauri && cargo build` → PASS

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands/artikel.rs
git commit -m "feat: artikel_delete kaskadiert optional auf Kundenpreise"
```

---

### Task 4: Frontend — API-Anpassungen

**Files:**
- Modify: `src/api.ts`

- [ ] **Step 1: `Kunde`-Interface erweitern**

Vorher:
```ts
export interface Kunde {
  id: string;
  typ: "firma" | "privat";
  name: string;
  kundennummer: string;
  zahlungsziel_tage: number;
  notizen: string;
  ust_idnr: string;
  email: string;
  leitweg_id: string;
  kaeuferreferenz: string;
  hat_adresse: boolean;
}
export type KundeNeu = Omit<Kunde, "id" | "kundennummer" | "hat_adresse">;
```

Nachher:
```ts
export interface Kunde {
  id: string;
  typ: "firma" | "privat";
  name: string;
  kundennummer: string;
  zahlungsziel_tage: number;
  notizen: string;
  ust_idnr: string;
  email: string;
  leitweg_id: string;
  kaeuferreferenz: string;
  hat_adresse: boolean;
  hat_offene_entwuerfe?: boolean;
}
export type KundeNeu = Omit<Kunde, "id" | "kundennummer" | "hat_adresse" | "hat_offene_entwuerfe">;
```

(Optionales Feld — bewusst nicht verpflichtend, damit bestehende Test-Fixtures in `Kunden.test.tsx`, `KundeDetail.test.tsx`, `Artikel.test.tsx`, `Rechnungen.test.tsx`, `Angebote.test.tsx` ohne dieses Feld weiterhin kompilieren, analog zu `kunde_snapshot_name` in Teilprojekt 1. Das Backend liefert es in der Praxis immer mit.)

- [ ] **Step 2: `artikel.delete`-Signatur anpassen**

Vorher:
```ts
    delete: (id: string) => invoke<void>("artikel_delete", { id }),
```

Nachher:
```ts
    delete: (id: string, kundenpreiseMitloeschen: boolean) =>
      invoke<void>("artikel_delete", { id, kundenpreiseMitloeschen }),
```

- [ ] **Step 3: Build läuft**

Run: `npm run build`
Erwartet: PASS (reine Typänderung, keine Verhaltensänderung — bestehende Aufrufstellen von `api.artikel.delete` gibt es noch keine).

- [ ] **Step 4: Volle Frontend-Suite**

Run: `npm test` → 99/99 (unverändert — reine Typ-/Signaturänderung ohne neue Tests in diesem Task)

- [ ] **Step 5: Commit**

```bash
git add src/api.ts
git commit -m "feat: Frontend-API für Kunde/Artikel-Löschen erweitert"
```

---

### Task 5: Frontend — Kunden.tsx (Liste)

**Files:**
- Modify: `src/pages/Kunden.tsx`
- Modify: `src/pages/Kunden.test.tsx`

- [ ] **Step 1: Fehlschlagende Tests schreiben**

`within` zum bestehenden `@testing-library/react`-Import ergänzen (Datei-Kopf, Zeile 1):

Vorher:
```tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
```

Nachher:
```tsx
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
```

`delete` zum Mock von `api.kunden` ergänzen (im `vi.mock("../api", ...)`-Block):

Vorher:
```tsx
    kunden: {
      list: vi.fn().mockResolvedValue([
        { id: "1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
          zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
          leitweg_id: "", kaeuferreferenz: "", hat_adresse: false },
      ]),
      create: vi.fn().mockResolvedValue({
        id: "neu1", typ: "firma", name: "Neu GmbH", kundennummer: "KD-0002",
        zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
        leitweg_id: "", kaeuferreferenz: "", hat_adresse: false,
      }),
    },
```

Nachher:
```tsx
    kunden: {
      list: vi.fn().mockResolvedValue([
        { id: "1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
          zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
          leitweg_id: "", kaeuferreferenz: "", hat_adresse: false },
      ]),
      create: vi.fn().mockResolvedValue({
        id: "neu1", typ: "firma", name: "Neu GmbH", kundennummer: "KD-0002",
        zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
        leitweg_id: "", kaeuferreferenz: "", hat_adresse: false,
      }),
      delete: vi.fn().mockResolvedValue(undefined),
    },
```

Drei neue Tests am Ende von `describe("Kunden", ...)` anhängen, direkt vor der schließenden `});`:

```tsx
  it("löscht einen Kunden nicht, wenn im Dialog abgebrochen wird", async () => {
    const { api } = await import("../api");
    render(<Kunden onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("ACME GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(vi.mocked(api.kunden.delete)).not.toHaveBeenCalled();
  });

  it("Löschen-Button ist deaktiviert, wenn der Kunde offene Entwürfe hat", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.list).mockResolvedValueOnce([
      { id: "1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
        zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
        leitweg_id: "", kaeuferreferenz: "", hat_adresse: true, hat_offene_entwuerfe: true },
    ]);
    render(<Kunden onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("ACME GmbH")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Löschen" })).toBeDisabled();
  });

  it("zeigt nach dem Löschen eines Kunden einen Erfolgs-Hinweis und öffnet nicht versehentlich die Detailseite", async () => {
    const onOeffnen = vi.fn();
    render(<Kunden onOeffnen={onOeffnen} />);
    await waitFor(() => expect(screen.getByText("ACME GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText('Kunde „ACME GmbH" löschen?')).toBeTruthy());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText('Kunde „ACME GmbH" gelöscht')).toBeTruthy());
    expect(onOeffnen).not.toHaveBeenCalled();
  });
```

**Wichtig — Reihenfolge**: Der Abbrechen-Test steht bewusst als ERSTER der drei neuen Tests. Es gibt kein `clearMocks`/`resetMocks` in der Vitest-Konfiguration — Mock-Aufrufhistorie bleibt über Tests hinweg innerhalb derselben Datei erhalten. Stünde der Erfolgs-Test (der `api.kunden.delete` aufruft) vorher, würde die Assertion `not.toHaveBeenCalled()` im Abbrechen-Test fälschlich fehlschlagen. Gleiches Muster wie bereits in Teilprojekt 2 etabliert.

Der letzte Test prüft zusätzlich `expect(onOeffnen).not.toHaveBeenCalled()` — das ist ein direkter Regressionstest für das beim Spec-Review gefundene Problem: die Tabellenzeile hat `onClick={() => onOeffnen(kunde.id)}`, ohne `stopPropagation()` im Löschen-Button würde ein Klick auf „Löschen" zusätzlich die Detailseite öffnen.

- [ ] **Step 2: Tests laufen nicht**

Run: `npm test -- Kunden`
Erwartet: FAIL — kein Löschen-Button vorhanden (3 neue Tests fehlschlagen, bestehende bleiben grün).

- [ ] **Step 3: Imports ergänzen**

Vorher:
```tsx
import { useEffect, useState } from "react";
import { api, istValidierungsfehler, type AppFehler, type Kunde, type KundeNeu } from "../api";
import { Fehler } from "../components/Fehler";
import { Hinweis } from "../components/Hinweis";
import type { Reiter } from "./KundeDetail";
```

Nachher:
```tsx
import { useEffect, useState } from "react";
import { api, istValidierungsfehler, type AppFehler, type Kunde, type KundeNeu } from "../api";
import { Fehler } from "../components/Fehler";
import { Hinweis } from "../components/Hinweis";
import { useErfolgsHinweis } from "../hooks/useErfolgsHinweis";
import { useLoeschBestaetigung } from "../hooks/useLoeschBestaetigung";
import type { Reiter } from "./KundeDetail";
```

- [ ] **Step 4: Hook-Aufrufe ergänzen**

Vorher:
```tsx
  const [artikelLeer, setArtikelLeer] = useState(false);
  const [zeigtArtikelHinweis, setZeigtArtikelHinweis] = useState(false);

  useEffect(() => {
    if (zeigeFormularBeimStart) {
```

Nachher:
```tsx
  const [artikelLeer, setArtikelLeer] = useState(false);
  const [zeigtArtikelHinweis, setZeigtArtikelHinweis] = useState(false);
  const { zeigen, hinweis } = useErfolgsHinweis();
  const { bestaetigen, dialog } = useLoeschBestaetigung();

  useEffect(() => {
    if (zeigeFormularBeimStart) {
```

- [ ] **Step 5: `loeschen`-Funktion ergänzen**

Vorher:
```tsx
    } catch (e) {
      setFormFehler(e as AppFehler);
    }
  }

  const feldFehler = (feld: string) =>
```

Nachher:
```tsx
    } catch (e) {
      setFormFehler(e as AppFehler);
    }
  }

  async function loeschen(id: string, name: string) {
    if (!(await bestaetigen(`Kunde „${name}" löschen?`))) return;
    setFehler(null);
    try {
      await api.kunden.delete(id);
      const liste = await api.kunden.list(suche || undefined);
      setKunden(liste);
      zeigen(`Kunde „${name}" gelöscht`);
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  const feldFehler = (feld: string) =>
```

- [ ] **Step 6: Render anpassen**

Vorher:
```tsx
      <h1 className="seiten-kopf">Kunden</h1>
      <Fehler fehler={fehler} />

      {zeigtAdressHinweis && neuerKundeId && (
```

Nachher:
```tsx
      <h1 className="seiten-kopf">Kunden</h1>
      <Fehler fehler={fehler} />
      {hinweis}
      {dialog}

      {zeigtAdressHinweis && neuerKundeId && (
```

Vorher (Tabelle):
```tsx
      <table className="tabelle tabelle-klickbar">
        <thead>
          <tr>
            <th>Nummer</th>
            <th>Name</th>
            <th>Typ</th>
          </tr>
        </thead>
        <tbody>
          {kunden.map((kunde) => (
            <tr key={kunde.id} onClick={() => onOeffnen(kunde.id)}>
              <td className="tabelle-num">{kunde.kundennummer}</td>
              <td>
                {kunde.name}
                {!kunde.hat_adresse && (
                  <span title="Keine Adresse hinterlegt">{WARNUNG_ICON}</span>
                )}
              </td>
              <td>{KUNDE_TYP_LABEL[kunde.typ] ?? kunde.typ}</td>
            </tr>
          ))}
        </tbody>
      </table>
```

Nachher:
```tsx
      <table className="tabelle tabelle-klickbar">
        <thead>
          <tr>
            <th>Nummer</th>
            <th>Name</th>
            <th>Typ</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {kunden.map((kunde) => (
            <tr key={kunde.id} onClick={() => onOeffnen(kunde.id)}>
              <td className="tabelle-num">{kunde.kundennummer}</td>
              <td>
                {kunde.name}
                {!kunde.hat_adresse && (
                  <span title="Keine Adresse hinterlegt">{WARNUNG_ICON}</span>
                )}
              </td>
              <td>{KUNDE_TYP_LABEL[kunde.typ] ?? kunde.typ}</td>
              <td>
                <button
                  type="button"
                  className="btn btn-gefahr"
                  disabled={kunde.hat_offene_entwuerfe}
                  onClick={(e) => {
                    e.stopPropagation();
                    loeschen(kunde.id, kunde.name);
                  }}
                >
                  Löschen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
```

**Wichtig — `stopPropagation()`**: Die Tabellenzeile hat bereits `onClick={() => onOeffnen(kunde.id)}`. Ohne `e.stopPropagation()` im Löschen-Button würde ein Klick auf „Löschen" per Event-Bubbling zusätzlich `onOeffnen` auslösen und die Detailseite öffnen. Dieses Detail wurde beim kritischen Review der Spec extra gefunden und ist kein optionaler Schönheitsfehler.

- [ ] **Step 7: Tests laufen**

Run: `npm test -- Kunden`
Erwartet: PASS.

- [ ] **Step 8: Volle Suite + Build**

Run: `npm test` → 102/102
Run: `npm run build` → PASS

- [ ] **Step 9: Commit**

```bash
git add src/pages/Kunden.tsx src/pages/Kunden.test.tsx
git commit -m "feat: Kunde-Löschen in der Kundenliste"
```

---

### Task 6: Frontend — KundeDetail.tsx (Stammdaten) + App.tsx

**Files:**
- Modify: `src/pages/KundeDetail.tsx`
- Modify: `src/pages/KundeDetail.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Fehlschlagende Tests schreiben**

`delete` zum Mock von `api.kunden` in `src/pages/KundeDetail.test.tsx` ergänzen:

Vorher:
```tsx
      update: vi.fn(),
      adresseSave: vi.fn(),
      adresseDelete: vi.fn(),
      ansprechpartnerSave: vi.fn(),
      ansprechpartnerDelete: vi.fn(),
    },
```

Nachher:
```tsx
      update: vi.fn(),
      delete: vi.fn(),
      adresseSave: vi.fn(),
      adresseDelete: vi.fn(),
      ansprechpartnerSave: vi.fn(),
      ansprechpartnerDelete: vi.fn(),
    },
```

Zwei neue Tests im `describe("KundeDetail", ...)`-Block anhängen, direkt vor der schließenden `});`:

```tsx
  it("Löschen-Button in den Stammdaten ist deaktiviert, wenn der Kunde offene Entwürfe hat", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.get).mockResolvedValueOnce({
      kunde: {
        id: "1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
        zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
        leitweg_id: "", kaeuferreferenz: "", hat_adresse: true, hat_offene_entwuerfe: true,
      },
      adressen: [], ansprechpartner: [],
    });
    render(<KundeDetail id="1" />);
    await waitFor(() => expect(screen.getByDisplayValue("ACME GmbH")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Löschen" })).toBeDisabled();
  });

  it("ruft onGeloescht nach dem Löschen des Kunden auf", async () => {
    const onGeloescht = vi.fn();
    render(<KundeDetail id="1" onGeloescht={onGeloescht} />);
    await waitFor(() => expect(screen.getByDisplayValue("ACME GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText('Kunde „ACME GmbH" löschen?')).toBeTruthy());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(onGeloescht).toHaveBeenCalledTimes(1));
  });
```

- [ ] **Step 2: Tests laufen nicht**

Run: `npm test -- KundeDetail`
Erwartet: FAIL — kein Löschen-Button in den Stammdaten vorhanden.

- [ ] **Step 3: `KundeDetailProps` und Komponentensignatur anpassen**

Vorher:
```tsx
interface KundeDetailProps {
  id: string;
  startReiter?: Reiter | null;
  onReiterUebernommen?: () => void;
}
```

Nachher:
```tsx
interface KundeDetailProps {
  id: string;
  startReiter?: Reiter | null;
  onReiterUebernommen?: () => void;
  onGeloescht?: () => void;
}
```

Vorher:
```tsx
export function KundeDetail({ id, startReiter, onReiterUebernommen }: KundeDetailProps) {
```

Nachher:
```tsx
export function KundeDetail({ id, startReiter, onReiterUebernommen, onGeloescht }: KundeDetailProps) {
```

- [ ] **Step 4: `onGeloescht` an `StammdatenReiter` durchreichen**

Vorher:
```tsx
      {reiter === "stammdaten" && (
        <StammdatenReiter kunde={detail.kunde} onGespeichert={laden} />
      )}
```

Nachher:
```tsx
      {reiter === "stammdaten" && (
        <StammdatenReiter kunde={detail.kunde} onGespeichert={laden} onGeloescht={onGeloescht} />
      )}
```

- [ ] **Step 5: `StammdatenReiter` anpassen**

Vorher:
```tsx
interface StammdatenReiterProps {
  kunde: Kunde;
  onGespeichert: () => void;
}

function StammdatenReiter({ kunde, onGespeichert }: StammdatenReiterProps) {
  const [form, setForm] = useState<Kunde>(kunde);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();

  useEffect(() => {
    setForm(kunde);
  }, [kunde]);

  async function speichern() {
    setFehler(null);
    try {
      await api.kunden.update(form);
      zeigen(`Kunde „${form.name}" gespeichert`);
      onGespeichert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Nachher:
```tsx
interface StammdatenReiterProps {
  kunde: Kunde;
  onGespeichert: () => void;
  onGeloescht?: () => void;
}

function StammdatenReiter({ kunde, onGespeichert, onGeloescht }: StammdatenReiterProps) {
  const [form, setForm] = useState<Kunde>(kunde);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();
  const { bestaetigen, dialog } = useLoeschBestaetigung();

  useEffect(() => {
    setForm(kunde);
  }, [kunde]);

  async function speichern() {
    setFehler(null);
    try {
      await api.kunden.update(form);
      zeigen(`Kunde „${form.name}" gespeichert`);
      onGespeichert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function loeschen() {
    if (!(await bestaetigen(`Kunde „${kunde.name}" löschen?`))) return;
    setFehler(null);
    try {
      await api.kunden.delete(kunde.id);
      onGeloescht?.();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

(`useLoeschBestaetigung` ist bereits am Datei-Kopf importiert — aus Teilprojekt 2, Task 4/5 dieses Repos, für `AdressenReiter`/`AnsprechpartnerReiter`. Kein erneuter Import nötig.)

- [ ] **Step 6: Render anpassen**

Vorher:
```tsx
  return (
    <section>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}
      {hinweis}
      <form
```

Nachher:
```tsx
  return (
    <section>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}
      {hinweis}
      {dialog}
      <form
```

Vorher (Ende der Funktion):
```tsx
        <button type="submit" className="btn btn-primaer">
          Speichern
        </button>
      </form>
    </section>
  );
}
```

Nachher:
```tsx
        <button type="submit" className="btn btn-primaer">
          Speichern
        </button>
      </form>
      <button
        type="button"
        className="btn btn-gefahr"
        disabled={kunde.hat_offene_entwuerfe}
        onClick={loeschen}
      >
        Löschen
      </button>
    </section>
  );
}
```

- [ ] **Step 7: `App.tsx` anpassen**

Reine Prop-Durchreichung, ohne eigenen Test: `App.tsx` hat aktuell keine
Testdatei/-infrastruktur, und die eigentliche Logik (`onGeloescht` wird nach
erfolgreichem Löschen aufgerufen) ist bereits über den KundeDetail-Test aus
Step 1 abgedeckt („ruft onGeloescht nach dem Löschen des Kunden auf"). Ein
neues `App.test.tsx` nur für diese eine Zeile Prop-Weitergabe würde
unverhältnismäßig viel Setup-Aufwand (Mocken aller Unterseiten) für
minimalen zusätzlichen Testwert bedeuten — abweichend von der Spec, die
noch einen eigenen App.tsx-Test vorsah, wird das hier bewusst
zusammengefasst. Verifiziert wird diese Zeile über `npm run build`
(Typecheck) und die volle Suite in Step 9.

Vorher:
```tsx
          <KundeDetail
            id={ausgewaehlterKunde}
            startReiter={kundeDetailStartReiter}
            onReiterUebernommen={() => setKundeDetailStartReiter(null)}
          />
```

Nachher:
```tsx
          <KundeDetail
            id={ausgewaehlterKunde}
            startReiter={kundeDetailStartReiter}
            onReiterUebernommen={() => setKundeDetailStartReiter(null)}
            onGeloescht={() => setAusgewaehlterKunde(null)}
          />
```

- [ ] **Step 8: Tests laufen**

Run: `npm test -- KundeDetail`
Erwartet: PASS.

- [ ] **Step 9: Volle Suite + Build**

Run: `npm test` → 104/104
Run: `npm run build` → PASS

- [ ] **Step 10: Commit**

```bash
git add src/pages/KundeDetail.tsx src/pages/KundeDetail.test.tsx src/App.tsx
git commit -m "feat: Kunde-Löschen in der Detailseite, Navigation zurück zur Liste"
```

---

### Task 7: Frontend — Artikel.tsx (Liste)

**Files:**
- Modify: `src/pages/Artikel.tsx`
- Modify: `src/pages/Artikel.test.tsx`

- [ ] **Step 1: Fehlschlagende Tests schreiben**

`within` zum bestehenden `@testing-library/react`-Import ergänzen (Datei-Kopf, Zeile 1):

Vorher:
```tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
```

Nachher:
```tsx
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
```

(`api.artikel.delete` ist im Mock bereits als `vi.fn()` vorhanden, kein Update nötig — als leerer Mock ohne `mockResolvedValue` liefert er beim `await` bereits `undefined`, was für einen `Promise<void>`-Aufruf ausreicht.)

Drei neue Tests im `describe("Artikel", ...)`-Block anhängen, direkt vor der schließenden `});`:

```tsx
  it("löscht einen Artikel nicht, wenn im Dialog abgebrochen wird", async () => {
    const { api } = await import("../api");
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(vi.mocked(api.artikel.delete)).not.toHaveBeenCalled();
  });

  it("löscht einen Artikel ohne Kundenpreise nach Bestätigung", async () => {
    const { api } = await import("../api");
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText('Artikel „Beratung" löschen?')).toBeTruthy());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText('Artikel „Beratung" gelöscht')).toBeTruthy());
    expect(vi.mocked(api.artikel.delete)).toHaveBeenCalledWith("a1", false);
  });

  it("zeigt einen Hinweis auf mitzulöschende Kundenpreise im Dialogtext und übergibt kundenpreiseMitloeschen", async () => {
    const { api } = await import("../api");
    vi.mocked(api.artikel.list).mockResolvedValueOnce([
      {
        id: "a1", artikelnummer: "ART-0001", bezeichnung: "Beratung", beschreibung: "",
        einheit_id: "e1", standardpreis_cent: 9550, kundenpreise_anzahl: 2,
      },
    ]);
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() =>
      expect(
        screen.getByText(
          'Artikel „Beratung" hat 2 Kundenpreis(e). Diese werden beim Löschen ebenfalls entfernt. Trotzdem löschen?',
        ),
      ).toBeTruthy(),
    );
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(vi.mocked(api.artikel.delete)).toHaveBeenCalledWith("a1", true));
  });
```

**Wichtig — Reihenfolge**: Der Abbrechen-Test steht bewusst als ERSTER der drei neuen Tests, aus demselben Grund wie in Task 5 (kein `clearMocks` in der Vitest-Konfiguration, Mock-Aufrufhistorie bleibt über Tests hinweg erhalten).

- [ ] **Step 2: Tests laufen nicht**

Run: `npm test -- Artikel`
Erwartet: FAIL — kein Löschen-Button vorhanden.

- [ ] **Step 3: Import ergänzen**

Vorher:
```tsx
import { useErfolgsHinweis } from "../hooks/useErfolgsHinweis";
import { formatCent, parseEuro } from "../geld";
```

Nachher:
```tsx
import { useErfolgsHinweis } from "../hooks/useErfolgsHinweis";
import { useLoeschBestaetigung } from "../hooks/useLoeschBestaetigung";
import { formatCent, parseEuro } from "../geld";
```

- [ ] **Step 4: Hook-Aufruf und `loeschen`-Funktion ergänzen**

Vorher:
```tsx
  const { zeigen, hinweis } = useErfolgsHinweis();

  function ladeArtikel() {
    api.artikel
      .list()
      .then((liste) => {
        setArtikel(liste);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }

  useEffect(() => {
    ladeArtikel();
    api.einheiten.list().then(setEinheiten).catch((e) => setFehler(e as AppFehler));
    api.kunden.list().then(setKunden).catch((e) => setFehler(e as AppFehler));
  }, []);
```

Nachher:
```tsx
  const { zeigen, hinweis } = useErfolgsHinweis();
  const { bestaetigen, dialog } = useLoeschBestaetigung();

  function ladeArtikel() {
    api.artikel
      .list()
      .then((liste) => {
        setArtikel(liste);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }

  async function loeschen(a: ArtikelTyp) {
    const text =
      a.kundenpreise_anzahl === 0
        ? `Artikel „${a.bezeichnung}" löschen?`
        : `Artikel „${a.bezeichnung}" hat ${a.kundenpreise_anzahl} Kundenpreis(e). Diese werden beim Löschen ebenfalls entfernt. Trotzdem löschen?`;
    if (!(await bestaetigen(text))) return;
    setFehler(null);
    try {
      await api.artikel.delete(a.id, a.kundenpreise_anzahl > 0);
      ladeArtikel();
      zeigen(`Artikel „${a.bezeichnung}" gelöscht`);
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  useEffect(() => {
    ladeArtikel();
    api.einheiten.list().then(setEinheiten).catch((e) => setFehler(e as AppFehler));
    api.kunden.list().then(setKunden).catch((e) => setFehler(e as AppFehler));
  }, []);
```

- [ ] **Step 5: Render anpassen**

Vorher:
```tsx
      <h1 className="seiten-kopf">Artikel &amp; Leistungen</h1>
      <Fehler fehler={fehler} />
      {hinweis}
```

Nachher:
```tsx
      <h1 className="seiten-kopf">Artikel &amp; Leistungen</h1>
      <Fehler fehler={fehler} />
      {hinweis}
      {dialog}
```

Vorher (Zeilen-Buttons):
```tsx
                <td>
                  <button type="button" className="btn" onClick={() => bearbeiten(a)}>
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    className="btn btn-leise"
                    onClick={() => setAufgeklappt(aufgeklappt === a.id ? null : a.id)}
                  >
                    {a.kundenpreise_anzahl === 0 ? "Kundenpreise" : `Kundenpreise (${a.kundenpreise_anzahl})`}
                  </button>
                </td>
```

Nachher:
```tsx
                <td>
                  <button type="button" className="btn" onClick={() => bearbeiten(a)}>
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    className="btn btn-leise"
                    onClick={() => setAufgeklappt(aufgeklappt === a.id ? null : a.id)}
                  >
                    {a.kundenpreise_anzahl === 0 ? "Kundenpreise" : `Kundenpreise (${a.kundenpreise_anzahl})`}
                  </button>
                  <button type="button" className="btn btn-gefahr" onClick={() => loeschen(a)}>
                    Löschen
                  </button>
                </td>
```

(Kein `stopPropagation()` nötig — die Artikel-Tabellenzeilen haben keinen Zeilen-Klick-Handler, anders als bei Kunden.tsx in Task 5.)

- [ ] **Step 6: Tests laufen**

Run: `npm test -- Artikel`
Erwartet: PASS.

- [ ] **Step 7: Volle Suite + Build**

Run: `npm test` → 107/107
Run: `npm run build` → PASS

- [ ] **Step 8: Commit**

```bash
git add src/pages/Artikel.tsx src/pages/Artikel.test.tsx
git commit -m "feat: Artikel-Löschen mit Kundenpreis-Kaskade"
```

---

### Task 8: Abschlussprüfung

**Files:** keine Änderungen — reine Verifikation.

- [ ] **Step 1: Vollständige Frontend-Test-Suite**

Run: `npm test`
Erwartet: alle 107 Tests grün.

- [ ] **Step 2: Typecheck und Build**

Run: `npm run build`
Erwartet: `tsc && vite build` erfolgreich, keine Typfehler.

- [ ] **Step 3: Rust-Tests**

Run: `cd src-tauri && cargo test`
Erwartet: alle 111 Tests grün.

- [ ] **Step 4: Manuelle Abnahme (durch Auftraggeber)**

`npm run tauri dev` starten und folgende Abläufe einmal live durchklicken:
1. Kundenliste: Kunde ohne Belege löschen (Abbrechen und Bestätigen je einmal testen) → Bestätigen entfernt ihn aus der Liste, Banner erscheint.
2. Kundenliste: Kunde mit offenem Entwurf (Angebot/Rechnung anlegen, nicht stellen) → Löschen-Button ist deaktiviert/ausgegraut.
3. Kundenliste: Klick auf „Löschen" bei einem Kunden öffnet NUR den Bestätigungsdialog — die Detailseite öffnet sich dabei nicht (Regressionstest für den stopPropagation-Fix).
4. Kundendetailseite → Stammdaten: Kunde ohne offene Entwürfe löschen → nach Bestätigung landet man automatisch wieder auf der Kundenliste.
5. Kundendetailseite → Stammdaten: bei einem Kunden mit offenem Entwurf ist der Löschen-Button dort ebenfalls deaktiviert.
6. Angebot stellen (Status wechselt zu "versendet"/"gestellt") → der zugehörige Kunde lässt sich danach wieder löschen (kein Entwurf mehr offen).
7. Artikelliste: Artikel ohne Kundenpreise löschen → normaler Bestätigungsdialog, danach Banner.
8. Artikelliste: Artikel MIT Kundenpreisen löschen → Dialogtext nennt die Anzahl und kündigt das Mitlöschen an; nach Bestätigen sind sowohl der Artikel als auch seine Kundenpreise weg (im Kundenpreise-Bereich eines anderen Artikels ggf. stichprobenartig prüfen, dass nichts anderes betroffen ist).
9. Hell- und Dunkelmodus stichprobenartig gegenprüfen (deaktivierte Buttons sollten in beiden Modi erkennbar ausgegraut sein).

- [ ] **Step 5: Commit (nur falls Schritt 4 Korrekturen ergab)**

Nur falls die manuelle Abnahme Anpassungen ergeben hat — sonst entfällt dieser Schritt.

---

## Nach Task 8

Alle 8 Tasks abgeschlossen → alle drei Teilprojekte der Lösch-UI (Kunden-Snapshot-Anzeige, Lösch-Bestätigungsdialog app-weit, Kunde/Artikel Lösch-UI) sind fertig. Merge nach `main` über `superpowers:finishing-a-development-branch`. Danach steht die ganz am Ende geplante gesamthafte manuelle Abnahme über alle drei Teilprojekte hinweg an.
