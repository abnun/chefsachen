# Vierte Logo-Position „Oben rechts" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vierte Logo-Position „Oben rechts" ergänzen (Logo rechts, Firmenanschrift unverändert rechtsbündig darunter — Spiegelbild von „Oben links"), einen fehlenden Abstand bei der bestehenden „Oben rechts, neben der Anschrift"-Option beheben, und beides als Version 1.3.1 vormerken.

**Architektur:** Neue `LogoPosition::RechtsOben`-Variante im Rust-Backend (`vorlage.rs`), ein neuer Zweig in der Typst-Vorlage (`rechnung.typ`), ein neuer Dropdown-Eintrag im Frontend (`Belegvorlage.tsx`). Geometrische PDF-Regressionstests messen die tatsächliche Logo- und Textposition im erzeugten PDF (nicht nur, dass kein Fehler auftritt) — dafür wird ein neuer Test-Helfer `bildpositionen` ergänzt, der Bild-XObject-Positionen aus dem PDF-Content-Stream liest, analog zum bestehenden `textpositionen`.

**Tech Stack:** Rust (Tauri-Backend), Typst (PDF-Vorlage), React/TypeScript (Frontend), `cargo test`, `vitest`.

**Spec:** `docs/superpowers/specs/2026-08-09-logo-position-rechts-oben-design.md`

---

### Task 1: Bereits behobenen Logo-Bug committen

Während der Recherche zu diesem Feature wurde ein separater, bereits im
Arbeitsverzeichnis behobener Bug gefunden: „Logo entfernen" speicherte ein
leeres statt eines `NULL`-Blobs, wodurch **jeder** Beleg-Export (nicht nur
die Vorschau) mit „failed to decode image (unexpected end of file)"
abstürzte, sobald einmal ein Logo entfernt wurde. Der Fix (`logo_get`
filtert leere Blobs zu `None`) und ein Regressionstest sind bereits in
`src-tauri/src/commands/firma.rs` geschrieben und mit `cargo test --lib
firma::` grün getestet — nur noch nicht committet.

**Files:**
- Modify: `src-tauri/src/commands/firma.rs` (bereits geändert, siehe `git diff`)

- [ ] **Step 1: Diff ansehen und bestätigen, dass nur der erwartete Fix drin steht**

Run: `git diff src-tauri/src/commands/firma.rs`

Erwartet: Änderung an `logo_get` (Filter auf leere Blobs) plus neuer Test
`leeres_logo_gilt_als_kein_logo`.

- [ ] **Step 2: Tests laufen lassen**

Run: `cd src-tauri && cargo test --lib firma:: 2>&1 | tail -20`
Erwartet: `test result: ok. 15 passed; 0 failed`

- [ ] **Step 3: Committen**

```bash
git add src-tauri/src/commands/firma.rs
git commit -m "$(cat <<'EOF'
fix: leeres Logo-Blob nach „Logo entfernen" als kein Logo behandeln

„Logo entfernen" speicherte ein leeres statt eines NULL-Blobs. logo_get
gab das als Some(vec![]) zurück, was Vorschau und echter Beleg-Export
(PDF/XRechnung/ZUGFeRD) als „Logo vorhanden" interpretierten — Typst
scheiterte beim Dekodieren des 0-Byte-Bildes mit „unexpected end of
file" bei jedem künftigen Export.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `LogoPosition::RechtsOben` im Backend

**Files:**
- Modify: `src-tauri/src/dokument/vorlage.rs:23-47` (Enum)
- Test: `src-tauri/src/dokument/vorlage.rs` (`mod tests`, ab Zeile 267)

- [ ] **Step 1: Fehlschlagenden Test schreiben**

Füge im `mod tests`-Block von `src-tauri/src/dokument/vorlage.rs` (z. B.
direkt nach `akzent_verwendung_geht_als_eingabe_an_die_vorlage`, um Zeile
305) diesen Test ein:

```rust
/// Vierte Logo-Option: Logo rechts, Firmenanschrift unverändert rechtsbündig
/// darunter — Spiegelbild von „links". `LogoPosition::RechtsOben` existiert
/// noch nicht, dieser Test schlägt daher zunächst nicht am Assert, sondern
/// schon beim Kompilieren fehl.
#[test]
fn logo_position_rechts_oben_wird_gelesen() {
    let v = Vorlage::aus_paaren(&[("vorlage.logo_position".into(), "rechts_oben".into())]);
    assert_eq!(v.logo_position, LogoPosition::RechtsOben);
    assert_eq!(v.logo_position.als_str(), "rechts_oben");
}
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd src-tauri && cargo test --lib dokument::vorlage::tests::logo_position_rechts_oben_wird_gelesen 2>&1 | tail -20`
Erwartet: Kompilierfehler — `no variant or associated item named 'RechtsOben' found for enum 'LogoPosition'`

- [ ] **Step 3: `LogoPosition` um die neue Variante erweitern**

In `src-tauri/src/dokument/vorlage.rs:23-47` ersetze den bestehenden Block:

```rust
/// Wo das Logo steht.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogoPosition {
    Links,
    Rechts,
    Keins,
}

