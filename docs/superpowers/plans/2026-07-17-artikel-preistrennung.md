# Optische Trennung Standard-/Kundenpreise (Artikel-Seite) — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der aufgeklappte Kundenpreise-Bereich auf der Artikel-Seite wird optisch klar als Ausnahme vom Standardpreis erkennbar (statt wie eine gleichrangige zweite Liste), inklusive Preisvergleich je Kundenpreis und einer sichtbaren Anzahl bereits im geschlossenen Zustand.

**Architecture:** Kleine Backend-Ergänzung (`kundenpreise_anzahl` als berechnetes Feld am Artikel, analog zum `hat_adresse`-Muster aus dem Onboarding-Plan) plus Frontend-Umbau von `KundenpreiseBereich` in `src/pages/Artikel.tsx` (neue Panel-Struktur statt verschachtelter `.karte`+`<table>`) plus neue CSS-Tokens/-Klassen.

**Tech Stack:** Tauri 2 (Rust/sqlx/SQLite) + React 19/TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-17-artikel-preistrennung-design.md`

---

### Task 1: Backend — `kundenpreise_anzahl` in Artikel-Abfragen

**Files:**
- Modify: `src-tauri/src/commands/artikel.rs`

- [ ] **Step 1: Fehlschlagenden Test ergänzen**

An `mod tests` in `src-tauri/src/commands/artikel.rs` anhängen (nutzt die bestehenden Helfer `test_pool()`, `neu()`, `kunde()`):

```rust
    #[tokio::test]
    async fn list_liefert_kundenpreise_anzahl_korrekt() {
        let (_dir, pool) = test_pool().await;
        let a1 = create(&pool, neu("Beratung")).await.unwrap();
        let a2 = create(&pool, neu("Konzeption")).await.unwrap();
        let k = kunde(&pool, "ACME GmbH").await;
        kundenpreis_speichern(&pool, Kundenpreis {
            id: "".into(), artikel_id: a1.id.clone(), kunde_id: k.clone(),
            preis_cent: 8000, gueltig_ab: None,
        }).await.unwrap();
        let kp2 = kundenpreis_speichern(&pool, Kundenpreis {
            id: "".into(), artikel_id: a1.id.clone(), kunde_id: k.clone(),
            preis_cent: 8500, gueltig_ab: Some("2026-01-01".into()),
        }).await.unwrap();
        kundenpreis_entfernen(&pool, kp2.id).await.unwrap();

        let liste = list(&pool, None).await.unwrap();
        let gefunden_a1 = liste.iter().find(|x| x.id == a1.id).unwrap();
        let gefunden_a2 = liste.iter().find(|x| x.id == a2.id).unwrap();
        // a1 hat zwei Kundenpreise angelegt, einer davon wieder gelöscht -> zählt nur der verbleibende.
        assert_eq!(gefunden_a1.kundenpreise_anzahl, 1);
        // a2 hat gar keine Kundenpreise.
        assert_eq!(gefunden_a2.kundenpreise_anzahl, 0);
    }
```

- [ ] **Step 2: Test läuft nicht**

Run: `cd src-tauri && cargo test list_liefert_kundenpreise_anzahl_korrekt`
Erwartet: Compile-Fehler — `kundenpreise_anzahl` existiert noch nicht auf `Artikel`.

- [ ] **Step 3: `Artikel`-Struct und `list()` anpassen**

Vorher:
```rust
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Artikel {
    pub id: String,
    pub artikelnummer: String,
    pub bezeichnung: String,
    pub beschreibung: String,
    pub einheit_id: String,
    pub standardpreis_cent: i64,
}
```

Nachher:
```rust
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Artikel {
    pub id: String,
    pub artikelnummer: String,
    pub bezeichnung: String,
    pub beschreibung: String,
    pub einheit_id: String,
    pub standardpreis_cent: i64,
    pub kundenpreise_anzahl: i64,
}
```

Vorher:
```rust
pub async fn list(pool: &SqlitePool, suche: Option<String>) -> AppResult<Vec<Artikel>> {
    let muster = format!("%{}%", suche.unwrap_or_default().to_lowercase());
    Ok(sqlx::query_as(
        "SELECT id, artikelnummer, bezeichnung, beschreibung, einheit_id, standardpreis_cent \
         FROM artikel WHERE deleted_at IS NULL AND (lower(bezeichnung) LIKE ? OR lower(artikelnummer) LIKE ?) ORDER BY bezeichnung")
        .bind(&muster).bind(&muster).fetch_all(pool).await?)
}
```

Nachher:
```rust
pub async fn list(pool: &SqlitePool, suche: Option<String>) -> AppResult<Vec<Artikel>> {
    let muster = format!("%{}%", suche.unwrap_or_default().to_lowercase());
    Ok(sqlx::query_as(
        "SELECT a.id, a.artikelnummer, a.bezeichnung, a.beschreibung, a.einheit_id, a.standardpreis_cent, \
                (SELECT COUNT(*) FROM kundenpreis kp WHERE kp.artikel_id = a.id AND kp.deleted_at IS NULL) AS kundenpreise_anzahl \
         FROM artikel a WHERE a.deleted_at IS NULL AND (lower(a.bezeichnung) LIKE ? OR lower(a.artikelnummer) LIKE ?) ORDER BY a.bezeichnung")
        .bind(&muster).bind(&muster).fetch_all(pool).await?)
}
```

- [ ] **Step 4: `create()` anpassen**

Vorher (in `create()`):
```rust
    let a = Artikel {
        id: Uuid::new_v4().to_string(),
        artikelnummer,
        bezeichnung: d.bezeichnung.trim().into(),
        beschreibung: d.beschreibung,
        einheit_id: d.einheit_id,
        standardpreis_cent: d.standardpreis_cent,
    };
