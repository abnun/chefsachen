# Onboarding-Flow (Erststart & Kundenanlage) — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Führungslücken beim Erststart-Assistenten und bei der Kundenanlage schließen — mehr Erklärung, ein Abschluss-Schritt mit Kunde↔Artikel-Verzahnung, und ein Hinweis, Adressen/Ansprechpartner nach der Kundenanlage zu ergänzen.

**Architecture:** Eine neue, kleine `Hinweis`-Komponente (analog zu `Fehler`) wird an drei Stellen eingesetzt. Zustand für die seitenübergreifende Navigation (welches Formular beim nächsten Seitenwechsel offen sein soll, welcher Reiter in `KundeDetail` starten soll) wird zentral in `App.tsx` gehalten und per Props durchgereicht — konsistent mit dem bereits etablierten Muster (`ausgewaehlterKunde` etc.).

**Tech Stack:** React 19, Rust/sqlx (Tauri-Backend). Referenz: `docs/superpowers/specs/2026-07-13-onboarding-flow-design.md`.

---

## Technische Korrektur gegenüber der Spec

Die Spec sagt zur Backend-Erweiterung: „Nur `list` wird geändert — `get` ... bleibt unverändert." Das geht technisch nicht auf: `Kunde` ist ein gemeinsamer Rust-Struct für `list` UND `get` (über `KundeDetail.kunde`), und `sqlx::FromRow` matcht Spalten **nach Namen**. Würde nur `list`s SQL um `hat_adresse` erweitert, bräche `get`s Query zur Laufzeit („column not found"), sobald `Kunde` das neue Pflichtfeld hat. Fix: **beide** Queries (`list` und `get`) bekommen dieselbe `EXISTS`-Unterabfrage — hält den `Kunde`-Typ einheitlich (kein zweiter Paralleltyp nötig) und ist bei `get()` (nur eine Zeile) performance-irrelevant.

---

### Task 1: Hinweis-Komponente & CSS

**Files:**
- Create: `src/components/Hinweis.tsx`
- Test: `src/components/Hinweis.test.tsx`
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/komponenten.css`

- [ ] **Step 1: `src/components/Hinweis.tsx` erstellen**

```tsx
import { useEffect } from "react";
import type { ReactNode } from "react";

interface HinweisProps {
  children: ReactNode;
  onSchliessen: () => void;
  autoDismissMs?: number;
}

/**
 * Zeigt einen informativen (nicht-roten) Hinweis. Mit `autoDismissMs`
 * verschwindet er nach der angegebenen Zeit von selbst (kein Schließen-
 * Button, da er ohnehin gleich weg ist). Ohne `autoDismissMs` zeigt er
 * einen „×"-Button, den der Nutzer aktiv anklicken muss. `onSchliessen`
 * ist in beiden Fällen Pflicht — die aufrufende Seite steuert die
 * Sichtbarkeit über eigenen State, diese Komponente merkt sich nichts.
 */
export function Hinweis({ children, onSchliessen, autoDismissMs }: HinweisProps) {
  useEffect(() => {
    if (autoDismissMs === undefined) return;
    const timeout = setTimeout(onSchliessen, autoDismissMs);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDismissMs]);

  return (
    <div className="hinweis-box" role="status">
      <span>{children}</span>
      {autoDismissMs === undefined && (
        <button type="button" className="hinweis-schliessen" onClick={onSchliessen} aria-label="Hinweis schließen">
          ×
        </button>
      )}
    </div>
  );
}
```

(Der `eslint-disable`-Kommentar verhindert, dass `onSchliessen` als Dependency verlangt wird — es wird bewusst nur beim Mount/bei Änderung von `autoDismissMs` neu getimert, nicht bei jedem Re-Render der Elternkomponente, die `onSchliessen` typischerweise als neue Inline-Funktion pro Render übergibt.)

- [ ] **Step 2: `src/components/Hinweis.test.tsx` erstellen**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Hinweis } from "./Hinweis";

describe("Hinweis", () => {
  it("zeigt den übergebenen Inhalt", () => {
    render(<Hinweis onSchliessen={() => {}}>Testtext</Hinweis>);
    expect(screen.getByText("Testtext")).toBeTruthy();
  });

  it("ruft onSchliessen bei Klick auf × auf (manueller Modus, kein autoDismissMs)", () => {
    const onSchliessen = vi.fn();
    render(<Hinweis onSchliessen={onSchliessen}>Testtext</Hinweis>);
    fireEvent.click(screen.getByRole("button", { name: "Hinweis schließen" }));
    expect(onSchliessen).toHaveBeenCalledTimes(1);
  });

  it("zeigt keinen Schließen-Button und ruft onSchliessen nach autoDismissMs automatisch auf", () => {
    vi.useFakeTimers();
    const onSchliessen = vi.fn();
    render(
      <Hinweis onSchliessen={onSchliessen} autoDismissMs={4000}>
        Testtext
      </Hinweis>,
    );
    expect(screen.queryByRole("button", { name: "Hinweis schließen" })).toBeNull();
    expect(onSchliessen).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3999);
    expect(onSchliessen).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onSchliessen).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 3: Tests laufen lassen (erwartet FAIL, da CSS-Klassen noch fehlen — Komponente selbst sollte aber schon funktionieren)**

Run: `npm test -- Hinweis`
Erwartet: PASS (die Tests prüfen Verhalten, nicht CSS-Klassen — sie sollten bereits jetzt grün sein).

- [ ] **Step 4: Neue Tokens in `src/styles/tokens.css` ergänzen**

Im `:root`-Block, direkt nach den bestehenden `--fehler-*`-Zeilen (Zeile 26-28) einfügen:

```css
  --hinweis-bg: #eaf1f7;
  --hinweis-text: #2c5a7c;
  --hinweis-rand: #c9dced;
```

Im `@media (prefers-color-scheme: dark)`-Block, direkt nach den dortigen `--fehler-*`-Zeilen einfügen:

```css
    --hinweis-bg: #1a2733;
    --hinweis-text: #8fc1e8;
    --hinweis-rand: #2d4358;
```

- [ ] **Step 5: Neue Klassen an `src/styles/komponenten.css` anhängen**

```css
/* Hinweis-Box */
.hinweis-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--abstand-m);
  background: var(--hinweis-bg);
  color: var(--hinweis-text);
  border: 1px solid var(--hinweis-rand);
  border-radius: var(--radius-m);
  padding: var(--abstand-m) var(--abstand-l);
  margin-bottom: var(--abstand-l);
}

.hinweis-schliessen {
  background: transparent;
  border: none;
  box-shadow: none;
  color: inherit;
  font-size: var(--text-l);
  line-height: 1;
  padding: 0 0 0 var(--abstand-s);
  cursor: pointer;
}
```

- [ ] **Step 6: Volle Test-Suite + Build**

Run: `npm test` → 39/39 (36 bestehend + 3 neue `Hinweis`-Tests)
Run: `npm run build` → PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/Hinweis.tsx src/components/Hinweis.test.tsx src/styles/tokens.css src/styles/komponenten.css
git commit -m "feat: Hinweis-Komponente für informative Banner/Hinweise"
```

---

### Task 2: Backend — `hat_adresse` in Kunde-Abfragen

**Files:**
- Modify: `src-tauri/src/commands/kunden.rs`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

An das bestehende `mod tests` in `src-tauri/src/commands/kunden.rs` anhängen (nach `standard_adresse_ist_exklusiv_je_typ` oder einem anderen bestehenden Test):

```rust
    #[tokio::test]
    async fn list_liefert_hat_adresse_korrekt() {
        let (_dir, pool) = test_pool().await;
        let mit_adresse = create(&pool, neu("Mit Adresse GmbH")).await.unwrap();
        let ohne_adresse = create(&pool, neu("Ohne Adresse GmbH")).await.unwrap();
        adresse_speichern(&pool, Adresse {
            id: "".into(), kunde_id: mit_adresse.id.clone(), typ: "rechnung".into(),
            strasse: "Weg 1".into(), plz: "10115".into(), ort: "Berlin".into(),
            land: "DE".into(), ist_standard: true,
        }).await.unwrap();

        let liste = list(&pool, None).await.unwrap();
        let treffer_mit = liste.iter().find(|k| k.id == mit_adresse.id).unwrap();
        let treffer_ohne = liste.iter().find(|k| k.id == ohne_adresse.id).unwrap();
        assert!(treffer_mit.hat_adresse);
        assert!(!treffer_ohne.hat_adresse);
    }
```