impl LogoPosition {
    fn aus(wert: &str) -> Self {
        match wert {
            "rechts" => Self::Rechts,
            "keins" => Self::Keins,
            _ => Self::Links,
        }
    }

    fn als_str(self) -> &'static str {
        match self {
            Self::Links => "links",
            Self::Rechts => "rechts",
            Self::Keins => "keins",
        }
    }
}
```

durch:

```rust
/// Wo das Logo steht.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogoPosition {
    Links,
    Rechts,
    /// Logo rechts, Firmenanschrift unverändert rechtsbündig darunter —
    /// Spiegelbild von `Links`. Anders als `Rechts` stehen Logo und
    /// Anschrift nicht nebeneinander, sondern übereinander.
    RechtsOben,
    Keins,
}

impl LogoPosition {
    fn aus(wert: &str) -> Self {
        match wert {
            "rechts" => Self::Rechts,
            "rechts_oben" => Self::RechtsOben,
            "keins" => Self::Keins,
            _ => Self::Links,
        }
    }

    fn als_str(self) -> &'static str {
        match self {
            Self::Links => "links",
            Self::Rechts => "rechts",
            Self::RechtsOben => "rechts_oben",
            Self::Keins => "keins",
        }
    }
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `cd src-tauri && cargo test --lib dokument::vorlage:: 2>&1 | tail -30`
Erwartet: alle Tests in `dokument::vorlage::tests` grün, inklusive
`logo_position_rechts_oben_wird_gelesen`.

- [ ] **Step 5: Committen**

