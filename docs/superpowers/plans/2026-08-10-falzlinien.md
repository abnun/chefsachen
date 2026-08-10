# Falz- und Lochmarken — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drei Hilfsmarken (zwei Falzmarken, eine Lochmarke) nach DIN 5008 Form B auf jeder Seite jedes Belegs, ein gemeinsamer An/Aus-Schalter, Vorgabe an.

**Architektur:** Ein neues `bool`-Feld `falzmarken` in `Vorlage` (Backend, alleinige Autorität für Vorschau und echten Export). Ein neuer Typst-Zweig nutzt Typsts `#set page(background: ...)`, das — empirisch verifiziert per Spike-Test — absolut vom wahren Blattursprung aus positioniert, unabhängig vom eingestellten Rand, und pro Seite läuft wie der bestehende `footer`. Ein neuer PDF-Test-Helfer `linienpositionen` liest die tatsächlich gezeichneten Linienpositionen aus dem PDF-Content-Stream, analog zu `textpositionen`/`bildpositionen`.

**Tech Stack:** Rust (`vorlage.rs`, `pdf.rs`), Typst (`rechnung.typ`), React/TypeScript (`Belegvorlage.tsx`), `cargo test`, `vitest`.

**Spec:** `docs/superpowers/specs/2026-08-10-falzlinien-design.md`

---

### Task 1: Backend — `falzmarken`-Einstellung

**Files:**
- Modify: `src-tauri/src/dokument/vorlage.rs` (Struct, Default, `aus_paaren`, `als_eingaben`)
- Test: `src-tauri/src/dokument/vorlage.rs` (`mod tests`)

- [ ] **Step 1: Fehlschlagende Tests schreiben**

Füge im `mod tests`-Block von `src-tauri/src/dokument/vorlage.rs` direkt
nach `ohne_einstellung_ist_der_girocode_aktiv` ein:

```rust
#[tokio::test]
async fn ohne_einstellung_sind_falzmarken_aktiv() {
    // Bewusste Ausnahme vom sonstigen "neue Einstellungen ändern nichts am
    // bisherigen Aussehen"-Prinzip — ausdrücklicher Nutzerwunsch, wie beim
    // Girocode.
    let dir = tempfile::tempdir().unwrap();
    let pool = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
    let v = Vorlage::laden(&pool).await.unwrap();
    assert!(v.falzmarken);
}

#[tokio::test]
async fn falzmarken_lassen_sich_abschalten() {
    let dir = tempfile::tempdir().unwrap();
    let pool = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
    crate::commands::einstellungen::set(&pool, "vorlage.falzmarken".into(), "nein".into())
        .await
        .unwrap();
    let v = Vorlage::laden(&pool).await.unwrap();
    assert!(!v.falzmarken);
}
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `cd src-tauri && cargo test --lib dokument::vorlage::tests::ohne_einstellung_sind_falzmarken_aktiv dokument::vorlage::tests::falzmarken_lassen_sich_abschalten 2>&1 | tail -30`
Erwartet: Kompilierfehler — `no field 'falzmarken' on type 'vorlage::Vorlage'`.

- [ ] **Step 3: Struct-Feld ergänzen**

In `src-tauri/src/dokument/vorlage.rs` in der `Vorlage`-Struct-Definition,
direkt nach `pub rand_seitlich_mm: f64,` (letztes Feld vor der
schließenden `}`) einfügen:

```rust
    /// Zwei Falzmarken und eine Lochmarke nach DIN 5008 Form B (105 mm,
    /// 148,5 mm, 210 mm von oben) am linken Blattrand. Anders als die
    /// übrigen Einstellungen hier standardmäßig aktiv — ausdrücklicher
    /// Nutzerwunsch, kein Bewahren des bisherigen Aussehens.
    pub falzmarken: bool,
```

- [ ] **Step 4: Vorgabewert ergänzen**

In `Default for Vorlage`, direkt nach `rand_seitlich_mm: 25.0,` (letztes
Feld vor der schließenden `}`) einfügen:

```rust
            falzmarken: true,