```

Nachher:
```rust
    let a = Artikel {
        id: Uuid::new_v4().to_string(),
        artikelnummer,
        bezeichnung: d.bezeichnung.trim().into(),
        beschreibung: d.beschreibung,
        einheit_id: d.einheit_id,
        standardpreis_cent: d.standardpreis_cent,
        kundenpreise_anzahl: 0,
    };
```

`update()` bleibt unverändert — es echot den übergebenen `Artikel` unverändert zurück und schreibt `kundenpreise_anzahl` nicht in die DB (das Feld ist rein lesend, wie `hat_adresse` bei `Kunde`).

- [ ] **Step 5: Test läuft**

Run: `cd src-tauri && cargo test list_liefert_kundenpreise_anzahl_korrekt`
Erwartet: PASS.

- [ ] **Step 6: Volle Rust-Test-Suite**

Run: `cd src-tauri && cargo test`
Erwartet: 99 Tests grün (98 bestehend + 1 neuer).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands/artikel.rs
git commit -m "feat: kundenpreise_anzahl-Feld in Artikel-Abfragen"
```

---

### Task 2: Frontend — `kundenpreise_anzahl` im Typ, `api.ts` und bestehende Mocks

**Files:**
- Modify: `src/api.ts`
- Modify: `src/pages/Artikel.tsx`
- Modify: `src/pages/Artikel.test.tsx`
- Modify: `src/pages/BelegEditor.test.tsx`

Dieser Task fügt nur das Feld zum Typ hinzu und behebt alle dadurch entstehenden Build-Brüche — noch OHNE sichtbares neues Verhalten (das kommt in Task 3). Genau wie beim `hat_adresse`-Feld im Onboarding-Plan macht `tsconfig.json`s `"include": ["src"]` + `"strict": true` ein neues Pflichtfeld auf einem geteilten Typ zu einem Build-Bruch für JEDE Datei mit einem veralteten Mock — nicht nur für Testdateien der Artikel-Seite selbst.

- [ ] **Step 1: `Artikel`-Interface und `create`-Typ in `api.ts` anpassen**

Vorher:
```ts
export interface Artikel {
  id: string;
  artikelnummer: string;
  bezeichnung: string;
  beschreibung: string;
  einheit_id: string;
  standardpreis_cent: number;
}
```

Nachher:
```ts
export interface Artikel {
  id: string;
  artikelnummer: string;
  bezeichnung: string;
  beschreibung: string;
  einheit_id: string;
  standardpreis_cent: number;
  kundenpreise_anzahl: number;
}
```

Vorher:
```ts
    create: (a: Omit<Artikel, "id" | "artikelnummer">) => invoke<Artikel>("artikel_create", { daten: a }),
```

Nachher:
```ts
    create: (a: Omit<Artikel, "id" | "artikelnummer" | "kundenpreise_anzahl">) => invoke<Artikel>("artikel_create", { daten: a }),
```

- [ ] **Step 2: Build läuft (noch) nicht durch**

Run: `npm run build`
Erwartet: FAIL — `tsc`-Fehler in `Artikel.tsx` (fehlendes `kundenpreise_anzahl` in der `update()`-Payload-Literal) sowie in `Artikel.test.tsx` und `BelegEditor.test.tsx` (Mock-Objekte ohne `kundenpreise_anzahl`).