```bash
git add src-tauri/src/dokument/vorlage.rs
git commit -m "$(cat <<'EOF'
feat: LogoPosition::RechtsOben im Backend ergänzen

Vierte Logo-Position: rechts, mit der Firmenanschrift unverändert
rechtsbündig darunter statt daneben. Vorgabe bleibt Links.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Logo rendert rechts bei „Oben rechts" (Template + geometrischer Test)

Baut einen neuen PDF-Test-Helfer `bildpositionen`, der (wie das bestehende
`textpositionen`) die Content-Stream-Operatoren der ersten Seite abläuft,
aber die Position des `Do`-Operators (zeichnet ein Bild-XObject) statt `Tm`
aufzeichnet. Damit lässt sich zum ersten Mal die tatsächliche Logo-Position
im PDF messen, nicht nur die der Firmenanschrift.

**Files:**
- Modify: `src-tauri/src/dokument/pdf.rs` (neuer Helfer + neuer Test im `mod tests`-Block, nach `textpositionen` bzw. vor `die_anschrift_liegt_im_sichtfenster_nach_din_5008`)
- Modify: `src-tauri/templates/rechnung.typ:162-173`

- [ ] **Step 1: `bildpositionen`-Helfer und fehlschlagenden Test schreiben**

Füge in `src-tauri/src/dokument/pdf.rs` direkt nach der bestehenden
`textpositionen`-Funktion (endet mit der schließenden `}` vor dem
DIN-5008-Kommentar, um Zeile 516) diesen Helfer ein:

```rust
/// Bildpositionen der ersten Seite in Punkten, gemessen wie `textpositionen`
/// von der linken unteren Ecke.
///
/// PDF zeichnet ein Bild-XObject in das Einheitsquadrat, transformiert durch
/// die beim `Do`-Aufruf aktuelle Matrix — `ctm[4]/ctm[5]` ist deshalb die
/// linke untere Ecke des gezeichneten Bildes, unabhängig von dessen
/// tatsächlicher Pixelgröße.
fn bildpositionen(bytes: &[u8]) -> Vec<(f32, f32)> {
    let doc = lopdf::Document::load_mem(bytes).unwrap();
    let (_, seite) = doc.get_pages().into_iter().next().unwrap();
    let inhalt = lopdf::content::Content::decode(&doc.get_page_content(seite).unwrap()).unwrap();

    let mut ctm = EINHEIT;
    let mut stapel: Vec<Matrix> = Vec::new();
    let mut positionen = Vec::new();

    for op in inhalt.operations {
        let werte = || -> Matrix {
            let mut m = EINHEIT;
            for (i, o) in op.operands.iter().take(6).enumerate() {
                m[i] = o.as_float().unwrap_or(0.0);
            }
            m
        };
        match op.operator.as_str() {
            "q" => stapel.push(ctm),
            "Q" => ctm = stapel.pop().unwrap_or(EINHEIT),
            "cm" if op.operands.len() == 6 => ctm = mal(werte(), ctm),
            "Do" => positionen.push((ctm[4], ctm[5])),
            _ => {}
        }
    }
    positionen
}
```

Füge direkt vor `die_anschrift_liegt_im_sichtfenster_nach_din_5008` (um
Zeile 524) diesen Test ein:

```rust
/// „Oben rechts" spiegelt „Oben links": Nur das Logo wandert an den rechten
/// Rand der Kopfzeile. Ohne `bildpositionen` ließe sich das nicht von einem
/// Bug unterscheiden, der „rechts_oben" stillschweigend wie „links"
/// behandelt — die Firmenanschrift ist in beiden Fällen rechtsbündig, das
/// allein beweist also nichts über die Logo-Position.
#[test]
fn logo_steht_rechts_bei_rechts_oben_und_links_bei_links() {
    const MM: f32 = 72.0 / 25.4;
    const SEITENBREITE: f32 = 210.0 * MM;
    const LOGO: &[u8] = include_bytes!("../../resources/test/logo_1x1.png");

    let logo_x = |position: crate::dokument::vorlage::LogoPosition| {
        let vorlage = crate::dokument::vorlage::Vorlage { logo_position: position, ..Default::default() };
        let bytes = rendern(&test_kontext(), Some(LOGO), &vorlage).unwrap();
        let bilder = bildpositionen(&bytes);
        assert_eq!(bilder.len(), 1, "erwartet genau ein Bild (das Logo) auf der Seite");
        bilder[0].0
    };

    let links = logo_x(crate::dokument::vorlage::LogoPosition::Links);
    let rechts_oben = logo_x(crate::dokument::vorlage::LogoPosition::RechtsOben);

    assert!(
        links < SEITENBREITE / 2.0,
        "Logo bei „Oben links" steht bei {:.1} mm — nicht in der linken Hälfte",
        links / MM,
    );
    assert!(
        rechts_oben > SEITENBREITE / 2.0,
        "Logo bei „Oben rechts" steht bei {:.1} mm — nicht in der rechten Hälfte",
        rechts_oben / MM,
    );
}
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd src-tauri && cargo test --lib dokument::pdf::tests::logo_steht_rechts_bei_rechts_oben_und_links_bei_links 2>&1 | tail -20`
Erwartet: FAIL bei `rechts_oben > SEITENBREITE / 2.0` — „rechts_oben" fällt
mangels eigenem Zweig noch in den „links"-Zweig der Vorlage.

- [ ] **Step 3: Neuen Zweig in der Typst-Vorlage ergänzen**

In `src-tauri/templates/rechnung.typ:162-173` ersetze:

```typst
#if logo == none [
  #firma_block
] else if sys.inputs.v_logo_position == "rechts" [
  // "Neben der Anschrift": Beides gehört auf dieselbe Seite der Kopfzeile,
  // nicht auf entgegengesetzte Ecken. Die erste Spalte bleibt 1fr breit (sie
  // schluckt den Freiraum), aber ihr Inhalt wird an ihren rechten Rand
  // gerückt — direkt neben die Logo-Spalte, statt an den linken Seitenrand.
  #grid(columns: (1fr, auto), align: (right + horizon, right + horizon), firma_block, logo)
] else [
  #logo
  #firma_block
]
```

durch:

```typst
#if logo == none [
  #firma_block
] else if sys.inputs.v_logo_position == "rechts" [
  // "Neben der Anschrift": Beides gehört auf dieselbe Seite der Kopfzeile,
  // nicht auf entgegengesetzte Ecken. Die erste Spalte bleibt 1fr breit (sie
  // schluckt den Freiraum), aber ihr Inhalt wird an ihren rechten Rand
  // gerückt — direkt neben die Logo-Spalte, statt an den linken Seitenrand.
  #grid(columns: (1fr, auto), column-gutter: 12pt, align: (right + horizon, right + horizon), firma_block, logo)
] else if sys.inputs.v_logo_position == "rechts_oben" [
  // Spiegelbild von "links": nur das Logo wandert an den rechten Rand, die
  // Firmenanschrift bleibt unverändert rechtsbündig darunter stehen.
  #align(right)[#logo]
  #firma_block
] else [
  #logo
  #firma_block
]
```

(Das `column-gutter: 12pt` behebt nebenbei den in Task 4 separat getesteten
Abstands-Bug — hier schon mit drin, weil beide Zeilen sonst zweimal
angefasst würden. Task 4 schreibt dafür den eigenen Test nach.)

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `cd src-tauri && cargo test --lib dokument::pdf::tests::logo_steht_rechts_bei_rechts_oben_und_links_bei_links 2>&1 | tail -20`
Erwartet: `test result: ok. 1 passed`

- [ ] **Step 5: Gesamtes `pdf`-Testmodul laufen lassen (keine Regression)**

Run: `cd src-tauri && cargo test --lib dokument::pdf:: 2>&1 | tail -50`
Erwartet: alle Tests grün, insbesondere weiterhin
`firma_anschrift_steht_bei_logo_rechts_daneben_nicht_am_linken_rand`.

- [ ] **Step 6: Committen**

```bash
git add src-tauri/src/dokument/pdf.rs src-tauri/templates/rechnung.typ
git commit -m "$(cat <<'EOF'
feat: Logo-Position „Oben rechts" rendert Logo rechts, Anschrift bleibt darunter

