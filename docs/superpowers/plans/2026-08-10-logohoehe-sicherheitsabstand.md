# Logohöhe: automatische Obergrenze zum Anschriftfenster — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Logohöhe kann bei „Oben links"/„Oben rechts" das Logo bis ins DIN-5008-Anschriftfenster hängen lassen (0 mm Puffer bei den bisherigen Vorgaben). Die Vorgabe sinkt auf 15 mm, und die zulässige Obergrenze koppelt sich dynamisch an den oberen Rand, mit 5 mm Sicherheitspuffer.

**Architektur:** Eine reine Formel (`logo_hoehe_max_mm`) in Rust, identisch nachgebaut in TypeScript für die Live-Vorschau der Einstellungsseite. Backend ist die alleinige Autorität (derselbe `aus_paaren`-Pfad für Vorschau und echten Export); Frontend gibt nur sofortiges Feedback über native `max`-Validierung und einen dynamischen Hinweistext.

**Tech Stack:** Rust (`vorlage.rs`), Typst-Geometrietests (`pdf.rs`), React/TypeScript (`Belegvorlage.tsx`), `cargo test`, `vitest`.

**Spec:** `docs/superpowers/specs/2026-08-10-logohoehe-sicherheitsabstand-design.md`

---

### Task 1: Backend — dynamische Obergrenze für die Logohöhe

**Files:**
- Modify: `src-tauri/src/dokument/vorlage.rs:23-53` (neue Konstanten + Funktion, vor `LogoPosition`)
- Modify: `src-tauri/src/dokument/vorlage.rs:128-146` (`Default for Vorlage`)
- Modify: `src-tauri/src/dokument/vorlage.rs:197-246` (`aus_paaren`)
- Test: `src-tauri/src/dokument/vorlage.rs` (`mod tests`)

- [ ] **Step 1: Fehlschlagende Tests schreiben**

Füge in `src-tauri/src/dokument/vorlage.rs` im `mod tests`-Block direkt nach
`logo_position_rechts_oben_wird_gelesen` (endet mit der schließenden `}`
vor `unbrauchbare_masse_fallen_auf_die_vorgabe_zurueck`, um Zeile 320) ein:

```rust
/// Bei den bisherigen Rand-Extremen darf die sichere Logohöhe nie unter die
/// technische Mindesthöhe (5 mm) fallen — sonst wäre `min > max` in `mm()`
/// und die Clamp-Funktion würde bei jedem Aufruf mit diesem Rand abstürzen.
#[test]
fn logo_hoehe_max_mm_hat_sicherheitsabstand_zum_anschriftfenster() {
    assert_eq!(logo_hoehe_max_mm(20.0), 20.0);
    assert_eq!(logo_hoehe_max_mm(25.0), 15.0);
    // Boden greift: 45 - 40 - 5 = 0, aber die Mindesthöhe ist 5.
    assert_eq!(logo_hoehe_max_mm(40.0), 5.0);
}

/// Ein bei kleinem Rand noch gültiger Logohöhen-Wert wird ungültig, sobald
/// der Rand nachträglich vergrößert wird — die Begrenzung muss dynamisch
/// mitziehen, nicht nur beim ursprünglichen Speichern gelten.
#[test]
fn logo_hoehe_wird_dynamisch_auf_sicheren_bereich_begrenzt() {
    let v = Vorlage::aus_paaren(&[
        ("vorlage.rand_oben_mm".into(), "35".into()),
        ("vorlage.logo_hoehe_mm".into(), "30".into()),
    ]);
    assert_eq!(v.rand_oben_mm, 35.0);
    // Bei 35 mm Rand sind nur noch 5 mm sicher (45 - 35 - 5 = 5).
    assert_eq!(v.logo_hoehe_mm, 5.0);
}
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `cd src-tauri && cargo test --lib dokument::vorlage::tests::logo_hoehe_max_mm_hat_sicherheitsabstand_zum_anschriftfenster dokument::vorlage::tests::logo_hoehe_wird_dynamisch_auf_sicheren_bereich_begrenzt 2>&1 | tail -30`
Erwartet: Kompilierfehler — `cannot find function 'logo_hoehe_max_mm' in this scope`.

- [ ] **Step 3: Konstanten und Funktion ergänzen**

In `src-tauri/src/dokument/vorlage.rs` direkt vor `/// Wo das Logo steht.`
(Zeile 23) einfügen:

```rust
/// Wo laut DIN 5008 Form A das Anschriftfenster beginnt — muss mit dem
/// Literal `45mm` in `templates/rechnung.typ` übereinstimmen.
const ANSCHRIFTFENSTER_START_MM: f64 = 45.0;
/// Mindestabstand zwischen Logo-Unterkante und Anschriftfenster bei „Oben
/// links"/„Oben rechts" (gestapelt) — dort steht das Logo im Textfluss
/// direkt über der Firmenanschrift, während das Fenster fest positioniert
/// ist und nicht mitwandert.
const LOGO_SICHERHEITSPUFFER_MM: f64 = 5.0;

/// Größte Logohöhe, die beim gegebenen oberen Rand noch Sicherheitsabstand
/// zum Anschriftfenster lässt.
///
/// `.max(5.0)`: Bei sehr großem oberen Rand (nahe 40 mm) läge das
/// rechnerische Maximum unter der technischen Mindesthöhe von 5 mm — ein
/// ungültiger Bereich für `mm()` (`min > max`), der dort abstürzen würde.
/// Der Boden verhindert das; in diesem Extremfall bleibt kein Puffer mehr,
/// aber die App bleibt funktionsfähig statt abzustürzen.
fn logo_hoehe_max_mm(rand_oben_mm: f64) -> f64 {
    (ANSCHRIFTFENSTER_START_MM - rand_oben_mm - LOGO_SICHERHEITSPUFFER_MM).max(5.0)
}

```

Diese Konstanten/Funktion gelten unabhängig von der gewählten
`LogoPosition` — sie werden in `aus_paaren` unten so verwendet, dass sie
nur bei „Oben links"/„Oben rechts" tatsächlich relevant sind (siehe
Spec-Begründung: bei „Oben rechts, neben der Anschrift" liegt das Logo
horizontal außerhalb des Fensters). Eine positionsabhängige Fallunterscheidung
ist hier bewusst NICHT eingebaut — das würde die Berechnung nur verkomplizieren,
ohne einen echten Vorteil zu bringen, da die Begrenzung dort schlicht nie zu eng wird.

- [ ] **Step 4: Vorgabewert senken**

In `src-tauri/src/dokument/vorlage.rs:131` ersetze:

```rust
            logo_hoehe_mm: 20.0,
```

durch:

```rust
            logo_hoehe_mm: 15.0,
```

- [ ] **Step 5: `aus_paaren` umbauen — `rand_oben_mm` zuerst berechnen**

In `src-tauri/src/dokument/vorlage.rs` ersetze den Anfang von `aus_paaren`
(ab `let standard = Self::default();`, Zeile 204, bis zum Ende des
Struct-Literals, Zeile 245) durch folgende Fassung — der einzige
inhaltliche Unterschied zum bisherigen Code ist die neue lokale
`rand_oben_mm`-Variable vor dem Literal und ihre Verwendung als
`max`-Grenze für `logo_hoehe_mm`; alle anderen Felder bleiben unverändert:

```rust
        let standard = Self::default();
        // Muss vor `logo_hoehe_mm` berechnet werden: dessen Obergrenze
        // hängt vom oberen Rand ab (siehe logo_hoehe_max_mm).
        let rand_oben_mm = mm(hole("vorlage.rand_oben_mm"), standard.rand_oben_mm, 20.0, 40.0);
        Self {
            logo_position: hole("vorlage.logo_position")
                .map(|w| LogoPosition::aus(&w))
                .unwrap_or(standard.logo_position),
            logo_hoehe_mm: mm(
                hole("vorlage.logo_hoehe_mm"),
                standard.logo_hoehe_mm,
                5.0,
                logo_hoehe_max_mm(rand_oben_mm),
            ),
            absenderzeile: ja(hole("vorlage.absenderzeile"), standard.absenderzeile),
            akzentfarbe: farbe(hole("vorlage.akzentfarbe"), &standard.akzentfarbe),
            akzent_verwendung: hole("vorlage.akzent_verwendung")
                .map(|w| AkzentVerwendung::aus(&w))
                .unwrap_or(standard.akzent_verwendung),
            spalte_nummer: ja(hole("vorlage.spalte_nummer"), standard.spalte_nummer),
            einheit_eigene_spalte: ja(
                hole("vorlage.einheit_eigene_spalte"),
                standard.einheit_eigene_spalte,
            ),
            spalte_einzelpreis: ja(hole("vorlage.spalte_einzelpreis"), standard.spalte_einzelpreis),
            tabelle_gitterlinien: ja(
                hole("vorlage.tabelle_gitterlinien"),
                standard.tabelle_gitterlinien,
            ),
            zeigt_girocode: ja(hole("vorlage.zeigt_girocode"), standard.zeigt_girocode),
            girocode_groesse_mm: mm(
                hole("vorlage.girocode_groesse_mm"),
                standard.girocode_groesse_mm,
                20.0,
                32.0,
            ),
            // Der obere Rand geht nicht unter 20 mm: Darunter überschnitte der
            // Briefkopf das Anschriftfeld, das bei 45 mm beginnt.
            rand_oben_mm,
            rand_unten_mm: mm(hole("vorlage.rand_unten_mm"), standard.rand_unten_mm, 25.0, 40.0),
            // Seitlich höchstens 30 mm: Das Anschriftfeld beginnt nach DIN bei
            // 20 mm und ist 85 mm breit; ein breiterer Rand schöbe den Textblock
            // daneben weiter nach innen als das Fenster.
            rand_seitlich_mm: mm(
                hole("vorlage.rand_seitlich_mm"),
                standard.rand_seitlich_mm,
                15.0,
                30.0,
            ),
        }
```

- [ ] **Step 6: Tests laufen lassen, Erfolg bestätigen**

Run: `cd src-tauri && cargo test --lib dokument::vorlage:: 2>&1 | tail -40`
Erwartet: alle Tests grün, inklusive der beiden neuen. Falls
`ohne_gespeicherte_einstellungen_gilt_das_bisherige_aussehen` (vergleicht
`Vorlage::laden` gegen `Vorlage::default()`) fehlschlägt, liegt das an
einem Tippfehler in Step 4/5 — beide Seiten müssen denselben neuen
Vorgabewert 15.0 liefern.

- [ ] **Step 7: Committen**

```bash
git add src-tauri/src/dokument/vorlage.rs
git commit -m "$(cat <<'EOF'
fix: Logohöhe automatisch auf sicheren Abstand zum Anschriftfenster begrenzen

Bei den bisherigen Vorgaben (25 mm Rand, 20 mm Logo) endete das Logo bei
„Oben links"/„Oben rechts" exakt dort, wo das DIN-5008-Anschriftfenster
beginnt — 0 mm Puffer, sichtbar als Logo, das auf der Absenderzeile
"hängt". Vorgabe sinkt auf 15 mm; die Obergrenze koppelt sich jetzt
dynamisch an den oberen Rand (5 mm Sicherheitspuffer), unabhängig davon,
ob der Wert explizit gesetzt ist oder auf die Vorgabe zurückfällt.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Bestehende Geometrie-Tests von der Logohöhe-Vorgabe entkoppeln

**Kontext für den Implementierer:** Zwei Tests aus der vorigen Session
verwenden `..Default::default()` und erben damit implizit die
App-Vorgabe für `logo_hoehe_mm`. Das quadratische Test-Logo
(`logo_1x1.png`, Seitenverhältnis 1:1) übernimmt Breite *und* Höhe von
diesem Wert. Sinkt die Vorgabe (Task 1) von 20 auf 15 mm, wird das
Test-Logo 5 mm schmäler und rutscht dadurch 5 mm weiter nach rechts —
einer der beiden Tests verliert dadurch stillschweigend seine
Trennschärfe (er bliebe grün, unabhängig davon, ob der Gutter-Fix aus der
vorigen Session noch vorhanden ist). Fix: beide Tests setzen ihre
Logohöhe künftig explizit statt implizit über die Vorgabe zu beziehen —
sauberer unabhängig vom aktuellen Anlass, macht beide Tests robust gegen
jede künftige Änderung von `Vorlage::default()`.

**Files:**
- Modify: `src-tauri/src/dokument/pdf.rs:565` (`logo_steht_rechts_bei_rechts_oben_und_links_bei_links`)
- Modify: `src-tauri/src/dokument/pdf.rs:597-600` (`abstand_zwischen_anschrift_und_logo_bei_rechts_neben_der_anschrift`)

- [ ] **Step 1: Beide Tests vor der Backend-Änderung laufen lassen (Referenzwerte einholen)**

Run: `cd src-tauri && cargo test --lib dokument::pdf::tests::logo_steht_rechts_bei_rechts_oben_und_links_bei_links dokument::pdf::tests::abstand_zwischen_anschrift_und_logo_bei_rechts_neben_der_anschrift 2>&1 | tail -20`
Erwartet: beide `ok` — dieser Task läuft NACH Task 1 (der Vorgabewert ist
bereits auf 15 mm gesenkt); dieser Schritt bestätigt nur, dass beide Tests
mit dem *neuen* Vorgabewert noch grün sind, bevor die Härtung beginnt (sie
müssen es sein — die Kernaussage beider Tests hängt nicht am genauen
Zahlenwert der Logohöhe, siehe Spec).

- [ ] **Step 2: `logo_steht_rechts_bei_rechts_oben_und_links_bei_links` — explizite Höhe**

In `src-tauri/src/dokument/pdf.rs` ersetze:

```rust
            let vorlage = crate::dokument::vorlage::Vorlage { logo_position: position, ..Default::default() };