- [ ] **Step 3: `Artikel.tsx`s `speichern()` anpassen**

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
```

Nachher:
```tsx
      if (bearbeiteId) {
        await api.artikel.update({
          id: bearbeiteId,
          artikelnummer: artikel.find((a) => a.id === bearbeiteId)?.artikelnummer ?? "",
          kundenpreise_anzahl: artikel.find((a) => a.id === bearbeiteId)?.kundenpreise_anzahl ?? 0,
          bezeichnung: form.bezeichnung,
          beschreibung: form.beschreibung,
          einheit_id: form.einheit_id,
          standardpreis_cent: cent,
        });
```

- [ ] **Step 4: `Artikel.test.tsx`s Mock anpassen**

Vorher:
```tsx
      list: vi.fn().mockResolvedValue([
        {
          id: "a1",
          artikelnummer: "ART-0001",
          bezeichnung: "Beratung",
          beschreibung: "",
          einheit_id: "e1",
          standardpreis_cent: 9550,
        },
      ]),
```

Nachher:
```tsx
      list: vi.fn().mockResolvedValue([
        {
          id: "a1",
          artikelnummer: "ART-0001",
          bezeichnung: "Beratung",
          beschreibung: "",
          einheit_id: "e1",
          standardpreis_cent: 9550,
          kundenpreise_anzahl: 0,
        },
      ]),
```

- [ ] **Step 5: `BelegEditor.test.tsx`s Mock anpassen**

Vorher:
```tsx
    vi.mocked(api.artikel.list).mockResolvedValue([
      {
        id: "a1", artikelnummer: "ART-0001", bezeichnung: "Beratung",
        beschreibung: "", einheit_id: "e1", standardpreis_cent: 9550,
      },
    ]);
```

Nachher:
```tsx
    vi.mocked(api.artikel.list).mockResolvedValue([
      {
        id: "a1", artikelnummer: "ART-0001", bezeichnung: "Beratung",
        beschreibung: "", einheit_id: "e1", standardpreis_cent: 9550, kundenpreise_anzahl: 0,
      },
    ]);
```

(Die drei anderen `api.artikel.list`-Mocks in derselben Datei lösen mit `[]` auf und brauchen keine Änderung.)

- [ ] **Step 6: Build und Tests laufen**

Run: `npm run build`
Erwartet: PASS.

Run: `npm test`
Erwartet: 53/53 (unverändert — dieser Task fügt keine neuen Tests hinzu, behebt nur Build-Brüche).

- [ ] **Step 7: Commit**

```bash
git add src/api.ts src/pages/Artikel.tsx src/pages/Artikel.test.tsx src/pages/BelegEditor.test.tsx
git commit -m "feat: kundenpreise_anzahl im Artikel-Typ, bestehende Mocks angepasst"
```

---

### Task 3: Frontend — Button-Label zeigt Kundenpreis-Anzahl

**Files:**
- Modify: `src/pages/Artikel.tsx`
- Modify: `src/pages/Artikel.test.tsx`

- [ ] **Step 1: Fehlschlagende Tests ergänzen**

An `src/pages/Artikel.test.tsx` anhängen:

```tsx
  it("zeigt den Kundenpreise-Button ohne Zahl, wenn keine Kundenpreise vorhanden sind", async () => {
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Kundenpreise" })).toBeTruthy();
  });

  it("zeigt den Kundenpreise-Button mit Anzahl, wenn Kundenpreise vorhanden sind", async () => {
    const { api } = await import("../api");
    vi.mocked(api.artikel.list).mockResolvedValueOnce([
      {
        id: "a1", artikelnummer: "ART-0001", bezeichnung: "Beratung",
        beschreibung: "", einheit_id: "e1", standardpreis_cent: 9550, kundenpreise_anzahl: 2,
      },
    ]);
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Kundenpreise (2)" })).toBeTruthy();
  });
```

- [ ] **Step 2: Tests laufen nicht**

Run: `npm test -- Artikel`
Erwartet: FAIL — Button heißt noch immer schlicht „Kundenpreise" unabhängig von der Anzahl (der erste neue Test bleibt PASS, da er den unveränderten Fall prüft; der zweite schlägt fehl).

- [ ] **Step 3: `Artikel.tsx` anpassen**

Vorher:
```tsx
                  <button
                    type="button"
                    className="btn btn-leise"
                    onClick={() => setAufgeklappt(aufgeklappt === a.id ? null : a.id)}
                  >
                    Kundenpreise
                  </button>
```

Nachher:
```tsx
                  <button
                    type="button"
                    className="btn btn-leise"
                    onClick={() => setAufgeklappt(aufgeklappt === a.id ? null : a.id)}
                  >
                    {a.kundenpreise_anzahl === 0 ? "Kundenpreise" : `Kundenpreise (${a.kundenpreise_anzahl})`}
                  </button>
```

- [ ] **Step 4: Tests laufen**

Run: `npm test -- Artikel`
Erwartet: PASS.

- [ ] **Step 5: Volle Suite + Build**

Run: `npm test` → 55/55
Run: `npm run build` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/Artikel.tsx src/pages/Artikel.test.tsx
git commit -m "feat: Kundenpreise-Button zeigt Anzahl vorhandener Kundenpreise"
```

---

### Task 4: CSS — neue Tokens und Klassen für das Kundenpreise-Panel

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/komponenten.css`

- [ ] **Step 1: Neue Farbtoken in `tokens.css` ergänzen**

Im hellen `:root`-Block, direkt nach den bestehenden `--hinweis-*`-Zeilen:

Vorher:
```css
  --hinweis-bg: #eaf1f7;
  --hinweis-text: #2c5a7c;
  --hinweis-rand: #c9dced;

  /* Abstände */
```

Nachher:
```css
  --hinweis-bg: #eaf1f7;
  --hinweis-text: #2c5a7c;
  --hinweis-rand: #c9dced;

  --preis-guenstiger-bg: #e6f4ec;
  --preis-guenstiger-text: #1f7a52;
  --preis-teurer-bg: #fdecea;
  --preis-teurer-text: #a3231f;

  /* Abstände */
```

Im dunklen `@media (prefers-color-scheme: dark) { :root { ... } }`-Block, direkt nach den dortigen `--hinweis-*`-Zeilen:

Vorher:
```css
    --hinweis-bg: #1a2733;
    --hinweis-text: #8fc1e8;
    --hinweis-rand: #2d4358;

    --schatten: 0 1px 3px rgba(0, 0, 0, 0.4);
```

Nachher:
```css
    --hinweis-bg: #1a2733;
    --hinweis-text: #8fc1e8;
    --hinweis-rand: #2d4358;

    --preis-guenstiger-bg: #163a2a;
    --preis-guenstiger-text: #6ed3a0;
    --preis-teurer-bg: #3a1e1c;
    --preis-teurer-text: #ef8f8a;

    --schatten: 0 1px 3px rgba(0, 0, 0, 0.4);
```

- [ ] **Step 2: Neue Klassen an `komponenten.css` anhängen**

Ans Ende der Datei (nach der bestehenden `.schritt-fortschritt`-Regel):

```css

/* Kundenpreise-Panel (Artikel-Seite) */
.kundenpreis-panel {
  margin: var(--abstand-s) 0;
  padding: var(--abstand-m) var(--abstand-l);
  background: var(--bg-gedaempft);
  border-left: 3px solid var(--akzent);
  border-radius: 0 var(--radius-m) var(--radius-m) 0;
}

.kundenpreis-panel h4 {
  margin: 0 0 var(--abstand-s);
  font-size: var(--text-s);
  font-weight: 600;
  color: var(--text-leise);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.kundenpreis-zeile {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--abstand-s) 0;
  border-bottom: 1px solid var(--rand);
  font-size: var(--text-m);
}

.kundenpreis-zeile:last-of-type {
  border-bottom: none;
}

.kundenpreis-gueltig-ab {
  display: block;
  font-size: var(--text-s);
  color: var(--text-leiser);
}

.kundenpreis-preis {
  font-weight: 600;
}

.kundenpreis-badge {
  display: inline-block;
  margin-left: var(--abstand-s);
  padding: 1px var(--abstand-s);
  border-radius: var(--radius-pill);
  font-size: var(--text-s);
  font-weight: 600;
}

.kundenpreis-badge.guenstiger {
  background: var(--preis-guenstiger-bg);
  color: var(--preis-guenstiger-text);
}

.kundenpreis-badge.teurer {
  background: var(--preis-teurer-bg);
  color: var(--preis-teurer-text);
}
```

- [ ] **Step 3: Build läuft**

Run: `npm run build`
Erwartet: PASS. (Reines CSS, keine Testauswirkung — `npm test` bleibt bei 55/55.)

- [ ] **Step 4: Commit**

```bash
git add src/styles/tokens.css src/styles/komponenten.css
git commit -m "feat: CSS-Tokens und -Klassen für Kundenpreise-Panel"
```

---

### Task 5: Frontend — Panel-Struktur ersetzen (ohne Abweichungs-Badge)

**Files:**
- Modify: `src/pages/Artikel.tsx`
- Modify: `src/pages/Artikel.test.tsx`

Ersetzt die bisherige `.karte` + `<h3>` + `<table>`-Struktur von `KundenpreiseBereich` durch das neue Panel. Die Abweichungs-Badge kommt in Task 6 — dieser Task legt nur das Grundgerüst (Überschrift mit Standardpreis, Zeilen statt Tabelle, Gültig-ab als Zusatztext, Formular im selben Panel) und die dafür nötige `standardpreisCent`-Prop.

**Hinweis zur Datumsanzeige:** Die Spec nennt als Beispiel „ab TT.MM.JJJJ", die restliche App zeigt Datumswerte (`beleg.datum`, `zahlung.datum` usw.) aber überall unverändert im ISO-Format (`YYYY-MM-DD`) an — es gibt keine einzige Stelle im Code, die deutsches Datumsformat erzeugt. Um keine einmalige, nirgends sonst verwendete Formatierungs-Konvention einzuführen, wird `gueltig_ab` hier ebenfalls im ISO-Format gezeigt (`ab 2026-01-01`), konsistent mit dem Rest der App.

- [ ] **Step 1: Fehlschlagende Tests ergänzen**

An `src/pages/Artikel.test.tsx` anhängen. Diese Tests klappen den Kundenpreise-Bereich per Klick auf den Button auf — dafür müssen `api.kunden.list` und `api.artikel.kundenpreise` für den jeweiligen Test passende Werte liefern (beide werden beim Mount unverzögert aufgerufen, kein Debounce beteiligt — die `mockResolvedValueOnce`-Werte werden jeweils innerhalb desselben Tests konsumiert, kein Leak-Risiko wie beim durchsuchbaren Kundenfeld in `Kunden.tsx`):

```tsx
  it("zeigt im aufgeklappten Bereich den Standardpreis in der Überschrift sowie Kundenname und -preis", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.list).mockResolvedValueOnce([
      {
        id: "k1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
        zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
        leitweg_id: "", kaeuferreferenz: "", hat_adresse: true,
      },
    ]);
    vi.mocked(api.artikel.kundenpreise).mockResolvedValueOnce([
      { id: "kp1", artikel_id: "a1", kunde_id: "k1", preis_cent: 6500, gueltig_ab: null },
    ]);
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Kundenpreise" }));
    await waitFor(() =>
      expect(screen.getByText("Kundenpreise — Ausnahmen vom Standardpreis (95,50 €)")).toBeTruthy(),
    );
    // Kundenname und -preis hängen von zwei unabhängig auflösenden Promises ab
    // (api.kunden.list und api.artikel.kundenpreise) — deshalb eigenes waitFor je
    // Assertion statt sich auf das Timing des obigen waitFor zu verlassen (das nur
    // von standardpreisCent abhängt, einer synchron verfügbaren Prop, und daher
    // schon vor dem Laden der beiden Listen erfüllt sein kann).
    // { selector: "span" } grenzt außerdem gegen die gleichnamige <option> im
    // Kunde-Dropdown desselben Panels ab — sonst meldet getByText "Found multiple
    // elements", da <option>-Text ebenfalls zu getByText passt.
    await waitFor(() => expect(screen.getByText("ACME GmbH", { selector: "span" })).toBeTruthy());
    await waitFor(() => expect(screen.getByText("65,00 €")).toBeTruthy());
  });

  it("zeigt das Gültig-ab-Datum als Zusatz, wenn gesetzt", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.list).mockResolvedValueOnce([
      {
        id: "k1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
        zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
        leitweg_id: "", kaeuferreferenz: "", hat_adresse: true,
      },
    ]);
    vi.mocked(api.artikel.kundenpreise).mockResolvedValueOnce([
      { id: "kp1", artikel_id: "a1", kunde_id: "k1", preis_cent: 6500, gueltig_ab: "2026-01-01" },
    ]);
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Kundenpreise" }));
    await waitFor(() => expect(screen.getByText("ab 2026-01-01")).toBeTruthy());
  });
