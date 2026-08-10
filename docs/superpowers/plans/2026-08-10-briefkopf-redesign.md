# Briefkopf-Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die eigene Anschrift + Kontakt wird ein einziger, vom Logo entkoppelter Block bei 45 mm (Höhe der Empfängeranschrift); der Fuß verliert die dadurch doppelte Anschrift/Kontakt-Spalte; die Logo-Option „Rechts, neben der Anschrift" entfällt, da ihr ganzer Zweck (Logo neben der Anschrift) mit der Entkopplung wegfällt.

**Architektur:** Rust-Enum `LogoPosition` verliert eine Variante, eine zweite wird umbenannt (`RechtsOben` → `Rechts`) — reiner Namens-/Strukturwechsel, keine neue Logik. Die Typst-Vorlage trennt Logo-Rendering und Anschrift-Platzierung vollständig (bisher im selben Grid verzahnt). Zwei bestehende PDF-Geometrietests verlieren ihre Grundlage und entfallen; zwei neue beweisen die zentrale neue Eigenschaft (Anschrift bei 45 mm, unabhängig von der Logo-Position; keine Dopplung mehr im Fuß).

**Tech Stack:** Rust (`vorlage.rs`, `pdf.rs`), Typst (`rechnung.typ`), React/TypeScript (`Belegvorlage.tsx`), `cargo test`, `vitest`.

**Spec:** `docs/superpowers/specs/2026-08-10-briefkopf-redesign-design.md`

**Reihenfolge-Hinweis:** Task 1 muss sowohl `vorlage.rs` als auch die davon
betroffenen Stellen in `pdf.rs` in einem Commit ändern — der Workspace
kompiliert sonst zwischen den beiden Änderungen nicht (Task 1 entfernt
`LogoPosition::RechtsOben`/die alte `LogoPosition::Rechts`, auf die
`pdf.rs` an mehreren Stellen verweist). Nach Task 1 rendert `rechnung.typ`
für die (umbenannte) Variante `Rechts` noch nach der **alten** Logik
(Vorlage wird erst in Task 2 umgebaut) — das ist ein bewusster,
kurzzeitiger Zwischenzustand innerhalb dieser Session, kein Zustand, der
je real ausgeliefert wird.

---

### Task 1: Backend — `LogoPosition` vereinfachen (Enum + betroffene Bestandstests)

**Files:**
- Modify: `src-tauri/src/dokument/vorlage.rs` (Enum, Kommentare, ein Test)
- Modify: `src-tauri/src/dokument/pdf.rs` (zwei Tests entfernen, einen umbenennen — nur damit der Workspace kompiliert, siehe Reihenfolge-Hinweis oben)

- [ ] **Step 1: `LogoPosition`-Enum umbauen**

In `src-tauri/src/dokument/vorlage.rs` ersetze:

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

durch:

```rust
/// Wo das Logo steht. Reine Logo-Position ohne Bezug zur eigenen
/// Anschrift — die steht seit dem Briefkopf-Redesign immer separat bei
/// 45 mm, unabhängig davon, wo (oder ob) ein Logo erscheint. Bis 2026-08-10
/// gab es eine vierte Variante `Rechts` mit Logo und Anschrift nebeneinander
/// im selben Grid; die entfiel mit der Entkopplung ersatzlos.
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

- [ ] **Step 2: `LOGO_SICHERHEITSPUFFER_MM`-Kommentar korrigieren**

In `src-tauri/src/dokument/vorlage.rs` ersetze:

```rust
/// Mindestabstand zwischen Logo-Unterkante und Anschriftfenster bei „Oben
/// links"/„Oben rechts" (gestapelt) — dort steht das Logo im Textfluss
/// direkt über der Firmenanschrift, während das Fenster fest positioniert
/// ist und nicht mitwandert.
const LOGO_SICHERHEITSPUFFER_MM: f64 = 5.0;
```

durch:

```rust
/// Mindestabstand zwischen Logo-Unterkante und Anschriftfenster bei „Oben
/// links"/„Oben rechts" — dort steht das Logo allein im Textfluss, dessen
/// Unterkante ins Anschriftfenster hineinragen kann, während das Fenster
/// fest positioniert ist und nicht mitwandert.
const LOGO_SICHERHEITSPUFFER_MM: f64 = 5.0;
```

(Der einzige inhaltliche Unterschied: „dort steht das Logo im Textfluss
direkt über der Firmenanschrift" → „dort steht das Logo allein im
Textfluss" — nach dem Umbau steht keine Firmenanschrift mehr darunter.)

- [ ] **Step 3: Unit-Test umbenennen**

In `src-tauri/src/dokument/vorlage.rs` ersetze:

```rust
    /// Vierte Logo-Option: Logo rechts, Firmenanschrift unverändert rechtsbündig
    /// darunter — Spiegelbild von „links".
    #[test]
    fn logo_position_rechts_oben_wird_gelesen() {
        let v = Vorlage::aus_paaren(&[("vorlage.logo_position".into(), "rechts_oben".into())]);
        assert_eq!(v.logo_position, LogoPosition::RechtsOben);
        assert_eq!(v.logo_position.als_str(), "rechts_oben");
    }