- [ ] **Step 2: Test läuft nicht (Kunde hat noch kein `hat_adresse`-Feld)**

Run: `cd src-tauri && cargo test list_liefert_hat_adresse_korrekt`
Erwartet: Kompilierfehler „no field `hat_adresse` on type `Kunde`".

- [ ] **Step 3: `Kunde`-Struct um `hat_adresse` erweitern**

Vorher (`src-tauri/src/commands/kunden.rs`):
```rust
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Kunde {
    pub id: String, pub typ: String, pub name: String, pub kundennummer: String,
    pub zahlungsziel_tage: i64, pub notizen: String, pub ust_idnr: String,
    pub email: String, pub leitweg_id: String, pub kaeuferreferenz: String,
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
}
```

- [ ] **Step 4: `create()` — neues Feld im Struct-Literal ergänzen**

Vorher:
```rust
    let k = Kunde { id: Uuid::new_v4().to_string(), typ: d.typ, name: d.name.trim().into(),
        kundennummer, zahlungsziel_tage: d.zahlungsziel_tage, notizen: d.notizen,
        ust_idnr: d.ust_idnr, email: d.email, leitweg_id: d.leitweg_id,
        kaeuferreferenz: d.kaeuferreferenz };
```

Nachher:
```rust
    let k = Kunde { id: Uuid::new_v4().to_string(), typ: d.typ, name: d.name.trim().into(),
        kundennummer, zahlungsziel_tage: d.zahlungsziel_tage, notizen: d.notizen,
        ust_idnr: d.ust_idnr, email: d.email, leitweg_id: d.leitweg_id,
        kaeuferreferenz: d.kaeuferreferenz, hat_adresse: false };
```

(Ein frisch angelegter Kunde hat naturgemäß noch keine Adresse.)

- [ ] **Step 5: `list()` — Query um `hat_adresse` erweitern**

Vorher:
```rust
pub async fn list(pool: &SqlitePool, suche: Option<String>) -> AppResult<Vec<Kunde>> {
    let muster = format!("%{}%", suche.unwrap_or_default().to_lowercase());
    Ok(sqlx::query_as(
        "SELECT id, typ, name, kundennummer, zahlungsziel_tage, notizen, ust_idnr, email, leitweg_id, kaeuferreferenz \
         FROM kunde WHERE deleted_at IS NULL AND (lower(name) LIKE ? OR lower(kundennummer) LIKE ?) ORDER BY name")
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
                EXISTS(SELECT 1 FROM adresse a WHERE a.kunde_id = k.id AND a.deleted_at IS NULL) AS hat_adresse \
         FROM kunde k WHERE k.deleted_at IS NULL AND (lower(k.name) LIKE ? OR lower(k.kundennummer) LIKE ?) ORDER BY k.name")
        .bind(&muster).bind(&muster).fetch_all(pool).await?)
}
```

- [ ] **Step 6: `get()` — Query gleichermaßen erweitern**

Vorher:
```rust
pub async fn get(pool: &SqlitePool, id: String) -> AppResult<KundeDetail> {
    let kunde: Kunde = sqlx::query_as(
        "SELECT id, typ, name, kundennummer, zahlungsziel_tage, notizen, ust_idnr, email, leitweg_id, kaeuferreferenz \
         FROM kunde WHERE id = ? AND deleted_at IS NULL")
        .bind(&id).fetch_optional(pool).await?.ok_or(AppError::NichtGefunden)?;
```

Nachher:
```rust
pub async fn get(pool: &SqlitePool, id: String) -> AppResult<KundeDetail> {
    let kunde: Kunde = sqlx::query_as(
        "SELECT k.id, k.typ, k.name, k.kundennummer, k.zahlungsziel_tage, k.notizen, k.ust_idnr, \
                k.email, k.leitweg_id, k.kaeuferreferenz, \
                EXISTS(SELECT 1 FROM adresse a WHERE a.kunde_id = k.id AND a.deleted_at IS NULL) AS hat_adresse \
         FROM kunde k WHERE k.id = ? AND k.deleted_at IS NULL")
        .bind(&id).fetch_optional(pool).await?.ok_or(AppError::NichtGefunden)?;
```

(`update()` braucht keine Änderung — es nimmt einen bereits vollständigen `Kunde` als Parameter entgegen und gibt ihn unverändert zurück, `hat_adresse` wird nie in die DB geschrieben, da es ein berechnetes Feld ist, kein gespeicherter Wert.)

- [ ] **Step 7: Tests laufen lassen**

Run: `cd src-tauri && cargo test`
Erwartet: alle bisherigen 97 Tests weiterhin PASS, plus der neue `list_liefert_hat_adresse_korrekt` → **98 passed**.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/commands/kunden.rs
git commit -m "feat: hat_adresse-Feld in Kunde-Abfragen (list und get)"
```

---

### Task 3: Frontend — `hat_adresse` im Typ, Leerzustand-Hinweis & Warnsymbol in `Kunden.tsx`

**Files:**
- Modify: `src/api.ts`
- Modify: `src/pages/Kunden.tsx`
- Modify: `src/pages/Kunden.test.tsx`
- Modify: `src/pages/KundeDetail.test.tsx`
- Modify: `src/pages/Angebote.test.tsx`
- Modify: `src/pages/Rechnungen.test.tsx`
- Modify: `src/styles/komponenten.css`

**Wichtig:** `tsconfig.json` hat `"include": ["src"]` und `"strict": true` — `tsc` (Teil von `npm run build`) typprüft auch Testdateien. Da `hat_adresse` ein **Pflichtfeld** wird, brechen alle bestehenden Mocks, die ein `Kunde`-Objekt ohne dieses Feld konstruieren, sonst den Build. Betroffen sind neben `Kunden.test.tsx` auch `KundeDetail.test.tsx` (Mock für `kunden.get`), `Angebote.test.tsx` und `Rechnungen.test.tsx` (beide mocken `kunden.list`). `Artikel.test.tsx` ist NICHT betroffen, da dessen `kunden.list`-Mock ein leeres Array liefert, ohne einzelnes `Kunde`-Objekt.

- [ ] **Step 1: `Kunde`-TS-Typ um `hat_adresse` erweitern**

Vorher (`src/api.ts`):
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
}
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
}
```

- [ ] **Step 2: Fehlschlagenden Test in `Kunden.test.tsx` ergänzen**

Bestehende Mock-Daten im `vi.mock("../api", ...)`-Block um `hat_adresse` ergänzen (sonst TS-Fehler durch das neue Pflichtfeld) und zwei neue Tests hinzufügen:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  api: {
    kunden: {
      list: vi.fn().mockResolvedValue([
        { id: "1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
          zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
          leitweg_id: "", kaeuferreferenz: "", hat_adresse: false },
      ]),
    },
    artikel: { list: vi.fn().mockResolvedValue([{ id: "a1" }]) },
  },
  istValidierungsfehler: () => false,
}));
import { Kunden } from "./Kunden";

