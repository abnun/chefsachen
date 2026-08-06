# Beleg-Layout, Girocode und Abschlagsrechnung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Kopf/Fuß of Angebot and Rechnung into a clear info table plus a fixed three-column business footer, add an optional SEPA-Girocode (EPC069-12 QR payment code) to Rechnung/Zahlungserinnerung, and add a simple "Gesamt-Auftragswert" hint field for Abschlagsrechnungen.

**Architecture:** All three features extend the existing Typst-based PDF pipeline (`src-tauri/src/dokument/pdf.rs` builds a flat string-dict of "Typst inputs", `src-tauri/templates/rechnung.typ` renders them) and the existing `Vorlage` settings struct (`src-tauri/src/dokument/vorlage.rs`, mirrored in `src/components/Belegvorlage.tsx`). The Girocode payload/matrix math lives in a new pure domain module (`src-tauri/src/domain/girocode.rs`), following the same "Rust computes data, Typst draws it" split already used for `domain::steuer`. The Gesamt-Auftragswert is a single new nullable column on `beleg`.

**Tech Stack:** Rust (Tauri 2, sqlx/SQLite, Typst 0.13 via `typst-as-lib`), React 19 + TypeScript, Vitest, `qrcode` crate (new dependency, `default-features = false`).

## Global Constraints

- Approved spec: `docs/superpowers/specs/2026-08-06-beleg-layout-girocode-abschlag-design.md` — read it before starting; every task below implements one piece of it.
- German comments/identifiers throughout, matching the existing codebase style (see any file in `src-tauri/src/` or `src/` for tone).
- Every backend change needs a passing `cargo test` (whole workspace) and `cargo clippy --all-targets -- -D warnings` before moving to the next task.
- Every frontend change needs a passing `npx tsc --noEmit`, `npx eslint .`, and `npm test -- --run` before moving to the next task.
- Never touch the DIN-5008 anschriftfeld `place()` block in `rechnung.typ` (lines ~57–90 as of this plan) — it is load-bearing for envelope-window compatibility and out of scope.
- The Girocode setting defaults to **enabled** (`true`) — an intentional, explicit exception to this codebase's usual "new settings preserve prior appearance" rule (confirmed by the user).
- Commit after each task with a German, rationale-first message (see recent `git log` in this repo for style). Do not tag or publish a release — that happens only on explicit user request, after this plan is fully executed and verified.

---

## Part A — Kopf- und Fußbereich

### Task 1: merged into Task 2

Task 1 originally planned to add `kunde_kundennummer` as a Typst input in
its own commit, with its own test (`rechnung_enthaelt_die_kundennummer`,
asserting the rendered PDF text contains `"KD-0001"`). That test cannot
pass on its own: `rechnung.typ` does not read `sys.inputs.kunde_kundennummer`
anywhere yet (confirmed via `grep -n "kunde_kundennummer" src-tauri/templates/rechnung.typ`
— no match), and that key is only ever read once Task 2's Kopf-Tabelle
exists. Adding the Rust input alone leaves the value unread and the test
red — the two changes are inseparable under TDD (an implementer correctly
escalated this rather than guessing). Task 1 is therefore folded into
Task 2 below, which now does both: exposes the input and reads it.

---

### Task 2: Kopf-Tabelle statt loser Textzeilen (inkl. Kundennummer-Eingabe)