```

durch:

```rust
            // Feste Logohöhe statt `..Default::default()`: Das quadratische
            // Testbild übernimmt Breite und Höhe von diesem Wert, und dieser
            // Test misst die horizontale Logo-Position — der Wert muss also
            // unabhängig von künftigen Änderungen an Vorlage::default() sein.
            let vorlage = crate::dokument::vorlage::Vorlage {
                logo_position: position,
                logo_hoehe_mm: 20.0,
                ..Default::default()
            };
```

- [ ] **Step 3: `abstand_zwischen_anschrift_und_logo_bei_rechts_neben_der_anschrift` — explizite Höhe**

In `src-tauri/src/dokument/pdf.rs` ersetze:

```rust
        let vorlage = crate::dokument::vorlage::Vorlage {
            logo_position: crate::dokument::vorlage::LogoPosition::Rechts,
            ..Default::default()
        };
```

durch:

```rust
        // Feste Logohöhe statt `..Default::default()` — aus demselben Grund
        // wie in logo_steht_rechts_bei_rechts_oben_und_links_bei_links: der
        // gemessene Abstand hängt an der Logobreite, die am quadratischen
        // Testbild direkt von diesem Wert abhängt. 20.0 ist exakt der Wert,
        // gegen den der Schwellenwert (12.0mm) unten ursprünglich hergeleitet
        // und per Rot-Probe verifiziert wurde — unverändert übernommen.
        let vorlage = crate::dokument::vorlage::Vorlage {
            logo_position: crate::dokument::vorlage::LogoPosition::Rechts,
            logo_hoehe_mm: 20.0,
            ..Default::default()
        };
```

- [ ] **Step 4: Beide Tests erneut laufen lassen — Werte müssen exakt gleich bleiben**

Run: `cd src-tauri && cargo test --lib dokument::pdf::tests::logo_steht_rechts_bei_rechts_oben_und_links_bei_links dokument::pdf::tests::abstand_zwischen_anschrift_und_logo_bei_rechts_neben_der_anschrift 2>&1 | tail -20`
Erwartet: beide weiterhin `ok` — die gemessenen Werte sind jetzt exakt
identisch zu denen aus der vorigen Session (20.0 mm war der Wert, mit dem
beide Tests ursprünglich geschrieben und verifiziert wurden), unabhängig
vom aktuellen `Vorlage::default()`.

- [ ] **Step 5: Gesamtes `pdf`-Testmodul laufen lassen (keine Regression)**

Run: `cd src-tauri && cargo test --lib dokument::pdf:: 2>&1 | tail -60`
Erwartet: alle Tests grün.

- [ ] **Step 6: Committen**

```bash
git add src-tauri/src/dokument/pdf.rs
git commit -m "$(cat <<'EOF'
test: Logo-Geometrietests von Vorlage::default() entkoppeln