describe("Kunden", () => {
  it("zeigt Kundenliste mit Nummer und Name", async () => {
    render(<Kunden onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("ACME GmbH")).toBeTruthy());
    expect(screen.getByText("KD-0001")).toBeTruthy();
  });

  it("zeigt ein Warnsymbol für Kunden ohne Adresse", async () => {
    render(<Kunden onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("ACME GmbH")).toBeTruthy());
    expect(screen.getByTitle("Keine Adresse hinterlegt")).toBeTruthy();
  });

  it("zeigt den Leerzustand-Hinweis, wenn keine Kunden vorhanden und nicht gesucht wird", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.list).mockResolvedValueOnce([]);
    render(<Kunden onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Noch keine Kunden/)).toBeTruthy());
  });
});
```

- [ ] **Step 3: Test läuft nicht**

Run: `npm test -- Kunden`
Erwartet: FAIL — `getByTitle("Keine Adresse hinterlegt")` und der Leerzustand-Text existieren noch nicht.

- [ ] **Step 4: Bestehende Fremd-Mocks in `KundeDetail.test.tsx`, `Angebote.test.tsx`, `Rechnungen.test.tsx` um `hat_adresse` ergänzen**

In `src/pages/KundeDetail.test.tsx`, im `kunden.get`-Mock:

Vorher:
```tsx
      get: vi.fn().mockResolvedValue({
        kunde: {
          id: "1",
          typ: "firma",
          name: "ACME GmbH",
          kundennummer: "KD-0001",
          zahlungsziel_tage: 14,
          notizen: "",
          ust_idnr: "",
          email: "",
          leitweg_id: "",
          kaeuferreferenz: "",
        },
```

Nachher:
```tsx
      get: vi.fn().mockResolvedValue({
        kunde: {
          id: "1",
          typ: "firma",
          name: "ACME GmbH",
          kundennummer: "KD-0001",
          zahlungsziel_tage: 14,
          notizen: "",
          ust_idnr: "",
          email: "",
          leitweg_id: "",
          kaeuferreferenz: "",
          hat_adresse: true,
        },
```

In `src/pages/Angebote.test.tsx`, im `kunden.list`-Mock:

Vorher:
```tsx
    kunden: {
      list: vi.fn().mockResolvedValue([
        { id: "k1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001", zahlungsziel_tage: 14,
          notizen: "", ust_idnr: "", email: "", leitweg_id: "", kaeuferreferenz: "" },
      ]),
    },
```

Nachher:
```tsx
    kunden: {
      list: vi.fn().mockResolvedValue([
        { id: "k1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001", zahlungsziel_tage: 14,
          notizen: "", ust_idnr: "", email: "", leitweg_id: "", kaeuferreferenz: "", hat_adresse: true },
      ]),
    },
```

In `src/pages/Rechnungen.test.tsx` exakt dieselbe Änderung (identischer Mock-Block, gleiche Vorher/Nachher-Zeilen wie bei `Angebote.test.tsx` oben).

- [ ] **Step 5: `Kunden.tsx` — Warnsymbol-Icon, `hat_adresse`-Anzeige, Leerzustand-Hinweis**

Import ergänzen (nach dem bestehenden `Fehler`-Import):

```tsx
import { Hinweis } from "../components/Hinweis";
```

Neue Konstante direkt nach `KUNDE_TYP_LABEL` einfügen:

```tsx
const WARNUNG_ICON = (
  <svg className="warnung-icon" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="10" cy="10" r="7.5" />
    <path d="M10 6.5v4.5" strokeLinecap="round" />
    <circle cx="10" cy="13.5" r="0.4" fill="currentColor" stroke="none" />
  </svg>
);
```

Innerhalb der Komponente, neuer State direkt nach `const [suche, setSuche] = useState("");`:

```tsx
  const [leerHinweisVersteckt, setLeerHinweisVersteckt] = useState(false);
```

Die Tabellenzeile (Nachher für die `<tbody>`, ersetzt die bestehende `{kunden.map(...)}`):

Vorher:
```tsx
          {kunden.map((kunde) => (
            <tr key={kunde.id} onClick={() => onOeffnen(kunde.id)}>
              <td className="tabelle-num">{kunde.kundennummer}</td>
              <td>{kunde.name}</td>
              <td>{KUNDE_TYP_LABEL[kunde.typ] ?? kunde.typ}</td>
            </tr>
          ))}
```

Nachher:
```tsx
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
```

Der Leerzustand-Hinweis wird direkt vor der `<table>` eingefügt:

Vorher:
```tsx
      )}

      <table className="tabelle tabelle-klickbar">
```

Nachher:
```tsx
      )}

      {kunden.length === 0 && suche === "" && !leerHinweisVersteckt && (
        <Hinweis onSchliessen={() => setLeerHinweisVersteckt(true)}>
          Noch keine Kunden — leg direkt los.
        </Hinweis>
      )}

      <table className="tabelle tabelle-klickbar">
```

- [ ] **Step 6: `.warnung-icon`-Klasse an `src/styles/komponenten.css` anhängen**

```css
/* Warnsymbol (z. B. Kunde ohne Adresse) */
.warnung-icon {
  margin-left: 6px;
  vertical-align: middle;
  color: var(--st-storniert-text);
}
```

- [ ] **Step 7: Tests laufen lassen**

Run: `npm test -- Kunden`
Erwartet: PASS (3/3).
Run: `npm test -- KundeDetail`
Run: `npm test -- Angebote`
Run: `npm test -- Rechnungen`
Erwartet: alle weiterhin PASS (Step 4 hat deren Mocks korrigiert, kein Verhalten geändert).

- [ ] **Step 8: Volle Test-Suite + Build**

Run: `npm test` → 41/41 (39 aus Task 1 + 2 neue in `Kunden.test.tsx` — der bestehende „zeigt Kundenliste..."-Test bleibt unverändert erhalten und zählt bereits zu den 39; `KundeDetail`/`Angebote`/`Rechnungen`-Tests bleiben zahlenmäßig unverändert, nur deren Mocks wurden korrigiert)
Run: `npm run build` → PASS (dies ist der entscheidende Nachweis, dass Step 4 tatsächlich alle betroffenen Mocks erwischt hat — vorher hätte `tsc` hier mit „Property 'hat_adresse' is missing" fehlschlagen müssen)

- [ ] **Step 9: Commit**

```bash
git add src/api.ts src/pages/Kunden.tsx src/pages/Kunden.test.tsx src/pages/KundeDetail.test.tsx src/pages/Angebote.test.tsx src/pages/Rechnungen.test.tsx src/styles/komponenten.css
git commit -m "feat: Warnsymbol für Kunden ohne Adresse, Leerzustand-Hinweis auf Kundenliste"
```

---

### Task 4: `KundeDetail.tsx` — `startReiter`-Prop

**Files:**
- Modify: `src/pages/KundeDetail.tsx`
- Modify: `src/pages/KundeDetail.test.tsx`

- [ ] **Step 1: Fehlschlagenden Test ergänzen**

`src/pages/KundeDetail.test.tsx` verwendet bereits einen Mock mit Kunde `id: "1"` (siehe bestehender Test „laedt Kundendaten..."). An den bestehenden `describe("KundeDetail", ...)`-Block anhängen (nach dem Test „zeigt nur Belege dieses Kunden"):

```tsx
  it("startet mit dem über startReiter vorgegebenen Reiter", async () => {
    render(<KundeDetail id="1" startReiter="adressen" onReiterUebernommen={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Adressen" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Adressen" })).toHaveAttribute("aria-current", "page");
  });

  it("ruft onReiterUebernommen einmalig nach dem Start mit startReiter auf", async () => {
    const onReiterUebernommen = vi.fn();
    render(<KundeDetail id="1" startReiter="adressen" onReiterUebernommen={onReiterUebernommen} />);
    await waitFor(() => expect(onReiterUebernommen).toHaveBeenCalledTimes(1));
  });
```

- [ ] **Step 2: Test läuft nicht**

Run: `npm test -- KundeDetail`
Erwartet: TS-Fehler „Property 'startReiter' does not exist on type 'IntrinsicAttributes & KundeDetailProps'".

- [ ] **Step 3: `KundeDetail.tsx` anpassen**

Vorher:
```tsx
interface KundeDetailProps {
  id: string;
}

type Reiter = "stammdaten" | "adressen" | "ansprechpartner" | "sonderpreise" | "belege";
```

Nachher:
```tsx
interface KundeDetailProps {
  id: string;
  startReiter?: Reiter | null;
  onReiterUebernommen?: () => void;
}