```

- [ ] **Step 2: Tests laufen nicht**

Run: `npm test -- Artikel`
Erwartet: FAIL — die alte Überschrift „Kundenpreise" (als `<h3>`) und die Tabellenstruktur existieren noch, der neue Text „Kundenpreise — Ausnahmen vom Standardpreis (…)" nicht.

- [ ] **Step 3: `standardpreisCent`-Prop durchreichen**

Vorher (im Aufruf innerhalb der Hauptkomponente):
```tsx
              {aufgeklappt === a.id && (
                <tr>
                  <td colSpan={5}>
                    <KundenpreiseBereich artikelId={a.id} kunden={kunden} />
                  </td>
                </tr>
              )}
```

Nachher:
```tsx
              {aufgeklappt === a.id && (
                <tr>
                  <td colSpan={5}>
                    <KundenpreiseBereich
                      artikelId={a.id}
                      kunden={kunden}
                      standardpreisCent={a.standardpreis_cent}
                    />
                  </td>
                </tr>
              )}
```

- [ ] **Step 4: `KundenpreiseBereich` umbauen**

Vorher:
```tsx
interface KundenpreiseBereichProps {
  artikelId: string;
  kunden: Kunde[];
}

function KundenpreiseBereich({ artikelId, kunden }: KundenpreiseBereichProps) {
  const [kundenpreise, setKundenpreise] = useState<Kundenpreis[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [kundeId, setKundeId] = useState("");
  const [preisText, setPreisText] = useState("");
  const [preisFehlerText, setPreisFehlerText] = useState<string | null>(null);
  const [gueltigAb, setGueltigAb] = useState("");

  function laden() {
    api.artikel
      .kundenpreise(artikelId)
      .then((liste) => {
        setKundenpreise(liste);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }

  useEffect(laden, [artikelId]);

  async function speichern() {
    const cent = parseEuro(preisText);
    if (cent === null) {
      setPreisFehlerText("Bitte einen gültigen Preis eingeben, z. B. 95,50");
      return;
    }
    setPreisFehlerText(null);
    setFehler(null);
    try {
      await api.artikel.kundenpreisSave({
        id: "",
        artikel_id: artikelId,
        kunde_id: kundeId,
        preis_cent: cent,
        gueltig_ab: gueltigAb || null,
      });
      setKundeId("");
      setPreisText("");
      setGueltigAb("");
      laden();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  function kundeName(id: string): string {
    return kunden.find((k) => k.id === id)?.name ?? id;
  }

  return (
    <div className="karte">
      <h3>Kundenpreise</h3>
      <Fehler fehler={fehler} />
      <table className="tabelle">
        <thead>
          <tr>
            <th>Kunde</th>
            <th>Preis</th>
            <th>Gültig ab</th>
          </tr>
        </thead>
        <tbody>
          {kundenpreise.map((kp) => (
            <tr key={kp.id}>
              <td>{kundeName(kp.kunde_id)}</td>
              <td>{formatCent(kp.preis_cent)}</td>
              <td>{kp.gueltig_ab ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <label className="feld">
          Kunde
          <select value={kundeId} onChange={(e) => setKundeId(e.currentTarget.value)}>
            <option value="">–</option>
            {kunden.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>
        <label className="feld">
          Preis (€)
          <input value={preisText} onChange={(e) => setPreisText(e.currentTarget.value)} />
        </label>
        {preisFehlerText && <div className="feld-fehler" role="alert">{preisFehlerText}</div>}
        <label className="feld">
          Gültig ab
          <input type="date" value={gueltigAb} onChange={(e) => setGueltigAb(e.currentTarget.value)} />
        </label>
        <button type="submit" className="btn btn-primaer">Speichern</button>
      </form>
    </div>
  );
}
```

Nachher:
```tsx
interface KundenpreiseBereichProps {
  artikelId: string;
  kunden: Kunde[];
  standardpreisCent: number;
}

function KundenpreiseBereich({ artikelId, kunden, standardpreisCent }: KundenpreiseBereichProps) {
  const [kundenpreise, setKundenpreise] = useState<Kundenpreis[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [kundeId, setKundeId] = useState("");
  const [preisText, setPreisText] = useState("");
  const [preisFehlerText, setPreisFehlerText] = useState<string | null>(null);
  const [gueltigAb, setGueltigAb] = useState("");

  function laden() {
    api.artikel
      .kundenpreise(artikelId)
      .then((liste) => {
        setKundenpreise(liste);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }

  useEffect(laden, [artikelId]);

  async function speichern() {
    const cent = parseEuro(preisText);
    if (cent === null) {
      setPreisFehlerText("Bitte einen gültigen Preis eingeben, z. B. 95,50");
      return;
    }
    setPreisFehlerText(null);
    setFehler(null);
    try {
      await api.artikel.kundenpreisSave({
        id: "",
        artikel_id: artikelId,
        kunde_id: kundeId,
        preis_cent: cent,
        gueltig_ab: gueltigAb || null,
      });
      setKundeId("");
      setPreisText("");
      setGueltigAb("");
      laden();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  function kundeName(id: string): string {
    return kunden.find((k) => k.id === id)?.name ?? id;
  }

  return (
    <div className="kundenpreis-panel">
      <h4>Kundenpreise — Ausnahmen vom Standardpreis ({formatCent(standardpreisCent)})</h4>
      <Fehler fehler={fehler} />
      {kundenpreise.map((kp) => (
        <div className="kundenpreis-zeile" key={kp.id}>
          <span>
            {kundeName(kp.kunde_id)}
            {kp.gueltig_ab && <span className="kundenpreis-gueltig-ab">ab {kp.gueltig_ab}</span>}
          </span>
          <span className="kundenpreis-preis">{formatCent(kp.preis_cent)}</span>
        </div>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <label className="feld">
          Kunde
          <select value={kundeId} onChange={(e) => setKundeId(e.currentTarget.value)}>
            <option value="">–</option>
            {kunden.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>
        <label className="feld">
          Preis (€)
          <input value={preisText} onChange={(e) => setPreisText(e.currentTarget.value)} />
        </label>
        {preisFehlerText && <div className="feld-fehler" role="alert">{preisFehlerText}</div>}
        <label className="feld">
          Gültig ab
          <input type="date" value={gueltigAb} onChange={(e) => setGueltigAb(e.currentTarget.value)} />
        </label>
        <button type="submit" className="btn btn-primaer">Speichern</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Tests laufen**

Run: `npm test -- Artikel`
Erwartet: PASS.

- [ ] **Step 6: Volle Suite + Build**

Run: `npm test` → 57/57
Run: `npm run build` → PASS

- [ ] **Step 7: Stabilitätslauf**

Zwei `mockResolvedValueOnce`-Aufrufe (`kunden.list` und `artikel.kundenpreise`) sind in diesem Task neu kombiniert — vor dem Commit zur Sicherheit mehrfach laufen lassen:

```bash
rm -rf node_modules/.vite
for i in $(seq 1 15); do npm test -- Artikel > /tmp/artikel_run_$i.log 2>&1; echo "Run $i: exit=$?"; done
```

Erwartet: 15/15 mit `exit=0`. Bei Auffälligkeiten: Root Cause analog zum bereits dokumentierten Muster aus dem Onboarding-Plan suchen (unkonsumierter `mockResolvedValueOnce`-Wert, der in einen späteren Test durchsickert) und mit einem `beforeEach`-Reset lösen statt mit einem lokalen Patch.

- [ ] **Step 8: Commit**

```bash
git add src/pages/Artikel.tsx src/pages/Artikel.test.tsx
git commit -m "feat: Kundenpreise-Bereich als schlankes Panel statt eigener Tabelle"
```

---

### Task 6: Frontend — Abweichungs-Badge

**Files:**
- Modify: `src/pages/Artikel.tsx`
- Modify: `src/pages/Artikel.test.tsx`

- [ ] **Step 1: Fehlschlagende Tests ergänzen**

An `src/pages/Artikel.test.tsx` anhängen (nutzt denselben Mock-Aufbau wie Task 5s Tests):

```tsx
  it("zeigt eine günstiger-Badge, wenn der Kundenpreis niedriger als der Standardpreis ist", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.list).mockResolvedValueOnce([
      {
        id: "k1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
        zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
        leitweg_id: "", kaeuferreferenz: "", hat_adresse: true,
      },
    ]);
    vi.mocked(api.artikel.kundenpreise).mockResolvedValueOnce([
      { id: "kp1", artikel_id: "a1", kunde_id: "k1", preis_cent: 6500, gueltig_ab: null },
    ]);
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Kundenpreise" }));
    // Standardpreis 95,50 € -> 65,00 € ist rund 32% günstiger.
    await waitFor(() => expect(screen.getByText("−32%")).toBeTruthy());
  });

  it("zeigt eine teurer-Badge, wenn der Kundenpreis höher als der Standardpreis ist", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.list).mockResolvedValueOnce([
      {
        id: "k1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
        zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
        leitweg_id: "", kaeuferreferenz: "", hat_adresse: true,
      },
    ]);
    vi.mocked(api.artikel.kundenpreise).mockResolvedValueOnce([
      { id: "kp1", artikel_id: "a1", kunde_id: "k1", preis_cent: 12000, gueltig_ab: null },
    ]);
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Kundenpreise" }));
    // Standardpreis 95,50 € -> 120,00 € ist rund 26% teurer.
    await waitFor(() => expect(screen.getByText("+26%")).toBeTruthy());
  });

  it("zeigt keine Abweichungs-Badge, wenn der Standardpreis 0 ist", async () => {
    const { api } = await import("../api");
    vi.mocked(api.artikel.list).mockResolvedValueOnce([
      {
        id: "a1", artikelnummer: "ART-0001", bezeichnung: "Gratis-Beratung",
        beschreibung: "", einheit_id: "e1", standardpreis_cent: 0, kundenpreise_anzahl: 1,
      },
    ]);
    vi.mocked(api.kunden.list).mockResolvedValueOnce([
      {
        id: "k1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
        zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
        leitweg_id: "", kaeuferreferenz: "", hat_adresse: true,
      },
    ]);
    vi.mocked(api.artikel.kundenpreise).mockResolvedValueOnce([
      { id: "kp1", artikel_id: "a1", kunde_id: "k1", preis_cent: 5000, gueltig_ab: null },
    ]);
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Gratis-Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Kundenpreise (1)" }));
    await waitFor(() => expect(screen.getByText("50,00 €")).toBeTruthy());
    expect(screen.queryByText(/%/)).toBeNull();
  });
```

- [ ] **Step 2: Tests laufen nicht**

Run: `npm test -- Artikel`
Erwartet: FAIL — keine Abweichungs-Badges vorhanden.

- [ ] **Step 3: Berechnungsfunktion und Badge-JSX ergänzen**

Vor der `KundenpreiseBereich`-Funktion (oder direkt danach, außerhalb) einfügen:

```tsx
function abweichungsBadge(standardpreisCent: number, kundenpreisCent: number): { text: string; klasse: "guenstiger" | "teurer" } | null {
  if (standardpreisCent === 0) return null;
  const prozent = Math.round(((kundenpreisCent - standardpreisCent) / standardpreisCent) * 100);
  // 0% (Kundenpreis exakt gleich Standardpreis) wird wie "teurer" behandelt — es ist
  // schlicht keine Verbilligung, eine dritte Sonderfarbe für den seltenen Gleichstand-Fall
  // lohnt sich nicht.
  const klasse = prozent < 0 ? "guenstiger" : "teurer";
  const vorzeichen = prozent < 0 ? "−" : "+";
  return { text: `${vorzeichen}${Math.abs(prozent)}%`, klasse };
}
```

Vorher (in `KundenpreiseBereich`s JSX):
```tsx
      {kundenpreise.map((kp) => (
        <div className="kundenpreis-zeile" key={kp.id}>
          <span>
            {kundeName(kp.kunde_id)}
            {kp.gueltig_ab && <span className="kundenpreis-gueltig-ab">ab {kp.gueltig_ab}</span>}
          </span>
          <span className="kundenpreis-preis">{formatCent(kp.preis_cent)}</span>
        </div>
      ))}
```

Nachher:
```tsx
      {kundenpreise.map((kp) => {
        const badge = abweichungsBadge(standardpreisCent, kp.preis_cent);
        return (
          <div className="kundenpreis-zeile" key={kp.id}>
            <span>
              {kundeName(kp.kunde_id)}
              {kp.gueltig_ab && <span className="kundenpreis-gueltig-ab">ab {kp.gueltig_ab}</span>}
            </span>
            <span>
              <span className="kundenpreis-preis">{formatCent(kp.preis_cent)}</span>
              {badge && <span className={`kundenpreis-badge ${badge.klasse}`}>{badge.text}</span>}
            </span>
          </div>
        );
      })}
```

- [ ] **Step 4: Tests laufen**

Run: `npm test -- Artikel`
Erwartet: PASS.

- [ ] **Step 5: Volle Suite + Build**

Run: `npm test` → 60/60
Run: `npm run build` → PASS

- [ ] **Step 6: Stabilitätslauf**

Dieselbe Mock-Kombination wie in Task 5 (`kunden.list` + `artikel.kundenpreise`, je einmal pro Test konsumiert), zur Sicherheit erneut mehrfach laufen lassen:

```bash
rm -rf node_modules/.vite
for i in $(seq 1 10); do npm test -- Artikel > /tmp/artikel_run_$i.log 2>&1; echo "Run $i: exit=$?"; done
```

Erwartet: 10/10 mit `exit=0`.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Artikel.tsx src/pages/Artikel.test.tsx
git commit -m "feat: Abweichungs-Badge für Kundenpreise gegenüber dem Standardpreis"
```

---

### Task 7: Frontend — Anzahl im Button nach Änderung synchron halten

**Files:**
- Modify: `src/pages/Artikel.tsx`
- Modify: `src/pages/Artikel.test.tsx`

Behebt die im Spec-Review gefundene Lücke: Wird im `KundenpreiseBereich` ein Kundenpreis hinzugefügt oder entfernt, aktualisiert das bisher nur die lokale Preisliste — die `kundenpreise_anzahl` im `artikel`-State der Elternkomponente (Grundlage der Button-Beschriftung) bleibt veraltet.

- [ ] **Step 1: Fehlschlagenden Test ergänzen**

An `src/pages/Artikel.test.tsx` anhängen:

```tsx
  it("aktualisiert die Kundenpreise-Anzahl im Button, nachdem ein neuer Kundenpreis gespeichert wurde", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.list).mockResolvedValueOnce([
      {
        id: "k1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
        zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
        leitweg_id: "", kaeuferreferenz: "", hat_adresse: true,
      },
    ]);
    vi.mocked(api.artikel.kundenpreise).mockResolvedValueOnce([]);
    vi.mocked(api.artikel.kundenpreisSave).mockResolvedValueOnce({
      id: "kp1", artikel_id: "a1", kunde_id: "k1", preis_cent: 6500, gueltig_ab: null,
    });
    vi.mocked(api.artikel.list).mockResolvedValueOnce([
      {
        id: "a1", artikelnummer: "ART-0001", bezeichnung: "Beratung",
        beschreibung: "", einheit_id: "e1", standardpreis_cent: 9550, kundenpreise_anzahl: 0,
      },
    ]).mockResolvedValueOnce([
      {
        id: "a1", artikelnummer: "ART-0001", bezeichnung: "Beratung",
        beschreibung: "", einheit_id: "e1", standardpreis_cent: 9550, kundenpreise_anzahl: 1,
      },
    ]);
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Kundenpreise" }));
    // Explizit auf die geladene <option> warten, nicht nur auf das <select> selbst:
    // Das <select> existiert schon synchron beim Mount, bevor api.kunden.list
    // aufgelöst hat — ein fireEvent.change auf "k1" liefe ansonsten ins Leere,
    // solange die passende <option value="k1"> noch nicht im DOM ist.
    await waitFor(() => expect(screen.getByRole("option", { name: "ACME GmbH" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Kunde"), { target: { value: "k1" } });
    fireEvent.change(screen.getByLabelText("Preis (€)"), { target: { value: "65,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Kundenpreise (1)" })).toBeTruthy(),
    );
  });
```

- [ ] **Step 2: Test läuft nicht**

Run: `npm test -- Artikel`
Erwartet: FAIL — Button bleibt bei „Kundenpreise" (ohne Zahl), da `Artikel.tsx`s `artikel`-Liste nach dem Speichern nicht neu geladen wird.

- [ ] **Step 3: `onAenderung`-Prop ergänzen**

Vorher:
```tsx
interface KundenpreiseBereichProps {
  artikelId: string;
  kunden: Kunde[];
  standardpreisCent: number;
}

function KundenpreiseBereich({ artikelId, kunden, standardpreisCent }: KundenpreiseBereichProps) {
```

Nachher:
```tsx
interface KundenpreiseBereichProps {
  artikelId: string;
  kunden: Kunde[];
  standardpreisCent: number;
  onAenderung: () => void;
}

function KundenpreiseBereich({ artikelId, kunden, standardpreisCent, onAenderung }: KundenpreiseBereichProps) {
```

Vorher (in `speichern()`):
```tsx
      setKundeId("");
      setPreisText("");
      setGueltigAb("");
      laden();
    } catch (e) {
```

Nachher:
```tsx
      setKundeId("");
      setPreisText("");
      setGueltigAb("");
      laden();
      onAenderung();
    } catch (e) {
```

Vorher (Aufrufstelle in der Hauptkomponente):
```tsx
                    <KundenpreiseBereich
                      artikelId={a.id}
                      kunden={kunden}
                      standardpreisCent={a.standardpreis_cent}
                    />
```

Nachher:
```tsx
                    <KundenpreiseBereich
                      artikelId={a.id}
                      kunden={kunden}
                      standardpreisCent={a.standardpreis_cent}
                      onAenderung={ladeArtikel}
                    />
```

- [ ] **Step 4: Test läuft**

Run: `npm test -- Artikel`
Erwartet: PASS.

- [ ] **Step 5: Volle Suite + Build**

Run: `npm test` → 61/61
Run: `npm run build` → PASS

- [ ] **Step 6: Stabilitätslauf**

Dieser Task verkettet erstmals zwei `mockResolvedValueOnce`-Werte auf `api.artikel.list` in einem einzigen Test (Mount + Reload nach Speichern) — eine neue Kombination, die vor dem Commit mehrfach laufen sollte:

```bash
rm -rf node_modules/.vite
for i in $(seq 1 15); do npm test -- Artikel > /tmp/artikel_run_$i.log 2>&1; echo "Run $i: exit=$?"; done
```

Erwartet: 15/15 mit `exit=0`. Bei Auffälligkeiten: siehe Hinweis in Task 5, Schritt 7 (Root Cause suchen statt lokal patchen).

- [ ] **Step 7: Commit**

```bash
git add src/pages/Artikel.tsx src/pages/Artikel.test.tsx
git commit -m "fix: Kundenpreise-Anzahl im Button nach Speichern/Löschen synchron halten"
```

---

### Task 8: Abschlussprüfung

**Files:** keine Änderungen — reine Verifikation.

- [ ] **Step 1: Vollständige Frontend-Test-Suite**

Run: `npm test`
Erwartet: alle 61 Tests grün.

- [ ] **Step 2: Typecheck und Build**

Run: `npm run build`
Erwartet: `tsc && vite build` erfolgreich, keine Typfehler.

- [ ] **Step 3: Rust-Tests**

Run: `cd src-tauri && cargo test`
Erwartet: 99 Tests grün (98 bestehend + 1 neuer `list_liefert_kundenpreise_anzahl_korrekt`-Test aus Task 1).

- [ ] **Step 4: Manuelle Abnahme (durch Auftraggeber)**

`npm run tauri dev` starten und folgende Abläufe einmal live durchklicken:
1. Artikel-Seite öffnen: Artikel ohne Kundenpreise zeigt Button „Kundenpreise" (ohne Zahl).
2. Über das Formular im aufgeklappten Panel einen ersten Kundenpreis anlegen — Button ändert sich sofort zu „Kundenpreise (1)", ohne die Seite neu zu laden.
3. Einen Kundenpreis anlegen, der günstiger als der Standardpreis ist → grüne „−N%"-Badge; einen zweiten, der teurer ist → rote „+N%"-Badge.
4. Bei einem Artikel mit Standardpreis 0 € (z. B. testweise anlegen) einen Kundenpreis hinzufügen — keine Badge, nur der Preis wird gezeigt.
5. Ein „Gültig ab"-Datum bei einem Kundenpreis setzen — erscheint als kleiner Zusatztext unter dem Kundennamen.
6. Hell- und Dunkelmodus für das neue Panel und die Badges gegenprüfen (Systemeinstellung umschalten, App-Fenster offen lassen).

- [ ] **Step 5: Commit (nur falls Schritt 4 Korrekturen ergab)**

Nur falls die manuelle Abnahme Anpassungen ergeben hat — sonst entfällt dieser Schritt.

---

## Nach Task 8

Alle 8 Tasks abgeschlossen → `superpowers:finishing-a-development-branch` für Merge nach `main`.