Beide Tests setzen die Logohöhe jetzt explizit statt implizit über die
App-Vorgabe zu beziehen. Ohne das hätte die gesunkene Vorgabe (Task
dieser Session) das quadratische Testbild verschmälert und dabei einem
der beiden Tests unbemerkt seine Trennschärfe genommen — kein
Fehlschlag, aber ein stiller Verlust an Testqualität. Macht beide Tests
zusätzlich robust gegen jede künftige Änderung an Vorlage::default().

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Frontend — dynamische Obergrenze in der Belegvorlage-Einstellung

**Files:**
- Modify: `src/components/Belegvorlage.tsx:208-` (Komponentenkörper, neue abgeleitete Werte)
- Modify: `src/components/Belegvorlage.tsx:326-362` (Render-Schleife, nur `zahl`-Zweig)
- Test: `src/components/Belegvorlage.test.tsx`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

Füge in `src/components/Belegvorlage.test.tsx` nach dem Test „bietet die
vierte Logo-Option „Oben rechts" an" (aus der vorigen Session) ein:

```tsx
  it('begrenzt die Logohöhe abhängig vom oberen Rand', async () => {
    vi.mocked(api.einstellungen.list).mockResolvedValue([
      ["vorlage.rand_oben_mm", "35"],
    ]);
    render(<Belegvorlage />);

    // Bei 35 mm Rand sind nur noch 5 mm sicher (45 - 35 - 5 = 5).
    await waitFor(() => expect(screen.getByLabelText("Logohöhe")).toHaveAttribute("max", "5"));
    expect(screen.getByText(/Vorgabe 5 mm, möglich 5–5 mm\./)).toBeTruthy();
  });
```

Hinweis für die Implementierung: `screen.getByLabelText("Logohöhe")` und
der genaue Wortlaut des Hinweistexts (`Vorgabe {…} mm, möglich {…}–{…}
mm.`) folgen exakt dem bestehenden Muster in `Belegvorlage.tsx:357-361` —
bei Abweichungen im tatsächlichen Rendering (z. B. zusätzlicher Text
danach) die Regex im Test entsprechend anpassen, nicht den
Produktionscode verbiegen, um den Test zu erfüllen.

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run src/components/Belegvorlage.test.tsx -t "begrenzt die Logohöhe" 2>&1 | tail -30`
Erwartet: FAIL — das `max`-Attribut zeigt noch die statische `50` aus dem
`SCHALTER`-Array, nicht die dynamisch berechnete `5`.

- [ ] **Step 3: Abgeleitete Werte im Komponentenkörper ergänzen**

In `src/components/Belegvorlage.tsx` direkt nach der Zeile
`const [werte, setWerte] = useState<Record<string, string>>({});`
(Zeile 209) einfügen:

```tsx

  // Größte Logohöhe, die beim aktuellen oberen Rand noch Sicherheitsabstand
  // zum DIN-5008-Anschriftfenster lässt (das bei „Oben links"/„Oben rechts"
  // im Textfluss direkt über der Firmenanschrift steht) — muss mit
  // logo_hoehe_max_mm in dokument/vorlage.rs übereinstimmen. Rein
  // clientseitiges Feedback; die Begrenzung selbst erzwingt das Backend.
  const randObenMm = Number(werte["vorlage.rand_oben_mm"] ?? "25") || 25;
  const logoHoeheMaxMm = Math.max(45 - randObenMm - 5, 5);
  const logoHoeheStandardMm = Math.min(15, logoHoeheMaxMm);