**Files:**
- Modify: `src-tauri/src/dokument/pdf.rs` (function `dokument_bauen`'s `felder` vec — add the `kunde_kundennummer` input)
- Modify: `src-tauri/templates/rechnung.typ` (heading + the non-Erinnerung `else` branch)
- Test: `src-tauri/src/dokument/pdf.rs`

**Interfaces:**
- Consumes: `BelegKontext.kunde_kundennummer: String` (already exists, `src-tauri/src/dokument/kontext.rs`; `test_kontext()` in `pdf.rs` already sets it to `"KD-0001"`); Typst inputs `titel`, `nummer`, `datum`, `leistungsdatum`, `leistung_beschriftung`, `zahlungsbedingung`, `angebot_gueltig_bis` — all already provided by `pdf.rs`.
- Produces: Typst input key `"kunde_kundennummer"`, read by this same task's template change (no other task depends on it).

- [ ] **Step 1: Write the failing tests**

Add these three tests after `rechnung_enthaelt_den_kopftext` in `src-tauri/src/dokument/pdf.rs`:

```rust
/// `kunde_kundennummer` existiert in `BelegKontext` bereits seit der
/// Kundenverwaltung, wurde aber nie an die Vorlage weitergereicht.
#[test]
fn rechnung_enthaelt_die_kundennummer() {
    let t = text(&test_kontext());
    assert!(t.contains("KD-0001"), "Kundennummer fehlt:\n{t}");
}

#[test]
fn kopf_zeigt_rechnungsnummer_kundennummer_und_datum_als_tabelle() {
    let t = text(&test_kontext());
    assert!(t.contains("Rechnungsnummer:"), "Label fehlt:\n{t}");
    assert!(t.contains("Kundennummer:"), "Label fehlt:\n{t}");
}

#[test]
fn kopf_nennt_ein_angebot_angebotsnummer_statt_rechnungsnummer() {
    let mut kontext = test_kontext();
    kontext.beleg.typ = "angebot".into();
    let t = text(&kontext);
    assert!(t.contains("Angebotsnummer:"), "Label fehlt:\n{t}");
    assert!(!t.contains("Rechnungsnummer:"), "falsches Label für ein Angebot:\n{t}");
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml rechnung_enthaelt_die_kundennummer kopf_zeigt_rechnungsnummer kopf_nennt_ein_angebot`
Expected: all three FAIL (the input isn't exposed yet, and no such labels exist yet)

- [ ] **Step 3: Add the Rust-side input**

In `src-tauri/src/dokument/pdf.rs`, in `dokument_bauen`'s `felder` vec, add a line right after `("kunde_ansprechpartner", kontext.kunde_ansprechpartner.clone()),`:

```rust
        ("kunde_ansprechpartner", kontext.kunde_ansprechpartner.clone()),
        ("kunde_kundennummer", kontext.kunde_kundennummer.clone()),
```

(Running the tests now still fails: the input exists but nothing reads it yet — that happens in Steps 4-5 below.)

- [ ] **Step 4: Rewrite the heading**

In `src-tauri/templates/rechnung.typ`, change:

```typst
= #sys.inputs.titel #sys.inputs.nummer

Datum: #sys.inputs.datum

// Eine Zahlungserinnerung teilt Briefkopf, Anschriftfeld und Bankverbindung
```

to:

```typst
= #sys.inputs.titel

// Eine Zahlungserinnerung teilt Briefkopf, Anschriftfeld und Bankverbindung
```

- [ ] **Step 5: Replace the loose Datum/Leistungsdatum lines with a table**

Still in `src-tauri/templates/rechnung.typ`, in the `else` branch (the non-Erinnerung path), change:

```typst
] else [
  \ #sys.inputs.leistung_beschriftung: #sys.inputs.leistungsdatum
  #if ist_gesetzt(sys.inputs.zahlungsbedingung) [
    \ #sys.inputs.zahlungsbedingung
  ]
  // Umgekehrt: eine Gültigkeit ist eine Angebotssache. Der Fußtext
  // versprach bisher eine Frist ("Dieses Angebot ist 30 Tage gültig"),
  // ohne dass ein Datum dazu auf dem Beleg stand.
  #if ist_gesetzt(sys.inputs.angebot_gueltig_bis) [
    \ Gültig bis: #sys.inputs.angebot_gueltig_bis
  ]
```

to:

```typst
] else [
  #let nummer_label = if sys.inputs.titel == "Angebot" { "Angebotsnummer:" } else { "Rechnungsnummer:" }
  #let leistung_label = sys.inputs.leistung_beschriftung + ":"
  #table(
    columns: (auto, 1fr),
    align: (left, right),
    stroke: none,
    inset: (y: 2pt),
    [#nummer_label], [#sys.inputs.nummer],
    [Kundennummer:], [#sys.inputs.kunde_kundennummer],
    [Datum:], [#sys.inputs.datum],
    [#leistung_label], [#sys.inputs.leistungsdatum],
  )

  #if ist_gesetzt(sys.inputs.zahlungsbedingung) [
    #sys.inputs.zahlungsbedingung
  ]
  // Umgekehrt: eine Gültigkeit ist eine Angebotssache. Der Fußtext
  // versprach bisher eine Frist ("Dieses Angebot ist 30 Tage gültig"),
  // ohne dass ein Datum dazu auf dem Beleg stand.
  #if ist_gesetzt(sys.inputs.angebot_gueltig_bis) [
    Gültig bis: #sys.inputs.angebot_gueltig_bis
  ]
```

(Note: the leading `\ ` line-break markers on the `zahlungsbedingung` and `angebot_gueltig_bis` lines are dropped — they only ever chained onto the removed Datum/Leistungsdatum line, and `zahlungsbedingung` is always empty exactly when `angebot_gueltig_bis` might be set, so the two never render together.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml rechnung_enthaelt_die_kundennummer kopf_zeigt_rechnungsnummer kopf_nennt_ein_angebot`
Expected: all three PASS

- [ ] **Step 7: Run the full backend test suite**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all pass. In particular check `rechnung_enthaelt_die_pflichtangaben_nach_paragraf_14_ustg`, `leistungszeitraum_wird_als_spanne_ausgewiesen`, `ohne_zeitraum_bleibt_es_beim_einzeldatum`, `eine_korrektur_verweist_auf_die_ursprungsrechnung`, `zahlungserinnerung_*`, and the two geometry tests (`firma_anschrift_steht_bei_logo_rechts_daneben_nicht_am_linken_rand`, `gesamtsumme_steht_exakt_unter_der_positionssumme`) — none of these depend on the removed heading/loose-line text, only on label/value text that still exists (now in the table).

- [ ] **Step 8: Commit**

```bash
git add src-tauri/templates/rechnung.typ src-tauri/src/dokument/pdf.rs
git commit -m "feat: Rechnungsnummer, Kundennummer und Datum als Kopf-Tabelle (inkl. Kundennummer-Eingabe)

Standen bisher als lose Textzeilen untereinander. Enthält zugleich die bisher
ungenutzte kunde_kundennummer als neue Typst-Eingabe. Nach dem Vorbild einer
echten Handwerker-Rechnung jetzt eine klare zweispaltige Tabelle, wie es
die bestehende Zahlungserinnerungs-Tabelle schon vormacht."
```

---

### Task 3: Fester Geschäfts-Fuß auf jeder Seite (Bankverbindung-Einstellung entfällt)

This task removes the `vorlage.bankverbindung` setting entirely (its two positions, "am Fuß" and "direkt unter der Summe", are replaced by a single fixed footer) and moves Bankverbindung/Kontaktzeilen/Steuerangaben from one-time body content into a `#set page(footer: ...)` block that repeats on every page. These two changes are interdependent (the template must stop reading `sys.inputs.v_bankverbindung` in the same commit that Rust stops sending it) and must ship together.

**Files:**
- Modify: `src-tauri/src/dokument/vorlage.rs` (remove `BankPosition` + `bankverbindung` field; bump `rand_unten_mm` minimum)
- Modify: `src-tauri/templates/rechnung.typ` (move footer content to top-of-file `#let`s + rewrite `#set page(footer: ...)`; simplify the tail)
- Modify: `src-tauri/src/dokument/pdf.rs` (remove the `BankPosition`-based test assertion)
- Modify: `src/components/Belegvorlage.tsx` (remove the `vorlage.bankverbindung` schalter; raise the "Rand unten" `min` to match)
- Test: `src-tauri/src/dokument/vorlage.rs`, `src-tauri/src/dokument/pdf.rs`

**Interfaces:**
- Consumes: `sys.inputs.firma_name/strasse/plz/ort/telefon/fax/email/steuernummer/ust_idnr/iban/bic` — already provided to both `rendern()` and `rendern_zahlungserinnerung()` in `pdf.rs` (verified: both felder lists already include all of these).
- Produces: nothing new — this is a pure relocation. No Rust-side interface changes beyond removing `v_bankverbindung`.

- [ ] **Step 1: Write the failing test proving the footer repeats on every page**

Add this test in `src-tauri/src/dokument/pdf.rs`, right after `lange_rechnung_bekommt_seitenzahlen_und_wiederholten_tabellenkopf`:

```rust
/// Vorher stand die Bankverbindung als einmaliger Fließtext irgendwo im
/// Dokument — auf einer mehrseitigen Rechnung erschien sie nur auf der
/// Seite, auf die sie zufällig fiel. Jetzt ist sie Teil des Seiten-Fußes.
#[test]
fn geschaeftsfuss_wiederholt_sich_auf_jeder_seite() {
    let mut kontext = test_kontext();
    let vorlage_pos = kontext.positionen[0].clone();
    kontext.positionen = (0..60)
        .map(|i| Belegposition { id: format!("p{i}"), bezeichnung: format!("Leistung {i}"), ..vorlage_pos.clone() })
        .collect();
    let t = text(&kontext);
    let treffer = t.matches("DE02 1203 0000 0000 2020 51").count();
    assert!(treffer > 1, "Bankverbindung erscheint nicht auf jeder Seite (gefunden: {treffer}x)");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml geschaeftsfuss_wiederholt_sich_auf_jeder_seite`
Expected: FAIL — `treffer` is `1` (appears once, wherever the old one-time paragraph happened to land)

- [ ] **Step 3: Remove `BankPosition` and the `bankverbindung` field from `vorlage.rs`**

In `src-tauri/src/dokument/vorlage.rs`, remove this whole block (the enum, currently right before the `Vorlage` struct):

```rust
/// Wo die Bankverbindung steht.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BankPosition {
    /// Am Fuß, hinter dem Fußtext — die bisherige Anordnung.
    Fuss,
    /// Unmittelbar unter der Gesamtsumme, wo der Blick nach dem Betrag hinfällt.
    NachSumme,
}
```

In the `Vorlage` struct, remove the line `pub bankverbindung: BankPosition,` (between `pub tabelle_gitterlinien: bool,` and `pub rand_oben_mm: f64,`).

In `impl Default for Vorlage`, remove the line `bankverbindung: BankPosition::Fuss,`.

In `Vorlage::aus_paaren`, remove this block (between the `tabelle_gitterlinien` assignment and the `rand_oben_mm` comment), and change the `rand_unten_mm` bound from `15.0` to `25.0` (equal to the current default — the footer went from an optional single "Seite X von Y" line to a mandatory three-column business block, and there is no PDF-rendering tool in this environment to visually confirm a smaller margin still fits, so the safe floor is "at least what already works today"):

```rust
            bankverbindung: match hole("vorlage.bankverbindung").as_deref() {
                Some("nach_summe") => BankPosition::NachSumme,
                _ => BankPosition::Fuss,
            },
```

```rust
            rand_unten_mm: mm(hole("vorlage.rand_unten_mm"), standard.rand_unten_mm, 15.0, 40.0),
```
becomes
```rust
            rand_unten_mm: mm(hole("vorlage.rand_unten_mm"), standard.rand_unten_mm, 25.0, 40.0),
```

In `Vorlage::als_eingaben`, remove this tuple (between the `v_tabelle_gitterlinien` entry and the `v_rand_oben_mm` entry):

```rust
            (
                "v_bankverbindung",
                match self.bankverbindung {
                    BankPosition::Fuss => "fuss".into(),
                    BankPosition::NachSumme => "nach_summe".into(),
                },
            ),
```

- [ ] **Step 4: Fix the now-broken `vorlage.rs` tests**

In `gespeicherte_einstellungen_wirken`, remove the tuple `("vorlage.bankverbindung", "nach_summe"),` from the `for` loop's array, and remove the line `assert_eq!(v.bankverbindung, BankPosition::NachSumme);`.

Add this new test proving the raised `rand_unten_mm` minimum, right after `gespeicherte_einstellungen_wirken`:

```rust
#[tokio::test]
async fn rand_unten_hat_platz_fuer_den_geschaeftsfuss() {
    // Ein zu geringer unterer Rand ließe keinen Platz für den dreispaltigen
    // Geschäftsfuß — daher jetzt mindestens 25 statt bisher 15 mm, gleich
    // dem bisherigen Standardwert: Niemand kann mehr unter das gehen, was
    // heute schon funktioniert.
    let dir = tempfile::tempdir().unwrap();
    let pool = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
    crate::commands::einstellungen::set(&pool, "vorlage.rand_unten_mm".into(), "5".into()).await.unwrap();
    let v = Vorlage::laden(&pool).await.unwrap();
    assert_eq!(v.rand_unten_mm, 25.0);
}
```

- [ ] **Step 5: Fix the now-broken `pdf.rs` test**

In `src-tauri/src/dokument/pdf.rs`, in `einstellungen_wirken_auf_den_beleg`, change:

```rust
    fn einstellungen_wirken_auf_den_beleg() {
        use crate::dokument::vorlage::{BankPosition, Vorlage};
```

to:

```rust
    fn einstellungen_wirken_auf_den_beleg() {
        use crate::dokument::vorlage::Vorlage;
```

and remove this trailing block from the same test (the last part of its body):

```rust
        // Die Bankverbindung wandert, verschwindet aber nicht.
        let nach_summe = Vorlage { bankverbindung: BankPosition::NachSumme, ..Default::default() };
        let t3 = pdf_extract::extract_text_from_mem(
            &rendern(&test_kontext(), None, &nach_summe).unwrap()).unwrap();
        assert!(t3.contains("Bankverbindung"), "Bankverbindung fehlt:\n{t3}");
    }
```

(the closing `}` of the function now comes right after the `Einheitenspalte fehlt` assertion)

- [ ] **Step 6: Move the footer content to the top of `rechnung.typ` and rewrite `#set page`**

In `src-tauri/templates/rechnung.typ`, change the top of the file from:

```typst
#set text(font: "Inter", size: 10pt)

#let ist_gesetzt(wert) = wert != none and wert != ""
#let ja(wert) = wert == "ja"

// Einstellbares aus `dokument::vorlage`. Die Vorgaben dort bilden das
// ursprüngliche Aussehen ab; hier steht nur, wie die Werte wirken.
#let mass(name) = float(name) * 1mm
#let rand_oben = mass(sys.inputs.v_rand_oben_mm)
#let rand_unten = mass(sys.inputs.v_rand_unten_mm)
#let rand_seitlich = mass(sys.inputs.v_rand_seitlich_mm)
#let akzent = rgb(sys.inputs.v_akzentfarbe)

// Fußzeile mit Seitenzahl: Bei einer mehrseitigen Rechnung muss der Empfänger
// erkennen können, ob das Dokument vollständig ist. Sie erscheint erst ab
// Seite 2 — auf einer einseitigen Rechnung wäre "Seite 1 von 1" nur Ballast.
#set page(
  margin: (top: rand_oben, bottom: rand_unten, x: rand_seitlich),
  footer: context {
    let seiten = counter(page).final().first()
    if seiten > 1 {
      align(center, text(size: 8pt, fill: rgb("#666666"))[
        #sys.inputs.titel #sys.inputs.nummer — Seite #counter(page).display() von #seiten
      ])
    }
  },
)

#set heading(numbering: none)
#show heading: it => text(fill: akzent, it)
```

to:

```typst
#set text(font: "Inter", size: 10pt)

#let ist_gesetzt(wert) = wert != none and wert != ""
#let ja(wert) = wert == "ja"

// Einstellbares aus `dokument::vorlage`. Die Vorgaben dort bilden das
// ursprüngliche Aussehen ab; hier steht nur, wie die Werte wirken.
#let mass(name) = float(name) * 1mm
#let rand_oben = mass(sys.inputs.v_rand_oben_mm)
#let rand_unten = mass(sys.inputs.v_rand_unten_mm)
#let rand_seitlich = mass(sys.inputs.v_rand_seitlich_mm)
#let akzent = rgb(sys.inputs.v_akzentfarbe)

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
  #if kontaktzeilen.len() > 0 [
    \ #kontaktzeilen.join(" · ")
  ]
]

// Pflichtangabe nach § 14 Abs. 4 Nr. 2 UStG: Steuernummer oder USt-IdNr. des
// Ausstellers. Ohne sie ist die Rechnung formell fehlerhaft und der
// Empfänger kann sie zurückweisen.
#let steuerangaben = [
  #if ist_gesetzt(sys.inputs.firma_steuernummer) [
    Steuernummer: #sys.inputs.firma_steuernummer
  ]
  #if ist_gesetzt(sys.inputs.firma_steuernummer) and ist_gesetzt(sys.inputs.firma_ust_idnr) [
    #linebreak()
  ]
  #if ist_gesetzt(sys.inputs.firma_ust_idnr) [
    USt-IdNr.: #sys.inputs.firma_ust_idnr
  ]
]

// Fester Geschäfts-Fuß auf jeder Seite: Anschrift/Kontakt, Steuerangaben und
// Bankverbindung nebeneinander — statt bisher als loser Fließtext nach der
// Positionstabelle, an unterschiedlichen, einstellbaren Stellen. Die
// Seitenzahl ("Seite X von Y") bleibt zusätzlich, nur bei mehr als einer
// Seite — auf einer einseitigen Rechnung wäre sie nur Ballast.
#set page(
  margin: (top: rand_oben, bottom: rand_unten, x: rand_seitlich),
  footer: context {
    let seiten = counter(page).final().first()
    text(size: 8pt)[
      #grid(
        columns: (1fr, 1fr, 1fr),
        column-gutter: 12pt,
        anschrift_und_kontakt, steuerangaben, bankverbindung,
      )
      #if seiten > 1 [
        #v(0.15cm)
        #align(center, text(fill: rgb("#666666"))[
          #sys.inputs.titel #sys.inputs.nummer — Seite #counter(page).display() von #seiten
        ])
      ]
    ]
  },
)

#set heading(numbering: none)
#show heading: it => text(fill: akzent, it)
```

- [ ] **Step 7: Simplify the tail of `rechnung.typ`**

Near the end of the file, replace this whole block:

```typst
// Bankverbindung: gesetzlich nicht vorgeschrieben, aber ohne sie kann der
// Empfänger nicht zahlen — bei einer Erinnerung erst recht wichtig.
#let bankverbindung = if ist_gesetzt(sys.inputs.firma_iban) [
  #v(0.5cm)
  #text(size: 9pt)[
    *Bankverbindung* \
    IBAN: #sys.inputs.firma_iban
    #if ist_gesetzt(sys.inputs.firma_bic) [
      \ BIC: #sys.inputs.firma_bic
    ]
  ]
] else { none }

#if sys.inputs.v_bankverbindung == "nach_summe" and bankverbindung != none [
  #bankverbindung
]

#if not ist_erinnerung and ist_gesetzt(sys.inputs.fusstext) [
  #v(0.5cm)
  #sys.inputs.fusstext
]

#if sys.inputs.v_bankverbindung != "nach_summe" and bankverbindung != none [
  #bankverbindung
]

// Kontaktangaben: gesetzlich nicht vorgeschrieben, anders als die
// Steuernummer/USt-IdNr. unten — nur was gepflegt ist, erscheint auch.
// Absichtlich nicht im Kopf neben Logo und Anschrift: Der bleibt bewusst
// knapp, wie ein DIN-5008-Briefkopf es vorsieht.
#let kontaktzeilen = (
  if ist_gesetzt(sys.inputs.firma_telefon) { "Telefon: " + sys.inputs.firma_telefon },
  if ist_gesetzt(sys.inputs.firma_fax) { "Fax: " + sys.inputs.firma_fax },
  if ist_gesetzt(sys.inputs.firma_email) { "E-Mail: " + sys.inputs.firma_email },
).filter(z => z != none)

#if kontaktzeilen.len() > 0 [
  #v(0.3cm)
  #text(size: 9pt)[#kontaktzeilen.join(" · ")]
]

// Pflichtangabe nach § 14 Abs. 4 Nr. 2 UStG: Steuernummer oder USt-IdNr. des
// Ausstellers. Ohne sie ist die Rechnung formell fehlerhaft und der Empfänger
// kann sie zurückweisen.
#v(0.5cm)
#text(size: 9pt)[
  #if ist_gesetzt(sys.inputs.firma_steuernummer) [
    Steuernummer: #sys.inputs.firma_steuernummer
  ]
  #if ist_gesetzt(sys.inputs.firma_steuernummer) and ist_gesetzt(sys.inputs.firma_ust_idnr) [
    #linebreak()
  ]
  #if ist_gesetzt(sys.inputs.firma_ust_idnr) [
    USt-IdNr.: #sys.inputs.firma_ust_idnr
  ]
]
```

with just:

```typst
#if not ist_erinnerung and ist_gesetzt(sys.inputs.fusstext) [
  #v(0.5cm)
  #sys.inputs.fusstext
]
```

- [ ] **Step 8: Run all the new/changed tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml geschaeftsfuss_wiederholt_sich_auf_jeder_seite rand_unten_hat_platz_fuer_den_geschaeftsfuss gespeicherte_einstellungen_wirken einstellungen_wirken_auf_den_beleg`
Expected: all PASS

- [ ] **Step 9: Run the full backend test suite**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all pass, including `rechnung_enthaelt_die_bankverbindung`, `rechnung_enthaelt_telefon_fax_und_email`, `zahlungserinnerung_nennt_die_bankverbindung`, `zahlungserinnerung_enthaelt_telefon_fax_und_email`, `einseitige_rechnung_hat_keine_seitenzahl` (all content still present, just relocated) and both geometry tests (unaffected — one filters `y < 40mm`, the other only needs `treffer >= 2` which the identical Positionssumme/Gesamt pair alone already guarantees).

- [ ] **Step 10: Remove the frontend setting and match the raised minimum**

In `src/components/Belegvorlage.tsx`, remove this entry from the `SCHALTER` array:

```typescript
  {
    schluessel: "vorlage.bankverbindung",
    label: "Bankverbindung",
    art: "auswahl",
    optionen: [
      ["fuss", "Am Fuß, hinter dem Fußtext"],
      ["nach_summe", "Direkt unter der Gesamtsumme"],
    ],
  },
```

In the same file, update the "Rand unten" entry's `min` from `15` to `25`, matching the raised backend bound from Step 3 — otherwise the number input would still invite a value the backend silently overrides, with no visible feedback:

```typescript
  { schluessel: "vorlage.rand_unten_mm", label: "Rand unten", art: "zahl", einheit: "mm", min: 15, max: 40 },
```
becomes
```typescript
  { schluessel: "vorlage.rand_unten_mm", label: "Rand unten", art: "zahl", einheit: "mm", min: 25, max: 40 },
```

- [ ] **Step 11: Run the frontend test suite**

Run: `npm test -- --run src/components/Belegvorlage.test.tsx`
Expected: all pass (no existing test asserts on the "Bankverbindung" label directly — verified by inspection)

- [ ] **Step 12: Commit**

```bash
git add src-tauri/src/dokument/vorlage.rs src-tauri/src/dokument/pdf.rs src-tauri/templates/rechnung.typ src/components/Belegvorlage.tsx
git commit -m "feat: fester dreispaltiger Geschäfts-Fuß statt einstellbarer Bankverbindungs-Position

Anschrift/Kontakt, Steuerangaben und Bankverbindung standen bisher als
loser Fließtext nach der Positionstabelle, wahlweise an zwei einstellbaren
Stellen — und erschienen auf einer mehrseitigen Rechnung nur auf der
Seite, auf die sie zufällig fielen. Jetzt ein fester, dreispaltiger Fuß
auf jeder Seite, nach dem Vorbild einer echten Handwerker-Rechnung. Die
Einstellung 'Bankverbindung: am Fuß / direkt unter der Summe' entfällt
damit ersatzlos."
```

---

## Part B — Girocode (SEPA-QR, EPC069-12)

### Task 4: `domain/girocode.rs` — Payload und Matrix

**Files:**
- Create: `src-tauri/src/domain/girocode.rs`
- Modify: `src-tauri/src/domain/mod.rs` (register the module)
- Modify: `src-tauri/Cargo.toml` (add the `qrcode` dependency)

**Interfaces:**
- Produces: `pub fn epc_payload(name: &str, iban: &str, bic: &str, betrag_cent: Option<i64>, verwendungszweck: &str) -> String` and `pub fn qr_matrix(payload: &str) -> AppResult<Vec<Vec<bool>>>`, both consumed by Task 6.

- [ ] **Step 1: Add the dependency**

In `src-tauri/Cargo.toml`, add this line at the end of the `[dependencies]` section (after `zip = ...`):

```toml
# Für den optionalen SEPA-Girocode auf Rechnungen. Ohne image/svg-Feature —
# nur die Modul-Matrix wird gebraucht, Typst zeichnet sie als Vektor-Rechtecke.
qrcode = { version = "0.14", default-features = false }
```

- [ ] **Step 2: Register the module**

In `src-tauri/src/domain/mod.rs`, add `pub mod girocode;` (alphabetically, between `pub mod bankverbindung;` and `pub mod nummernkreis;`... actually insert it right before `pub mod nummernkreis;` since `girocode` sorts between `bankverbindung`/`beleg` and `nummernkreis`):

```rust
pub mod bankverbindung;
pub mod beleg;
pub mod girocode;
pub mod nummernkreis;
pub mod preisfindung;
pub mod steuer;
pub mod umsatz;
```

- [ ] **Step 3: Write the failing tests**

Create `src-tauri/src/domain/girocode.rs` with just the doc comment, imports, and this test module (no implementation yet):

```rust
//! Erzeugt die SEPA-Girocode-Zahlungsaufforderung (EPC069-12) für Rechnungen.
//!
//! Baut dieselbe elfzeilige Nutzlast wie der eigene HTML-Prototyp
//! (`qr-code-generator/generator.html`), damit ein bereits geprüftes Format
//! übernommen wird statt eines zweiten, unabhängig entstandenen. Die Matrix
//! selbst zeichnet nicht dieses Modul, sondern die Typst-Vorlage — hier
//! entsteht nur die Rohdaten-Grundlage (Boolean-Gitter), im selben Stil wie
//! `domain::steuer` Zahlen liefert und `dokument::pdf` sie rendert.

use crate::error::{AppError, AppResult};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn epc_payload_baut_die_elf_zeilen_der_epc069_12_nutzlast() {
        // Dieselben Beispieldaten wie der "Beispieldaten laden"-Knopf im
        // HTML-Prototyp (qr-code-generator/generator.html).
        let payload = epc_payload("Max Mustermann", "DE89370400440532013000", "", Some(2550), "Mitgliedsbeitrag");
        assert_eq!(
            payload,
            "BCD\n002\n1\nSCT\n\nMax Mustermann\nDE89370400440532013000\nEUR25.50\n\n\nMitgliedsbeitrag"
        );
    }

    #[test]
    fn epc_payload_laesst_den_betrag_leer_wenn_nicht_gesetzt() {
        let payload = epc_payload("Max Mustermann", "DE89370400440532013000", "", None, "");
        let zeilen: Vec<&str> = payload.split('\n').collect();
        assert_eq!(zeilen.len(), 11);
        assert_eq!(zeilen[7], "", "Betragszeile sollte leer sein");
    }

    #[test]
    fn epc_payload_traegt_die_bic_wenn_gesetzt() {
        let payload = epc_payload("Meine Firma", "DE02120300000000202051", "BYLADEM1001", Some(9500), "");
        let zeilen: Vec<&str> = payload.split('\n').collect();
        assert_eq!(zeilen[4], "BYLADEM1001");
    }

    #[test]
    fn epc_payload_kappt_einen_zu_langen_namen_auf_70_zeichen() {
        let langer_name = "A".repeat(100);
        let payload = epc_payload(&langer_name, "DE89370400440532013000", "", None, "");
        let zeilen: Vec<&str> = payload.split('\n').collect();
        assert_eq!(zeilen[5].chars().count(), 70);
    }

    #[test]
    fn epc_payload_kappt_einen_zu_langen_verwendungszweck_auf_140_zeichen() {
        let langer_zweck = "B".repeat(200);
        let payload = epc_payload("Meine Firma", "DE89370400440532013000", "", None, &langer_zweck);
        let zeilen: Vec<&str> = payload.split('\n').collect();
        assert_eq!(zeilen[10].chars().count(), 140);
    }

    #[test]
    fn epc_payload_kappt_umlaute_ohne_an_einer_zeichengrenze_abzustuerzen() {
        // "ü" ist im UTF-8 zwei Bytes breit — ein Kappen nach Byteanzahl
        // stürzte hier mitten im Zeichen ab.
        let name = "ü".repeat(71);
        let payload = epc_payload(&name, "DE89370400440532013000", "", None, "");
        let zeilen: Vec<&str> = payload.split('\n').collect();
        assert_eq!(zeilen[5].chars().count(), 70);
    }

    #[test]
    fn qr_matrix_erzeugt_ein_quadratisches_gitter_aus_mindestens_21_zeilen() {
        let matrix = qr_matrix("BCD\n002\n1\nSCT\n\nTest\nDE89370400440532013000\nEUR25.50\n\n\n").unwrap();
        assert!(matrix.len() >= 21, "QR-Version 1 hat mindestens 21 Module Breite");
        for zeile in &matrix {
            assert_eq!(zeile.len(), matrix.len(), "Gitter ist nicht quadratisch");
        }
        assert!(matrix.iter().flatten().any(|&dunkel| dunkel), "Gitter ist komplett leer");
    }

    #[test]
    fn qr_matrix_ist_fuer_dieselbe_eingabe_deterministisch() {
        let a = qr_matrix("BCD\n002\n1\nSCT\n\nTest\nDE89370400440532013000\n\n\n\n").unwrap();
        let b = qr_matrix("BCD\n002\n1\nSCT\n\nTest\nDE89370400440532013000\n\n\n\n").unwrap();
        assert_eq!(a, b);
    }

    /// Rundtrip statt Scanner: Da kein QR-Lesegerät in der CI verfügbar ist,
    /// beweist dieser Test die Struktur der Nutzlast, indem er sie wieder in
    /// ihre Felder zerlegt — genau wie eine Bank-App es täte.
    #[test]
    fn epc_payload_laesst_sich_wieder_in_seine_felder_zerlegen() {
        let payload = epc_payload("Meine Firma", "DE02120300000000202051", "BYLADEM1001", Some(9500), "Rechnung RE-2026-0001");
        let zeilen: Vec<&str> = payload.split('\n').collect();
        assert_eq!(zeilen[0], "BCD");
        assert_eq!(zeilen[1], "002");
        assert_eq!(zeilen[2], "1");
        assert_eq!(zeilen[3], "SCT");
        assert_eq!(zeilen[4], "BYLADEM1001");
        assert_eq!(zeilen[5], "Meine Firma");
        assert_eq!(zeilen[6], "DE02120300000000202051");
        assert_eq!(zeilen[7], "EUR95.00");
        assert_eq!(zeilen[8], "");
        assert_eq!(zeilen[9], "");
        assert_eq!(zeilen[10], "Rechnung RE-2026-0001");
    }
}
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml domain::girocode`
Expected: compile FAIL — `epc_payload`/`qr_matrix` not found

- [ ] **Step 5: Implement the functions**

Add this above the `#[cfg(test)]` module in `src-tauri/src/domain/girocode.rs`:

```rust
/// Kürzt auf eine Zeichenanzahl (nicht Byteanzahl — Namen mit Umlauten dürfen
/// nicht mitten in einem UTF-8-Zeichen abgeschnitten werden).
fn kappe(text: &str, max_zeichen: usize) -> String {
    text.chars().take(max_zeichen).collect()
}

/// Baut die EPC069-12-Nutzlast ("BCD"-Format) für einen SEPA-Girocode.
///
/// `betrag_cent` bleibt leer (kein Betrag im Code), wenn `None` — ein Girocode
/// ohne Betrag lässt den Zahlenden selbst eintragen. `betrag_cent` muss, wenn
/// gesetzt, nicht-negativ sein; das stellt der Aufrufer sicher (ein Girocode
/// über einen negativen Betrag ergäbe keinen gültigen Zahlungsauftrag).
pub fn epc_payload(name: &str, iban: &str, bic: &str, betrag_cent: Option<i64>, verwendungszweck: &str) -> String {
    debug_assert!(betrag_cent.map_or(true, |c| c >= 0), "Girocode-Betrag darf nicht negativ sein");
    let betrag = betrag_cent
        .map(|cent| format!("EUR{}.{:02}", cent / 100, cent % 100))
        .unwrap_or_default();
    [
        "BCD",
        "002",
        "1",
        "SCT",
        bic,
        &kappe(name, 70),
        iban,
        &betrag,
        "",
        "",
        &kappe(verwendungszweck, 140),
    ]
    .join("\n")
}

/// Wandelt die EPC-Nutzlast in eine quadratische Hell/Dunkel-Matrix. Typst
/// zeichnet daraus Vektor-Rechtecke — es entsteht keine Bilddatei, anders als
/// beim Logo.
pub fn qr_matrix(payload: &str) -> AppResult<Vec<Vec<bool>>> {
    let code = qrcode::QrCode::new(payload.as_bytes())
        .map_err(|e| AppError::Technisch(format!("QR-Code konnte nicht erzeugt werden: {e}")))?;
    let breite = code.width();
    let farben = code.to_colors();
    Ok(farben
        .chunks(breite)
        .map(|zeile| zeile.iter().map(|f| *f == qrcode::Color::Dark).collect())
        .collect())
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml domain::girocode`
Expected: all PASS

- [ ] **Step 7: Run clippy**

Run: `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
Expected: no warnings

- [ ] **Step 8: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/domain/mod.rs src-tauri/src/domain/girocode.rs
git commit -m "feat: EPC069-12-Nutzlast und QR-Matrix für den Girocode

Baut dieselbe elfzeilige Nutzlast wie der eigene HTML-Prototyp
(qr-code-generator/generator.html). Reine Domänenlogik, noch nicht an
Belege angebunden (folgt in den nächsten Commits)."
```

---

### Task 5: Einstellung „Girocode anzeigen" (Default: an)

**Files:**
- Modify: `src-tauri/src/dokument/vorlage.rs` (`Vorlage` struct, `Default`, `aus_paaren`, `als_eingaben`, tests)
- Modify: `src/components/Belegvorlage.tsx` (new schalter)
- Test: `src-tauri/src/dokument/vorlage.rs`, `src/components/Belegvorlage.test.tsx`

**Interfaces:**
- Produces: `Vorlage.zeigt_girocode: bool` and Typst input `v_zeigt_girocode`, consumed by Task 6.

- [ ] **Step 1: Write the failing tests**

In `src-tauri/src/dokument/vorlage.rs`, add this test after `gespeicherte_einstellungen_wirken`:

```rust
#[tokio::test]
async fn ohne_einstellung_ist_der_girocode_aktiv() {
    // Bewusste Ausnahme vom sonstigen "neue Einstellungen ändern nichts am
    // bisherigen Aussehen"-Prinzip — ausdrücklicher Nutzerwunsch.
    let dir = tempfile::tempdir().unwrap();
    let pool = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
    let v = Vorlage::laden(&pool).await.unwrap();
    assert!(v.zeigt_girocode);
}
```

In `gespeicherte_einstellungen_wirken`, add `("vorlage.zeigt_girocode", "nein"),` to the `for` loop's array and `assert!(!v.zeigt_girocode);` to the assertions.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml ohne_einstellung_ist_der_girocode_aktiv gespeicherte_einstellungen_wirken`
Expected: compile FAIL — no field `zeigt_girocode`

- [ ] **Step 3: Add the field**

In `src-tauri/src/dokument/vorlage.rs`, add to the `Vorlage` struct (after `pub tabelle_gitterlinien: bool,` and its doc comment, where `bankverbindung` used to be):

```rust
    /// Ob ein SEPA-Girocode (QR-Zahlungscode) auf Rechnung und
    /// Zahlungserinnerung erscheint. Anders als die übrigen Einstellungen
    /// hier standardmäßig aktiv — ausdrücklicher Nutzerwunsch, kein
    /// Bewahren des bisherigen Aussehens.
    pub zeigt_girocode: bool,
```

In `impl Default for Vorlage`, add `zeigt_girocode: true,` (where `bankverbindung: BankPosition::Fuss,` used to be).

In `Vorlage::aus_paaren`, add (where the removed `bankverbindung` match used to be):

```rust
            zeigt_girocode: ja(hole("vorlage.zeigt_girocode"), standard.zeigt_girocode),
```

In `Vorlage::als_eingaben`, add (where the removed `v_bankverbindung` tuple used to be):

```rust
            ("v_zeigt_girocode", ja_nein(self.zeigt_girocode)),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml ohne_einstellung_ist_der_girocode_aktiv gespeicherte_einstellungen_wirken`
Expected: both PASS

- [ ] **Step 5: Add the frontend schalter**

In `src/components/Belegvorlage.tsx`, add to the `SCHALTER` array (where the removed `vorlage.bankverbindung` entry used to be):

```typescript
  {
    schluessel: "vorlage.zeigt_girocode",
    label: "Girocode (QR-Zahlungscode) auf Rechnungen anzeigen",
    hinweis:
      "Ermöglicht dem Empfänger, per Smartphone-Kamera zu bezahlen, ohne IBAN abzutippen. " +
      "Erscheint nur auf Rechnungen und Zahlungserinnerungen, sofern eine IBAN hinterlegt ist.",
    art: "ja_nein",
  },
```

- [ ] **Step 6: Write and run the frontend test**

In `src/components/Belegvorlage.test.tsx`, add this test after `startet mit vollen Gitterlinien abgewählt, wie die Rust-Vorgabe`:

```tsx
  it("startet mit aktivem Girocode, wie die Rust-Vorgabe", async () => {
    render(<Belegvorlage />);
    await waitFor(() => expect(screen.getByLabelText(/Girocode/)).toBeTruthy());
    expect(screen.getByLabelText(/Girocode/)).toBeChecked();
  });
```

Run: `npx tsc --noEmit && npx eslint . && npm test -- --run src/components/Belegvorlage.test.tsx`
Expected: all pass

- [ ] **Step 7: Run the full backend test suite and clippy**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
Expected: all pass, no warnings

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/dokument/vorlage.rs src/components/Belegvorlage.tsx src/components/Belegvorlage.test.tsx
git commit -m "feat: Einstellung für den Girocode, standardmäßig aktiv

Anders als sonst in dieser Anwendung üblich startet diese Einstellung
aktiviert statt das bisherige Aussehen zu bewahren — ausdrücklicher
Nutzerwunsch. Noch ohne Wirkung auf den Beleg (folgt im nächsten Commit)."
```

---

### Task 6: Girocode auf Rechnung und Zahlungserinnerung rendern

**Files:**
- Modify: `src-tauri/src/dokument/pdf.rs` (new private helper `girocode_matrix_json`, wiring in `dokument_bauen` and `rendern_zahlungserinnerung`)
- Modify: `src-tauri/templates/rechnung.typ` (new `girocode_block` + two insertion points)
- Test: `src-tauri/src/dokument/pdf.rs`

**Interfaces:**
- Consumes: `crate::domain::girocode::{epc_payload, qr_matrix}` (Task 4), `crate::domain::bankverbindung::normalisieren` (existing, `src-tauri/src/domain/bankverbindung.rs`), `Vorlage.zeigt_girocode` (Task 5).
- Produces: Typst input `girocode_matrix_json` (a JSON array-of-bool-arrays string, `"[]"` when not applicable).

Eligibility (reasoned beyond the literal spec text, documented in code): the Girocode never appears on a storno (a credit note has a negative or zero amount, which cannot form a valid positive SEPA payment request) — only on a genuine, positive-amount Rechnung, or on a Zahlungserinnerung (whose `offener_betrag_cent` is already guaranteed `> 0` by `dokument/export.rs::pruefe_kann_erinnert_werden` before `rendern_zahlungserinnerung` is ever called).

- [ ] **Step 1: Write the failing tests**

Add these tests in `src-tauri/src/dokument/pdf.rs`, after `rechnung_enthaelt_die_bankverbindung` (or any convenient spot in the test module):

```rust
#[test]
fn rechnung_zeigt_den_girocode_wenn_aktiviert_und_iban_hinterlegt() {
    let t = text(&test_kontext());
    assert!(t.contains("Bezahlen Sie jetzt mit GiroCode"), "Girocode-Block fehlt:\n{t}");
}

#[test]
fn rechnung_zeigt_keinen_girocode_wenn_die_einstellung_deaktiviert_ist() {
    let vorlage = crate::dokument::vorlage::Vorlage { zeigt_girocode: false, ..Default::default() };
    let bytes = rendern(&test_kontext(), None, &vorlage).unwrap();
    let t = pdf_extract::extract_text_from_mem(&bytes).unwrap();
    assert!(!t.contains("GiroCode"), "Girocode trotz deaktivierter Einstellung:\n{t}");
}

#[test]
fn rechnung_zeigt_keinen_girocode_ohne_iban() {
    let mut kontext = test_kontext();
    kontext.firma.iban = "".into();
    let t = text(&kontext);
    assert!(!t.contains("GiroCode"), "Girocode ohne IBAN:\n{t}");
}

#[test]
fn angebot_zeigt_keinen_girocode_auch_wenn_aktiviert() {
    let mut kontext = test_kontext();
    kontext.beleg.typ = "angebot".into();
    let t = text(&kontext);
    assert!(!t.contains("GiroCode"), "Girocode auf einem Angebot:\n{t}");
}

#[test]
fn storno_zeigt_keinen_girocode() {
    let mut kontext = test_kontext();
    kontext.beleg.storno_von_id = Some("b0".into());
    kontext.beleg.summe_cent = -9500;
    let t = text(&kontext);
    assert!(!t.contains("GiroCode"), "Girocode auf einem Storno:\n{t}");
}

#[test]
fn zahlungserinnerung_zeigt_den_girocode() {
    let t = text_erinnerung(&test_kontext(), tag("2026-08-04"), "Text");
    assert!(t.contains("Bezahlen Sie jetzt mit GiroCode"), "Girocode fehlt auf der Erinnerung:\n{t}");
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml girocode`
Expected: the "zeigt den Girocode"/"zeigt_den_girocode" tests FAIL (no such text yet); the "zeigt keinen"/negative tests currently PASS vacuously (no Girocode exists at all yet) — that's fine, they'll stay meaningful once the feature exists.

- [ ] **Step 3: Add the Rust-side helper and wiring**

In `src-tauri/src/dokument/pdf.rs`, add this function right after `kleinunternehmer_flag`:

```rust
/// Baut die Girocode-Matrix als JSON-Array von Bool-Zeilen für die Vorlage —
/// leer, wenn kein Code gezeigt werden soll (Einstellung aus, keine IBAN,
/// oder kein positiver Betrag). Schlägt die Erzeugung technisch fehl (z. B.
/// eine zu lange Nutzlast), wird der Code stillschweigend weggelassen statt
/// den Export abzubrechen — wie beim Logo.
fn girocode_matrix_json(
    vorlage: &crate::dokument::vorlage::Vorlage,
    firma: &crate::commands::firma::Firma,
    betrag_cent: i64,
    verwendungszweck: &str,
) -> String {
    if !vorlage.zeigt_girocode || firma.iban.trim().is_empty() || betrag_cent <= 0 {
        return "[]".to_string();
    }
    let iban = crate::domain::bankverbindung::normalisieren(&firma.iban);
    let payload = crate::domain::girocode::epc_payload(&firma.name, &iban, &firma.bic, Some(betrag_cent), verwendungszweck);
    match crate::domain::girocode::qr_matrix(&payload) {
        Ok(matrix) => serde_json::to_string(&matrix).unwrap_or_else(|_| "[]".to_string()),
        Err(_) => "[]".to_string(),
    }
}
```

In `dokument_bauen`, right before the line `let mut felder: Vec<(&'static str, String)> = vec![`, add:

```rust
    // Nur echte Rechnungen (kein Angebot, kein Storno — ein negativer oder
    // fehlender Betrag ergäbe keinen gültigen Zahlungsauftrag).
    let girocode_json = if kontext.beleg.typ == "rechnung" && kontext.beleg.storno_von_id.is_none() {
        girocode_matrix_json(
            vorlage, &kontext.firma, kontext.beleg.summe_cent,
            &format!("Rechnung {}", kontext.beleg.nummer.clone().unwrap_or_default()),
        )
    } else {
        "[]".to_string()
    };
```

and add `("girocode_matrix_json", girocode_json),` to the `felder` vec, right after the `("steuerzeilen_json", steuerzeilen_json),` line.

In `rendern_zahlungserinnerung`, right before the line `let mut felder: Vec<(&'static str, String)> = vec![`, add:

```rust
    let girocode_json = girocode_matrix_json(
        vorlage, &kontext.firma, kontext.offener_betrag_cent,
        &format!("Rechnung {}", kontext.beleg.nummer.clone().unwrap_or_default()),
    );
```

and add `("girocode_matrix_json", girocode_json),` to that function's `felder` vec, right after `("erinnerung_offener_betrag", cent_format(kontext.offener_betrag_cent)),`.

- [ ] **Step 4: Add the Typst rendering block**

In `src-tauri/templates/rechnung.typ`, add this near the top of the file, right after the `#let ja(wert) = wert == "ja"` line:

```typst
// Girocode (SEPA-QR-Zahlungscode, EPC069-12): Der Empfänger zahlt per
// Smartphone-Kamera, ohne IBAN abzutippen. Rust liefert nur die
// Hell/Dunkel-Matrix (wie die Positionstabelle nur Zahlen liefert) — hier
// entstehen daraus Vektor-Rechtecke, kein Bild.
#let girocode_groesse = 28mm
#let girocode_block(matrix_json) = {
  let reihen = json(bytes(matrix_json))
  if reihen.len() > 0 {
    let n = reihen.len()
    box(stroke: 0.5pt + rgb("#999999"), inset: 8pt)[
      #grid(
        columns: (auto, 1fr),
        column-gutter: 10pt,
        align: horizon,
        block(width: girocode_groesse, height: girocode_groesse)[
          #grid(
            columns: (1fr,) * n,
            rows: (1fr,) * n,
            ..reihen.map(reihe => reihe.map(dunkel => box(
              width: 100%, height: 100%,
              fill: if dunkel { black } else { white },
            ))).flatten()
          )
        ],
        [
          *Bezahlen Sie jetzt mit GiroCode* \
          #text(size: 8pt)[Einfach GiroCode auf dem Smartphone scannen und lästiges Abtippen ersparen.]
        ],
      )
    ]
  }
}
```

Then, in the `else` branch (non-Erinnerung), right after the summary `#table(...)` call that ends with `table.cell(stroke: (top: 0.6pt + akzent, bottom: none))[*#sys.inputs.summe*],\n  )` and before the `#if sys.inputs.kleinunternehmer == "ja" [...]` block, add:

```typst
  #v(0.3cm)
  #girocode_block(sys.inputs.girocode_matrix_json)

```

And in the `if ist_erinnerung [...]` branch, right after its own summary `#table(...)` call (the one with `[*Offener Betrag*]`), add:

```typst
  #v(0.3cm)
  #girocode_block(sys.inputs.girocode_matrix_json)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml girocode`
Expected: all PASS. A Typst syntax error in the block above would surface here as a panic from `rendern(...).unwrap()` with the Typst compiler's error message — if that happens, read the message and adjust the block (e.g. `grid` column/row-count arguments) accordingly; this is normal TDD iteration, not a plan defect.

- [ ] **Step 6: Run the full backend test suite and clippy**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
Expected: all pass, no warnings. Also re-check `einseitige_rechnung_hat_keine_seitenzahl` and the two geometry tests from Task 3 still pass (the Girocode block sits well below the address window and to the right of/below the summary table, so it shouldn't perturb either).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/dokument/pdf.rs src-tauri/templates/rechnung.typ
git commit -m "feat: Girocode auf Rechnung und Zahlungserinnerung anzeigen

Erscheint, wenn die Einstellung aktiv ist (Vorgabe: ja) und eine IBAN
hinterlegt ist — nicht auf Angeboten (noch keine Zahlungspflicht) und
nicht auf Stornos (negativer Betrag ergäbe keinen gültigen
Zahlungsauftrag). Die Modul-Matrix kommt aus domain::girocode, Typst
zeichnet sie als Vektor-Rechtecke."
```

---

## Part C — Einfache Abschlagsrechnung

### Task 7: Gesamt-Auftragswert — Schema, Struct, Validierung

**Files:**
- Create: `src-tauri/migrations/0021_abschlagszahlung.sql`
- Modify: `src-tauri/src/commands/belege.rs` (`Beleg` struct, `BELEG_SPALTEN`, `BelegUpdate` struct, new `pruefe_gesamtauftragswert`, `update()`, three struct-literal sites)
- Modify: `src-tauri/src/dokument/pdf.rs`, `src-tauri/src/dokument/xrechnung.rs`, `src-tauri/src/dokument/vorschau.rs` (add the new field to their `test_kontext`/`muster_beleg` `Beleg` literals)
- Test: `src-tauri/src/commands/belege.rs`

**Interfaces:**
- Produces: `Beleg.gesamtauftragswert_cent: Option<i64>` and `BelegUpdate.gesamtauftragswert_cent: Option<i64>`, consumed by Task 8 (PDF display) and Task 9 (frontend).

- [ ] **Step 1: Write the migration**

Create `src-tauri/migrations/0021_abschlagszahlung.sql`:

```sql
-- Gesamt-Auftragswert für einfache Abschlagsrechnungen: ein rein
-- informativer Hinweis auf dem PDF ("Gesamt-Auftragswert: X € (zzgl.
-- USt)"). Keine Verkettung mehrerer Abschläge, keine automatisch
-- berechnete Schlussrechnung — nur diese eine Zahl. Nullable, weil die
-- meisten Belege keine Teilrechnung eines größeren Auftrags sind.
ALTER TABLE beleg ADD COLUMN gesamtauftragswert_cent INTEGER;
```

- [ ] **Step 2: Write the failing tests**

In `src-tauri/src/commands/belege.rs`, add these tests right after `stellen_lehnt_konkurrierende_doppel_vergabe_ab` (or any convenient spot near the other `update()`-related tests):

```rust
    #[tokio::test]
    async fn gesamtauftragswert_unter_der_summe_wird_abgelehnt() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 100000).await; // 1.000,00 €
        let beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();

        let fehler = update(&pool, BelegUpdate {
            id: beleg.id.clone(), kunde_id: kunde_id.clone(), datum: beleg.datum.clone(),
            leistungsdatum: beleg.leistungsdatum.clone(), leistungsdatum_bis: None, gueltig_bis: None,
            zahlungsziel_tage: 14, kopftext: "".into(), fusstext: "".into(),
            adresse_id: None, ansprechpartner_id: None,
            gesamtauftragswert_cent: Some(50000), // 500,00 € — unter der Summe von 1.000,00 €
        }).await.unwrap_err();
        assert!(matches!(fehler, AppError::Validation { feld, .. } if feld == "gesamtauftragswert_cent"));
    }

    #[tokio::test]
    async fn gesamtauftragswert_ueber_der_summe_wird_gespeichert() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 73500).await; // 735,00 €
        let beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();

        let aktualisiert = update(&pool, BelegUpdate {
            id: beleg.id.clone(), kunde_id: kunde_id.clone(), datum: beleg.datum.clone(),
            leistungsdatum: beleg.leistungsdatum.clone(), leistungsdatum_bis: None, gueltig_bis: None,
            zahlungsziel_tage: 14, kopftext: "".into(), fusstext: "".into(),
            adresse_id: None, ansprechpartner_id: None,
            gesamtauftragswert_cent: Some(147000), // 1.470,00 €
        }).await.unwrap();
        assert_eq!(aktualisiert.gesamtauftragswert_cent, Some(147000));
    }
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml gesamtauftragswert`
Expected: compile FAIL — `BelegUpdate` has no field `gesamtauftragswert_cent`

- [ ] **Step 4: Add the column to `BELEG_SPALTEN` and the `Beleg` struct**

In `src-tauri/src/commands/belege.rs`, change:

```rust
pub(crate) const BELEG_SPALTEN: &str = "id, typ, nummer, status, kunde_id, datum, leistungsdatum, leistungsdatum_bis, gueltig_bis, zahlungsziel_tage, kopftext, fusstext, summe_cent, ursprungsangebot_id, storno_von_id, kunde_snapshot, adresse_id, ansprechpartner_id";
```

to:

```rust
pub(crate) const BELEG_SPALTEN: &str = "id, typ, nummer, status, kunde_id, datum, leistungsdatum, leistungsdatum_bis, gueltig_bis, zahlungsziel_tage, kopftext, fusstext, summe_cent, ursprungsangebot_id, storno_von_id, kunde_snapshot, adresse_id, ansprechpartner_id, gesamtauftragswert_cent";
```

In the `Beleg` struct, add this field after `pub ansprechpartner_id: Option<String>,` (and its `#[sqlx(default)] #[serde(default)]` attributes, matching that field's pattern), before `pub kunde_snapshot_name: Option<String>,`:

```rust
    /// Nur bei Abschlagsrechnungen gepflegt: der Wert des gesamten Auftrags,
    /// von dem dieser Beleg nur einen Teil abrechnet. Rein informativ auf dem
    /// PDF, fließt nicht in Summen oder die XRechnung ein.
    #[sqlx(default)]
    #[serde(default)]
    pub gesamtauftragswert_cent: Option<i64>,
```

- [ ] **Step 5: Add the field to `BelegUpdate` and the validation function**

In the `BelegUpdate` struct, add after `pub ansprechpartner_id: Option<String>,`:

```rust
    /// Gesamtwert des Auftrags, falls dies eine Abschlagsrechnung ist; `None`
    /// heißt: keine Angabe.
    #[serde(default)]
    pub gesamtauftragswert_cent: Option<i64>,
```

Add this new function right after `pruefe_beleg_neu` (before `pub async fn create`):

```rust
/// Ein Gesamt-Auftragswert unter der bereits erfassten Summe ergäbe eine
/// Teilrechnung, die mehr abrechnet, als der Auftrag insgesamt wert ist —
/// ein Zahlendreher, den man besser vor dem Speichern abfängt als hinterher
/// auf dem gedruckten Beleg zu entdecken.
fn pruefe_gesamtauftragswert(gesamtauftragswert_cent: Option<i64>, summe_cent: i64) -> AppResult<()> {
    if let Some(wert) = gesamtauftragswert_cent {
        if wert < summe_cent {
            return Err(AppError::Validation {
                feld: "gesamtauftragswert_cent".into(),
                meldung: "Der Gesamt-Auftragswert darf nicht unter der Rechnungssumme liegen".into(),
            });
        }
    }
    Ok(())
}
```

- [ ] **Step 6: Wire the validation and the UPDATE statement into `update()`**

In `update()`, add `pruefe_gesamtauftragswert(d.gesamtauftragswert_cent, beleg.summe_cent)?;` right after the `pruefe_beleg_neu(...)?;` call.

Change:

```rust
    sqlx::query("UPDATE beleg SET kunde_id=?, datum=?, leistungsdatum=?, leistungsdatum_bis=?, gueltig_bis=?, zahlungsziel_tage=?, kopftext=?, fusstext=?, adresse_id=?, ansprechpartner_id=?, updated_at=? WHERE id=?")
        .bind(&d.kunde_id).bind(&d.datum).bind(&d.leistungsdatum).bind(leistungsdatum_bis).bind(gueltig_bis)
        .bind(d.zahlungsziel_tage)
        .bind(&d.kopftext).bind(&d.fusstext).bind(&d.adresse_id).bind(&d.ansprechpartner_id)
        .bind(jetzt()).bind(&d.id)
        .execute(pool).await?;
```

to:

```rust
    sqlx::query("UPDATE beleg SET kunde_id=?, datum=?, leistungsdatum=?, leistungsdatum_bis=?, gueltig_bis=?, zahlungsziel_tage=?, kopftext=?, fusstext=?, adresse_id=?, ansprechpartner_id=?, gesamtauftragswert_cent=?, updated_at=? WHERE id=?")
        .bind(&d.kunde_id).bind(&d.datum).bind(&d.leistungsdatum).bind(leistungsdatum_bis).bind(gueltig_bis)
        .bind(d.zahlungsziel_tage)
        .bind(&d.kopftext).bind(&d.fusstext).bind(&d.adresse_id).bind(&d.ansprechpartner_id)
        .bind(d.gesamtauftragswert_cent)
        .bind(jetzt()).bind(&d.id)
        .execute(pool).await?;
```

- [ ] **Step 7: Fix the three now-broken `Beleg` struct literals in `belege.rs`**

Add `gesamtauftragswert_cent: None,` right after `bezahlt_cent: 0, zahlungsstand: None, faellig_am: None,` at all three occurrences in this file (in `create()`, `angebot_ueberfuehren()`, and `storniere_rechnung()` — these are the only three `Beleg { ... }` production literals in `belege.rs`, confirmed by `grep -n "bezahlt_cent: 0, zahlungsstand: None, faellig_am: None" src-tauri/src/commands/belege.rs` returning exactly 3 lines).

- [ ] **Step 8: Fix the three `Beleg` test-fixture literals in the `dokument` module**

In `src-tauri/src/dokument/pdf.rs`'s `test_kontext()`, `src-tauri/src/dokument/xrechnung.rs`'s `test_kontext()`, and `src-tauri/src/dokument/vorschau.rs`'s `muster_beleg()`, add `gesamtauftragswert_cent: None,` to each `Beleg { ... }` literal (each already has a line `bezahlt_cent: 0, zahlungsstand: None, faellig_am: None,` in `pdf.rs`/`xrechnung.rs`, and separate `bezahlt_cent: 0,`/`zahlungsstand: None,`/`faellig_am: None,` lines in `vorschau.rs` — add the new field right after those in each file).

- [ ] **Step 9: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml gesamtauftragswert`
Expected: both PASS

- [ ] **Step 10: Run the full backend test suite and clippy**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
Expected: all pass, no warnings

- [ ] **Step 11: Commit**

```bash
git add src-tauri/migrations/0021_abschlagszahlung.sql src-tauri/src/commands/belege.rs src-tauri/src/dokument/pdf.rs src-tauri/src/dokument/xrechnung.rs src-tauri/src/dokument/vorschau.rs
git commit -m "feat: Gesamt-Auftragswert für einfache Abschlagsrechnungen (Schema)

Ein einziges neues, optionales Feld — kein neuer Belegtyp, keine
Verkettung mehrerer Abschläge, keine automatische Schlussrechnung. Muss,
wenn gesetzt, mindestens der Rechnungssumme entsprechen. Noch ohne
Anzeige auf dem PDF oder im Frontend (folgt in den nächsten Commits)."
```

---

### Task 8: Gesamt-Auftragswert auf dem PDF anzeigen

**Files:**
- Modify: `src-tauri/src/dokument/pdf.rs` (`dokument_bauen`'s `felder` vec)
- Modify: `src-tauri/templates/rechnung.typ`
- Test: `src-tauri/src/dokument/pdf.rs`

**Interfaces:**
- Consumes: `Beleg.gesamtauftragswert_cent` (Task 7), `cent_format` (existing helper in `pdf.rs`).
- Produces: Typst input `gesamtauftragswert` (empty string when `None`).

- [ ] **Step 1: Write the failing tests**

Add these tests in `src-tauri/src/dokument/pdf.rs`:

```rust
#[test]
fn zeigt_den_gesamtauftragswert_bei_einer_abschlagsrechnung() {
    let mut kontext = test_kontext();
    kontext.beleg.gesamtauftragswert_cent = Some(147000);
    let t = text(&kontext);
    assert!(t.contains("Gesamt-Auftragswert: 1470,00 €"), "Gesamt-Auftragswert fehlt:\n{t}");
    assert!(t.contains("zzgl. USt"), "Hinweis auf die USt fehlt:\n{t}");
}

#[test]
fn zeigt_keinen_gesamtauftragswert_wenn_nicht_gesetzt() {
    let t = text(&test_kontext());
    assert!(!t.contains("Gesamt-Auftragswert"), "Gesamt-Auftragswert ohne gesetzten Wert:\n{t}");
}
```

(Note: `cent_format` does not add a thousands separator — `cent_format(147000)` renders as `"1470,00 €"`, matching every other large sum already shown on this PDF today.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml gesamtauftragswert`
Expected: `zeigt_den_gesamtauftragswert_bei_einer_abschlagsrechnung` FAILS (text not present); `zeigt_keinen_gesamtauftragswert_wenn_nicht_gesetzt` PASSES vacuously

- [ ] **Step 3: Add the Typst input**

In `src-tauri/src/dokument/pdf.rs`, in `dokument_bauen`'s `felder` vec, add right after `("summe", cent_format(kontext.beleg.summe_cent)),`:

```rust
        ("gesamtauftragswert", kontext.beleg.gesamtauftragswert_cent.map(cent_format).unwrap_or_default()),
```

- [ ] **Step 4: Add the template line**

In `src-tauri/templates/rechnung.typ`, in the `else` branch, right after the summary `#table(...)` call closes and before the `#v(0.3cm) #girocode_block(...)` lines added in Task 6, add:

```typst
  #if ist_gesetzt(sys.inputs.gesamtauftragswert) [
    #v(0.2cm)
    Gesamt-Auftragswert: #sys.inputs.gesamtauftragswert (zzgl. USt)
  ]
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml gesamtauftragswert`
Expected: both PASS

- [ ] **Step 6: Run the full backend test suite and clippy**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
Expected: all pass, no warnings

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/dokument/pdf.rs src-tauri/templates/rechnung.typ
git commit -m "feat: Gesamt-Auftragswert auf dem PDF anzeigen

Erscheint nur, wenn gesetzt, direkt nach der Positionstabelle — nach
dem Vorbild einer echten Abschlagsrechnung."
```

---

### Task 9: Frontend — Feld im Beleg-Editor

**Files:**
- Modify: `src/api.ts` (`Beleg`, `BelegUpdate` interfaces)
- Modify: `src/components/StammdatenAbschnitt.tsx` (new field, both bearbeitbar and read-only views)
- Modify: `src/pages/BelegEditor.tsx` (`stammdatenSpeichern`'s felder type)
- Test: `src/pages/BelegEditor.test.tsx`

**Interfaces:**
- Consumes: `formatCent`, `parseEuro` from `src/geld.ts` (existing).
- Produces: nothing further downstream — this is the final, user-facing piece of Part C.

- [ ] **Step 1: Write the failing tests**

In `src/pages/BelegEditor.test.tsx`, add a new `describe` block at the end of the file:

```tsx
describe("BelegEditor – Gesamt-Auftragswert", () => {
  function entwurfOhneAuftragswert() {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "rechnung", nummer: null, status: "entwurf", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 0, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0, steuerzeilen: [],
    } as never);
  }

  it("sendet den Gesamt-Auftragswert beim Speichern der Stammdaten mit", async () => {
    entwurfOhneAuftragswert();
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByLabelText(/Gesamt-Auftragswert/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/Gesamt-Auftragswert/), { target: { value: "1.470,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(api.belege.update).toHaveBeenCalledWith(
        expect.objectContaining({ gesamtauftragswert_cent: 147000 }),
      ),
    );
  });

  it("lässt den Gesamt-Auftragswert leer, wenn nichts eingegeben wurde", async () => {
    entwurfOhneAuftragswert();
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Speichern" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(api.belege.update).toHaveBeenCalledWith(
        expect.objectContaining({ gesamtauftragswert_cent: null }),
      ),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsc --noEmit`
Expected: FAIL — `screen.getByLabelText(/Gesamt-Auftragswert/)` matches nothing, and (once the type is added in Step 3 below) `gesamtauftragswert_cent` would be missing from the update payload

- [ ] **Step 3: Add the TypeScript types**

In `src/api.ts`, in the `Beleg` interface, add after `ansprechpartner_id?: string | null;`:

```typescript
  /** Nur bei Abschlagsrechnungen gepflegt: Wert des gesamten Auftrags. */
  gesamtauftragswert_cent?: number | null;
```

In the `BelegUpdate` interface, add after `ansprechpartner_id?: string | null;`:

```typescript
  /** Gesamtwert des Auftrags, falls dies eine Abschlagsrechnung ist; null heißt keine Angabe. */
  gesamtauftragswert_cent: number | null;
```

- [ ] **Step 4: Wire the field through `StammdatenAbschnittProps` and `BelegEditor.tsx`**

In `src/components/StammdatenAbschnitt.tsx`, add `gesamtauftragswert_cent: number | null;` to the `onSpeichern` prop's parameter object type (right after `ansprechpartner_id: string | null;`).

In `src/pages/BelegEditor.tsx`, add `gesamtauftragswert_cent: number | null;` to `stammdatenSpeichern`'s `felder` parameter type (right after `ansprechpartner_id: string | null;`).

- [ ] **Step 5: Implement the field in `StammdatenAbschnitt.tsx`**

Add to the imports: `import { formatCent, parseEuro } from "../geld";`.

Add this state, right after `const [ansprechpartnerId, setAnsprechpartnerId] = useState(beleg.ansprechpartner_id ?? "");`:

```tsx
  const [gesamtauftragswertText, setGesamtauftragswertText] = useState(
    beleg.gesamtauftragswert_cent != null ? formatCent(beleg.gesamtauftragswert_cent).replace(" €", "") : "",
  );
  const [gesamtauftragswertFehler, setGesamtauftragswertFehler] = useState<string | null>(null);
  const gesamtauftragswertCent =
    gesamtauftragswertText.trim() === "" ? null : parseEuro(gesamtauftragswertText);
```

In the `geaendert` boolean, add a clause (right after `ansprechpartnerId !== (beleg.ansprechpartner_id ?? "")`):

```tsx
      ansprechpartnerId !== (beleg.ansprechpartner_id ?? "") ||
      gesamtauftragswertCent !== (beleg.gesamtauftragswert_cent ?? null));
```

(i.e. change the closing `);` of the existing multi-line `const geaendert = ...` expression to include this extra `||` line before it.)

Change the form's `onSubmit` handler from:

```tsx
        onSubmit={(e) => {
          e.preventDefault();
          onSpeichern({
            kunde_id: kundeId,
            datum,
            leistungsdatum,
            leistungsdatum_bis: leistungsdatumBis === "" ? null : leistungsdatumBis,
            gueltig_bis: gueltigBis === "" ? null : gueltigBis,
            zahlungsziel_tage: zahlungszielTage,
            kopftext,
            fusstext,
            adresse_id: adresseId === "" ? null : adresseId,
            ansprechpartner_id: ansprechpartnerId === "" ? null : ansprechpartnerId,
          });
        }}