Spiegelbild von "Oben links": Nur das Logo wandert an den rechten Rand
der Kopfzeile, die Firmenanschrift steht unverändert rechtsbündig
darunter statt daneben. Neuer Test-Helfer bildpositionen liest die
tatsächliche Bildposition aus dem PDF-Content-Stream (Do-Operator),
analog zu textpositionen für Text.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Abstand zwischen Anschrift und Logo bei „Oben rechts, neben der Anschrift"

Der Grid-Gutter wurde in Task 3 bereits gesetzt (er stand in derselben
Zeile wie die dortige Änderung). Dieser Task schreibt den Test **nach**, der
das beweist — er muss zunächst gegen den Stand **vor** Task 3 fehlschlagen,
darum wird hier zusätzlich mit `git stash` kurz geprüft, dass er ohne das
Gutter tatsächlich rot wäre, bevor er endgültig committet wird.

**Files:**
- Test: `src-tauri/src/dokument/pdf.rs` (`mod tests`)

- [ ] **Step 1: Test schreiben**

Füge in `src-tauri/src/dokument/pdf.rs` direkt nach dem in Task 3
hinzugefügten Test `logo_steht_rechts_bei_rechts_oben_und_links_bei_links`
ein:

```rust
/// Ohne `column-gutter` stieß die Anschrift direkt an das Logo — im PDF
/// sichtbar, aber von keinem Test bemerkt (die vorhandenen Tests prüfen nur,
/// dass beide in der rechten Hälfte stehen, nicht ihren Abstand
/// zueinander).
#[test]
fn abstand_zwischen_anschrift_und_logo_bei_rechts_neben_der_anschrift() {
    const MM: f32 = 72.0 / 25.4;
    const SEITENHOEHE: f32 = 297.0 * MM;
    const LOGO: &[u8] = include_bytes!("../../resources/test/logo_1x1.png");

    let vorlage = crate::dokument::vorlage::Vorlage {
        logo_position: crate::dokument::vorlage::LogoPosition::Rechts,
        ..Default::default()
    };
    let bytes = rendern(&test_kontext(), Some(LOGO), &vorlage).unwrap();

    let kopf: Vec<_> = textpositionen(&bytes)
        .into_iter()
        .map(|(x, y)| (x, SEITENHOEHE - y))
        .filter(|(_, y)| *y < 40.0 * MM)
        .collect();
    let anschrift_rechte_kante = kopf.iter().map(|(x, _)| *x).fold(f32::MIN, f32::max);

    let bilder = bildpositionen(&bytes);
    assert_eq!(bilder.len(), 1, "erwartet genau ein Bild (das Logo) auf der Seite");
    let logo_linke_kante = bilder[0].0;

    assert!(
        logo_linke_kante - anschrift_rechte_kante > 2.0 * MM,
        "Anschrift endet bei {:.1} mm, Logo beginnt bei {:.1} mm — kein spürbarer Abstand",
        anschrift_rechte_kante / MM,
        logo_linke_kante / MM,
    );
}
```

