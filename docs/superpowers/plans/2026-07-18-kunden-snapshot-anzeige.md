# Kunden-Snapshot-Anzeige Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Liste (`Angebote.tsx`/`Rechnungen.tsx`) und `BelegEditor.tsx` zeigen den Kundennamen aus dem bereits bestehenden `beleg.kunde_snapshot` an, sobald dieser existiert, statt sich auf eine Live-Suche in der aktuellen Kundenliste zu verlassen — damit ein späteres Löschen des Kunden die Anzeige bei bereits gestellten/versendeten Belegen nicht mehr kaputt macht.

**Architecture:** Backend leitet aus der vorhandenen `kunde_snapshot`-JSON-Spalte ein neues Feld `kunde_snapshot_name: Option<String>` ab (`None` bei Entwürfen, sonst der Name aus dem Snapshot) und liefert es über `beleg_list`/`beleg_get` mit aus. Frontend nutzt dieses Feld als ersten Fallback vor der bisherigen Live-Suche.

**Tech Stack:** Rust/sqlx/SQLite (Backend), React/TypeScript/Vitest (Frontend), Tauri 2.

---

### Task 1: Beleg-Struct erweitern und Ableitungs-Funktion

**Files:**
- Modify: `src-tauri/src/commands/belege.rs`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

An das `mod tests`-Modul in `src-tauri/src/commands/belege.rs` anhängen (direkt vor der schließenden `}` des Moduls):

```rust
    #[test]
    fn kunde_snapshot_name_liefert_none_bei_leerem_snapshot() {
        assert_eq!(kunde_snapshot_name(""), None);
    }

    #[test]
    fn kunde_snapshot_name_liefert_none_bei_kaputtem_json() {
        assert_eq!(kunde_snapshot_name("kein json"), None);
    }

    #[test]
    fn kunde_snapshot_name_extrahiert_namen_aus_gueltigem_snapshot() {
        let roh = r#"{"kunde":{"name":"ACME GmbH","kundennummer":"KD-0001"},"adresse":null,"firma":{}}"#;
        assert_eq!(kunde_snapshot_name(roh), Some("ACME GmbH".to_string()));
    }
```

- [ ] **Step 2: Tests laufen nicht (kompilieren nicht)**

Run: `cd src-tauri && cargo test kunde_snapshot_name`
Erwartet: Kompilierfehler — `kunde_snapshot_name` ist nicht definiert.

- [ ] **Step 3: Struct-Felder und Funktion ergänzen**

Vorher (Struct-Definition, Zeile ~10-25):
```rust
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
```

Nachher:
```rust
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
    /// Rohe Snapshot-Spalte — nie ans Frontend senden, nur zur Ableitung von
    /// `kunde_snapshot_name` innerhalb dieser Datei verwendet.
    #[serde(skip_serializing, default)]
    pub kunde_snapshot: String,
    /// Aus `kunde_snapshot` abgeleitet: `None` bei Entwürfen (noch kein
    /// Snapshot geschrieben), sonst der zum Zeitpunkt des Stellens
    /// eingefrorene Kundenname. Wird von `mit_snapshot_name()` befüllt,
    /// NICHT direkt aus der DB-Spalte gemappt (siehe Task 2).
    #[sqlx(default)]
    #[serde(default)]
    pub kunde_snapshot_name: Option<String>,
}
```

Direkt nach der Funktion `kunde_snapshot_json` (die den Snapshot beim Stellen erzeugt) folgende neue Funktion einfügen:

```rust
/// Extrahiert den Kundennamen aus einer rohen `kunde_snapshot`-Spalte.
/// Leerer String (Entwurf, noch kein Snapshot) oder nicht parsbares JSON
/// liefern `None` statt eines Fehlers — die Anzeige fällt dann auf die
/// Live-Suche in der aktuellen Kundenliste zurück (siehe Frontend-Tasks).
fn kunde_snapshot_name(roh: &str) -> Option<String> {
    if roh.is_empty() {
        return None;
    }
    let wert: serde_json::Value = serde_json::from_str(roh).ok()?;
    wert.get("kunde")?.get("name")?.as_str().map(String::from)
}
```

- [ ] **Step 4: Tests laufen — aber Projekt kompiliert noch nicht vollständig**