```

to:

```tsx
        onSubmit={(e) => {
          e.preventDefault();
          if (gesamtauftragswertText.trim() !== "" && gesamtauftragswertCent === null) {
            setGesamtauftragswertFehler("Bitte einen gültigen Betrag eingeben, z. B. 1.470,00");
            return;
          }
          setGesamtauftragswertFehler(null);
          onSpeichern({
            kunde_id: kundeId,
            datum,
            leistungsdatum,
            leistungsdatum_bis: leistungsdatumBis === "" ? null : leistungsdatumBis,
            gueltig_bis: gueltigBis === "" ? null : gueltigBis,
            zahlungsziel_tage: zahlungszielTage,
            kopftext,
            fusstext,
            adresse_id: adresseId === "" ? null : adresseId,
            ansprechpartner_id: ansprechpartnerId === "" ? null : ansprechpartnerId,
            gesamtauftragswert_cent: gesamtauftragswertCent,
          });
        }}
```

Add the field markup right after the Fußtext `<label className="feld">` block and before the `<div className="aktionen aktionen-formular">` div:

```tsx
        <label className="feld">
          Gesamt-Auftragswert (€)
          <input
            value={gesamtauftragswertText}
            onChange={(e) => setGesamtauftragswertText(e.currentTarget.value)}
            placeholder="nur bei Abschlagsrechnungen"
          />
        </label>
        {gesamtauftragswertFehler && (
          <div className="feld-fehler" role="alert">{gesamtauftragswertFehler}</div>
        )}
        <p className="feld-hinweis">
          Nur für Abschlagsrechnungen: weist auf dem Beleg zusätzlich auf den Gesamtwert des
          Auftrags hin, aus dem sich diese Teilrechnung ergibt.
        </p>