- [ ] **Step 2: Test laufen lassen, aktuellen (grünen) Stand bestätigen**

Run: `cd src-tauri && cargo test --lib dokument::pdf::tests::abstand_zwischen_anschrift_und_logo_bei_rechts_neben_der_anschrift 2>&1 | tail -20`
Erwartet: `test result: ok. 1 passed` (das Gutter kam bereits in Task 3 mit).

- [ ] **Step 3: Rot-Probe — Gutter kurz entfernen und bestätigen, dass der Test dann scheitert**

In `src-tauri/templates/rechnung.typ:169` entferne testweise mit dem
Edit-Tool das Teilstück `column-gutter: 12pt, ` aus der Zeile, sodass sie
wieder lautet:

```typst
  #grid(columns: (1fr, auto), align: (right + horizon, right + horizon), firma_block, logo)
```

Run: `cd src-tauri && cargo test --lib dokument::pdf::tests::abstand_zwischen_anschrift_und_logo_bei_rechts_neben_der_anschrift 2>&1 | tail -20`
Erwartet: FAIL — „kein spürbarer Abstand"

Danach das Gutter mit dem Edit-Tool wieder einfügen (Zeile zurück auf den
Stand aus Task 3, Step 3):

```typst
  #grid(columns: (1fr, auto), column-gutter: 12pt, align: (right + horizon, right + horizon), firma_block, logo)
```

Run: `cd src-tauri && cargo test --lib dokument::pdf::tests::abstand_zwischen_anschrift_und_logo_bei_rechts_neben_der_anschrift 2>&1 | tail -20`
Erwartet: `test result: ok. 1 passed`

- [ ] **Step 4: Committen**

```bash
git add src-tauri/src/dokument/pdf.rs
git commit -m "$(cat <<'EOF'
test: Abstand zwischen Anschrift und Logo bei „Oben rechts, neben der Anschrift" absichern

Regressionstest für das column-gutter aus Task 3 — ohne ihn stießen
Anschrift und Logo im PDF direkt aneinander.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Dropdown-Option im Frontend

**Files:**
- Modify: `src/components/Belegvorlage.tsx:40-50`
- Test: `src/components/Belegvorlage.test.tsx`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

Füge in `src/components/Belegvorlage.test.tsx` nach dem Test „zeichnet die
Vorschau mit den Werten aus dem Formular neu" (endet Zeile 49) ein:

```tsx
  it("bietet die vierte Logo-Option 'Oben rechts' an", async () => {
    render(<Belegvorlage />);
    await waitFor(() => expect(api.vorlage.vorschau).toHaveBeenCalled());
    vi.mocked(api.vorlage.vorschau).mockClear();

    fireEvent.change(screen.getByLabelText("Logo"), { target: { value: "rechts_oben" } });

    await waitFor(() =>
      expect(api.vorlage.vorschau).toHaveBeenCalledWith(
        expect.arrayContaining([["vorlage.logo_position", "rechts_oben"]]),
      ),
    );
  });
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run src/components/Belegvorlage.test.tsx -t "Oben rechts" 2>&1 | tail -30`
Erwartet: FAIL — `fireEvent.change` findet die Option `rechts_oben` nicht
im `<select>` (`value` bleibt unverändert bzw. Vorschau wird nicht mit
`rechts_oben` aufgerufen).

- [ ] **Step 3: Option im Dropdown ergänzen**

In `src/components/Belegvorlage.tsx:44-49` ersetze:

```tsx
    optionen: [
      ["links", "Oben links"],
      ["rechts", "Oben rechts, neben der Anschrift"],
      ["keins", "Kein Logo"],
    ],