```

durch:

```rust
    /// Logo rechts — reine Logo-Position, ohne Bezug zur eigenen Anschrift
    /// (die steht seit dem Briefkopf-Redesign immer separat bei 45 mm).
    #[test]
    fn logo_position_rechts_wird_gelesen() {
        let v = Vorlage::aus_paaren(&[("vorlage.logo_position".into(), "rechts".into())]);
        assert_eq!(v.logo_position, LogoPosition::Rechts);
        assert_eq!(v.logo_position.als_str(), "rechts");
    }
```

- [ ] **Step 4: Tests im `dokument::vorlage::`-Modul laufen lassen**

Run: `cd src-tauri && cargo test --lib dokument::vorlage:: 2>&1 | tail -40`
Erwartet: Kompilierfehler in `pdf.rs` (nicht in `vorlage.rs` selbst) — die
folgenden Schritte beheben das.

- [ ] **Step 5: `pdf.rs` — Test für die entfernte Option löschen (1/2)**

In `src-tauri/src/dokument/pdf.rs` entferne den kompletten Test
`abstand_zwischen_anschrift_und_logo_bei_rechts_neben_der_anschrift`
(inklusive seines Doc-Kommentars, direkt nach
`logo_steht_rechts_bei_rechts_oben_und_links_bei_links` — der bleibt
vorerst stehen, wird in Step 6 angepasst) — der komplette Block von:

```rust
    /// Ohne `column-gutter` stieß die Anschrift direkt an das Logo — im PDF
    /// sichtbar, aber von keinem Test bemerkt (die vorhandenen Tests prüfen nur,
    /// dass beide in der rechten Hälfte stehen, nicht ihren Abstand
    /// zueinander).
    #[test]
    fn abstand_zwischen_anschrift_und_logo_bei_rechts_neben_der_anschrift() {
```

bis zur schließenden `}` dieser Testfunktion (endet mit dem `assert!(...)`-Block
über den Abstand in mm, gefolgt vom Kommentar zu
`logo_unterkante_haelt_sicherheitsabstand_zum_anschriftfenster_ein_im_echten_pdf`).
Komplett entfernen — dieser Test prüft den `column-gutter`-Grid der jetzt
entfernten „Rechts, neben der Anschrift"-Option, die es nicht mehr gibt.

- [ ] **Step 6: `pdf.rs` — verbleibenden Logo-Positions-Test umbenennen**

Ersetze:

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
            // Feste Logohöhe statt `..Default::default()`: Das quadratische
            // Testbild übernimmt Breite und Höhe von diesem Wert, und dieser
            // Test misst die horizontale Logo-Position — der Wert muss also
            // unabhängig von künftigen Änderungen an Vorlage::default() sein.
            let vorlage = crate::dokument::vorlage::Vorlage {
                logo_position: position,
                logo_hoehe_mm: 20.0,
                ..Default::default()
            };
            let bytes = rendern(&test_kontext(), Some(LOGO), &vorlage).unwrap();
            let bilder = bildpositionen(&bytes);
            assert_eq!(bilder.len(), 1, "erwartet genau ein Bild (das Logo) auf der Seite");
            bilder[0].0
        };

        let links = logo_x(crate::dokument::vorlage::LogoPosition::Links);
        let rechts_oben = logo_x(crate::dokument::vorlage::LogoPosition::RechtsOben);

        assert!(
            links < SEITENBREITE / 2.0,
            "Logo bei „Oben links\" steht bei {:.1} mm — nicht in der linken Hälfte",
            links / MM,
        );
        assert!(
            rechts_oben > SEITENBREITE / 2.0,
            "Logo bei „Oben rechts\" steht bei {:.1} mm — nicht in der rechten Hälfte",
            rechts_oben / MM,
        );
    }
```