```

Finally, add a read-only display right after the read-only `<p>Zahlungsziel: ...</p>` line (inside the `if (!bearbeitbar)` branch):

```tsx
        {beleg.gesamtauftragswert_cent != null && (
          <p>Gesamt-Auftragswert: {formatCent(beleg.gesamtauftragswert_cent)}</p>
        )}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx tsc --noEmit && npx eslint . && npm test -- --run src/pages/BelegEditor.test.tsx`
Expected: all PASS

- [ ] **Step 7: Run the full frontend test suite**

Run: `npm test -- --run`
Expected: all pass

- [ ] **Step 8: Commit**

```bash
git add src/api.ts src/components/StammdatenAbschnitt.tsx src/pages/BelegEditor.tsx src/pages/BelegEditor.test.tsx
git commit -m "feat: Gesamt-Auftragswert im Beleg-Editor pflegbar

Neues optionales Feld neben Kopf- und Fußtext, mit demselben
Geld-Eingabe-Muster wie an anderen Stellen der App (Komma statt Punkt,
über geld.ts in Cent umgerechnet)."
```

---

## Final Task 10: Verifikation, Doku, Abschluss

**Files:**
- Modify: `docs/CHANGELOG.md` (new section)
- Modify: `README.md` (feature list)
- Modify: `docs/TODO.md` (status note)

- [ ] **Step 1: Full backend sweep**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
Expected: all pass, no warnings

- [ ] **Step 2: Full frontend sweep**

Run: `npx tsc --noEmit && npx eslint . && npm test -- --run`
Expected: all pass

- [ ] **Step 3: End-to-end sweep**

Run: `./e2e/docker-lauf.sh`
Expected: all scenarios pass (9/9 as of the last release)

- [ ] **Step 4: Manual visual review (ask the user)**

There is no PDF-to-image tool in this environment (`pdftoppm`/poppler is not installed here), so the geometric result of Part A (Kopf-Tabelle placement, three-column footer fitting within the lowered margin) and the Girocode's visual size/placement in Part B have only been verified via text-presence tests and Typst-compiles-without-error checks — not by eye. Start the app, open an existing Rechnung, export a PDF, and visually confirm:
- the Kopf-Tabelle reads well below the address window (per the user's explicit "ich schau danach, ob es einigermaßen passt" from the design conversation)
- the footer's three columns fit comfortably above the page bottom edge, including on a Kleinunternehmer beleg (no Steuerzeilen/USt block) and a multi-page beleg
- the Girocode is a reasonable physical size and actually scans with a banking app (this is the only way to catch an EPC069-12 payload mistake that unit tests can't — e.g. a banking app is stricter about IBAN whitespace than any test here checks)

- [ ] **Step 5: Update the CHANGELOG**

In `docs/CHANGELOG.md`, add a new section above the existing `## 0.10.1` section (check the current top of the file first — if `0.10.1` is still unreleased/undated, add these bullets to it instead of creating a new version section; ask the user which if unclear):