export type Reiter = "stammdaten" | "adressen" | "ansprechpartner" | "sonderpreise" | "belege";
```

Vorher:
```tsx
export function KundeDetail({ id }: KundeDetailProps) {
  const [detail, setDetail] = useState<KundeDetailTyp | null>(null);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [reiter, setReiter] = useState<Reiter>("stammdaten");
```

Nachher:
```tsx
export function KundeDetail({ id, startReiter, onReiterUebernommen }: KundeDetailProps) {
  const [detail, setDetail] = useState<KundeDetailTyp | null>(null);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [reiter, setReiter] = useState<Reiter>(startReiter ?? "stammdaten");

  useEffect(() => {
    if (startReiter) {
      onReiterUebernommen?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

(Analog zum `zeigeFormularBeimStart`-Muster: der Einmal-Konsum passiert im `useEffect` mit leerem Dependency-Array, damit er nur beim Mount feuert, nicht bei jeder Änderung von `startReiter`/`onReiterUebernommen`.)

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- KundeDetail`
Erwartet: PASS.

- [ ] **Step 5: Volle Test-Suite + Build**

Run: `npm test` → 43/43
Run: `npm run build` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/KundeDetail.tsx src/pages/KundeDetail.test.tsx
git commit -m "feat: KundeDetail kann mit vorgegebenem Reiter starten"
```

---

### Task 5: `App.tsx` + `Kunden.tsx` — Banner nach Kundenanlage, Weiterleitung zu Adressen

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/Kunden.tsx`
- Modify: `src/pages/Kunden.test.tsx`

- [ ] **Step 1: `App.tsx` — `onOeffnen` um optionalen Zielreiter erweitern**

Vorher:
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
import "./styles/tokens.css";
import "./styles/basis.css";
import "./styles/komponenten.css";

function App() {
  const [firma, setFirma] = useState<Firma | null>(null);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [seite, setSeite] = useState<Seite>("kunden");
  const [ausgewaehlterKunde, setAusgewaehlterKunde] = useState<string | null>(null);
  const [ausgewaehltesAngebot, setAusgewaehltesAngebot] = useState<string | null>(null);
  const [ausgewaehlteRechnung, setAusgewaehlteRechnung] = useState<string | null>(null);
```

Nachher:
```tsx
import { useEffect, useState } from "react";
import { api, type AppFehler, type Firma } from "./api";
import { Layout, type Seite } from "./components/Layout";
import { Fehler } from "./components/Fehler";
import { Einrichtung } from "./pages/Einrichtung";
import { Einstellungen } from "./pages/Einstellungen";
import { Kunden } from "./pages/Kunden";
import { KundeDetail, type Reiter } from "./pages/KundeDetail";
import { Artikel } from "./pages/Artikel";
import { Angebote } from "./pages/Angebote";
import { Rechnungen } from "./pages/Rechnungen";
import { BelegEditor } from "./pages/BelegEditor";
import "./styles/tokens.css";
import "./styles/basis.css";
import "./styles/komponenten.css";

function App() {
  const [firma, setFirma] = useState<Firma | null>(null);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [seite, setSeite] = useState<Seite>("kunden");
  const [ausgewaehlterKunde, setAusgewaehlterKunde] = useState<string | null>(null);
  const [kundeDetailStartReiter, setKundeDetailStartReiter] = useState<Reiter | null>(null);
  const [ausgewaehltesAngebot, setAusgewaehltesAngebot] = useState<string | null>(null);
  const [ausgewaehlteRechnung, setAusgewaehlteRechnung] = useState<string | null>(null);
```

- [ ] **Step 2: `navigiere` und Render-Teil anpassen**

Vorher:
```tsx
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
```

Nachher:
```tsx
  function navigiere(neueSeite: Seite) {
    setAusgewaehlterKunde(null);
    setKundeDetailStartReiter(null);
    setAusgewaehltesAngebot(null);
    setAusgewaehlteRechnung(null);
    setSeite(neueSeite);
  }

  return (
    <Layout aktiveSeite={seite} onNavigiere={navigiere}>
      {seite === "kunden" &&
        (ausgewaehlterKunde ? (
          <KundeDetail
            id={ausgewaehlterKunde}
            startReiter={kundeDetailStartReiter}
            onReiterUebernommen={() => setKundeDetailStartReiter(null)}
          />
        ) : (
          <Kunden
            onOeffnen={(id, startReiter) => {
              setAusgewaehlterKunde(id);
              setKundeDetailStartReiter(startReiter ?? null);
            }}
          />
        ))}
```

- [ ] **Step 3: `Kunden.tsx` — Banner nach Kundenanlage**

Import ergänzen:

```tsx
import type { Reiter } from "./KundeDetail";
```

Props-Interface anpassen:

Vorher:
```tsx
interface KundenProps {
  onOeffnen: (id: string) => void;
}
```

Nachher:
```tsx
interface KundenProps {
  onOeffnen: (id: string, startReiter?: Reiter) => void;
}
```

Neue States direkt nach `const [leerHinweisVersteckt, setLeerHinweisVersteckt] = useState(false);` (aus Task 3):

```tsx
  const [neuerKundeId, setNeuerKundeId] = useState<string | null>(null);
  const [zeigtAdressHinweis, setZeigtAdressHinweis] = useState(false);
```

`anlegen()` anpassen:

Vorher:
```tsx
  async function anlegen() {
    setFormFehler(null);
    try {
      await api.kunden.create(neuerKunde);
      setZeigeFormular(false);
      setNeuerKunde(KUNDE_NEU_LEER);
      const liste = await api.kunden.list(suche || undefined);
      setKunden(liste);
    } catch (e) {
      setFormFehler(e as AppFehler);
    }
  }
```

Nachher:
```tsx
  async function anlegen() {
    setFormFehler(null);
    try {
      const erstellt = await api.kunden.create(neuerKunde);
      setZeigeFormular(false);
      setNeuerKunde(KUNDE_NEU_LEER);
      const liste = await api.kunden.list(suche || undefined);
      setKunden(liste);
      setNeuerKundeId(erstellt.id);
      setZeigtAdressHinweis(true);
    } catch (e) {
      setFormFehler(e as AppFehler);
    }
  }
```

Banner-JSX direkt nach `<Fehler fehler={fehler} />` einfügen:

Vorher:
```tsx
      <h1 className="seiten-kopf">Kunden</h1>
      <Fehler fehler={fehler} />

      <div className="werkzeugleiste">
```

Nachher:
```tsx
      <h1 className="seiten-kopf">Kunden</h1>
      <Fehler fehler={fehler} />

      {zeigtAdressHinweis && neuerKundeId && (
        <Hinweis autoDismissMs={4000} onSchliessen={() => setZeigtAdressHinweis(false)}>
          Kunde angelegt —{" "}
          <button
            type="button"
            className="btn btn-leise"
            onClick={() => onOeffnen(neuerKundeId, "adressen")}
          >
            jetzt Adresse und Ansprechpartner ergänzen?
          </button>
        </Hinweis>
      )}

      <div className="werkzeugleiste">
```

- [ ] **Step 4: Test ergänzen**

An `src/pages/Kunden.test.tsx` anhängen (`api.kunden.create` muss im Mock ergänzt werden):

```tsx
// im vi.mock("../api", ...) Objekt, unter kunden: { ... } ergänzen:
      create: vi.fn().mockResolvedValue({
        id: "neu1", typ: "firma", name: "Neu GmbH", kundennummer: "KD-0002",
        zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
        leitweg_id: "", kaeuferreferenz: "", hat_adresse: false,
      }),
```

Neuer Test:

```tsx
  it("zeigt nach dem Anlegen einen Hinweis mit Link zu Adresse/Ansprechpartner", async () => {
    const onOeffnen = vi.fn();
    render(<Kunden onOeffnen={onOeffnen} />);
    await waitFor(() => expect(screen.getByText("ACME GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Neuer Kunde" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Neu GmbH" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /jetzt Adresse und Ansprechpartner ergänzen/ })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /jetzt Adresse und Ansprechpartner ergänzen/ }));
    expect(onOeffnen).toHaveBeenCalledWith("neu1", "adressen");
  });
```

(`fireEvent`/`waitFor` sind bereits aus `@testing-library/react` importiert, `import { fireEvent } from "@testing-library/react";` ggf. zum bestehenden Import in `Kunden.test.tsx` ergänzen, falls dort noch nicht vorhanden.)

- [ ] **Step 5: Tests laufen lassen**

Run: `npm test -- Kunden`
Erwartet: PASS.

- [ ] **Step 6: Volle Test-Suite + Build**

Run: `npm test` → 44/44
Run: `npm run build` → PASS

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/pages/Kunden.tsx src/pages/Kunden.test.tsx
git commit -m "feat: Hinweis-Banner nach Kundenanlage, Weiterleitung zu Adressen-Reiter"
```

---

### Task 6: `Artikel.tsx` — Leerzustand-Hinweis

**Files:**
- Modify: `src/pages/Artikel.tsx`
- Modify: `src/pages/Artikel.test.tsx`

Artikel hat kein Suchfeld — der Leerzustand-Hinweis ist hier also einfacher als bei Kunden (keine Suche-Ausnahme nötig).

- [ ] **Step 1: Fehlschlagenden Test ergänzen**

An `src/pages/Artikel.test.tsx` anhängen (Mock für `api.artikel.list` muss dafür einmal ein leeres Array liefern):

```tsx
  it("zeigt den Leerzustand-Hinweis, wenn keine Artikel vorhanden sind", async () => {
    const { api } = await import("../api");
    vi.mocked(api.artikel.list).mockResolvedValueOnce([]);
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText(/Noch keine Artikel/)).toBeTruthy());
  });
```

- [ ] **Step 2: Test läuft nicht**

Run: `npm test -- Artikel`
Erwartet: FAIL — Text „Noch keine Artikel" existiert noch nicht.

- [ ] **Step 3: `Artikel.tsx` anpassen**

Import ergänzen:

```tsx
import { Hinweis } from "../components/Hinweis";
```

Neuer State direkt nach `const [aufgeklappt, setAufgeklappt] = useState<string | null>(null);`:

```tsx
  const [leerHinweisVersteckt, setLeerHinweisVersteckt] = useState(false);
```

Hinweis-JSX direkt vor der `<table>` in der Hauptkomponente einfügen:

Vorher:
```tsx
      )}

      <table className="tabelle">
        <thead>
          <tr>
            <th>Nummer</th>
```

Nachher:
```tsx
      )}

      {artikel.length === 0 && !leerHinweisVersteckt && (
        <Hinweis onSchliessen={() => setLeerHinweisVersteckt(true)}>
          Noch keine Artikel oder Leistungen — leg direkt los.
        </Hinweis>
      )}

      <table className="tabelle">
        <thead>
          <tr>
            <th>Nummer</th>