durch:

```rust
    /// „Oben rechts" und „Oben links" sind reine Logo-Positionen ohne Bezug
    /// zur Anschrift (die steht seit dem Briefkopf-Redesign immer separat
    /// bei 45 mm). Misst am echten PDF, nicht nur an der Einstellung selbst.
    #[test]
    fn logo_steht_rechts_bei_rechts_und_links_bei_links() {
        const MM: f32 = 72.0 / 25.4;
        const SEITENBREITE: f32 = 210.0 * MM;
        const LOGO: &[u8] = include_bytes!("../../resources/test/logo_1x1.png");

        let logo_x = |position: crate::dokument::vorlage::LogoPosition| {
            // Feste Logohöhe statt `..Default::default()`: Das quadratische
            // Testbild übernimmt Breite und Höhe von diesem Wert, und dieser
            // Test misst die horizontale Logo-Position — der Wert muss also
            // unabhängig von künftigen Änderungen an Vorlage::default() sein.
            let vorlage = crate::dokument::vorlage::Vorlage {
                logo_position: position,
                logo_hoehe_mm: 20.0,
                ..Default::default()
            };
            let bytes = rendern(&test_kontext(), Some(LOGO), &vorlage).unwrap();
            let bilder = bildpositionen(&bytes);
            assert_eq!(bilder.len(), 1, "erwartet genau ein Bild (das Logo) auf der Seite");
            bilder[0].0
        };

        let links = logo_x(crate::dokument::vorlage::LogoPosition::Links);
        let rechts = logo_x(crate::dokument::vorlage::LogoPosition::Rechts);

        assert!(
            links < SEITENBREITE / 2.0,
            "Logo bei „Oben links\" steht bei {:.1} mm — nicht in der linken Hälfte",
            links / MM,
        );
        assert!(
            rechts > SEITENBREITE / 2.0,
            "Logo bei „Oben rechts\" steht bei {:.1} mm — nicht in der rechten Hälfte",
            rechts / MM,
        );
    }
```

(Änderungen: Testname, Doc-Kommentar, `LogoPosition::RechtsOben` →
`LogoPosition::Rechts`, Variable `rechts_oben` → `rechts`.)

- [ ] **Step 7: `pdf.rs` — Test für die entfernte Option löschen (2/2)**

Entferne den kompletten Test
`firma_anschrift_steht_bei_logo_rechts_daneben_nicht_am_linken_rand`
(inklusive Doc-Kommentar), zu finden zwischen
`die_anschrift_bleibt_im_fenster_auch_bei_anderen_seitenraendern` und
`einstellungen_wirken_auf_den_beleg`:

```rust
    /// „Oben rechts, neben der Anschrift" verspricht, dass das Logo und die
    /// eigene Firmenanschrift nebeneinander stehen — nicht auf entgegengesetzten
    /// Seiten der Kopfzeile. Vorher stand die Anschrift am linken Seitenrand,
    /// weit vom Logo entfernt, weil eine breite Gitterspalte ihren Inhalt an
    /// deren linke statt rechte Kante rückte.
    #[test]
    fn firma_anschrift_steht_bei_logo_rechts_daneben_nicht_am_linken_rand() {
```

bis zur schließenden `}` dieser Testfunktion. Komplett entfernen — testet
dieselbe entfernte Funktionalität wie Step 5, nur mit einer anderen
Messmethode (Textposition statt Gutter-Abstand).

- [ ] **Step 8: Gesamter Workspace kompiliert und alle Tests laufen**

Run: `cd src-tauri && cargo test 2>&1 | tail -60`
Erwartet: kompiliert fehlerfrei, alle Tests grün (die App-Vorlage rendert
für `LogoPosition::Rechts` noch nach der alten, in Task 2 zu ersetzenden
Logik — siehe Reihenfolge-Hinweis oben — das ist hier noch kein Fehler).