Run: `cd src-tauri && cargo test kunde_snapshot_name`
Erwartet: Kompilierfehler an anderer Stelle — jede bestehende Stelle, die `Beleg { ... }` literal konstruiert (in `belege.rs`, `dokument/pdf.rs`, `dokument/xrechnung.rs`), hat jetzt zwei fehlende Felder. Das wird in Task 2 behoben. Für DIESEN Task genügt es, dass die drei neuen `kunde_snapshot_name_*`-Tests selbst (isoliert betrachtet) korrekten Code enthalten — der Compile-Fehler kommt aus nicht verwandten Stellen und ist erwartet.

Ignoriere an dieser Stelle den Compile-Fehler und fahre direkt mit Task 2 fort — die drei neuen Tests werden erst am Ende von Task 2 tatsächlich grün laufen können, da das Projekt vorher nicht kompiliert. Kein Commit in diesem Task.

---

### Task 2: Snapshot-Name in alle Beleg-Erzeugungsstellen einweben

**Files:**
- Modify: `src-tauri/src/commands/belege.rs`
- Modify: `src-tauri/src/dokument/pdf.rs`
- Modify: `src-tauri/src/dokument/xrechnung.rs`

- [ ] **Step 1: `BELEG_SPALTEN` um die Snapshot-Spalte erweitern**

Vorher:
```rust
const BELEG_SPALTEN: &str = "id, typ, nummer, status, kunde_id, datum, leistungsdatum, zahlungsziel_tage, kopftext, fusstext, summe_cent, ursprungsangebot_id, storno_von_id";
```

Nachher:
```rust
const BELEG_SPALTEN: &str = "id, typ, nummer, status, kunde_id, datum, leistungsdatum, zahlungsziel_tage, kopftext, fusstext, summe_cent, ursprungsangebot_id, storno_von_id, kunde_snapshot";
```

- [ ] **Step 2: Mapping-Helfer ergänzen**

Direkt nach der `kunde_snapshot_name`-Funktion aus Task 1 einfügen:

```rust
/// Befüllt `kunde_snapshot_name` aus der geladenen `kunde_snapshot`-Spalte.
/// Wird nach jedem `query_as::<_, Beleg>`-Aufruf angewendet, der über
/// `BELEG_SPALTEN` selektiert (die Spalte landet dank `#[sqlx(default)]`
/// sonst ungenutzt im Struct).
fn mit_snapshot_name(mut beleg: Beleg) -> Beleg {
    beleg.kunde_snapshot_name = kunde_snapshot_name(&beleg.kunde_snapshot);
    beleg
}
```

- [ ] **Step 3: `lade_beleg` anpassen**

Vorher:
```rust
async fn lade_beleg(pool: &SqlitePool, id: &str) -> AppResult<Beleg> {
    let sql = format!("SELECT {BELEG_SPALTEN} FROM beleg WHERE id = ? AND deleted_at IS NULL");
    sqlx::query_as(&sql).bind(id).fetch_optional(pool).await?.ok_or(AppError::NichtGefunden)
}
```

Nachher:
```rust
async fn lade_beleg(pool: &SqlitePool, id: &str) -> AppResult<Beleg> {
    let sql = format!("SELECT {BELEG_SPALTEN} FROM beleg WHERE id = ? AND deleted_at IS NULL");
    let beleg: Beleg = sqlx::query_as(&sql).bind(id).fetch_optional(pool).await?.ok_or(AppError::NichtGefunden)?;
    Ok(mit_snapshot_name(beleg))
}
```

- [ ] **Step 4: `list` anpassen**

Vorher:
```rust
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
```

Nachher:
```rust
pub async fn list(pool: &SqlitePool, typ: Option<String>, status: Option<String>) -> AppResult<Vec<Beleg>> {
    let sql = format!(
        "SELECT {BELEG_SPALTEN} FROM beleg WHERE deleted_at IS NULL \
         AND (? IS NULL OR typ = ?) AND (? IS NULL OR status = ?) \
         ORDER BY datum DESC, created_at DESC"
    );
    let belege: Vec<Beleg> = sqlx::query_as(&sql)
        .bind(typ.clone()).bind(typ)
        .bind(status.clone()).bind(status)
        .fetch_all(pool).await?;
    Ok(belege.into_iter().map(mit_snapshot_name).collect())
}
```

- [ ] **Step 5: `offene_posten` anpassen**

Vorher:
```rust
pub async fn offene_posten(pool: &SqlitePool) -> AppResult<Vec<OffenerPosten>> {
    let sql = format!("SELECT {BELEG_SPALTEN} FROM beleg WHERE deleted_at IS NULL AND typ = 'rechnung' AND status = 'gestellt' ORDER BY datum");
    let rechnungen: Vec<Beleg> = sqlx::query_as(&sql).fetch_all(pool).await?;
```

Nachher:
```rust
pub async fn offene_posten(pool: &SqlitePool) -> AppResult<Vec<OffenerPosten>> {
    let sql = format!("SELECT {BELEG_SPALTEN} FROM beleg WHERE deleted_at IS NULL AND typ = 'rechnung' AND status = 'gestellt' ORDER BY datum");
    let rechnungen: Vec<Beleg> = sqlx::query_as(&sql).fetch_all(pool).await?;
    let rechnungen: Vec<Beleg> = rechnungen.into_iter().map(mit_snapshot_name).collect();
```

(Der restliche Funktionskörper danach bleibt unverändert — er iteriert weiterhin über `rechnungen`.)

- [ ] **Step 6: `create()`-Literal anpassen**

Vorher:
```rust
    let beleg = Beleg {
        id: Uuid::new_v4().to_string(), typ: d.typ, nummer: None, status: "entwurf".into(),
        kunde_id: d.kunde_id, datum: d.datum, leistungsdatum: d.leistungsdatum,
        zahlungsziel_tage: d.zahlungsziel_tage, kopftext: d.kopftext, fusstext: d.fusstext,
        summe_cent: 0, ursprungsangebot_id: None, storno_von_id: None,
    };
```

Nachher:
```rust
    let beleg = Beleg {
        id: Uuid::new_v4().to_string(), typ: d.typ, nummer: None, status: "entwurf".into(),
        kunde_id: d.kunde_id, datum: d.datum, leistungsdatum: d.leistungsdatum,
        zahlungsziel_tage: d.zahlungsziel_tage, kopftext: d.kopftext, fusstext: d.fusstext,
        summe_cent: 0, ursprungsangebot_id: None, storno_von_id: None,
        kunde_snapshot: String::new(), kunde_snapshot_name: None,
    };
```

- [ ] **Step 7: `angebot_ueberfuehren`-Literal anpassen (neue Rechnung, Status Entwurf)**

Vorher:
```rust
    let rechnung = Beleg {
        id: Uuid::new_v4().to_string(), typ: "rechnung".into(), nummer: None, status: "entwurf".into(),
        kunde_id: angebot.kunde_id.clone(), datum: heute, leistungsdatum: angebot.leistungsdatum.clone(),
        zahlungsziel_tage: angebot.zahlungsziel_tage, kopftext: angebot.kopftext.clone(), fusstext: angebot.fusstext.clone(),
        summe_cent: angebot.summe_cent, ursprungsangebot_id: Some(angebot.id.clone()), storno_von_id: None,
    };
```

Nachher:
```rust
    let rechnung = Beleg {
        id: Uuid::new_v4().to_string(), typ: "rechnung".into(), nummer: None, status: "entwurf".into(),
        kunde_id: angebot.kunde_id.clone(), datum: heute, leistungsdatum: angebot.leistungsdatum.clone(),
        zahlungsziel_tage: angebot.zahlungsziel_tage, kopftext: angebot.kopftext.clone(), fusstext: angebot.fusstext.clone(),
        summe_cent: angebot.summe_cent, ursprungsangebot_id: Some(angebot.id.clone()), storno_von_id: None,
        kunde_snapshot: String::new(), kunde_snapshot_name: None,
    };
```

- [ ] **Step 8: `rechnung_stornieren`-Literal anpassen (Storno, Status sofort "gestellt")**

Vorher:
```rust
    let storno = Beleg {
        id: Uuid::new_v4().to_string(), typ: "rechnung".into(), nummer: Some(nummer), status: "gestellt".into(),
        kunde_id: rechnung.kunde_id.clone(), datum: heute, leistungsdatum: rechnung.leistungsdatum.clone(),
        zahlungsziel_tage: rechnung.zahlungsziel_tage, kopftext: rechnung.kopftext.clone(),
        fusstext: format!("Stornierung zu Rechnung {}", rechnung.nummer.clone().unwrap_or_default()),
        summe_cent: -rechnung.summe_cent, ursprungsangebot_id: None, storno_von_id: Some(rechnung.id.clone()),
    };
```

Nachher:
```rust
    let storno = Beleg {
        id: Uuid::new_v4().to_string(), typ: "rechnung".into(), nummer: Some(nummer), status: "gestellt".into(),
        kunde_id: rechnung.kunde_id.clone(), datum: heute, leistungsdatum: rechnung.leistungsdatum.clone(),
        zahlungsziel_tage: rechnung.zahlungsziel_tage, kopftext: rechnung.kopftext.clone(),
        fusstext: format!("Stornierung zu Rechnung {}", rechnung.nummer.clone().unwrap_or_default()),
        summe_cent: -rechnung.summe_cent, ursprungsangebot_id: None, storno_von_id: Some(rechnung.id.clone()),
        kunde_snapshot: snapshot.0.clone(), kunde_snapshot_name: kunde_snapshot_name(&snapshot.0),
    };
```

(Das Storno bekommt sofort den Snapshot der Original-Rechnung, da es direkt mit Status "gestellt" angelegt wird — konsistent damit, dass die INSERT-Anweisung wenige Zeilen darunter bereits `snapshot.0` in die `kunde_snapshot`-Spalte schreibt.)

- [ ] **Step 9: Test-Fixtures in `dokument/pdf.rs` und `dokument/xrechnung.rs` reparieren**

In beiden Dateien enthält der Test-Code (`#[cfg(test)]`-Modul) je eine `Beleg { ... }`-Literal-Konstruktion. Beide bekommen die gleichen zwei neuen Felder angehängt.

In `src-tauri/src/dokument/xrechnung.rs`, Vorher:
```rust
            beleg: Beleg {
                id: "b1".into(), typ: "rechnung".into(), nummer: Some("RE-2026-0001".into()),
                status: "gestellt".into(), kunde_id: "k1".into(), datum: "2026-07-11".into(),
                leistungsdatum: "2026-07-11".into(), zahlungsziel_tage: 14,
                kopftext: "".into(), fusstext: "".into(), summe_cent,
                ursprungsangebot_id: None, storno_von_id: storno_von.map(String::from),
            },
```

Nachher:
```rust
            beleg: Beleg {
                id: "b1".into(), typ: "rechnung".into(), nummer: Some("RE-2026-0001".into()),
                status: "gestellt".into(), kunde_id: "k1".into(), datum: "2026-07-11".into(),
                leistungsdatum: "2026-07-11".into(), zahlungsziel_tage: 14,
                kopftext: "".into(), fusstext: "".into(), summe_cent,
                ursprungsangebot_id: None, storno_von_id: storno_von.map(String::from),
                kunde_snapshot: String::new(), kunde_snapshot_name: None,
            },
```

In `src-tauri/src/dokument/pdf.rs`, Vorher:
```rust
            beleg: Beleg {
                id: "b1".into(), typ: "rechnung".into(), nummer: Some("RE-2026-0001".into()),
                status: "gestellt".into(), kunde_id: "k1".into(), datum: "2026-07-11".into(),
                leistungsdatum: "2026-07-11".into(), zahlungsziel_tage: 14,
                kopftext: "".into(), fusstext: "Danke für Ihren Auftrag.".into(), summe_cent: 9500,
                ursprungsangebot_id: None, storno_von_id: None,
            },
```

Nachher:
```rust
            beleg: Beleg {
                id: "b1".into(), typ: "rechnung".into(), nummer: Some("RE-2026-0001".into()),
                status: "gestellt".into(), kunde_id: "k1".into(), datum: "2026-07-11".into(),
                leistungsdatum: "2026-07-11".into(), zahlungsziel_tage: 14,
                kopftext: "".into(), fusstext: "Danke für Ihren Auftrag.".into(), summe_cent: 9500,
                ursprungsangebot_id: None, storno_von_id: None,
                kunde_snapshot: String::new(), kunde_snapshot_name: None,
            },
```

- [ ] **Step 10: Projekt kompiliert und Task-1-Tests laufen**

Run: `cd src-tauri && cargo build`
Erwartet: Erfolgreich, keine Compile-Fehler mehr.

Run: `cd src-tauri && cargo test kunde_snapshot_name`
Erwartet: Alle 3 Tests aus Task 1 grün.

- [ ] **Step 11: Integrationstest ergänzen — `list`/`get` liefern das Feld korrekt**

An das `mod tests`-Modul in `src-tauri/src/commands/belege.rs` anhängen:

```rust
    #[tokio::test]
    async fn list_liefert_kunde_snapshot_name_erst_nach_dem_stellen() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let entwurf = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: entwurf.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        let gestellt = stellen(&pool, entwurf.id.clone()).await.unwrap();

        let alle = list(&pool, None, None).await.unwrap();
        let entwurf_geladen = alle.iter().find(|b| b.id == entwurf.id).unwrap();
        let gestellt_geladen = alle.iter().find(|b| b.id == gestellt.id).unwrap();

        assert_eq!(entwurf_geladen.kunde_snapshot_name, None);
        assert_eq!(gestellt_geladen.kunde_snapshot_name, Some("ACME GmbH".to_string()));
    }

    #[tokio::test]
    async fn get_liefert_kunde_snapshot_name() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let entwurf = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: entwurf.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        let gestellt = stellen(&pool, entwurf.id).await.unwrap();

        let geladen = get(&pool, gestellt.id).await.unwrap();
        assert_eq!(geladen.beleg.kunde_snapshot_name, Some("ACME GmbH".to_string()));
    }
```

- [ ] **Step 12: Tests laufen**

Run: `cd src-tauri && cargo test`
Erwartet: alle 104 Tests grün (99 bisherige + 3 reine Unit-Tests aus Task 1 + 2 neue Integrationstests aus Step 11 — Task 1 hatte keinen eigenen Commit, seine Tests laufen hier zum ersten Mal grün mit).

- [ ] **Step 13: Commit**

```bash
git add src-tauri/src/commands/belege.rs src-tauri/src/dokument/pdf.rs src-tauri/src/dokument/xrechnung.rs
git commit -m "feat: kunde_snapshot_name aus Beleg-Snapshot ableiten und ausliefern"
```

---

### Task 3: Frontend-Typ und Angebote.tsx

**Files:**
- Modify: `src/api.ts`
- Modify: `src/pages/Angebote.tsx`
- Modify: `src/pages/Angebote.test.tsx`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

In `src/pages/Angebote.test.tsx`, den bestehenden Mock-Beleg um einen zweiten mit abweichendem Snapshot-Namen ergänzen und einen neuen Test anhängen.

Vorher (kompletter Dateiinhalt):
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
          notizen: "", ust_idnr: "", email: "", leitweg_id: "", kaeuferreferenz: "", hat_adresse: true },
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

Nachher (kompletter Dateiinhalt):
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
        { id: "2", typ: "angebot", nummer: "AN-2026-0002", status: "versendet", kunde_id: "k1",
          datum: "2026-07-11", leistungsdatum: "2026-07-11", zahlungsziel_tage: 14,
          kopftext: "", fusstext: "", summe_cent: 5000, ursprungsangebot_id: null, storno_von_id: null,
          kunde_snapshot_name: "ACME GmbH (alter Name)" },
      ]),
    },
    kunden: {
      list: vi.fn().mockResolvedValue([
        { id: "k1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001", zahlungsziel_tage: 14,
          notizen: "", ust_idnr: "", email: "", leitweg_id: "", kaeuferreferenz: "", hat_adresse: true },
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

  it("zeigt den Snapshot-Namen statt des Live-Namens, wenn vorhanden", async () => {
    render(<Angebote onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("AN-2026-0002")).toBeTruthy());
    expect(screen.getByText("ACME GmbH (alter Name)")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Test läuft nicht**

Run: `npm test -- Angebote`
Erwartet: FAIL — der zweite Test findet "ACME GmbH (alter Name)" nicht (Liste zeigt stattdessen den Live-Namen "ACME GmbH", da `kunde_snapshot_name` noch nicht ausgewertet wird und der Typ im Mock-Objekt ignoriert wird).

- [ ] **Step 3: `Beleg`-Interface erweitern**

In `src/api.ts`, Vorher:
```ts
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
```

Nachher:
```ts
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
  kunde_snapshot_name?: string | null;
}
```

(Optionales Feld — bewusst nicht verpflichtend, damit bestehende Test-Fixtures ohne dieses Feld weiterhin kompilieren. Das Backend liefert es in der Praxis immer mit, `undefined` und `null` werden von der Fallback-Kette im nächsten Schritt gleich behandelt.)

- [ ] **Step 4: Anzeige in `Angebote.tsx` anpassen**

Vorher:
```tsx
              <td>{kunden.find((k) => k.id === a.kunde_id)?.name ?? a.kunde_id}</td>
```

Nachher:
```tsx
              <td>{a.kunde_snapshot_name ?? kunden.find((k) => k.id === a.kunde_id)?.name ?? a.kunde_id}</td>
```

- [ ] **Step 5: Tests laufen**

Run: `npm test -- Angebote`
Erwartet: PASS (beide Tests).

- [ ] **Step 6: Volle Suite + Build**

Run: `npm test` → 86/86
Run: `npm run build` → PASS

- [ ] **Step 7: Commit**

```bash
git add src/api.ts src/pages/Angebote.tsx src/pages/Angebote.test.tsx
git commit -m "feat: Angebote-Liste zeigt Kunden-Snapshot-Namen statt Live-Lookup"
```

---

### Task 4: Rechnungen.tsx

**Files:**
- Modify: `src/pages/Rechnungen.tsx`
- Modify: `src/pages/Rechnungen.test.tsx`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

Vorher (kompletter Dateiinhalt von `src/pages/Rechnungen.test.tsx`):
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
          notizen: "", ust_idnr: "", email: "", leitweg_id: "", kaeuferreferenz: "", hat_adresse: true },
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

Nachher (kompletter Dateiinhalt):
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
        { id: "2", typ: "rechnung", nummer: "RE-2026-0002", status: "gestellt", kunde_id: "k1",
          datum: "2026-07-11", leistungsdatum: "2026-07-11", zahlungsziel_tage: 14,
          kopftext: "", fusstext: "", summe_cent: 5000, ursprungsangebot_id: null, storno_von_id: null,
          kunde_snapshot_name: "ACME GmbH (alter Name)" },
      ]),
    },
    kunden: {
      list: vi.fn().mockResolvedValue([
        { id: "k1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001", zahlungsziel_tage: 14,
          notizen: "", ust_idnr: "", email: "", leitweg_id: "", kaeuferreferenz: "", hat_adresse: true },
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

  it("zeigt den Snapshot-Namen statt des Live-Namens, wenn vorhanden", async () => {
    render(<Rechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("RE-2026-0002")).toBeTruthy());
    expect(screen.getByText("ACME GmbH (alter Name)")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Test läuft nicht**

Run: `npm test -- Rechnungen`
Erwartet: FAIL — zweiter Test findet "ACME GmbH (alter Name)" nicht.

- [ ] **Step 3: Anzeige in `Rechnungen.tsx` anpassen**

Vorher:
```tsx
              <td>{kunden.find((k) => k.id === r.kunde_id)?.name ?? r.kunde_id}</td>
```

Nachher:
```tsx
              <td>{r.kunde_snapshot_name ?? kunden.find((k) => k.id === r.kunde_id)?.name ?? r.kunde_id}</td>
```

- [ ] **Step 4: Tests laufen**

Run: `npm test -- Rechnungen`
Erwartet: PASS (beide Tests).

- [ ] **Step 5: Volle Suite + Build**

Run: `npm test` → 87/87
Run: `npm run build` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/Rechnungen.tsx src/pages/Rechnungen.test.tsx
git commit -m "feat: Rechnungen-Liste zeigt Kunden-Snapshot-Namen statt Live-Lookup"
```

---

### Task 5: BelegEditor.tsx — StammdatenAbschnitt

**Files:**
- Modify: `src/pages/BelegEditor.tsx`
- Modify: `src/pages/BelegEditor.test.tsx`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

An `src/pages/BelegEditor.test.tsx` anhängen (nutzt den bereits im Modul vorhandenen `vi.mock("../api", ...)`-Block und dessen Default-Mocks; siehe bestehende Tests in derselben Datei für das exakte Muster von `api.belege.get`-Overrides):

```tsx
  it("zeigt den Kunden-Snapshot-Namen in den Stammdaten, wenn vorhanden", async () => {
    vi.mocked(api.artikel.list).mockResolvedValue([]);
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "rechnung", nummer: "RE-2026-0001", status: "gestellt", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9550, ursprungsangebot_id: null, storno_von_id: null,
        kunde_snapshot_name: "ACME GmbH (alter Name)",
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 9550,
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("Kunde: ACME GmbH (alter Name)")).toBeTruthy());
  });
```

- [ ] **Step 2: Test läuft nicht**

Run: `npm test -- BelegEditor`
Erwartet: FAIL — Stammdaten zeigen den Live-Namen (oder die `kunde_id`, je nach Mock-Zustand der `kunden`-Liste) statt "ACME GmbH (alter Name)".

- [ ] **Step 3: `StammdatenAbschnitt` anpassen**

Beide identischen Vorkommen der Zeile ändern (nicht-editierbarer Zweig UND editierbarer Zweig):

Vorher (beide Stellen, Zeilen 313 und 324):
```tsx
        <p>Kunde: {kunde?.name ?? beleg.kunde_id}</p>
```

Nachher (beide Stellen):
```tsx
        <p>Kunde: {beleg.kunde_snapshot_name ?? kunde?.name ?? beleg.kunde_id}</p>
```

- [ ] **Step 4: Tests laufen**

Run: `npm test -- BelegEditor`
Erwartet: PASS.

- [ ] **Step 5: Volle Suite + Build**

Run: `npm test` → 88/88
Run: `npm run build` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/BelegEditor.tsx src/pages/BelegEditor.test.tsx
git commit -m "feat: BelegEditor-Stammdaten zeigen Kunden-Snapshot-Namen statt Live-Lookup"
```

---

### Task 6: Abschlussprüfung

**Files:** keine Änderungen — reine Verifikation.

- [ ] **Step 1: Vollständige Frontend-Test-Suite**

Run: `npm test`
Erwartet: alle 88 Tests grün.

- [ ] **Step 2: Typecheck und Build**

Run: `npm run build`
Erwartet: `tsc && vite build` erfolgreich, keine Typfehler.

- [ ] **Step 3: Rust-Tests**

Run: `cd src-tauri && cargo test`
Erwartet: 104 Tests grün (99 bisherige + 3 Unit-Tests aus Task 1 + 2 Integrationstests aus Task 2).

- [ ] **Step 4: Manuelle Abnahme (durch Auftraggeber)**

`npm run tauri dev` starten:
1. Ein Angebot/eine Rechnung anlegen (Entwurf) → Kundenname wird korrekt angezeigt (noch via Live-Lookup, kein Snapshot vorhanden).
2. Dieses Angebot/diese Rechnung stellen → Kundenname bleibt korrekt sichtbar (jetzt via Snapshot).
3. In den Stammdaten des gestellten Belegs sowie in der Angebote-/Rechnungen-Liste denselben Kundennamen prüfen.
4. (Optional, falls zeitlich machbar) Kundendaten (z. B. Name) nachträglich ändern → bereits gestellte Belege zeigen weiterhin den ALTEN (eingefrorenen) Namen in Liste und Stammdaten, ein neu angelegter Entwurf zeigt den NEUEN Namen.

- [ ] **Step 5: Commit (nur falls Schritt 4 Korrekturen ergab)**

Nur falls die manuelle Abnahme Anpassungen ergeben hat — sonst entfällt dieser Schritt.

---

## Nach Task 6

Alle 6 Tasks abgeschlossen → weiter mit Teilprojekt 2 (Lösch-Bestätigungsdialog app-weit) im nächsten Brainstorming-Durchlauf. Kein Merge-Schritt hier nötig, falls direkt auf `main` gearbeitet wurde (kein separater Branch/Worktree) — sonst `superpowers:finishing-a-development-branch` für Merge nach `main`.