```

(Bewusst nur die EINE `<table>` in der Hauptkomponente betroffen — die zweite Tabelle in `KundenpreiseBereich` bleibt unverändert, dort ist Leere kein Onboarding-Thema.)

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- Artikel`
Erwartet: PASS.

- [ ] **Step 5: Volle Test-Suite + Build**

Run: `npm test` → 45/45
Run: `npm run build` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/Artikel.tsx src/pages/Artikel.test.tsx
git commit -m "feat: Leerzustand-Hinweis auf Artikel-Seite"
```

---

### Task 7: Kunde↔Artikel-Verzahnung

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/Kunden.tsx`
- Modify: `src/pages/Artikel.tsx`
- Modify: `src/pages/Kunden.test.tsx`
- Modify: `src/pages/Artikel.test.tsx`

- [ ] **Step 1: `App.tsx` — `formularBeimStartZiel`-State und Navigationshilfe**

Vorher:
```tsx
  const [kundeDetailStartReiter, setKundeDetailStartReiter] = useState<Reiter | null>(null);
  const [ausgewaehltesAngebot, setAusgewaehltesAngebot] = useState<string | null>(null);
  const [ausgewaehlteRechnung, setAusgewaehlteRechnung] = useState<string | null>(null);
```

Nachher:
```tsx
  const [kundeDetailStartReiter, setKundeDetailStartReiter] = useState<Reiter | null>(null);
  const [ausgewaehltesAngebot, setAusgewaehltesAngebot] = useState<string | null>(null);
  const [ausgewaehlteRechnung, setAusgewaehlteRechnung] = useState<string | null>(null);
  const [formularBeimStartZiel, setFormularBeimStartZiel] = useState<"kunden" | "artikel" | null>(null);
```

Vorher:
```tsx
  function navigiere(neueSeite: Seite) {
    setAusgewaehlterKunde(null);
    setKundeDetailStartReiter(null);
    setAusgewaehltesAngebot(null);
    setAusgewaehlteRechnung(null);
    setSeite(neueSeite);
  }

  return (
    <Layout aktiveSeite={seite} onNavigiere={navigiere}>
      {seite === "kunden" &&
        (ausgewaehlterKunde ? (
          <KundeDetail
            id={ausgewaehlterKunde}
            startReiter={kundeDetailStartReiter}
            onReiterUebernommen={() => setKundeDetailStartReiter(null)}
          />
        ) : (
          <Kunden
            onOeffnen={(id, startReiter) => {
              setAusgewaehlterKunde(id);
              setKundeDetailStartReiter(startReiter ?? null);
            }}
          />
        ))}
      {seite === "artikel" && <Artikel />}
```

Nachher:
```tsx
  function navigiere(neueSeite: Seite) {
    setAusgewaehlterKunde(null);
    setKundeDetailStartReiter(null);
    setAusgewaehltesAngebot(null);
    setAusgewaehlteRechnung(null);
    setSeite(neueSeite);
  }

  function navigiereMitFormular(ziel: "kunden" | "artikel") {
    navigiere(ziel);
    setFormularBeimStartZiel(ziel);
  }

  return (
    <Layout aktiveSeite={seite} onNavigiere={navigiere}>
      {seite === "kunden" &&
        (ausgewaehlterKunde ? (
          <KundeDetail
            id={ausgewaehlterKunde}
            startReiter={kundeDetailStartReiter}
            onReiterUebernommen={() => setKundeDetailStartReiter(null)}
          />
        ) : (
          <Kunden
            onOeffnen={(id, startReiter) => {
              setAusgewaehlterKunde(id);
              setKundeDetailStartReiter(startReiter ?? null);
            }}
            zeigeFormularBeimStart={formularBeimStartZiel === "kunden"}
            onFormularUebernommen={() => setFormularBeimStartZiel(null)}
            onZuArtikelWechseln={() => navigiereMitFormular("artikel")}
          />
        ))}
      {seite === "artikel" && (
        <Artikel
          zeigeFormularBeimStart={formularBeimStartZiel === "artikel"}
          onFormularUebernommen={() => setFormularBeimStartZiel(null)}
          onZuKundenWechseln={() => navigiereMitFormular("kunden")}
        />
      )}
```

- [ ] **Step 2: `Kunden.tsx` — Props, Artikel-Leerprüfung, Verzahnungs-Banner, Formular-Auto-Öffnen**

Props-Interface:

Vorher:
```tsx
interface KundenProps {
  onOeffnen: (id: string, startReiter?: Reiter) => void;
}
```

Nachher:
```tsx
interface KundenProps {
  onOeffnen: (id: string, startReiter?: Reiter) => void;
  zeigeFormularBeimStart?: boolean;
  onFormularUebernommen?: () => void;
  onZuArtikelWechseln?: () => void;
}
```

Komponenten-Signatur und neue States:

Vorher:
```tsx
export function Kunden({ onOeffnen }: KundenProps) {
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [suche, setSuche] = useState("");
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [zeigeFormular, setZeigeFormular] = useState(false);
  const [neuerKunde, setNeuerKunde] = useState<KundeNeu>(KUNDE_NEU_LEER);
  const [formFehler, setFormFehler] = useState<AppFehler | null>(null);
  const [leerHinweisVersteckt, setLeerHinweisVersteckt] = useState(false);
  const [neuerKundeId, setNeuerKundeId] = useState<string | null>(null);
  const [zeigtAdressHinweis, setZeigtAdressHinweis] = useState(false);
```