- [ ] **Step 9: Committen**

```bash
git add src-tauri/src/dokument/vorlage.rs src-tauri/src/dokument/pdf.rs
git commit -m "$(cat <<'EOF'
feat: LogoPosition vereinfachen — "Rechts, neben der Anschrift" entfällt

Vorbereitung für das Briefkopf-Redesign: Die eigene Anschrift wird in
Task 2 vom Logo entkoppelt und steht dann immer separat bei 45 mm —
die Option "Rechts, neben der Anschrift" (Logo und Anschrift im
selben Grid) verliert damit ihren ganzen Zweck und entfällt ersatzlos.
Die bisherige gestapelte Variante RechtsOben wird zu Rechts, da die
Unterscheidung "gestapelt vs. nebeneinander" nicht mehr existiert.

Rein rückwärtskompatibilitätsfrei (nur ein Nutzer dieser App): ein
gespeicherter Wert "rechts" (alt) wird künftig als "Logo rechts allein"
statt "Logo neben der Anschrift" gelesen, ohne Fehlermeldung.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Typst-Vorlage — Briefkopf umbauen + neue geometrische Tests

**Files:**
- Modify: `src-tauri/templates/rechnung.typ`
- Modify: `src-tauri/src/dokument/pdf.rs` (ein Kommentar korrigiert, zwei neue Tests)

- [ ] **Step 1: Fehlschlagenden Test schreiben — Anschrift bei 45 mm**

Füge in `src-tauri/src/dokument/pdf.rs` nach
`logo_steht_rechts_bei_rechts_und_links_bei_links` (aus Task 1) ein:

```rust
    /// Die eigene Anschrift+Kontakt ist vom Logo entkoppelt und steht bei
    /// jeder Logo-Position auf derselben Höhe (45 mm, wie die
    /// Empfängeranschrift) — die zentrale neue Eigenschaft des
    /// Briefkopf-Redesigns. Der Girocode/die Tabelle stehen erst ab 85 mm,
    /// die Anschrift ist also garantiert der oberste Text in der rechten
    /// Seitenhälfte — kein Zufallstreffer.
    #[test]
    fn eigene_anschrift_steht_bei_45mm_unabhaengig_von_der_logo_position() {
        const MM: f32 = 72.0 / 25.4;
        const SEITENHOEHE: f32 = 297.0 * MM;
        const SEITENBREITE: f32 = 210.0 * MM;

        let oberste_zeile_rechts_mm = |position: crate::dokument::vorlage::LogoPosition| -> f32 {
            let vorlage = crate::dokument::vorlage::Vorlage { logo_position: position, ..Default::default() };
            let bytes = rendern(&test_kontext(), None, &vorlage).unwrap();
            let rechts: Vec<f32> = textpositionen(&bytes)
                .into_iter()
                .filter(|(x, _)| *x > SEITENBREITE / 2.0)
                .map(|(_, y)| (SEITENHOEHE - y) / MM)
                .collect();
            assert!(!rechts.is_empty(), "keine Texte in der rechten Seitenhälfte bei Logo-Position {position:?}");
            rechts.iter().cloned().fold(f32::MAX, f32::min)
        };

        for position in [
            crate::dokument::vorlage::LogoPosition::Links,
            crate::dokument::vorlage::LogoPosition::Rechts,
            crate::dokument::vorlage::LogoPosition::Keins,
        ] {
            let oberste = oberste_zeile_rechts_mm(position);
            assert!(
                (oberste - 45.0).abs() < 1.0,
                "Anschrift bei Logo-Position {position:?} beginnt bei {oberste:.1} mm statt 45 mm",
            );
        }
    }

    /// Vor dem Umbau stand die eigene Anschrift zweimal auf dem Beleg (oben
    /// neben dem Logo und unten im Fuß). Der ganze Witz des Umbaus ist, dass
    /// sie jetzt nur noch einmal steht.
    #[test]
    fn eigene_anschrift_steht_nur_noch_einmal_nicht_mehr_doppelt_im_fuss() {
        let t = text(&test_kontext());
        let treffer = t.matches("Weg 1").count();
        assert_eq!(treffer, 1, "Firmenstraße erscheint {treffer}x statt genau einmal:\n{t}");
    }
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `cd src-tauri && cargo test --lib dokument::pdf::tests::eigene_anschrift_steht_bei_45mm_unabhaengig_von_der_logo_position dokument::pdf::tests::eigene_anschrift_steht_nur_noch_einmal_nicht_mehr_doppelt_im_fuss 2>&1 | tail -40`
Erwartet: `eigene_anschrift_steht_bei_45mm_unabhaengig_von_der_logo_position`
schlägt fehl (die Anschrift steht noch im alten Textfluss, nicht bei
45 mm). `eigene_anschrift_steht_nur_noch_einmal_nicht_mehr_doppelt_im_fuss`
schlägt ebenfalls fehl (`treffer` ist noch 2 — einmal oben, einmal im
Fuß).