```

durch:

```tsx
    optionen: [
      ["links", "Oben links"],
      ["rechts", "Oben rechts, neben der Anschrift"],
      ["rechts_oben", "Oben rechts"],
      ["keins", "Kein Logo"],
    ],
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `npx vitest run src/components/Belegvorlage.test.tsx 2>&1 | tail -40`
Erwartet: alle Tests in `Belegvorlage.test.tsx` grün.

- [ ] **Step 5: TypeScript-Build zur Sicherheit**

Run: `npm run build 2>&1 | tail -30`
Erwartet: kein Fehler.

- [ ] **Step 6: Committen**

```bash
git add src/components/Belegvorlage.tsx src/components/Belegvorlage.test.tsx
git commit -m "$(cat <<'EOF'
feat: Dropdown-Option „Oben rechts" für die vierte Logo-Position

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Release 1.3.1 vormerken

**Files:**
- Modify: `docs/CHANGELOG.md`
- Modify: `docs/TODO.md`
- Modify: `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`

- [ ] **Step 1: Vollen Testlauf als Gesamtabnahme**

Run: `cd src-tauri && cargo test 2>&1 | tail -40`
Erwartet: alle Tests grün (KoSIT/veraPDF-Normprüfungen übersprungen, sofern
keine JVM installiert ist — siehe `docs/TODO.md`, Abschnitt
„Entwicklungsumgebung einrichten").

Run: `npm test 2>&1 | tail -40`
Erwartet: alle Tests grün.

- [ ] **Step 2: `docs/CHANGELOG.md` — neuen Abschnitt einfügen**

Füge direkt nach Zeile 9 (`Deshalb hier in der Sprache der Anwender, nicht
in der der Commits.`) und vor `## 1.3.0` ein:

```markdown

## 1.3.1

**Belegvorlage**
- Vierte Logo-Position „Oben rechts": Das Logo steht jetzt auch spiegelbildlich
  zu „Oben links" zur Verfügung — rechts oben, mit der Firmenanschrift
  unverändert darunter statt daneben.
- Bei „Oben rechts, neben der Anschrift" berührten sich Anschrift und Logo
  bisher ohne Abstand. Jetzt liegt ein kleiner Zwischenraum dazwischen.

**Behobene Fehler**
- Nach „Logo entfernen" schlug jeder weitere Beleg-Export (PDF, XRechnung,
  ZUGFeRD, Vorschau) mit einem technischen Fehler fehl. Die Einstellung
  speicherte dafür fälschlich ein leeres statt gar kein Logo.
```

- [ ] **Step 3: `docs/TODO.md` — Punkt 1 aus „Offen" entfernen, Punkt 2 wird zu Punkt 1**

In der Tabelle unter `## Offen` (Zeilen 11-14) ersetze:

```markdown
| Nr. | Punkt | Art | Aufwand |
|-----|-------|-----|---------|
| 1 | [Logo auch an der rechten Blattkante](#1-logo-auch-an-der-rechten-blattkante) | Funktion | mittel |
| 2 | [Export für den Steuerberater](#2-export-für-den-steuerberater) | Funktion | groß, Klärung offen |
```

durch:

```markdown
| Nr. | Punkt | Art | Aufwand |
|-----|-------|-----|---------|
| 1 | [Export für den Steuerberater](#1-export-für-den-steuerberater) | Funktion | groß, Klärung offen |
```

Entferne den kompletten Abschnitt `### 1. Logo auch an der rechten
Blattkante` (der Text zwischen dieser Überschrift und der nachfolgenden
`### 2. Export für den Steuerberater`) und benenne die verbleibende
Überschrift von `### 2. Export für den Steuerberater` zu `### 1. Export für
den Steuerberater` um.

- [ ] **Step 4: `docs/TODO.md` — Archiv-Eintrag ergänzen**

Füge direkt nach der Zeile `[MVP-Review vom 2026-08-02](2026-08-02-mvp-review.md). Reihenfolge war
Empfehlung; jeder Punkt trägt die Referenz aus dem Review.` und vor `##
Stand (2026-08-08, Bedienbarkeit)` ein:

```markdown

## Stand (2026-08-09, Logo-Position, Firma-Logo-Bug)

- **Vierte Logo-Position „Oben rechts".** Spiegelbild von „Oben links":
  Logo rechts, Firmenanschrift unverändert rechtsbündig darunter statt
  daneben. Nebenbei behoben: Bei „Oben rechts, neben der Anschrift" fehlte
  ein Abstand zwischen Logo und Anschrift.
- **Behoben:** „Logo entfernen" speicherte ein leeres statt eines
  `NULL`-Blobs. Jeder weitere Beleg-Export (nicht nur die Vorschau)
  scheiterte danach mit „failed to decode image (unexpected end of file)",
  weil Vorschau und Export ein 0-Byte-Bild für vorhanden hielten.
```

- [ ] **Step 5: `docs/TODO.md` — Diff kontrollieren**

Run: `git diff docs/TODO.md`
Erwartet: Tabelle hat nur noch eine Zeile, Abschnitt „Logo auch an der
rechten Blattkante" ist weg, „Export für den Steuerberater" trägt jetzt
Nummer 1, neuer Archiv-Abschnitt steht vor „Stand (2026-08-08,
Bedienbarkeit)". Die Zeile „Zuletzt veröffentlicht: **1.3.0** …" bleibt
unverändert — sie wird erst nach dem tatsächlichen Release auf 1.3.1
aktualisiert, nicht in diesem Schritt.

- [ ] **Step 6: Changelog und TODO committen**

Eigener Commit, getrennt vom Versionsbump — entspricht dem bestehenden
Muster im Log (`4ff9a72` „docs: …" gefolgt von `a48bc27` „chore: Version
1.3.0", beide vom selben Tag).

```bash
git add docs/CHANGELOG.md docs/TODO.md
git commit -m "$(cat <<'EOF'
docs: Logo-Position und Firma-Logo-Bug ins Archiv, ein Punkt bleibt offen

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Version auf 1.3.1 anheben**

In `package.json:4`: `"version": "1.3.0",` → `"version": "1.3.1",`

In `src-tauri/tauri.conf.json:4`: `"version": "1.3.0",` → `"version": "1.3.1",`

In `src-tauri/Cargo.toml:3`: `version = "1.3.0"` → `version = "1.3.1"`

- [ ] **Step 8: Lockfiles nachziehen**

Run: `npm install --package-lock-only 2>&1 | tail -10`
Erwartet: `package-lock.json` übernimmt `1.3.1` an beiden Stellen
(`"name": "chefsachen"` — Wurzel-Paket).

Run: `cd src-tauri && cargo build 2>&1 | tail -20`
Erwartet: Baut durch; `Cargo.lock` übernimmt `version = "1.3.1"` beim
`chefsachen`-Paket.

- [ ] **Step 9: Versionsstände gegenprüfen**

Run: `grep -rn '"version": "1.3.1"' package.json package-lock.json src-tauri/tauri.conf.json; grep -n '^version = "1.3.1"' src-tauri/Cargo.toml; grep -A1 'name = "chefsachen"' src-tauri/Cargo.lock`
Erwartet: `1.3.1` an allen fünf Stellen.

- [ ] **Step 10: Versionsbump committen**

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
git commit -m "$(cat <<'EOF'
chore: Version 1.3.1

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

**Hinweis:** Dieser Task committet nur lokal. Tag, Push und
GitHub-Release bleiben ein bewusster, separater Schritt — siehe die
bestehende Reihenfolge-Regel (Version-Commit separat pushen, sonst bleibt
die Landingpage auf der alten Version stehen).

---

## Manuelle Sichtprüfung (kein Subagent-Task)

Automatisierte Tests decken die Positionen ab, nicht das optische
Erscheinungsbild. Nach Abschluss aller Tasks: App starten (`npm run tauri
dev`), unter „Einstellungen → Belegvorlage" mit hinterlegtem Logo beide
Änderungen ansehen — „Oben rechts" (neue Option) und den Abstand bei „Oben
rechts, neben der Anschrift". Das übernimmt der Nutzer bzw. die
Hauptsitzung interaktiv, nicht ein Subagent ohne Augen auf die
gerenderte Vorschau.