Nachher:
```tsx
export function Kunden({
  onOeffnen,
  zeigeFormularBeimStart,
  onFormularUebernommen,
  onZuArtikelWechseln,
}: KundenProps) {
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [suche, setSuche] = useState("");
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [zeigeFormular, setZeigeFormular] = useState(zeigeFormularBeimStart ?? false);
  const [neuerKunde, setNeuerKunde] = useState<KundeNeu>(KUNDE_NEU_LEER);
  const [formFehler, setFormFehler] = useState<AppFehler | null>(null);
  const [leerHinweisVersteckt, setLeerHinweisVersteckt] = useState(false);
  const [neuerKundeId, setNeuerKundeId] = useState<string | null>(null);
  const [zeigtAdressHinweis, setZeigtAdressHinweis] = useState(false);
  const [artikelLeer, setArtikelLeer] = useState(false);
  const [zeigtArtikelHinweis, setZeigtArtikelHinweis] = useState(false);

  useEffect(() => {
    if (zeigeFormularBeimStart) {
      onFormularUebernommen?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.artikel.list().then((liste) => setArtikelLeer(liste.length === 0)).catch(() => {});
  }, []);
```

`anlegen()` erweitern:

Vorher:
```tsx
  async function anlegen() {
    setFormFehler(null);
    try {
      const erstellt = await api.kunden.create(neuerKunde);
      setZeigeFormular(false);
      setNeuerKunde(KUNDE_NEU_LEER);
      const liste = await api.kunden.list(suche || undefined);
      setKunden(liste);
      setNeuerKundeId(erstellt.id);
      setZeigtAdressHinweis(true);
    } catch (e) {
      setFormFehler(e as AppFehler);
    }
  }
```

Nachher:
```tsx
  async function anlegen() {
    setFormFehler(null);
    try {
      const erstellt = await api.kunden.create(neuerKunde);
      setZeigeFormular(false);
      setNeuerKunde(KUNDE_NEU_LEER);
      const liste = await api.kunden.list(suche || undefined);
      setKunden(liste);
      setNeuerKundeId(erstellt.id);
      setZeigtAdressHinweis(true);
      if (artikelLeer) {
        setZeigtArtikelHinweis(true);
      }
    } catch (e) {
      setFormFehler(e as AppFehler);
    }
  }
```

Zweiten Banner direkt nach dem bestehenden Adress-Hinweis-Banner einfügen:

Vorher:
```tsx
      {zeigtAdressHinweis && neuerKundeId && (
        <Hinweis autoDismissMs={4000} onSchliessen={() => setZeigtAdressHinweis(false)}>
          Kunde angelegt —{" "}
          <button
            type="button"
            className="btn btn-leise"
            onClick={() => onOeffnen(neuerKundeId, "adressen")}
          >
            jetzt Adresse und Ansprechpartner ergänzen?
          </button>
        </Hinweis>
      )}

      <div className="werkzeugleiste">
```

Nachher:
```tsx
      {zeigtAdressHinweis && neuerKundeId && (
        <Hinweis autoDismissMs={4000} onSchliessen={() => setZeigtAdressHinweis(false)}>
          Kunde angelegt —{" "}
          <button
            type="button"
            className="btn btn-leise"
            onClick={() => onOeffnen(neuerKundeId, "adressen")}
          >
            jetzt Adresse und Ansprechpartner ergänzen?
          </button>
        </Hinweis>
      )}

      {zeigtArtikelHinweis && (
        <Hinweis autoDismissMs={4000} onSchliessen={() => setZeigtArtikelHinweis(false)}>
          Kunde angelegt —{" "}
          <button type="button" className="btn btn-leise" onClick={() => onZuArtikelWechseln?.()}>
            jetzt auch einen Artikel anlegen?
          </button>
        </Hinweis>
      )}

      <div className="werkzeugleiste">
```

- [ ] **Step 3: `Artikel.tsx` — Props, Kunden-Leerprüfung (nutzt bereits geladene `kunden`), Verzahnungs-Banner, Formular-Auto-Öffnen**

Import ergänzen:

```tsx
import { Hinweis } from "../components/Hinweis";
```

Props-Interface (bisher hat `Artikel` keine Props):

Vorher:
```tsx
export function Artikel() {
```

Nachher:
```tsx
interface ArtikelProps {
  zeigeFormularBeimStart?: boolean;
  onFormularUebernommen?: () => void;
  onZuKundenWechseln?: () => void;
}

export function Artikel({ zeigeFormularBeimStart, onFormularUebernommen, onZuKundenWechseln }: ArtikelProps) {
```

`zeigeFormular`-State und neue States/Effect:

Vorher:
```tsx
  const [zeigeFormular, setZeigeFormular] = useState(false);
  const [bearbeiteId, setBearbeiteId] = useState<string | null>(null);
  const [form, setForm] = useState(ARTIKEL_NEU_LEER);
  const [preisText, setPreisText] = useState("");
  const [preisFehlerText, setPreisFehlerText] = useState<string | null>(null);
  const [formFehler, setFormFehler] = useState<AppFehler | null>(null);
  const [aufgeklappt, setAufgeklappt] = useState<string | null>(null);
  const [leerHinweisVersteckt, setLeerHinweisVersteckt] = useState(false);
```

Nachher:
```tsx
  const [zeigeFormular, setZeigeFormular] = useState(zeigeFormularBeimStart ?? false);
  const [bearbeiteId, setBearbeiteId] = useState<string | null>(null);
  const [form, setForm] = useState(ARTIKEL_NEU_LEER);
  const [preisText, setPreisText] = useState("");
  const [preisFehlerText, setPreisFehlerText] = useState<string | null>(null);
  const [formFehler, setFormFehler] = useState<AppFehler | null>(null);
  const [aufgeklappt, setAufgeklappt] = useState<string | null>(null);
  const [leerHinweisVersteckt, setLeerHinweisVersteckt] = useState(false);
  const [zeigtKundenHinweis, setZeigtKundenHinweis] = useState(false);

  useEffect(() => {
    if (zeigeFormularBeimStart) {
      onFormularUebernommen?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

`speichern()` erweitern — nur der Neuanlage-Zweig (nicht bei `bearbeiteId`) löst den Hinweis aus:

Vorher:
```tsx
      if (bearbeiteId) {
        await api.artikel.update({
          id: bearbeiteId,
          artikelnummer: artikel.find((a) => a.id === bearbeiteId)?.artikelnummer ?? "",
          bezeichnung: form.bezeichnung,
          beschreibung: form.beschreibung,
          einheit_id: form.einheit_id,
          standardpreis_cent: cent,
        });
      } else {
        await api.artikel.create({
          bezeichnung: form.bezeichnung,
          beschreibung: form.beschreibung,
          einheit_id: form.einheit_id,
          standardpreis_cent: cent,
        });
      }
      setZeigeFormular(false);
      ladeArtikel();
```

Nachher:
```tsx
      if (bearbeiteId) {
        await api.artikel.update({
          id: bearbeiteId,
          artikelnummer: artikel.find((a) => a.id === bearbeiteId)?.artikelnummer ?? "",
          bezeichnung: form.bezeichnung,
          beschreibung: form.beschreibung,
          einheit_id: form.einheit_id,
          standardpreis_cent: cent,
        });
      } else {
        await api.artikel.create({
          bezeichnung: form.bezeichnung,
          beschreibung: form.beschreibung,
          einheit_id: form.einheit_id,
          standardpreis_cent: cent,
        });
        if (kunden.length === 0) {
          setZeigtKundenHinweis(true);
        }
      }
      setZeigeFormular(false);
      ladeArtikel();
```

Hinweis-JSX direkt nach `<Fehler fehler={fehler} />` einfügen:

Vorher:
```tsx
      <h1 className="seiten-kopf">Artikel &amp; Leistungen</h1>
      <Fehler fehler={fehler} />

      <button type="button" className="btn btn-primaer" onClick={neuFormular}>