- [ ] **Step 3: Typst-Vorlage umbauen — Kommentare korrigieren**

In `src-tauri/templates/rechnung.typ` ersetze:

```typst
// Geschäftsangaben für den Fuß jeder Seite — als `#let` hier oben, nicht
// erst weiter unten im Fließtext, wo sie inhaltlich hingehören würden: Der
// `footer`-Funktionswert von `#set page` unten bindet Variablen lexikalisch
// an ihrer Quelltextstelle. Was erst später mit `#let` definiert würde,
// sähe der Fuß nicht.
//
// Bankverbindung: gesetzlich nicht vorgeschrieben, aber ohne sie kann der
// Empfänger nicht zahlen — bei einer Erinnerung erst recht wichtig.
#let bankverbindung = if ist_gesetzt(sys.inputs.firma_iban) [
  *Bankverbindung* \
  IBAN: #sys.inputs.firma_iban
  #if ist_gesetzt(sys.inputs.firma_bic) [
    \ BIC: #sys.inputs.firma_bic
  ]
] else { [] }
// Leeres Content-Element statt `none`: Die drei Spalten unten übergeben
// `bankverbindung` direkt als Grid-Zelle, die dafür `content` erwartet.

// Kontaktangaben: gesetzlich nicht vorgeschrieben — nur was gepflegt ist,
// erscheint auch. Absichtlich nicht im Kopf neben Logo und Anschrift: Der
// bleibt bewusst knapp, wie ein DIN-5008-Briefkopf es vorsieht.
#let kontaktzeilen = (
  if ist_gesetzt(sys.inputs.firma_telefon) { "Telefon: " + sys.inputs.firma_telefon },
  if ist_gesetzt(sys.inputs.firma_fax) { "Fax: " + sys.inputs.firma_fax },
  if ist_gesetzt(sys.inputs.firma_email) { "E-Mail: " + sys.inputs.firma_email },
).filter(z => z != none)

#let anschrift_und_kontakt = [
  #sys.inputs.firma_name \
  #sys.inputs.firma_strasse \
  #sys.inputs.firma_plz #sys.inputs.firma_ort
  // Eine eigene Zeile je Kontaktangabe statt mit " · " zu einem Fließtext
  // verbunden: Bei allen drei Angaben (Telefon, Fax, E-Mail) brach die
  // verbundene Zeile in der schmalen Fuß-Spalte um, mit einem verwaisten
  // "·" vor der letzten Angabe.
  #for zeile in kontaktzeilen [
    \ #zeile
  ]
]
```

durch:

```typst
// Geschäftsangaben, die sowohl im Fuß jeder Seite als auch oben bei der
// eigenen Anschrift erscheinen — als `#let` hier oben, nicht erst weiter
// unten im Fließtext, wo `bankverbindung`/`steuerangaben` inhaltlich
// hingehören würden: Der `footer`-Funktionswert von `#set page` unten
// bindet Variablen lexikalisch an ihrer Quelltextstelle. Was erst später
// mit `#let` definiert würde, sähe der Fuß nicht.
//
// Bankverbindung: gesetzlich nicht vorgeschrieben, aber ohne sie kann der
// Empfänger nicht zahlen — bei einer Erinnerung erst recht wichtig.
#let bankverbindung = if ist_gesetzt(sys.inputs.firma_iban) [
  *Bankverbindung* \
  IBAN: #sys.inputs.firma_iban
  #if ist_gesetzt(sys.inputs.firma_bic) [
    \ BIC: #sys.inputs.firma_bic
  ]
] else { [] }
// Leeres Content-Element statt `none`: Die zwei Spalten unten übergeben
// `bankverbindung` direkt als Grid-Zelle, die dafür `content` erwartet.