```

- [ ] **Step 5: `aus_paaren` ergänzen**

In `aus_paaren`, direkt nach dem `rand_seitlich_mm: mm(...)`-Block (letztes
Feld vor der schließenden `}` des `Self`-Literals) einfügen:

```rust
            falzmarken: ja(hole("vorlage.falzmarken"), standard.falzmarken),
```

- [ ] **Step 6: `als_eingaben` ergänzen**

In `als_eingaben`, direkt nach `("v_rand_seitlich_mm", ...)` (letzter
Eintrag vor der schließenden `]`) einfügen:

```rust
            ("v_falzmarken", ja_nein(self.falzmarken)),
```

- [ ] **Step 7: Tests laufen lassen, Erfolg bestätigen**

Run: `cd src-tauri && cargo test --lib dokument::vorlage:: 2>&1 | tail -40`
Erwartet: alle Tests grün, inklusive der beiden neuen.

- [ ] **Step 8: Committen**

```bash
git add src-tauri/src/dokument/vorlage.rs
git commit -m "$(cat <<'EOF'
feat: Einstellung für Falz- und Lochmarken im Backend ergänzen

Neues Feld falzmarken (Vorgabe: an, wie beim Girocode eine bewusste
Ausnahme vom sonstigen "Aussehen bleibt unverändert"-Prinzip). Noch
ohne Wirkung auf die Typst-Vorlage — folgt in Task 2.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

## Context für Task 1

Dies ist Task 1 von 3. Reine Backend-Einstellung, noch keine Typst- oder
Frontend-Änderung — das Feld wird zwar an die Vorlage übergeben
(`v_falzmarken`), aber `rechnung.typ` liest diesen Eingabewert noch nirgends
(Task 2). Nicht `rechnung.typ` oder `.tsx`-Dateien anfassen.

Arbeite vom Repository-Wurzelverzeichnis:
`/Users/markusmueller/Library/Mobile Documents/com~apple~CloudDocs/Projekte/chefsachen`

Dieses Repo arbeitet direkt auf `main` (kein Feature-Branch/Worktree) — mit
dem menschlichen Betreuer für diese Session bestätigt.

Hinweis: Dieses Repo liegt auf iCloud Drive und hatte in früheren Sessions
Sync-bedingte `.git/objects`-Probleme (behoben über `git fetch origin
--refetch`, sollte nicht wiederkehren — bei `fatal: unable to read
tree/blob` oder `error: invalid object` das zuerst versuchen).

## Vor Beginn

Bei Unklarheiten oder wenn der genaue Inhalt in `vorlage.rs` nicht zur
Beschreibung passt (die Datei kann sich seit Schreiben des Plans leicht
verschoben haben), nachfragen — den umgebenden Code als Quelle der Wahrheit
nehmen, nicht Zeilennummern wörtlich.

## Report Format

- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- Was umgesetzt wurde
- Testergebnisse (RED-Bestätigung, dann GREEN für das gesamte `dokument::vorlage::`-Modul)
- Die Commit-SHA
- Bedenken, falls vorhanden

---

### Task 2: Typst-Vorlage + geometrischer PDF-Test

Der technisch anspruchsvollste Teil. Ein Spike-Test (in dieser Session
bereits durchgeführt, nicht committet) hat empirisch bestätigt: Typsts
`#set page(background: ...)` positioniert absolut vom wahren
Blattursprung aus — `place(dx: 0mm, dy: 105mm, ...)` landet exakt bei
105 mm vom echten Blattrand, **unabhängig vom eingestellten Rand**, keine
Korrektur wie beim Anschriftfeld nötig. `background` läuft wie `footer`
auf jeder Seite.

**Files:**
- Modify: `src-tauri/templates/rechnung.typ` (neue Funktion + `background:`-Parameter)
- Modify: `src-tauri/src/dokument/pdf.rs` (neuer Helfer `punkt` + `linienpositionen`, neue Tests)

- [ ] **Step 1: PDF-Test-Helfer und fehlschlagende Tests schreiben**

Füge in `src-tauri/src/dokument/pdf.rs` direkt nach der bestehenden
`bildpositionen`-Funktion (endet mit der schließenden `}` vor dem
Kommentar zu `logo_steht_rechts_bei_rechts_oben_und_links_bei_links`) ein:

```rust
    /// Transformiert einen Punkt mit einer Matrix — anders als `mal`, das
    /// zwei Matrizen verkettet: Ein Punkt hat keine eigene
    /// Rotation/Skalierung, nur eine Position.
    fn punkt(m: Matrix, x: f32, y: f32) -> (f32, f32) {
        (m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5])
    }

    /// Start- und Endpunkte gezeichneter Geradenstücke (`m`→`l`) der ersten
    /// Seite, gemessen wie `textpositionen`/`bildpositionen` von der linken
    /// unteren Ecke. Erfasst nur einfache Zweipunkt-Strecken — für die
    /// Falz-/Lochmarken ausreichend, die als je ein `line()` gezeichnet
    /// werden.
    fn linienpositionen(bytes: &[u8]) -> Vec<((f32, f32), (f32, f32))> {
        let doc = lopdf::Document::load_mem(bytes).unwrap();
        let (_, seite) = doc.get_pages().into_iter().next().unwrap();
        let inhalt = lopdf::content::Content::decode(&doc.get_page_content(seite).unwrap()).unwrap();

        let mut ctm = EINHEIT;
        let mut stapel: Vec<Matrix> = Vec::new();
        let mut start: Option<(f32, f32)> = None;
        let mut linien = Vec::new();

        for op in inhalt.operations {
            let werte = || -> Matrix {
                let mut m = EINHEIT;
                for (i, o) in op.operands.iter().take(6).enumerate() {
                    m[i] = o.as_float().unwrap_or(0.0);
                }
                m
            };
            let zahl = |i: usize| op.operands.get(i).and_then(|o| o.as_float()).unwrap_or(0.0);
            match op.operator.as_str() {
                "q" => stapel.push(ctm),
                "Q" => ctm = stapel.pop().unwrap_or(EINHEIT),
                "cm" if op.operands.len() == 6 => ctm = mal(werte(), ctm),
                "m" if op.operands.len() == 2 => start = Some(punkt(ctm, zahl(0), zahl(1))),
                "l" if op.operands.len() == 2 => {
                    if let Some(s) = start.take() {
                        linien.push((s, punkt(ctm, zahl(0), zahl(1))));
                    }
                }
                _ => {}
            }
        }
        linien
    }
```

Füge direkt vor der Test-Funktion `die_anschrift_liegt_im_sichtfenster_nach_din_5008`
diese beiden Tests ein:

```rust
    /// Beweist am tatsächlich erzeugten PDF, dass die drei Marken exakt bei
    /// 105/148,5/210 mm vom Blattursprung stehen — und zwar unabhängig vom
    /// eingestellten Rand. Das ist der eigentliche Witz von `background`
    /// (siehe Kommentar in rechnung.typ): Anders als das Anschriftfeld, das
    /// im Textfluss steht und die `- rand_oben`-Korrektur braucht, sitzt
    /// `background` schon absolut am Blattursprung. Nur bei x ≈ 0 gefiltert,
    /// damit andere Linien im Beleg (z. B. Tabellenlinien, die deutlich
    /// weiter rechts beginnen) das Ergebnis nicht verfälschen.
    #[test]
    fn falzmarken_stehen_an_den_richtigen_hoehen_unabhaengig_vom_rand() {
        const MM: f32 = 72.0 / 25.4;
        const SEITENHOEHE: f32 = 297.0 * MM;

        let hoehen_am_linken_rand = |vorlage: &crate::dokument::vorlage::Vorlage| -> Vec<f32> {
            let bytes = rendern(&test_kontext(), None, vorlage).unwrap();
            let mut hoehen: Vec<f32> = linienpositionen(&bytes)
                .into_iter()
                .filter(|((x1, _), (x2, _))| x1.abs() < 1.0 && x2.abs() < 1.0)
                .map(|((_, y1), _)| (SEITENHOEHE - y1) / MM)
                .collect();
            hoehen.sort_by(|a, b| a.partial_cmp(b).unwrap());
            hoehen
        };

        for vorlage in [
            crate::dokument::vorlage::Vorlage::default(),
            crate::dokument::vorlage::Vorlage {
                rand_oben_mm: 35.0,
                rand_seitlich_mm: 15.0,
                ..Default::default()
            },
        ] {
            let hoehen = hoehen_am_linken_rand(&vorlage);
            assert_eq!(hoehen.len(), 3, "erwartet drei Marken am linken Blattrand, gefunden: {hoehen:?}");
            assert!((hoehen[0] - 105.0).abs() < 0.5, "Falzmarke 1 bei {:.1} mm statt 105 mm", hoehen[0]);
            assert!((hoehen[1] - 148.5).abs() < 0.5, "Lochmarke bei {:.1} mm statt 148,5 mm", hoehen[1]);
            assert!((hoehen[2] - 210.0).abs() < 0.5, "Falzmarke 2 bei {:.1} mm statt 210 mm", hoehen[2]);
        }
    }

    /// Deaktivierte Falzmarken dürfen keine Linie am Blattrand hinterlassen.
    /// Prüft gezielt nur bei x ≈ 0 (dort, wo ausschließlich die Falz-/
    /// Lochmarken zeichnen würden), nicht die gesamte Linienliste — der
    /// Beleg zeichnet an anderer Stelle durchaus Linien (Tabelle,
    /// Girocode-Rahmen), die mit dieser Einstellung nichts zu tun haben.
    #[test]
    fn ohne_falzmarken_erscheint_keine_linie_am_blattrand() {
        let vorlage = crate::dokument::vorlage::Vorlage { falzmarken: false, ..Default::default() };
        let bytes = rendern(&test_kontext(), None, &vorlage).unwrap();
        let am_rand: Vec<_> = linienpositionen(&bytes)
            .into_iter()
            .filter(|((x1, _), (x2, _))| x1.abs() < 1.0 && x2.abs() < 1.0)
            .collect();
        assert!(am_rand.is_empty(), "Linie am Blattrand trotz deaktivierter Falzmarken: {am_rand:?}");
    }
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `cd src-tauri && cargo test --lib dokument::pdf::tests::falzmarken_stehen_an_den_richtigen_hoehen_unabhaengig_vom_rand dokument::pdf::tests::ohne_falzmarken_erscheint_keine_linie_am_blattrand 2>&1 | tail -30`
Erwartet: Kompilierfehler — `no field 'falzmarken' on type 'vorlage::Vorlage'`
ist bereits durch Task 1 behoben; stattdessen sollte
`falzmarken_stehen_an_den_richtigen_hoehen_unabhaengig_vom_rand` mit
`erwartet drei Marken am linken Blattrand, gefunden: []` fehlschlagen (die
Vorlage rendert die Marken mangels Typst-Implementierung noch nicht), und
`ohne_falzmarken_erscheint_keine_linie_am_blattrand` sollte bereits grün
sein (da ohnehin nichts gezeichnet wird — kein Widerspruch, dieser Test
beweist erst nach Step 3 etwas Substanzielles, wenn tatsächlich eine
Einstellung ausgewertet wird).

- [ ] **Step 3: Typst-Vorlage ergänzen**

In `src-tauri/templates/rechnung.typ` direkt nach der Zeile
`#let rand_seitlich = mass(sys.inputs.v_rand_seitlich_mm)` (vor dem
Kommentar „Geschäftsangaben für den Fuß jeder Seite") einfügen:

```typst

// Falz- und Lochmarken nach DIN 5008 Form B: kurze Striche am linken
// Blattrand für das manuelle Falten (Fensterumschlag DIN lang/C6/5) und
// Lochen (Zwei-Loch-Ordner). Über `background` statt im Textfluss — anders
// als das Anschriftfeld weiter unten braucht das keine Rand-Korrektur,
// `background` sitzt schon absolut am Blattursprung, unabhängig vom
// eingestellten Rand. Läuft wie `footer` auf jeder Seite, nicht nur der
// ersten: Anders als Logo/Anschrift ist das keine Inhaltsangabe, sondern
// eine Handhabungshilfe für den ganzen gedruckten Stapel.
#let falzmarke(y_mm) = place(
  top + left,
  dx: 0mm,
  dy: y_mm * 1mm,
  line(length: 4mm, stroke: 0.3pt + rgb("#999999")),
)
```