```

Nachher:
```tsx
      <h1 className="seiten-kopf">Artikel &amp; Leistungen</h1>
      <Fehler fehler={fehler} />

      {zeigtKundenHinweis && (
        <Hinweis autoDismissMs={4000} onSchliessen={() => setZeigtKundenHinweis(false)}>
          Artikel angelegt —{" "}
          <button type="button" className="btn btn-leise" onClick={() => onZuKundenWechseln?.()}>
            jetzt auch einen Kunden anlegen?
          </button>
        </Hinweis>
      )}

      <button type="button" className="btn btn-primaer" onClick={neuFormular}>
```

- [ ] **Step 4: Tests ergänzen**

An `src/pages/Kunden.test.tsx` anhängen (Mock `api.artikel.list` muss dafür einmal ein leeres Array liefern):

```tsx
  it("zeigt nach dem Anlegen zusätzlich einen Artikel-Hinweis, wenn noch keine Artikel existieren", async () => {
    const { api } = await import("../api");
    vi.mocked(api.artikel.list).mockResolvedValueOnce([]);
    const onZuArtikelWechseln = vi.fn();
    render(<Kunden onOeffnen={() => {}} onZuArtikelWechseln={onZuArtikelWechseln} />);
    await waitFor(() => expect(screen.getByText("ACME GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Neuer Kunde" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Neu GmbH" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /jetzt auch einen Artikel anlegen/ })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /jetzt auch einen Artikel anlegen/ }));
    expect(onZuArtikelWechseln).toHaveBeenCalledTimes(1);
  });

  it("öffnet das Anlage-Formular sofort, wenn zeigeFormularBeimStart gesetzt ist, und meldet die Übernahme", async () => {
    const onFormularUebernommen = vi.fn();
    render(
      <Kunden onOeffnen={() => {}} zeigeFormularBeimStart onFormularUebernommen={onFormularUebernommen} />,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Speichern" })).toBeTruthy());
    expect(onFormularUebernommen).toHaveBeenCalledTimes(1);
  });
```

An `src/pages/Artikel.test.tsx` anhängen (Mock `api.kunden.list` muss dafür einmal ein leeres Array liefern):

```tsx
  it("zeigt nach dem Anlegen einen Kunden-Hinweis, wenn noch keine Kunden existieren", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.list).mockResolvedValueOnce([]);
    const onZuKundenWechseln = vi.fn();
    render(<Artikel onZuKundenWechseln={onZuKundenWechseln} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Neuer Artikel" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Neuer Artikel" }));
    fireEvent.change(screen.getByLabelText("Bezeichnung"), { target: { value: "Beratung" } });
    fireEvent.change(screen.getByLabelText("Standardpreis (€)"), { target: { value: "50,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /jetzt auch einen Kunden anlegen/ })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /jetzt auch einen Kunden anlegen/ }));
    expect(onZuKundenWechseln).toHaveBeenCalledTimes(1);
  });
```

(Falls `fireEvent` in einer der beiden Testdateien noch nicht importiert ist, `import { fireEvent } from "@testing-library/react";` zum bestehenden Import ergänzen.)

- [ ] **Step 5: Tests laufen lassen**

Run: `npm test -- Kunden`
Run: `npm test -- Artikel`
Erwartet: beide PASS.

- [ ] **Step 6: Volle Test-Suite + Build**

Run: `npm test` → 48/48
Run: `npm run build` → PASS

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/pages/Kunden.tsx src/pages/Artikel.tsx src/pages/Kunden.test.tsx src/pages/Artikel.test.tsx
git commit -m "feat: Kunde-Artikel-Verzahnung nach Neuanlage (Hinweis + automatisch offenes Formular)"
```

---

### Task 8: `Einrichtung.tsx` — Fortschrittsanzeige & Erklärtexte

**Files:**
- Modify: `src/pages/Einrichtung.tsx`
- Modify: `src/pages/Einrichtung.test.tsx`

- [ ] **Step 1: Test ergänzen**

An `src/pages/Einrichtung.test.tsx` anhängen:

```tsx
  it("zeigt die Fortschrittsanzeige im ersten Schritt", async () => {
    render(<Einrichtung onFertig={() => {}} />);
    await waitFor(() => expect(screen.getByText("Schritt 1 von 5")).toBeTruthy());
  });
```

- [ ] **Step 2: Test läuft nicht**

Run: `npm test -- Einrichtung`
Erwartet: FAIL — Text „Schritt 1 von 5" existiert noch nicht.

- [ ] **Step 3: `Einrichtung.tsx` — `Schritt`-Typ erweitern, Fortschrittsanzeige + Erklärtexte**

Vorher:
```tsx
type Schritt = 1 | 2 | 3 | 4;
```

Nachher:
```tsx
type Schritt = 1 | 2 | 3 | 4 | 5;
```

Jeder der vier bestehenden `<h2>`-Überschriften (Schritt 1-4) bekommt direkt davor eine Fortschrittszeile. Beispiel für Schritt 1 (Muster identisch für Schritt 2, 3, 4 mit jeweils passender Zahl):

Vorher:
```tsx
      {schritt === 1 && (
        <section className="karte">
          <h2>Firmendaten</h2>
```

Nachher:
```tsx
      {schritt === 1 && (
        <section className="karte">
          <p className="schritt-fortschritt">Schritt 1 von 5</p>
          <h2>Firmendaten</h2>
          <p>Diese Angaben erscheinen später auf deinen Angeboten und Rechnungen.</p>
```

Schritt 2 („Logo") hat bereits einen Erklärtext direkt nach der Überschrift — hier wird nur die Fortschrittszeile ergänzt, kein zusätzlicher Text:

Vorher:
```tsx
      {schritt === 2 && (
        <section className="karte">
          <h2>Logo</h2>
          <p>Optional — kann auch später in den Einstellungen hinzugefügt werden.</p>
```

Nachher:
```tsx
      {schritt === 2 && (
        <section className="karte">
          <p className="schritt-fortschritt">Schritt 2 von 5</p>
          <h2>Logo</h2>
          <p>Optional — kann auch später in den Einstellungen hinzugefügt werden.</p>
```

Schritt 3 („Kleinunternehmer-Bestätigung") ebenso — nur die Fortschrittszeile wird ergänzt:

Vorher:
```tsx
      {schritt === 3 && (
        <section className="karte">
          <h2>Kleinunternehmer-Bestätigung</h2>
          <p>
```

Nachher:
```tsx
      {schritt === 3 && (
        <section className="karte">
          <p className="schritt-fortschritt">Schritt 3 von 5</p>
          <h2>Kleinunternehmer-Bestätigung</h2>
          <p>
```

Schritt 4 („Nummernkreise") bekommt die Fortschrittszeile UND einen neuen Erklärtext direkt nach der Überschrift:

Vorher:
```tsx
      {schritt === 4 && (
        <section className="karte">
          <h2>Nummernkreise</h2>
          <p>Die vorbelegten Formate können später jederzeit in den Einstellungen angepasst werden.</p>
```

Nachher:
```tsx
      {schritt === 4 && (
        <section className="karte">
          <p className="schritt-fortschritt">Schritt 4 von 5</p>
          <h2>Nummernkreise</h2>
          <p>Legt fest, wie deine Kunden-, Artikel-, Angebots- und Rechnungsnummern aufgebaut sind — änderbar in den Einstellungen.</p>
          <p>Die vorbelegten Formate können später jederzeit in den Einstellungen angepasst werden.</p>
```

- [ ] **Step 4: `.schritt-fortschritt`-Klasse an `komponenten.css` anhängen**

```css
/* Einrichtungs-Fortschritt */
.schritt-fortschritt {
  font-size: var(--text-s);
  color: var(--text-leise);
  margin: 0 0 var(--abstand-s);
}
```

- [ ] **Step 5: Tests laufen lassen**

Run: `npm test -- Einrichtung`
Erwartet: PASS.

- [ ] **Step 6: Volle Test-Suite + Build**

Run: `npm test` → 49/49
Run: `npm run build` → PASS

- [ ] **Step 7: Commit**

```bash
git add src/pages/Einrichtung.tsx src/pages/Einrichtung.test.tsx src/styles/komponenten.css
git commit -m "feat: Fortschrittsanzeige und Erklärtexte im Erststart-Assistenten"
```

---

### Task 9: `Einrichtung.tsx` + `App.tsx` — Neuer Abschluss-Schritt „Fertig"

**Files:**
- Modify: `src/pages/Einrichtung.tsx`
- Modify: `src/pages/Einrichtung.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Test ergänzen**

An `src/pages/Einrichtung.test.tsx` anhängen:

```tsx
  it("zeigt nach Nummernkreise einen Abschluss-Schritt mit zwei Zielen", async () => {
    render(<Einrichtung onFertig={() => {}} />);
    await waitFor(() => expect(screen.getByText("Firmendaten")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Einrichtung abschließen" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Ersten Kunden anlegen" })).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: "Ersten Artikel anlegen" })).toBeTruthy();
  });

  it("ruft onFertig mit zielSeite \"kunden\" auf, wenn 'Ersten Kunden anlegen' geklickt wird", async () => {
    const onFertig = vi.fn();
    render(<Einrichtung onFertig={onFertig} />);
    await waitFor(() => expect(screen.getByText("Firmendaten")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Einrichtung abschließen" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Ersten Kunden anlegen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Ersten Kunden anlegen" }));
    await waitFor(() => expect(onFertig).toHaveBeenCalledWith("kunden"));
  });
```

(`fireEvent` und `waitFor` sind bereits importiert; falls `fireEvent` fehlt, `import { fireEvent, render, screen, waitFor } from "@testing-library/react";` entsprechend ergänzen.)

- [ ] **Step 2: Test läuft nicht**

Run: `npm test -- Einrichtung`
Erwartet: FAIL — es gibt noch keinen Schritt 5, „Einrichtung abschließen" führt direkt zu `onFertig()` ohne Zwischenschritt.

- [ ] **Step 3: `EinrichtungProps` und `abschliessen` anpassen**

Vorher:
```tsx
interface EinrichtungProps {
  onFertig: () => void;
}
```

Nachher:
```tsx
interface EinrichtungProps {
  onFertig: (zielSeite?: "kunden" | "artikel") => void;
}
```

Vorher:
```tsx
  async function abschliessen() {
    if (!firma) return;
    setFehler(null);
    setSpeichert(true);
    try {
      await api.firma.save(firma);
      if (logoBytes) {
        await api.firma.logoSet(logoBytes);
      }
      onFertig();
    } catch (e) {
      setFehler(e as AppFehler);
      setSpeichert(false);
    }
  }
```

Nachher:
```tsx
  async function abschliessen() {
    if (!firma) return;
    setFehler(null);
    setSpeichert(true);
    try {
      await api.firma.save(firma);
      if (logoBytes) {
        await api.firma.logoSet(logoBytes);
      }
      setSchritt(5);
      setSpeichert(false);
    } catch (e) {
      setFehler(e as AppFehler);
      setSpeichert(false);
    }
  }
```

(`abschliessen()` speichert Firma/Logo wie bisher, wechselt aber jetzt zu Schritt 5 statt sofort `onFertig()` aufzurufen — die Signatur bleibt absichtlich ohne Parameter, der bestehende Button-Aufruf `onClick={abschliessen}` in Schritt 4 bleibt dadurch unverändert gültig. Erst der Klick auf einen der beiden neuen Buttons in Schritt 5 — siehe Step 4 — ruft `onFertig(zielSeite)` direkt auf; die Firma wurde zu dem Zeitpunkt bereits gespeichert, ein erneuter Aufruf von `abschliessen()` ist nicht nötig.)

- [ ] **Step 4: Neuer Schritt 5 „Fertig"**

Direkt nach dem bestehenden `{schritt === 4 && ( ... )}`-Block einfügen (vor dem schließenden `</main>`):

```tsx
      {schritt === 5 && (
        <section className="karte">
          <h2>Fertig!</h2>
          <p>Womit möchtest du starten?</p>
          <div className="werkzeugleiste">
            <button type="button" className="btn btn-primaer" onClick={() => onFertig("kunden")}>
              Ersten Kunden anlegen
            </button>
            <button type="button" className="btn btn-primaer" onClick={() => onFertig("artikel")}>
              Ersten Artikel anlegen
            </button>
          </div>
          <p>Firmendaten und Nummernkreise kannst du jederzeit in den Einstellungen ändern.</p>
        </section>
      )}
```

- [ ] **Step 5: `App.tsx` — `onFertig` mit `zielSeite` verdrahten**

Vorher:
```tsx
  if (!firma.eingerichtet) {
    return <Einrichtung onFertig={() => api.firma.get().then(setFirma)} />;
  }
```

Nachher:
```tsx
  if (!firma.eingerichtet) {
    return (
      <Einrichtung
        onFertig={(zielSeite) => {
          api.firma.get().then(setFirma);
          if (zielSeite) {
            setSeite(zielSeite);
            setFormularBeimStartZiel(zielSeite);
          }
        }}
      />
    );
  }
```

(`setSeite`/`setFormularBeimStartZiel` sind bereits vorhandene States aus Task 7 — hier werden sie erstmals auch vom Erststart-Pfad aus befüllt.)

- [ ] **Step 6: Tests laufen lassen**

Run: `npm test -- Einrichtung`
Erwartet: PASS.

- [ ] **Step 7: Volle Test-Suite + Build**

Run: `npm test` → 51/51
Run: `npm run build` → PASS

- [ ] **Step 8: Commit**

```bash
git add src/pages/Einrichtung.tsx src/pages/Einrichtung.test.tsx src/App.tsx
git commit -m "feat: Abschluss-Schritt nach Ersteinrichtung mit Kunde/Artikel-Weiche"
```

---

### Task 10: Abschlussprüfung

**Files:** keine Änderungen — reine Verifikation.

- [ ] **Step 1: Vollständige Frontend-Test-Suite**

Run: `npm test`
Erwartet: alle 51 Tests grün.

- [ ] **Step 2: Typecheck und Build**

Run: `npm run build`
Erwartet: `tsc && vite build` erfolgreich, keine Typfehler.

- [ ] **Step 3: Rust-Tests**

Run: `cd src-tauri && cargo test`
Erwartet: 98 Tests grün (97 bestehend + 1 neuer `list_liefert_hat_adresse_korrekt`-Test aus Task 2).

- [ ] **Step 4: Manuelle Abnahme (durch Auftraggeber)**

`npm run tauri dev` starten und folgende Abläufe einmal live durchklicken:
1. Falls möglich (frische DB oder `firma.eingerichtet = false` testweise gesetzt): Ersteinrichtung komplett durchlaufen, Fortschrittsanzeige und Erklärtexte prüfen, im Abschluss-Schritt „Ersten Kunden anlegen" wählen — landet auf Kunden-Seite mit bereits offenem Formular.
2. Einen Kunden anlegen — Hinweis-Banner „jetzt Adresse ergänzen" prüfen (verschwindet nach ~4 Sekunden von selbst), Klick darauf führt zur Detailseite mit vorausgewähltem Adressen-Reiter.
3. Kundenliste: Kunde ohne Adresse zeigt das kleine Warnsymbol neben dem Namen; verschwindet, sobald eine Adresse gespeichert wurde.
4. Bei leerer Kunden- bzw. Artikel-Liste: Leerzustand-Hinweis prüfen, inkl. Wegklicken per „×".
5. Kunde↔Artikel-Verzahnung: bei leerer Artikel-Liste einen Kunden anlegen → zusätzlicher Hinweis „jetzt auch einen Artikel anlegen?" erscheint, Klick führt zur Artikel-Seite mit offenem Formular. Symmetrisch umgekehrt testen.
6. Hell- und Dunkelmodus für die neue `Hinweis`-Box gegenprüfen (Systemeinstellung umschalten, App-Fenster offen lassen).

- [ ] **Step 5: Commit (nur falls Schritt 4 Korrekturen ergab)**

Nur falls die manuelle Abnahme Anpassungen ergeben hat — sonst entfällt dieser Schritt.

---

## Nach Task 10

Alle 10 Tasks abgeschlossen → `superpowers:finishing-a-development-branch` für Merge nach `main`.