// Kontaktangaben: gesetzlich nicht vorgeschrieben — nur was gepflegt ist,
// erscheint auch. Stehen bei der eigenen Anschrift oben, nicht mehr
// zusätzlich im Fuß — sonst stünden Name, Anschrift und Kontakt doppelt
// auf dem Beleg.
#let kontaktzeilen = (
  if ist_gesetzt(sys.inputs.firma_telefon) { "Telefon: " + sys.inputs.firma_telefon },
  if ist_gesetzt(sys.inputs.firma_fax) { "Fax: " + sys.inputs.firma_fax },
  if ist_gesetzt(sys.inputs.firma_email) { "E-Mail: " + sys.inputs.firma_email },
).filter(z => z != none)

#let anschrift_und_kontakt = [
  #sys.inputs.firma_name \
  #sys.inputs.firma_strasse \
  #sys.inputs.firma_plz #sys.inputs.firma_ort
  // Eine eigene Zeile je Kontaktangabe statt mit " · " zu einem Fließtext
  // verbunden: Bei allen drei Angaben (Telefon, Fax, E-Mail) brach die
  // verbundene Zeile in der schmalen Spalte um, mit einem verwaisten
  // "·" vor der letzten Angabe.
  #for zeile in kontaktzeilen [
    \ #zeile
  ]
]
```

- [ ] **Step 4: Fuß-Grid von drei auf zwei Spalten**

In `src-tauri/templates/rechnung.typ` ersetze innerhalb des
`#set page(...)`-Aufrufs:

```typst
  footer-descent: 10%,
```

durch (Kommentar korrigiert, da der Fuß nicht mehr die Anschrift/
Kontakt-Spalte trägt, deren Zeilenzahl den bisherigen Wert begründete):

```typst
  // Ohne diese Angabe senkt Typst den Footer standardmäßig um 30 % des
  // unteren Randes in die Marge ab (`footer-descent`) — 10 % lassen bei
  // 25 mm Rand ausreichend Platz für Steuerangaben und Bankverbindung
  // (je bis zu zwei Zeilen).
  footer-descent: 10%,
```

Und ersetze:

```typst
      #grid(
        columns: (1fr, 1fr, 1fr),
        column-gutter: 12pt,
        anschrift_und_kontakt, steuerangaben, bankverbindung,
      )
```

durch:

```typst
      #grid(
        columns: (1fr, 1fr),
        column-gutter: 12pt,
        steuerangaben, bankverbindung,
      )
```

Hinweis: Die alte `footer-descent`-Erklärung stand direkt vor der
`footer-descent: 10%,`-Zeile mit demselben Wortlaut wie oben im
alten Block — ersetze nur diesen einen zusammenhängenden Kommentar,
nicht die `margin:`/`background:`-Zeilen davor.

- [ ] **Step 5: Logo-Rendering vereinfachen, Anschrift bei 45 mm platzieren**

Ersetze:

```typst
// Logo und Absenderanschrift teilen sich die Kopfzeile. Steht das Logo rechts,
// rückt die Anschrift nach links — sonst überlagerten sie einander.
#let logo = if ist_gesetzt(sys.inputs.hat_logo) {
  image(sys.inputs.hat_logo, height: mass(sys.inputs.v_logo_hoehe_mm))
} else { none }

#let firma_block = align(right)[
  #sys.inputs.firma_name \
  #sys.inputs.firma_strasse \
  #sys.inputs.firma_plz #sys.inputs.firma_ort
]

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

durch:

```typst
// Logo — steht für sich allein, ohne Bezug zur eigenen Anschrift: Die
// steht unten fest bei 45 mm, unabhängig davon, wo (oder ob) ein Logo
// erscheint.
#let logo = if ist_gesetzt(sys.inputs.hat_logo) {
  image(sys.inputs.hat_logo, height: mass(sys.inputs.v_logo_hoehe_mm))
} else { none }