Im bestehenden `#set page(...)`-Aufruf, direkt nach der `margin:`-Zeile
und vor dem Kommentar zu `footer-descent`, einfügen:

```typst
  background: if ja(sys.inputs.v_falzmarken) [
    #falzmarke(105.0)
    #falzmarke(148.5)
    #falzmarke(210.0)
  ],
```

- [ ] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `cd src-tauri && cargo test --lib dokument::pdf::tests::falzmarken_stehen_an_den_richtigen_hoehen_unabhaengig_vom_rand dokument::pdf::tests::ohne_falzmarken_erscheint_keine_linie_am_blattrand 2>&1 | tail -30`
Erwartet: beide `ok`.

Falls `falzmarken_stehen_an_den_richtigen_hoehen_unabhaengig_vom_rand`
fehlschlägt, weil die gemessenen Höhen von den erwarteten abweichen (z. B.
weil die Annahme über `background`s Koordinatensystem doch nicht exakt
stimmt) oder weil der x≈0-Filter nichts oder zu viel findet (z. B. weil
andere Vorlagen-Inhalte zufällig auch bei x≈0 zeichnen): Nicht raten,
sondern die tatsächlichen `linienpositionen`-Werte ausgeben
(`eprintln!("{:?}", linienpositionen(&bytes));` temporär einfügen, `cargo
test -- --nocapture` laufen lassen) und Filter/Toleranz/Platzierung anhand
der echten Werte korrigieren. Genau dieses Vorgehen hat in einer früheren
Aufgabe dieser Session einen falsch angenommenen Schwellenwert aufgedeckt
und korrigiert — kein Grund zur Sorge, wenn die erste Annahme nicht exakt
stimmt, nur nicht stillschweigend den Test ans falsche Ergebnis anpassen.

- [ ] **Step 5: Gesamtes `pdf`-Testmodul laufen lassen (keine Regression)**

Run: `cd src-tauri && cargo test --lib dokument::pdf:: 2>&1 | tail -60`
Erwartet: alle Tests grün.

- [ ] **Step 6: Committen**

```bash
git add src-tauri/templates/rechnung.typ src-tauri/src/dokument/pdf.rs
git commit -m "$(cat <<'EOF'
feat: Falz- und Lochmarken in der PDF-Vorlage rendern

Zwei Falzmarken (105/210 mm) und eine Lochmarke (148,5 mm) nach DIN
5008 Form B, über Typsts background-Mechanismus — der positioniert
absolut vom Blattursprung aus, unabhängig vom eingestellten Rand, und
läuft wie der Footer auf jeder Seite. Neuer Test-Helfer
linienpositionen liest die tatsächlich gezeichneten Linien aus dem
PDF-Content-Stream (m/l-Operatoren), analog zu textpositionen/
bildpositionen für Text und Bilder.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

## Context für Task 2

Task 1 (Backend-Feld `falzmarken`, Vorgabe an) ist bereits committet.
Dieser Task verdrahtet es in die Typst-Vorlage und sichert es geometrisch
ab. Task 3 (Frontend-Schalter) ist separat und später — `Belegvorlage.tsx`
nicht anfassen.

`EINHEIT`, `Matrix`, `mal`, `test_kontext()` und `rendern()` sind bereits
vorhandene Hilfsmittel im selben `mod tests`-Block — keine neuen Importe
nötig.

Arbeite vom Repository-Wurzelverzeichnis; direkt auf `main`, wie in Task 1.

## Vor Beginn

Der Spike-Test, der `background`s Koordinatensystem verifiziert hat, ist
nicht Teil dieses Plans und nicht committet — die Erkenntnis daraus (kein
Korrekturterm nötig, absolute Positionierung vom Blattursprung) ist aber
oben in Step 3 bereits eingearbeitet. Trotzdem: Wenn Step 4 zeigt, dass die
Annahme nicht stimmt, ist das kein Zeichen, dass du etwas falsch gemacht
hast — folge dem Hinweis in Step 4 und miss nach, statt zu raten.

## Report Format

- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- Was umgesetzt wurde, inklusive ob die `background`-Koordinaten-Annahme aus dem Plan gestimmt hat oder korrigiert werden musste
- Testergebnisse (RED-Bestätigung, dann GREEN für beide neuen Tests, dann das gesamte `pdf::`-Modul)
- Die Commit-SHA
- Bedenken, falls vorhanden

---

### Task 3: Frontend — Schalter in der Belegvorlage-Einstellung

**Files:**
- Modify: `src/components/Belegvorlage.tsx` (`SCHALTER`-Array)
- Test: `src/components/Belegvorlage.test.tsx`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

Füge in `src/components/Belegvorlage.test.tsx` nach dem Test „startet mit
aktivem Girocode, wie die Rust-Vorgabe" ein:

```tsx
  it("startet mit aktiven Falzmarken, wie die Rust-Vorgabe", async () => {
    render(<Belegvorlage />);
    await waitFor(() => expect(screen.getByLabelText(/Falz- und Lochmarken/)).toBeTruthy());
    expect(screen.getByLabelText(/Falz- und Lochmarken/)).toBeChecked();
  });
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run src/components/Belegvorlage.test.tsx -t "aktiven Falzmarken" 2>&1 | tail -30`
Erwartet: FAIL — `getByLabelText(/Falz- und Lochmarken/)` findet nichts,
das Feld existiert noch nicht im Formular.

- [ ] **Step 3: Schalter ergänzen**

In `src/components/Belegvorlage.tsx` im `SCHALTER`-Array, direkt nach dem
Eintrag `{ schluessel: "vorlage.rand_seitlich_mm", ... }` (letzter Eintrag
vor der schließenden `];`) einfügen:

```ts
  {
    schluessel: "vorlage.falzmarken",
    label: "Falz- und Lochmarken",
    hinweis:
      "Kurze Markierungen am linken Rand für das Falten in einen Fensterumschlag " +
      "und das Lochen für den Ordner (DIN 5008). Erscheinen auf jeder Seite.",
    art: "ja_nein",
  },
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `npx vitest run src/components/Belegvorlage.test.tsx 2>&1 | tail -40`
Erwartet: alle Tests grün, inklusive des neuen.