```

- [ ] **Step 4: Render-Schleife — dynamische Werte nur für `vorlage.logo_hoehe_mm`**

Die `.map((s) => ...)`-Callback ist aktuell eine Arrow-Function mit
implizitem Return (ein einzelner Ternary-Ausdruck als Body) — darin lassen
sich keine `const`-Deklarationen einfügen, ohne den Body zuerst auf einen
Block mit explizitem `return` umzustellen. Ersetze deshalb den gesamten
Block von `{SCHALTER.map((s) =>` (Zeile 297) bis `)}` (Zeile 366) durch:

```tsx
          {SCHALTER.map((s) => {
            const istLogoHoehe = s.schluessel === "vorlage.logo_hoehe_mm";
            const effektiverMax = istLogoHoehe ? logoHoeheMaxMm : s.max;
            const effektiverStandard = istLogoHoehe ? String(logoHoeheStandardMm) : s.standard;

            return s.art === "ja_nein" ? (
              <div key={s.schluessel}>
                <label className="feld-checkbox">
                  <input
                    type="checkbox"
                    checked={istJa(s.schluessel)}
                    onChange={(e) => aendere(s.schluessel, e.currentTarget.checked ? "ja" : "nein")}
                  />
                  {s.label}
                </label>
                {s.hinweis && <p className="feld-hinweis">{s.hinweis}</p>}
              </div>
            ) : (
              <div key={s.schluessel}>
                <label className="feld">
                  {s.label}
                  {s.art === "auswahl" && (
                    <select
                      value={werte[s.schluessel] ?? s.optionen![0][0]}
                      onChange={(e) => aendere(s.schluessel, e.currentTarget.value)}
                    >
                      {s.optionen!.map(([wert, text]) => (
                        <option key={wert} value={wert}>
                          {text}
                        </option>
                      ))}
                    </select>
                  )}
                  {s.art === "zahl" && (
                    /* Der Platzhalter zeigt die Vorgabe, nicht den erlaubten
                       Bereich: Ein leeres Feld heißt „Vorgabe", und genau die
                       stand vorher nirgends. Der Bereich steht im Hinweis. */
                    <input
                      type="number"
                      min={s.min}
                      max={effektiverMax}
                      value={werte[s.schluessel] ?? ""}
                      placeholder={effektiverStandard}
                      onChange={(e) => aendere(s.schluessel, e.currentTarget.value)}
                    />
                  )}
                  {s.art === "farbe" && (
                    <input
                      type="color"
                      value={werte[s.schluessel] || s.standard}
                      onChange={(e) => aendere(s.schluessel, e.currentTarget.value)}
                    />
                  )}
                </label>
                {s.art === "farbe" && (
                  <FarbHilfe
                    wert={werte[s.schluessel] || s.standard!}
                    standard={s.standard!}
                    faerbtText={
                      (werte["vorlage.akzent_verwendung"] ?? "beides") !== "linien"
                    }
                    onWaehlen={(farbe) => aendere(s.schluessel, farbe)}
                  />
                )}
                {s.art === "zahl" && (
                  <p className="feld-hinweis">
                    Vorgabe {effektiverStandard} {s.einheit}, möglich {s.min}–{effektiverMax} {s.einheit}.
                    {s.hinweis ? ` ${s.hinweis}` : ""}
                  </p>
                )}
                {s.hinweis && s.art !== "zahl" && <p className="feld-hinweis">{s.hinweis}</p>}
              </div>
            );
          })}
```

Einzige inhaltliche Änderungen gegenüber dem bisherigen Code: die drei
neuen `const`-Zeilen am Anfang, `return` statt implizitem Ternary-Body,
`s.max`→`effektiverMax` und `s.standard`→`effektiverStandard` ausschließlich
im `zahl`-Zweig (Input und Hinweistext). Alle anderen Schalter-Typen
(`auswahl`, `farbe`, `ja_nein`) sind byte-identisch zum bisherigen Code.

- [ ] **Step 5: Test laufen lassen, Erfolg bestätigen**

Run: `npx vitest run src/components/Belegvorlage.test.tsx 2>&1 | tail -40`
Erwartet: alle Tests in `Belegvorlage.test.tsx` grün, inklusive des neuen.

- [ ] **Step 6: TypeScript-Build zur Sicherheit**

Run: `npm run build 2>&1 | tail -30`
Erwartet: kein Fehler.

- [ ] **Step 7: Committen**

```bash
git add src/components/Belegvorlage.tsx src/components/Belegvorlage.test.tsx
git commit -m "$(cat <<'EOF'
feat: Logohöhe-Feld zeigt dynamische Obergrenze abhängig vom oberen Rand

Rein clientseitiges Feedback (natives max-Attribut, aktualisierter
Hinweistext) — die eigentliche Begrenzung erzwingt weiterhin das
Backend (logo_hoehe_max_mm in vorlage.rs).

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Nicht Teil dieses Plans

Kein CHANGELOG-Eintrag, kein Versionsbump, keine TODO.md-Archivierung —
das bleibt wie beim letzten Mal ein bewusster, separater Schritt, wenn der
Nutzer zu einem Release bereit ist.