#if logo != none [
  #if sys.inputs.v_logo_position == "rechts" [
    #align(right)[#logo]
  ] else [
    #logo
  ]
]

// Eigene Anschrift + Kontakt, rechtsbündig auf Höhe der Empfängeranschrift
// (45 mm) — entkoppelt vom Logo, das oben allein steht. Reine
// Flusspositionierung (kein `background`): Anders als die Falzmarken ist
// das eine Inhaltsangabe, die nur auf Seite 1 gehört, dort wo auch das
// Anschriftfeld der Empfängerin beginnt.
#place(
  top + right,
  dy: 45mm - rand_oben,
  anschrift_und_kontakt,
)
```

- [ ] **Step 6: Tests laufen lassen, Erfolg bestätigen**

Run: `cd src-tauri && cargo test --lib dokument::pdf::tests::eigene_anschrift_steht_bei_45mm_unabhaengig_von_der_logo_position dokument::pdf::tests::eigene_anschrift_steht_nur_noch_einmal_nicht_mehr_doppelt_im_fuss 2>&1 | tail -40`
Erwartet: beide `ok`. Falls nicht — insbesondere falls die 45-mm-Messung
abweicht (z. B. weil `place`s Verhalten im normalen Textfluss doch anders
ist als angenommen, anders als das bereits verifizierte `background`):
nicht raten, sondern mit temporärem `eprintln!("{:?}", ...)` die
tatsächlichen Werte ausgeben und danach wieder entfernen — siehe
Vorgehen bei den Falzmarken-Tests in einer vorigen Aufgabe dieser
Session.

- [ ] **Step 7: `pdf.rs` — stale Kommentar korrigieren**

In `src-tauri/src/dokument/pdf.rs` ersetze:

```rust
    /// Die Zahlungserinnerung teilt sich den Fuß mit der Rechnung — die
    /// Kontaktzeile muss also auch dort erscheinen, nicht nur beim Export der
    /// eigentlichen Rechnung.
    #[test]
    fn zahlungserinnerung_enthaelt_telefon_fax_und_email() {
```

durch:

```rust
    /// Die Zahlungserinnerung teilt sich Briefkopf und Anschriftfeld mit der
    /// Rechnung — die Kontaktzeile muss also auch dort erscheinen, nicht nur
    /// beim Export der eigentlichen Rechnung.
    #[test]
    fn zahlungserinnerung_enthaelt_telefon_fax_und_email() {
```

(Reine Kommentarkorrektur — der Test selbst prüft nur Textpräsenz, nicht
Position, und bleibt unverändert grün; „teilt sich den Fuß" ist nach dem
Umbau nicht mehr korrekt, da Telefon/Fax/E-Mail jetzt oben stehen.)

- [ ] **Step 8: Gesamtes `pdf`-Testmodul laufen lassen (keine Regression)**

Run: `cd src-tauri && cargo test --lib dokument::pdf:: 2>&1 | tail -80`
Erwartet: alle Tests grün. Besonders prüfen:
`rechnung_enthaelt_telefon_fax_und_email`,
`rechnung_zeigt_keine_leeren_kontaktangaben`,
`zahlungserinnerung_enthaelt_telefon_fax_und_email`,
`rechnung_enthaelt_die_bankverbindung`,
`rechnung_zeigt_ust_idnr_wenn_vorhanden`,
`geschaeftsfuss_wiederholt_sich_auf_jeder_seite`,
`die_anschrift_liegt_im_sichtfenster_nach_din_5008`,
`die_anschrift_bleibt_im_fenster_auch_bei_anderen_seitenraendern` — keiner
davon sollte sich in dieser Aufgabe geändert haben, alle müssen weiterhin
grün sein.

- [ ] **Step 9: Gesamten Workspace testen (Rust)**

Run: `cd src-tauri && cargo test 2>&1 | tail -30`
Erwartet: alle Tests grün, keine Regression in anderen Modulen
(`xrechnung`, `zugferd`, `vorschau` nutzen dieselbe Vorlage).

- [ ] **Step 10: Committen**

```bash
git add src-tauri/templates/rechnung.typ src-tauri/src/dokument/pdf.rs
git commit -m "$(cat <<'EOF'
feat: Eigene Anschrift auf Fensterhöhe, Fuß dadurch schlanker

Die eigene Anschrift + Kontakt (Name, Straße, PLZ/Ort, Telefon, Fax,
E-Mail) steht jetzt als eigenständiger Block rechtsbündig bei 45 mm —
auf derselben Höhe wie die Empfängeranschrift, unabhängig von der
Logo-Position. Der Fuß zeigt diese Angaben nicht mehr zusätzlich
(keine Dopplung mehr), nur noch Steuerangaben und Bankverbindung.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Frontend — Logo-Dropdown vereinfachen

**Files:**
- Modify: `src/components/Belegvorlage.tsx`
- Modify: `src/components/Belegvorlage.test.tsx`

- [ ] **Step 1: `SCHALTER`-Eintrag vereinfachen**

In `src/components/Belegvorlage.tsx` ersetze:

```ts
  {
    schluessel: "vorlage.logo_position",
    label: "Logo",
    hinweis:
      "„Oben rechts“ setzt das Logo über die Anschrift, spiegelbildlich zu „Oben links“. Bei " +
      "„Oben rechts, neben der Anschrift“ stehen beide stattdessen nebeneinander in derselben Zeile.",
    art: "auswahl",
    optionen: [
      ["links", "Oben links"],
      ["rechts", "Oben rechts, neben der Anschrift"],
      ["rechts_oben", "Oben rechts"],
      ["keins", "Kein Logo"],
    ],
  },
```

durch:

```ts
  {
    schluessel: "vorlage.logo_position",
    label: "Logo",
    art: "auswahl",
    optionen: [
      ["links", "Oben links"],
      ["rechts", "Oben rechts"],
      ["keins", "Kein Logo"],
    ],
  },
```

(Der `hinweis` entfällt komplett — bei nur noch zwei einfachen Positionen
ohne Bezug zur Anschrift gibt es nichts mehr zu erklären.)

- [ ] **Step 2: Jetzt gegenstandslosen Test entfernen**

In `src/components/Belegvorlage.test.tsx` entferne den kompletten Test:

```tsx
  it('bietet die vierte Logo-Option „Oben rechts" an', async () => {
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

Kein Ersatztest nötig: Die Prämisse „vierte Option, unterscheidbar von
einer dritten" entfällt (nur noch drei Optionen), und die verbleibende
Funktionalität (Auswahl ändert `logo_position` und zeichnet die Vorschau
neu) ist bereits durch den direkt davorstehenden Test „zeichnet die
Vorschau mit den Werten aus dem Formular neu" abgedeckt (der nutzt
weiterhin den Wert `"rechts"`, der nach diesem Umbau weiterhin gültig
ist — nur seine Bedeutung hat sich geändert, was für diesen Test
irrelevant ist, er prüft nur, dass sich überhaupt etwas ändert).

- [ ] **Step 3: Tests laufen lassen**

Run: `npx vitest run src/components/Belegvorlage.test.tsx 2>&1 | tail -40`
Erwartet: alle verbleibenden Tests grün. Besonders prüfen: „zeichnet die
Vorschau mit den Werten aus dem Formular neu" (nutzt `"rechts"`) und
„übernimmt gespeicherte Werte ins Formular" (lädt `"rechts"` aus
gespeicherten Einstellungen) — beide sollten unverändert grün bleiben,
ohne Code-Änderung nötig zu haben.

- [ ] **Step 4: TypeScript-Build zur Sicherheit**

Run: `npm run build 2>&1 | tail -30`
Erwartet: kein Fehler.

- [ ] **Step 5: Committen**

```bash
git add src/components/Belegvorlage.tsx src/components/Belegvorlage.test.tsx
git commit -m "$(cat <<'EOF'
feat: Logo-Dropdown auf drei Optionen vereinfacht

"Oben rechts, neben der Anschrift" entfällt (siehe Backend-Commit) —
nur noch Oben links, Oben rechts, Kein Logo. Kein Hinweistext mehr
nötig, da es zwischen zwei einfachen Positionen nichts zu erklären
gibt.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Nicht Teil dieses Plans

Kein CHANGELOG-Eintrag, kein Versionsbump, keine TODO.md-Archivierung —
das bleibt wie bei den vorigen Features ein bewusster, separater Schritt.