- [ ] **Step 5: TypeScript-Build zur Sicherheit**

Run: `npm run build 2>&1 | tail -30`
Erwartet: kein Fehler.

- [ ] **Step 6: Committen**

```bash
git add src/components/Belegvorlage.tsx src/components/Belegvorlage.test.tsx
git commit -m "$(cat <<'EOF'
feat: Schalter für Falz- und Lochmarken in den Einstellungen

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

## Context für Task 3

Tasks 1 und 2 sind bereits committet: Das Backend-Feld `falzmarken`
existiert, `rechnung.typ` rendert die drei Marken bei aktivierter
Einstellung, beides geometrisch am echten PDF verifiziert. Dieser Task ist
reine Frontend-Verdrahtung nach dem exakt gleichen, bereits etablierten
Muster wie `vorlage.zeigt_girocode` — kein neues Konzept.

Optionen werden im bestehenden Formular generisch aus dem `SCHALTER`-Array
gerendert (`s.art === "ja_nein"`-Zweig) — keine weitere Verdrahtung nötig.

Arbeite vom Repository-Wurzelverzeichnis; direkt auf `main`, wie in den
vorigen Tasks.

Hinweis: Dieses Repo hatte in früheren Sessions `vitest`/`node_modules`-
Kaltstart-Timeouts auf iCloud Drive (`Timeout waiting for worker to
respond`) — falls das auftritt, einmal
`find node_modules -type f -print0 | xargs -0 -P 32 -n 1 cat > /dev/null`
laufen lassen, bevor erneut versucht wird.

## Vor Beginn

Bei Unklarheiten nachfragen, bevor mit der Umsetzung begonnen wird.

## Report Format

- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- Was umgesetzt wurde
- Testergebnisse (RED-Bestätigung, dann GREEN für die gesamte Testdatei, dann Build-Ergebnis)
- Die Commit-SHA
- Bedenken, falls vorhanden

---

## Nicht Teil dieses Plans

Kein CHANGELOG-Eintrag, kein Versionsbump, keine TODO.md-Archivierung —
das bleibt wie bei den vorigen Features ein bewusster, separater Schritt.