```markdown
**Beleg-Layout**
- Rechnungsnummer, Kundennummer, Datum und Leistungsdatum stehen jetzt als
  klare Tabelle im Kopf, statt als lose Textzeilen.
- Anschrift, Steuerangaben und Bankverbindung stehen jetzt als fester,
  dreispaltiger Fuß auf jeder Seite — vorher als loser Text nach der
  Positionstabelle, wahlweise an zwei einstellbaren Stellen. Die
  Einstellung dafür entfällt entsprechend.

**Girocode**
- Neue, standardmäßig aktive Einstellung: ein SEPA-Girocode (QR-Code zum
  Bezahlen per Smartphone) auf Rechnung und Zahlungserinnerung, sofern
  eine IBAN hinterlegt ist.

**Abschlagsrechnungen**
- Neues optionales Feld „Gesamt-Auftragswert" — weist auf dem Beleg
  zusätzlich auf den Gesamtwert des Auftrags hin, von dem eine
  Abschlagsrechnung nur einen Teil abrechnet.
```

- [ ] **Step 6: Update README and TODO**

In `README.md`, add brief mentions of the Girocode and Abschlagsrechnung-Hinweis to the feature list (matching the existing bullet style).

In `docs/TODO.md`, add a short "Stand" entry noting these three additions and any deliberately-out-of-scope notes (e.g. Girocode never on Angebote/Storno; Gesamt-Auftragswert doesn't flow into XRechnung).

- [ ] **Step 7: Commit the docs**

```bash
git add docs/CHANGELOG.md README.md docs/TODO.md
git commit -m "docs: Beleg-Layout, Girocode und Abschlagsrechnung im CHANGELOG

Kein Tag, kein Release — das entscheidet der Nutzer nach eigener Prüfung."
```

- [ ] **Step 8: Report completion, do not tag or publish**

Summarize what changed across the 10 tasks and explicitly ask the user whether/when to cut a release — this plan does not include tagging or publishing (per the global constraint above and this codebase's established release workflow).
