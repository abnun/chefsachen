# Plan 3: Dokumenterzeugung (PDF, XRechnung, ZUGFeRD) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gestellte Belege (Angebote und Rechnungen) aus Plan 2 als PDF exportierbar machen; für Rechnungen zusätzlich als eigenständige XRechnung-XML-Datei (EN 16931, CII-Syntax) und als ZUGFeRD-Rechnung (PDF/A-3 mit eingebetteter XML).

**Architecture:** Neues, entkoppeltes Rust-Modul `src-tauri/src/dokument/` (Geschwister von `domain/`), das ausschließlich lesend auf `commands::belege`/`commands::firma`/`commands::kunden` zugreift. PDF-Rendering über die eingebettete Typst-Bibliothek (`typst`/`typst-as-lib`), ZUGFeRD-Nachbearbeitung über `lopdf`+`xmp-writer`, XRechnung-XML direktes Building mit `quick-xml`. Zwei Tasks sind explizit als technischer Durchstich markiert (Typst-Rendering, ZUGFeRD-Einbettung) — dort ist die exakte Crate-API gegen die tatsächlich installierte Version zu verifizieren, bevor die Folge-Tasks darauf aufbauen.

**Tech Stack:** Rust: `typst`, `typst-pdf`, `typst-as-lib`, `lopdf`, `xmp-writer`, `quick-xml` (neu); bestehend: Tauri 2.x, sqlx, serde. Frontend: bestehende React/TS/Vitest-Basis aus Plan 1/2.

**Spec:** `docs/superpowers/specs/2026-07-11-dokumenterzeugung-design.md`

**Vorbedingung:** Plan 1 und Plan 2 sind abgeschlossen und in `main` gemerged (69 Rust- + 28 Frontend-Tests grün).

## Global Constraints

- Nur Belege mit Status ungleich `entwurf` (also `versendet`/`gestellt`/`angenommen`/`abgelehnt`/`abgelaufen`/`storniert`) sind exportierbar — der `kunde_snapshot` existiert erst ab dem Stellen.
- XRechnung/ZUGFeRD ausschließlich für `typ == "rechnung"` (inkl. Stornobelege); Angebote bekommen nur reines PDF.
- Stornobelege (`storno_von_id` gesetzt) werden in PDF und XML als Korrekturbeleg gekennzeichnet (Titel „Rechnungskorrektur", CII-TypeCode 384 statt 380), Beträge bleiben negativ wie im Datenmodell.
- Keine automatisierte externe Validierung (veraPDF/KoSIT) in diesem Plan — nur strukturelle Rust-Tests plus ein dokumentierter manueller Prüfschritt am Ende.
- TDD wo sinnvoll möglich; die beiden Spike-Tasks (3 und 7) sind Ausnahmen, da dort zunächst die reale Crate-API erkundet werden muss, bevor ein Test überhaupt formuliert werden kann — dort wird stattdessen ein Smoke-Test direkt nach der lauffähigen Implementierung geschrieben.
- Commit je Task.

---

### Task 1: Dependencies & `BelegKontext`

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/dokument/mod.rs`, `src-tauri/src/dokument/kontext.rs`
- Modify: `src-tauri/src/lib.rs` (Modul registrieren)

**Interfaces:**
- Produces: `dokument::kontext::BelegKontext` (flache Struktur), `dokument::kontext::kontext_aus_beleg(pool, beleg_id: String) -> AppResult<BelegKontext>`

- [ ] **Step 1: Dependencies ergänzen** — `src-tauri/Cargo.toml`, unter `[dependencies]`:

```toml
typst = "0.13"
typst-pdf = "0.13"
typst-as-lib = "0.14"
lopdf = "0.35"
xmp-writer = "0.4"
quick-xml = { version = "0.37", features = ["serialize"] }
```

Run: `cd src-tauri && cargo build` → falls eine Version nicht auflösbar ist (crates.io-Versionsnummern verschieben sich), `cargo add <crate>` ohne Versionsangabe laufen lassen, um die jeweils aktuell auflösbare Version zu ermitteln, und diese hier eintragen.

- [ ] **Step 2: Failing Test** — `src-tauri/src/dokument/kontext.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    async fn test_pool() -> (tempfile::TempDir, sqlx::SqlitePool) {
        let dir = tempfile::tempdir().unwrap();
        let p = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        (dir, p)
    }

    async fn setup_gestellte_rechnung(pool: &sqlx::SqlitePool) -> String {
        let kunde = crate::commands::kunden::create(pool, crate::commands::kunden::KundeNeu {
            typ: "firma".into(), name: "ACME GmbH".into(), zahlungsziel_tage: 14,
            notizen: "".into(), ust_idnr: "".into(), email: "acme@example.com".into(),
            leitweg_id: "".into(), kaeuferreferenz: "".into(),
        }).await.unwrap();
        let artikel = crate::commands::artikel::create(pool, crate::commands::artikel::ArtikelNeu {
            bezeichnung: "Beratung".into(), beschreibung: "".into(),
            einheit_id: "e0000000-0000-0000-0000-000000000001".into(),
            standardpreis_cent: 9500,
        }).await.unwrap();
        let beleg = crate::commands::belege::create(pool, crate::commands::belege::BelegNeu {
            typ: "rechnung".into(), kunde_id: kunde.id.clone(), datum: "2026-07-11".into(),
            leistungsdatum: "2026-07-11".into(), zahlungsziel_tage: 14,
            kopftext: "".into(), fusstext: "Vielen Dank.".into(),
        }).await.unwrap();
        crate::commands::belege::position_speichern(pool, crate::commands::belege::BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel.id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        let gestellt = crate::commands::belege::stellen(pool, beleg.id).await.unwrap();
        gestellt.id
    }

    #[tokio::test]
    async fn kontext_aus_beleg_laedt_beleg_positionen_und_firma() {
        let (_dir, pool) = test_pool().await;
        let beleg_id = setup_gestellte_rechnung(&pool).await;
        let kontext = kontext_aus_beleg(&pool, beleg_id).await.unwrap();
        assert_eq!(kontext.positionen.len(), 1);
        assert_eq!(kontext.kunde_name, "ACME GmbH");
        assert_eq!(kontext.kunde_email, "acme@example.com");
    }

    #[tokio::test]
    async fn kontext_aus_beleg_lehnt_entwurf_ab() {
        let (_dir, pool) = test_pool().await;
        let kunde = crate::commands::kunden::create(&pool, crate::commands::kunden::KundeNeu {
            typ: "firma".into(), name: "ACME GmbH".into(), zahlungsziel_tage: 14,
            notizen: "".into(), ust_idnr: "".into(), email: "".into(),
            leitweg_id: "".into(), kaeuferreferenz: "".into(),
        }).await.unwrap();
        let beleg = crate::commands::belege::create(&pool, crate::commands::belege::BelegNeu {
            typ: "rechnung".into(), kunde_id: kunde.id, datum: "2026-07-11".into(),
            leistungsdatum: "2026-07-11".into(), zahlungsziel_tage: 14,
            kopftext: "".into(), fusstext: "".into(),
        }).await.unwrap();
        let err = kontext_aus_beleg(&pool, beleg.id).await.unwrap_err();
        assert!(matches!(err, crate::error::AppError::Validation { .. }));
    }
}
```

- [ ] **Step 3: Test schlägt fehl** — Run: `cd src-tauri && cargo test kontext::` → FAIL (Modul existiert nicht).

- [ ] **Step 4: Implementierung** — `src-tauri/src/dokument/kontext.rs` (oberhalb des Testmoduls):

```rust
use crate::error::{AppError, AppResult};
use serde::Serialize;
use sqlx::SqlitePool;

#[derive(Debug, Clone, Serialize)]
pub struct BelegKontext {
    pub beleg: crate::commands::belege::Beleg,
    pub positionen: Vec<crate::commands::belege::Belegposition>,
    pub firma: crate::commands::firma::Firma,
    pub kunde_name: String,
    pub kunde_kundennummer: String,
    pub kunde_ust_idnr: String,
    pub kunde_email: String,
    pub kunde_leitweg_id: String,
    pub kunde_kaeuferreferenz: String,
    pub adresse_strasse: String,
    pub adresse_plz: String,
    pub adresse_ort: String,
    pub adresse_land: String,
}

fn feld_str(wert: &serde_json::Value, feld: &str) -> String {
    wert.get(feld).and_then(|v| v.as_str()).unwrap_or_default().to_string()
}

pub async fn kontext_aus_beleg(pool: &SqlitePool, beleg_id: String) -> AppResult<BelegKontext> {
    let detail = crate::commands::belege::get(pool, beleg_id.clone()).await?;
    if detail.beleg.status == "entwurf" {
        return Err(AppError::Validation {
            feld: "status".into(),
            meldung: "Nur gestellte Belege können exportiert werden".into(),
        });
    }
    let firma = crate::commands::firma::get(pool).await?;
    let snapshot_roh: (String,) = sqlx::query_as("SELECT kunde_snapshot FROM beleg WHERE id = ?")
        .bind(&beleg_id).fetch_one(pool).await?;
    let snapshot: serde_json::Value = serde_json::from_str(&snapshot_roh.0).unwrap_or(serde_json::Value::Null);
    let snapshot_hat_erweiterte_felder = snapshot.get("kunde").and_then(|k| k.get("email")).is_some();

    let (kunde_name, kunde_kundennummer, kunde_ust_idnr, kunde_email, kunde_leitweg_id, kunde_kaeuferreferenz,
         adresse_strasse, adresse_plz, adresse_ort, adresse_land) = if snapshot_hat_erweiterte_felder {
        let kunde_feld = &snapshot["kunde"];
        let adresse = snapshot.get("adresse");
        (
            feld_str(kunde_feld, "name"), feld_str(kunde_feld, "kundennummer"), feld_str(kunde_feld, "ust_idnr"),
            feld_str(kunde_feld, "email"), feld_str(kunde_feld, "leitweg_id"), feld_str(kunde_feld, "kaeuferreferenz"),
            adresse.map(|a| feld_str(a, "strasse")).unwrap_or_default(),
            adresse.map(|a| feld_str(a, "plz")).unwrap_or_default(),
            adresse.map(|a| feld_str(a, "ort")).unwrap_or_default(),
            adresse.map(|a| feld_str(a, "land")).unwrap_or_default(),
        )
    } else {
        // Alter Snapshot ohne die E-Rechnungs-Felder (vor dieser Erweiterung gestellt) -> Live-Daten als Fallback.
        let kunde_detail = crate::commands::kunden::get(pool, detail.beleg.kunde_id.clone()).await?;
        let adresse = kunde_detail.adressen.iter().find(|a| a.typ == "rechnung" && a.ist_standard);
        (
            kunde_detail.kunde.name, kunde_detail.kunde.kundennummer, kunde_detail.kunde.ust_idnr,
            kunde_detail.kunde.email, kunde_detail.kunde.leitweg_id, kunde_detail.kunde.kaeuferreferenz,
            adresse.map(|a| a.strasse.clone()).unwrap_or_default(),
            adresse.map(|a| a.plz.clone()).unwrap_or_default(),
            adresse.map(|a| a.ort.clone()).unwrap_or_default(),
            adresse.map(|a| a.land.clone()).unwrap_or_default(),
        )
    };

    Ok(BelegKontext {
        beleg: detail.beleg, positionen: detail.positionen, firma,
        kunde_name, kunde_kundennummer, kunde_ust_idnr, kunde_email, kunde_leitweg_id, kunde_kaeuferreferenz,
        adresse_strasse, adresse_plz, adresse_ort, adresse_land,
    })
}
```

`src-tauri/src/dokument/mod.rs`:

```rust
pub mod kontext;
```

`src-tauri/src/lib.rs`: `mod dokument;` zur Modulliste am Dateianfang hinzufügen (neben `mod commands; mod db; mod domain; mod error;`).

- [ ] **Step 5: Test grün** — Run: `cd src-tauri && cargo test kontext::` → PASS (2 Tests).

- [ ] **Step 6: Voller Testlauf** — Run: `cd src-tauri && cargo test` → PASS (69 bestehende + 2 neue = 71).

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: Dependencies für Dokumenterzeugung, BelegKontext"`

---

### Task 2: Snapshot-Erweiterung (Rückwirkung auf Plan 2)

**Files:**
- Modify: `src-tauri/src/commands/belege.rs`

**Interfaces:**
- Modifies: `kunde_snapshot_json` — ergänzt um `email`, `leitweg_id`, `kaeuferreferenz` (Kunde) sowie `land`, `kleinunternehmer` (Firma)

- [ ] **Step 1: Failing Test** — ergänzen im Testmodul von `belege.rs`:

```rust
    #[tokio::test]
    async fn stellen_friert_erweiterten_kundensnapshot_ein() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = crate::commands::kunden::create(&pool, crate::commands::kunden::KundeNeu {
            typ: "firma".into(), name: "ACME GmbH".into(), zahlungsziel_tage: 14,
            notizen: "".into(), ust_idnr: "".into(), email: "acme@example.com".into(),
            leitweg_id: "991-12345-67".into(), kaeuferreferenz: "PO-42".into(),
        }).await.unwrap().id;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        let gestellt = stellen(&pool, beleg.id).await.unwrap();

        let snapshot_roh: (String,) = sqlx::query_as("SELECT kunde_snapshot FROM beleg WHERE id = ?")
            .bind(&gestellt.id).fetch_one(&pool).await.unwrap();
        let snapshot: serde_json::Value = serde_json::from_str(&snapshot_roh.0).unwrap();
        assert_eq!(snapshot["kunde"]["email"], "acme@example.com");
        assert_eq!(snapshot["kunde"]["leitweg_id"], "991-12345-67");
        assert_eq!(snapshot["kunde"]["kaeuferreferenz"], "PO-42");
        assert_eq!(snapshot["firma"]["kleinunternehmer"], true);
    }
```

- [ ] **Step 2: Test schlägt fehl** — Run: `cd src-tauri && cargo test belege:: -- stellen_friert_erweiterten` → FAIL (Felder fehlen im JSON).

- [ ] **Step 3: Implementierung** — `kunde_snapshot_json` in `belege.rs` ersetzen:

```rust
fn kunde_snapshot_json(
    kunde: &crate::commands::kunden::Kunde,
    adresse: Option<&crate::commands::kunden::Adresse>,
    firma: &crate::commands::firma::Firma,
) -> String {
    serde_json::json!({
        "kunde": {
            "name": kunde.name, "kundennummer": kunde.kundennummer, "ust_idnr": kunde.ust_idnr,
            "email": kunde.email, "leitweg_id": kunde.leitweg_id, "kaeuferreferenz": kunde.kaeuferreferenz,
        },
        "adresse": adresse.map(|a| serde_json::json!({
            "strasse": a.strasse, "plz": a.plz, "ort": a.ort, "land": a.land,
        })),
        "firma": {
            "name": firma.name, "strasse": firma.strasse, "plz": firma.plz, "ort": firma.ort, "land": firma.land,
            "steuernummer": firma.steuernummer, "ust_idnr": firma.ust_idnr, "iban": firma.iban, "bic": firma.bic,
            "kleinunternehmer": firma.kleinunternehmer,
        },
    }).to_string()
}
```

- [ ] **Step 4: Test grün** — Run: `cd src-tauri && cargo test belege::` → PASS (alle Belege-Tests, inkl. neuem).

- [ ] **Step 5: Voller Testlauf** — Run: `cd src-tauri && cargo test` → PASS (71 + 1 = 72).

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: erweiterten Kunden-Snapshot für E-Rechnungs-Felder einfrieren"`

---

### Task 3: Typst-Rendering — technischer Durchstich

**Files:**
- Create: `src-tauri/resources/fonts/` (Font-Dateien), `src-tauri/templates/rechnung.typ`
- Create: `src-tauri/src/dokument/pdf.rs`
- Modify: `src-tauri/src/dokument/mod.rs`

**Interfaces:**
- Produces: `dokument::pdf::rendern(kontext: &BelegKontext) -> AppResult<Vec<u8>>`

**Ziel dieses Tasks:** ein minimales, aber echtes PDF aus einer Typst-Vorlage erzeugen und damit die Typst-Rust-Integration verifizieren, bevor Task 4 die vollständige Vorlage baut. Die untenstehende API (`TypstEngine::builder()...compile_with_input(...)`, dann `typst_pdf::pdf(&doc, &options)`) ist der von der `typst-as-lib`-Dokumentation beschriebene Verwendungsweg — vor der Implementierung mit `cargo doc --open -p typst-as-lib` bzw. der docs.rs-Seite der tatsächlich installierten Version gegenprüfen und bei Abweichungen anpassen.

- [ ] **Step 1: Schriftart besorgen**

```bash
mkdir -p src-tauri/resources/fonts
curl -L -o src-tauri/resources/fonts/Inter.ttf \
  "https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf"
```

Falls die URL nicht mehr gültig ist (Google-Fonts-Repo-Struktur kann sich ändern): eine aktuelle Inter-TTF-Datei von https://fonts.google.com/specimen/Inter oder https://rsms.me/inter/ herunterladen und unter demselben Pfad ablegen. Es genügt eine einzelne Variable-Font-Datei (deckt alle Schriftschnitte ab).

- [ ] **Step 2: Minimale Typst-Vorlage** — `src-tauri/templates/rechnung.typ`:

```typst
#set text(font: "Inter", size: 10pt)
#set page(margin: 2.5cm)

= #sys.inputs.titel

Beleg-Nr.: #sys.inputs.nummer \
Datum: #sys.inputs.datum

#sys.inputs.kunde_name \
#sys.inputs.kunde_strasse \
#sys.inputs.kunde_plz #sys.inputs.kunde_ort
```

(`sys.inputs` ist Typsts eingebauter Mechanismus für von außen übergebene Eingabedaten — als String-Map. Falls `typst-as-lib`s `compile_with_input` stattdessen ein eigenes Dict-basiertes Übergabeschema vorsieht, die Vorlage entsprechend auf das tatsächliche Schema anpassen; die Feldnamen bleiben gleich.)

- [ ] **Step 3: Implementierung** — `src-tauri/src/dokument/pdf.rs`:

```rust
use crate::dokument::kontext::BelegKontext;
use crate::error::{AppError, AppResult};
use typst_as_lib::TypstEngine;

const VORLAGE: &str = include_str!("../../templates/rechnung.typ");
const SCHRIFT: &[u8] = include_bytes!("../../resources/fonts/Inter.ttf");

pub fn rendern(kontext: &BelegKontext) -> AppResult<Vec<u8>> {
    let titel = if kontext.beleg.typ == "angebot" {
        "Angebot"
    } else if kontext.beleg.storno_von_id.is_some() {
        "Rechnungskorrektur"
    } else {
        "Rechnung"
    };

    let engine = TypstEngine::builder()
        .main_file(VORLAGE)
        .fonts([SCHRIFT])
        .build();

    let eingabe = std::collections::HashMap::from([
        ("titel".to_string(), titel.to_string()),
        ("nummer".to_string(), kontext.beleg.nummer.clone().unwrap_or_default()),
        ("datum".to_string(), kontext.beleg.datum.clone()),
        ("kunde_name".to_string(), kontext.kunde_name.clone()),
        ("kunde_strasse".to_string(), kontext.adresse_strasse.clone()),
        ("kunde_plz".to_string(), kontext.adresse_plz.clone()),
        ("kunde_ort".to_string(), kontext.adresse_ort.clone()),
    ]);

    let dokument = engine
        .compile_with_input(eingabe)
        .output
        .map_err(|e| AppError::Technisch(format!("Typst-Rendering fehlgeschlagen: {e:?}")))?;

    let optionen = typst_pdf::PdfOptions::default();
    typst_pdf::pdf(&dokument, &optionen)
        .map_err(|e| AppError::Technisch(format!("PDF-Export fehlgeschlagen: {e:?}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::belege::{Beleg, Belegposition};
    use crate::commands::firma::Firma;

    fn test_kontext() -> BelegKontext {
        BelegKontext {
            beleg: Beleg {
                id: "b1".into(), typ: "rechnung".into(), nummer: Some("RE-2026-0001".into()),
                status: "gestellt".into(), kunde_id: "k1".into(), datum: "2026-07-11".into(),
                leistungsdatum: "2026-07-11".into(), zahlungsziel_tage: 14,
                kopftext: "".into(), fusstext: "".into(), summe_cent: 9500,
                ursprungsangebot_id: None, storno_von_id: None,
            },
            positionen: Vec::<Belegposition>::new(),
            firma: Firma {
                id: "f1".into(), name: "Meine Firma".into(), strasse: "Weg 1".into(), plz: "10115".into(),
                ort: "Berlin".into(), land: "DE".into(), steuernummer: "12/345".into(), ust_idnr: "".into(),
                iban: "".into(), bic: "".into(), kleinunternehmer: true, eingerichtet: true,
            },
            kunde_name: "ACME GmbH".into(), kunde_kundennummer: "KD-0001".into(), kunde_ust_idnr: "".into(),
            kunde_email: "".into(), kunde_leitweg_id: "".into(), kunde_kaeuferreferenz: "".into(),
            adresse_strasse: "Kundenweg 5".into(), adresse_plz: "10117".into(), adresse_ort: "Berlin".into(),
            adresse_land: "DE".into(),
        }
    }

    #[test]
    fn rendern_erzeugt_gueltige_pdf_bytes() {
        let bytes = rendern(&test_kontext()).unwrap();
        assert!(bytes.starts_with(b"%PDF-"), "Ausgabe beginnt nicht mit der PDF-Signatur");
        assert!(bytes.len() > 500, "PDF wirkt verdächtig klein");
    }
}
```

`src-tauri/src/dokument/mod.rs` erweitern: `pub mod pdf;`

- [ ] **Step 4: Kompilieren & Smoke-Test** — Run: `cd src-tauri && cargo test dokument::pdf::` → Erwartung: kompiliert und PASS. Falls Compile-Fehler wegen abweichender `typst-as-lib`-API auftreten: `cargo doc -p typst-as-lib --open` (oder die docs.rs-Seite der im `Cargo.lock` gepinnten Version) konsultieren und Step 3 entsprechend der tatsächlichen Methodennamen/Signaturen anpassen — das ist der Kern dieses Durchstich-Tasks.

- [ ] **Step 5: Voller Testlauf** — Run: `cd src-tauri && cargo test` → PASS.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: Typst-Rendering-Durchstich mit eingebetteter Schrift"`

---

### Task 4: PDF-Vorlage vollständig

**Files:**
- Modify: `src-tauri/templates/rechnung.typ`, `src-tauri/src/dokument/pdf.rs`

**Interfaces:**
- Erweitert `rendern` um vollständige Beleg-Darstellung: Logo, Positionstabelle, Summe, Fußtext

- [ ] **Step 1: Vorlage erweitern** — `src-tauri/templates/rechnung.typ`:

```typst
#set text(font: "Inter", size: 10pt)
#set page(margin: 2.5cm)

#if sys.inputs.hat_logo == "ja" [
  #image("logo.png", width: 3cm)
]

#align(right)[
  #sys.inputs.firma_name \
  #sys.inputs.firma_strasse \
  #sys.inputs.firma_plz #sys.inputs.firma_ort
]

#v(1cm)

#sys.inputs.kunde_name \
#sys.inputs.kunde_strasse \
#sys.inputs.kunde_plz #sys.inputs.kunde_ort

#v(1cm)

= #sys.inputs.titel #sys.inputs.nummer

Datum: #sys.inputs.datum \
Leistungsdatum: #sys.inputs.leistungsdatum \
Zahlungsziel: #sys.inputs.zahlungsziel_tage Tage

#v(0.5cm)

#let positionen = json(bytes(sys.inputs.positionen_json))

#table(
  columns: (1fr, auto, auto, auto),
  align: (left, right, right, right),
  [*Bezeichnung*], [*Menge*], [*Einzelpreis*], [*Summe*],
  ..positionen.map(p => (p.bezeichnung, p.menge, p.einzelpreis, p.summe)).flatten()
)

#align(right)[*Gesamt: #sys.inputs.summe*]

#v(1cm)

#sys.inputs.fusstext
```

- [ ] **Step 2: `pdf::rendern` erweitern** — Positionen als JSON-Array serialisieren (Menge/Preise deutsch formatiert, damit die Vorlage nicht selbst rechnen muss), Logo als Base64 (falls vorhanden), Firmendaten ergänzen:

```rust
fn menge_format(menge_x1000: i64) -> String {
    let ganz = menge_x1000 / 1000;
    let rest = menge_x1000 % 1000;
    if rest == 0 { ganz.to_string() } else { format!("{},{:03}", ganz, rest).trim_end_matches('0').trim_end_matches(',').to_string() }
}

fn cent_format(cent: i64) -> String {
    // Vorzeichen explizit behandeln: bei -50 Cent liefert Integer-Division 0,
    // das Minus ginge sonst verloren ("0,50 €" statt "-0,50 €").
    let vorzeichen = if cent < 0 { "-" } else { "" };
    let betrag = cent.abs();
    format!("{}{},{:02} €", vorzeichen, betrag / 100, betrag % 100)
}

pub fn rendern(kontext: &BelegKontext, logo: Option<&[u8]>) -> AppResult<Vec<u8>> {
    let titel = if kontext.beleg.typ == "angebot" {
        "Angebot"
    } else if kontext.beleg.storno_von_id.is_some() {
        "Rechnungskorrektur"
    } else {
        "Rechnung"
    };

    let positionen_json = serde_json::to_string(
        &kontext.positionen.iter().map(|p| serde_json::json!({
            "bezeichnung": p.bezeichnung,
            "menge": format!("{} {}", menge_format(p.menge), p.einheit_kuerzel),
            "einzelpreis": cent_format(p.einzelpreis_cent),
            "summe": cent_format(p.positionssumme_cent),
        })).collect::<Vec<_>>()
    ).map_err(|e| AppError::Technisch(e.to_string()))?;

    // Logo als virtuelle Datei "logo.png" registrieren — NICHT als Base64-String durch
    // sys.inputs schleusen: Typsts bytes() dekodiert kein Base64, sondern liefert die
    // UTF-8-Bytes des Strings. typst-as-lib bietet dafür einen Static-File-Resolver;
    // exakten Methodennamen der installierten Version gegen docs.rs verifizieren
    // (gleicher Durchstich-Vorbehalt wie in Task 3).
    let mut builder = TypstEngine::builder().main_file(VORLAGE).fonts([SCHRIFT]);
    if let Some(bytes) = logo {
        builder = builder.with_static_file_resolver([("logo.png", bytes.to_vec())]);
    }
    let engine = builder.build();
    let eingabe = std::collections::HashMap::from([
        ("titel".to_string(), titel.to_string()),
        ("nummer".to_string(), kontext.beleg.nummer.clone().unwrap_or_default()),
        ("datum".to_string(), kontext.beleg.datum.clone()),
        ("leistungsdatum".to_string(), kontext.beleg.leistungsdatum.clone()),
        ("zahlungsziel_tage".to_string(), kontext.beleg.zahlungsziel_tage.to_string()),
        ("kunde_name".to_string(), kontext.kunde_name.clone()),
        ("kunde_strasse".to_string(), kontext.adresse_strasse.clone()),
        ("kunde_plz".to_string(), kontext.adresse_plz.clone()),
        ("kunde_ort".to_string(), kontext.adresse_ort.clone()),
        ("firma_name".to_string(), kontext.firma.name.clone()),
        ("firma_strasse".to_string(), kontext.firma.strasse.clone()),
        ("firma_plz".to_string(), kontext.firma.plz.clone()),
        ("firma_ort".to_string(), kontext.firma.ort.clone()),
        ("positionen_json".to_string(), positionen_json),
        ("summe".to_string(), cent_format(kontext.beleg.summe_cent)),
        ("fusstext".to_string(), kontext.beleg.fusstext.clone()),
        ("hat_logo".to_string(), if logo.is_some() { "ja" } else { "" }.to_string()),
    ]);

    let dokument = engine.compile_with_input(eingabe).output
        .map_err(|e| AppError::Technisch(format!("Typst-Rendering fehlgeschlagen: {e:?}")))?;
    typst_pdf::pdf(&dokument, &typst_pdf::PdfOptions::default())
        .map_err(|e| AppError::Technisch(format!("PDF-Export fehlgeschlagen: {e:?}")))
}
```

**Hinweis Bildformat:** `Firma.logo` kann PNG oder JPEG sein (Plan 1 erlaubt beide beim Hochladen). `#image("logo.png")` leitet das Format aus der Dateiendung ab — beim Umsetzen prüfen, ob die installierte Typst-Version das Format stattdessen aus den Bytes erkennt; falls die Endung maßgeblich ist, per Magic-Bytes unterscheiden (JPEG beginnt mit `0xFF 0xD8`) und die virtuelle Datei entsprechend als `logo.png` oder `logo.jpg` registrieren (Vorlage dann mit beiden Fällen, z. B. über einen weiteren `sys.inputs`-Schlüssel `logo_datei`).

- [ ] **Step 3: Test erweitern** — im Testmodul von `pdf.rs`: `test_kontext()` so ändern, dass `positionen` nicht mehr leer ist, und die Sichtbarkeit auf `pub(crate)` anheben. **Wichtig:** Damit Task 7 (`zugferd.rs`) diese Hilfsfunktion wiederverwenden kann, muss auch das Testmodul selbst sichtbar sein — die Moduldeklaration in `pdf.rs` von `mod tests` auf `#[cfg(test)] pub(crate) mod tests` ändern (ein privates `mod tests` wäre von außerhalb des Moduls NICHT erreichbar, auch nicht innerhalb der Crate). Zuerst eine Mini-Test-PNG als Ressource anlegen:

```bash
mkdir -p src-tauri/resources/test
base64 -d > src-tauri/resources/test/logo_1x1.png <<'EOF'
iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==
EOF
```

Dann die bestehende Funktion `test_kontext()` vollständig ersetzen durch:

```rust
    pub(crate) fn test_kontext() -> BelegKontext {
        BelegKontext {
            beleg: Beleg {
                id: "b1".into(), typ: "rechnung".into(), nummer: Some("RE-2026-0001".into()),
                status: "gestellt".into(), kunde_id: "k1".into(), datum: "2026-07-11".into(),
                leistungsdatum: "2026-07-11".into(), zahlungsziel_tage: 14,
                kopftext: "".into(), fusstext: "Danke für Ihren Auftrag.".into(), summe_cent: 9500,
                ursprungsangebot_id: None, storno_von_id: None,
            },
            positionen: vec![Belegposition {
                id: "p1".into(), beleg_id: "b1".into(), artikel_id: None,
                bezeichnung: "Beratung".into(), einheit_kuerzel: "Std.".into(),
                einzelpreis_cent: 9500, menge: 1000, positionssumme_cent: 9500, reihenfolge: 0,
            }],
            firma: Firma {
                id: "f1".into(), name: "Meine Firma".into(), strasse: "Weg 1".into(), plz: "10115".into(),
                ort: "Berlin".into(), land: "DE".into(), steuernummer: "12/345".into(), ust_idnr: "".into(),
                iban: "".into(), bic: "".into(), kleinunternehmer: true, eingerichtet: true,
            },
            kunde_name: "ACME GmbH".into(), kunde_kundennummer: "KD-0001".into(), kunde_ust_idnr: "".into(),
            kunde_email: "".into(), kunde_leitweg_id: "".into(), kunde_kaeuferreferenz: "".into(),
            adresse_strasse: "Kundenweg 5".into(), adresse_plz: "10117".into(), adresse_ort: "Berlin".into(),
            adresse_land: "DE".into(),
        }
    }

    #[test]
    fn rendern_mit_position_erzeugt_gueltige_pdf_bytes() {
        let bytes = rendern(&test_kontext(), None).unwrap();
        assert!(bytes.starts_with(b"%PDF-"));
    }

    #[test]
    fn rendern_storno_erzeugt_gueltige_pdf_bytes() {
        let mut kontext = test_kontext();
        kontext.beleg.storno_von_id = Some("r1".into());
        kontext.beleg.summe_cent = -9500;
        let bytes = rendern(&kontext, None).unwrap();
        assert!(bytes.starts_with(b"%PDF-"));
    }

    #[test]
    fn rendern_mit_logo_erzeugt_gueltige_pdf_bytes() {
        const LOGO: &[u8] = include_bytes!("../../resources/test/logo_1x1.png");
        let bytes = rendern(&test_kontext(), Some(LOGO)).unwrap();
        assert!(bytes.starts_with(b"%PDF-"));
    }
```

Die bisherige Funktion `rendern_erzeugt_gueltige_pdf_bytes` aus Task 3 (die noch die alte 1-Parameter-Signatur `rendern(&test_kontext())` aufruft) entsprechend auf `rendern(&test_kontext(), None)` anpassen, da `rendern` jetzt zwei Parameter hat.

Titel-Logik wird hier nicht per PDF-Textextraktion geprüft, das wäre unverhältnismäßig aufwendig — die Verzweigung selbst ist durch die drei `if`-Zweige in `rendern` offensichtlich; die beiden Tests stellen sicher, dass beide Pfade tatsächlich fehlerfrei durchlaufen.

- [ ] **Step 4: Tests grün** — Run: `cd src-tauri && cargo test dokument::pdf::` → PASS.

- [ ] **Step 5: Voller Testlauf** — Run: `cd src-tauri && cargo test` → PASS.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: vollständige PDF-Vorlage mit Positionstabelle und Logo"`

---

### Task 5: XRechnung-XML-Erzeugung

**Files:**
- Create: `src-tauri/src/dokument/xrechnung.rs`
- Modify: `src-tauri/src/dokument/mod.rs`

**Interfaces:**
- Produces: `dokument::xrechnung::xml_erzeugen(kontext: &BelegKontext) -> AppResult<String>`

- [ ] **Step 1: Failing Tests** — `src-tauri/src/dokument/xrechnung.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::belege::{Beleg, Belegposition};
    use crate::commands::firma::Firma;

    fn test_kontext(storno_von: Option<&str>, summe_cent: i64) -> BelegKontext {
        crate::dokument::kontext::BelegKontext {
            beleg: Beleg {
                id: "b1".into(), typ: "rechnung".into(), nummer: Some("RE-2026-0001".into()),
                status: "gestellt".into(), kunde_id: "k1".into(), datum: "2026-07-11".into(),
                leistungsdatum: "2026-07-11".into(), zahlungsziel_tage: 14,
                kopftext: "".into(), fusstext: "".into(), summe_cent,
                ursprungsangebot_id: None, storno_von_id: storno_von.map(String::from),
            },
            positionen: vec![Belegposition {
                id: "p1".into(), beleg_id: "b1".into(), artikel_id: None,
                bezeichnung: "Beratung".into(), einheit_kuerzel: "Std.".into(),
                einzelpreis_cent: 9500, menge: 1000, positionssumme_cent: 9500, reihenfolge: 0,
            }],
            firma: Firma {
                id: "f1".into(), name: "Meine Firma".into(), strasse: "Weg 1".into(), plz: "10115".into(),
                ort: "Berlin".into(), land: "DE".into(), steuernummer: "12/345".into(), ust_idnr: "DE123456789".into(),
                iban: "DE00 1234 5678".into(), bic: "ABCDDEFF".into(), kleinunternehmer: true, eingerichtet: true,
            },
            kunde_name: "ACME GmbH".into(), kunde_kundennummer: "KD-0001".into(), kunde_ust_idnr: "".into(),
            kunde_email: "acme@example.com".into(), kunde_leitweg_id: "991-12345-67".into(),
            kunde_kaeuferreferenz: "PO-42".into(),
            adresse_strasse: "Kundenweg 5".into(), adresse_plz: "10117".into(), adresse_ort: "Berlin".into(),
            adresse_land: "DE".into(),
        }
    }

    #[test]
    fn xml_erzeugen_setzt_typecode_380_fuer_regulaere_rechnung() {
        let xml = xml_erzeugen(&test_kontext(None, 9500)).unwrap();
        assert!(xml.contains("<ram:TypeCode>380</ram:TypeCode>"));
        assert!(xml.contains("RE-2026-0001"));
    }

    #[test]
    fn xml_erzeugen_setzt_typecode_384_fuer_storno() {
        let xml = xml_erzeugen(&test_kontext(Some("r1"), -9500)).unwrap();
        assert!(xml.contains("<ram:TypeCode>384</ram:TypeCode>"));
    }

    #[test]
    fn xml_erzeugen_setzt_steuerkategorie_e_fuer_kleinunternehmer() {
        let xml = xml_erzeugen(&test_kontext(None, 9500)).unwrap();
        assert!(xml.contains("<ram:CategoryCode>E</ram:CategoryCode>"));
    }

    #[test]
    fn xml_erzeugen_enthaelt_kaeuferreferenz_und_leitweg_id() {
        let xml = xml_erzeugen(&test_kontext(None, 9500)).unwrap();
        // Leitweg-ID belegt BT-10 (BuyerReference), Käuferreferenz wandert in die Bestellreferenz.
        assert!(xml.contains("<ram:BuyerReference>991-12345-67</ram:BuyerReference>"));
        assert!(xml.contains("PO-42"));
    }

    #[test]
    fn xml_erzeugen_enthaelt_postadressen_beider_parteien() {
        let xml = xml_erzeugen(&test_kontext(None, 9500)).unwrap();
        assert!(xml.contains("10115"), "Verkäufer-PLZ fehlt");
        assert!(xml.contains("10117"), "Käufer-PLZ fehlt");
        assert!(xml.contains("<ram:CountryID>DE</ram:CountryID>"));
    }
}
```

- [ ] **Step 2: Tests schlagen fehl** — Run: `cd src-tauri && cargo test xrechnung::` → FAIL (Modul existiert nicht).

- [ ] **Step 3: Implementierung** — oberhalb des Testmoduls:

```rust
use crate::dokument::kontext::BelegKontext;
use crate::error::AppResult;
use quick_xml::events::{BytesDecl, BytesEnd, BytesStart, BytesText, Event};
use quick_xml::Writer;
use std::io::Cursor;

fn cent_zu_dezimal(cent: i64) -> String {
    // Vorzeichen explizit behandeln: bei -50 Cent liefert Integer-Division 0,
    // das Minus ginge sonst verloren ("0.50" statt "-0.50").
    let vorzeichen = if cent < 0 { "-" } else { "" };
    let betrag = cent.abs();
    format!("{}{}.{:02}", vorzeichen, betrag / 100, betrag % 100)
}

fn menge_zu_dezimal(menge_x1000: i64) -> String {
    format!("{}.{:03}", menge_x1000 / 1000, menge_x1000 % 1000)
}

pub fn xml_erzeugen(kontext: &BelegKontext) -> AppResult<String> {
    let mut writer = Writer::new_with_indent(Cursor::new(Vec::new()), b' ', 2);
    let type_code = if kontext.beleg.storno_von_id.is_some() { "384" } else { "380" };
    // Kein separates Fälligkeitsdatum im Datenmodell (Plan 2) — Zahlungsziel wird stattdessen
    // als Frist in den Zahlungsbedingungen (SpecifiedTradePaymentTerms) unten ausgewiesen.

    writer.write_event(Event::Decl(BytesDecl::new("1.0", Some("UTF-8"), None))).unwrap();
    writer.write_event(Event::Start(BytesStart::new("rsm:CrossIndustryInvoice")
        .with_attributes([
            ("xmlns:rsm", "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"),
            ("xmlns:ram", "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"),
            ("xmlns:udt", "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"),
        ]))).unwrap();

    // ExchangedDocument: Belegkopf
    writer.write_event(Event::Start(BytesStart::new("rsm:ExchangedDocument"))).unwrap();
    schreibe_text(&mut writer, "ram:ID", kontext.beleg.nummer.as_deref().unwrap_or(""));
    schreibe_text(&mut writer, "ram:TypeCode", type_code);
    writer.write_event(Event::Start(BytesStart::new("ram:IssueDateTime"))).unwrap();
    schreibe_text(&mut writer, "udt:DateTimeString", &kontext.beleg.datum.replace('-', ""));
    writer.write_event(Event::End(BytesEnd::new("ram:IssueDateTime"))).unwrap();
    writer.write_event(Event::End(BytesEnd::new("rsm:ExchangedDocument"))).unwrap();

    // SupplyChainTradeTransaction: Positionen, Parteien, Summen, Zahlungsbedingungen
    writer.write_event(Event::Start(BytesStart::new("rsm:SupplyChainTradeTransaction"))).unwrap();

    for (i, pos) in kontext.positionen.iter().enumerate() {
        writer.write_event(Event::Start(BytesStart::new("ram:IncludedSupplyChainTradeLineItem"))).unwrap();
        writer.write_event(Event::Start(BytesStart::new("ram:AssociatedDocumentLineDocument"))).unwrap();
        schreibe_text(&mut writer, "ram:LineID", &(i + 1).to_string());
        writer.write_event(Event::End(BytesEnd::new("ram:AssociatedDocumentLineDocument"))).unwrap();
        writer.write_event(Event::Start(BytesStart::new("ram:SpecifiedTradeProduct"))).unwrap();
        schreibe_text(&mut writer, "ram:Name", &pos.bezeichnung);
        writer.write_event(Event::End(BytesEnd::new("ram:SpecifiedTradeProduct"))).unwrap();
        writer.write_event(Event::Start(BytesStart::new("ram:SpecifiedLineTradeAgreement"))).unwrap();
        writer.write_event(Event::Start(BytesStart::new("ram:NetPriceProductTradePrice"))).unwrap();
        schreibe_text(&mut writer, "ram:ChargeAmount", &cent_zu_dezimal(pos.einzelpreis_cent));
        writer.write_event(Event::End(BytesEnd::new("ram:NetPriceProductTradePrice"))).unwrap();
        writer.write_event(Event::End(BytesEnd::new("ram:SpecifiedLineTradeAgreement"))).unwrap();
        writer.write_event(Event::Start(BytesStart::new("ram:SpecifiedLineTradeDelivery"))).unwrap();
        writer.write_event(Event::Start(BytesStart::new("ram:BilledQuantity").with_attributes([("unitCode", "C62")]))).unwrap();
        writer.write_event(Event::Text(BytesText::new(&menge_zu_dezimal(pos.menge)))).unwrap();
        writer.write_event(Event::End(BytesEnd::new("ram:BilledQuantity"))).unwrap();
        writer.write_event(Event::End(BytesEnd::new("ram:SpecifiedLineTradeDelivery"))).unwrap();
        writer.write_event(Event::Start(BytesStart::new("ram:SpecifiedLineTradeSettlement"))).unwrap();
        writer.write_event(Event::Start(BytesStart::new("ram:ApplicableTradeTax"))).unwrap();
        schreibe_text(&mut writer, "ram:TypeCode", "VAT");
        schreibe_text(&mut writer, "ram:CategoryCode", "E");
        schreibe_text(&mut writer, "ram:RateApplicablePercent", "0");
        writer.write_event(Event::End(BytesEnd::new("ram:ApplicableTradeTax"))).unwrap();
        writer.write_event(Event::Start(BytesStart::new("ram:SpecifiedTradeSettlementLineMonetarySummation"))).unwrap();
        schreibe_text(&mut writer, "ram:LineTotalAmount", &cent_zu_dezimal(pos.positionssumme_cent));
        writer.write_event(Event::End(BytesEnd::new("ram:SpecifiedTradeSettlementLineMonetarySummation"))).unwrap();
        writer.write_event(Event::End(BytesEnd::new("ram:SpecifiedLineTradeSettlement"))).unwrap();
        writer.write_event(Event::End(BytesEnd::new("ram:IncludedSupplyChainTradeLineItem"))).unwrap();
    }

    writer.write_event(Event::Start(BytesStart::new("ram:ApplicableHeaderTradeAgreement"))).unwrap();
    // BT-10 (BuyerReference): Bei XRechnung an öffentliche Auftraggeber gehört die
    // Leitweg-ID in BT-10 — sie hat Vorrang; ohne Leitweg-ID wird die Käuferreferenz gesendet.
    let buyer_reference = if kontext.kunde_leitweg_id.is_empty() {
        &kontext.kunde_kaeuferreferenz
    } else {
        &kontext.kunde_leitweg_id
    };
    schreibe_text(&mut writer, "ram:BuyerReference", buyer_reference);
    writer.write_event(Event::Start(BytesStart::new("ram:SellerTradeParty"))).unwrap();
    schreibe_text(&mut writer, "ram:Name", &kontext.firma.name);
    writer.write_event(Event::Start(BytesStart::new("ram:PostalTradeAddress"))).unwrap();
    schreibe_text(&mut writer, "ram:PostcodeCode", &kontext.firma.plz);
    schreibe_text(&mut writer, "ram:LineOne", &kontext.firma.strasse);
    schreibe_text(&mut writer, "ram:CityName", &kontext.firma.ort);
    schreibe_text(&mut writer, "ram:CountryID", &kontext.firma.land);
    writer.write_event(Event::End(BytesEnd::new("ram:PostalTradeAddress"))).unwrap();
    writer.write_event(Event::Start(BytesStart::new("ram:SpecifiedTaxRegistration"))).unwrap();
    schreibe_text(&mut writer, "ram:ID", &kontext.firma.ust_idnr);
    writer.write_event(Event::End(BytesEnd::new("ram:SpecifiedTaxRegistration"))).unwrap();
    writer.write_event(Event::End(BytesEnd::new("ram:SellerTradeParty"))).unwrap();
    writer.write_event(Event::Start(BytesStart::new("ram:BuyerTradeParty"))).unwrap();
    schreibe_text(&mut writer, "ram:Name", &kontext.kunde_name);
    writer.write_event(Event::Start(BytesStart::new("ram:PostalTradeAddress"))).unwrap();
    schreibe_text(&mut writer, "ram:PostcodeCode", &kontext.adresse_plz);
    schreibe_text(&mut writer, "ram:LineOne", &kontext.adresse_strasse);
    schreibe_text(&mut writer, "ram:CityName", &kontext.adresse_ort);
    schreibe_text(&mut writer, "ram:CountryID", &kontext.adresse_land);
    writer.write_event(Event::End(BytesEnd::new("ram:PostalTradeAddress"))).unwrap();
    writer.write_event(Event::End(BytesEnd::new("ram:BuyerTradeParty"))).unwrap();
    if !kontext.kunde_leitweg_id.is_empty() && !kontext.kunde_kaeuferreferenz.is_empty() {
        // Wenn die Leitweg-ID BT-10 belegt, bleibt die Käuferreferenz als Bestellreferenz erhalten.
        writer.write_event(Event::Start(BytesStart::new("ram:BuyerOrderReferencedDocument"))).unwrap();
        schreibe_text(&mut writer, "ram:IssuerAssignedID", &kontext.kunde_kaeuferreferenz);
        writer.write_event(Event::End(BytesEnd::new("ram:BuyerOrderReferencedDocument"))).unwrap();
    }
    writer.write_event(Event::End(BytesEnd::new("ram:ApplicableHeaderTradeAgreement"))).unwrap();

    writer.write_event(Event::Start(BytesStart::new("ram:ApplicableHeaderTradeSettlement"))).unwrap();
    schreibe_text(&mut writer, "ram:InvoiceCurrencyCode", "EUR");
    writer.write_event(Event::Start(BytesStart::new("ram:SpecifiedTradePaymentTerms"))).unwrap();
    schreibe_text(&mut writer, "ram:Description",
        &format!("Zahlbar innerhalb von {} Tagen", kontext.beleg.zahlungsziel_tage));
    writer.write_event(Event::End(BytesEnd::new("ram:SpecifiedTradePaymentTerms"))).unwrap();
    writer.write_event(Event::Start(BytesStart::new("ram:SpecifiedTradeSettlementHeaderMonetarySummation"))).unwrap();
    schreibe_text(&mut writer, "ram:TaxBasisTotalAmount", &cent_zu_dezimal(kontext.beleg.summe_cent));
    schreibe_text(&mut writer, "ram:TaxTotalAmount", "0.00");
    schreibe_text(&mut writer, "ram:GrandTotalAmount", &cent_zu_dezimal(kontext.beleg.summe_cent));
    schreibe_text(&mut writer, "ram:DuePayableAmount", &cent_zu_dezimal(kontext.beleg.summe_cent));
    writer.write_event(Event::End(BytesEnd::new("ram:SpecifiedTradeSettlementHeaderMonetarySummation"))).unwrap();
    writer.write_event(Event::End(BytesEnd::new("ram:ApplicableHeaderTradeSettlement"))).unwrap();

    writer.write_event(Event::End(BytesEnd::new("rsm:SupplyChainTradeTransaction"))).unwrap();
    writer.write_event(Event::End(BytesEnd::new("rsm:CrossIndustryInvoice"))).unwrap();
    // (Die obige Positions-/Kopf-/Summenreihenfolge ist bewusst linear statt exakt nach CII-Elementreihenfolge
    // sortiert — die Global Constraints legen fest, dass automatisierte Schema-Validierung nicht Teil dieses
    // Plans ist; die Elementreihenfolge kann beim manuellen Prüfschritt am Ende bei Bedarf nachgezogen werden.)

    let bytes = writer.into_inner().into_inner();
    Ok(String::from_utf8(bytes).unwrap())
}

fn schreibe_text(writer: &mut Writer<Cursor<Vec<u8>>>, tag: &str, text: &str) {
    writer.write_event(Event::Start(BytesStart::new(tag))).unwrap();
    writer.write_event(Event::Text(BytesText::new(text))).unwrap();
    writer.write_event(Event::End(BytesEnd::new(tag))).unwrap();
}
```

`src-tauri/src/dokument/mod.rs` erweitern: `pub mod xrechnung;`

Hinweis: Dies ist eine pragmatische Teilmenge der vollständigen CII-Struktur (deckt die in der Spec genannten Pflichtfelder ab: Rechnungsnummer, TypeCode, Datum, Verkäufer/Käufer, Käuferreferenz, Leitweg-ID, Positionen mit Steuerkategorie E, Zahlungsbedingungen, Summen). Eine vollständige EN-16931-Konformitätsprüfung ist laut Spec bewusst nicht Teil dieses Plans (siehe „Global Constraints" und den manuellen Prüfschritt am Ende).

- [ ] **Step 4: Tests grün** — Run: `cd src-tauri && cargo test xrechnung::` → PASS (5 Tests).

- [ ] **Step 5: Voller Testlauf** — Run: `cd src-tauri && cargo test` → PASS.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: XRechnung-CII-XML-Erzeugung"`

---

### Task 6: XRechnung-Pflichtfeldprüfung

**Files:**
- Modify: `src-tauri/src/dokument/xrechnung.rs`

**Interfaces:**
- Produces: `dokument::xrechnung::pruefe_exportierbarkeit(kontext: &BelegKontext) -> AppResult<()>`

- [ ] **Step 1: Failing Tests** — ergänzen im Testmodul:

```rust
    #[test]
    fn pruefe_exportierbarkeit_verlangt_steuernummer_oder_ustidnr() {
        let mut kontext = test_kontext(None, 9500);
        kontext.firma.steuernummer = "".into();
        kontext.firma.ust_idnr = "".into();
        let err = pruefe_exportierbarkeit(&kontext).unwrap_err();
        assert!(matches!(err, crate::error::AppError::Validation { feld, .. } if feld == "steuernummer"));
    }

    #[test]
    fn pruefe_exportierbarkeit_verlangt_kaeuferreferenz() {
        let mut kontext = test_kontext(None, 9500);
        kontext.kunde_kaeuferreferenz = "".into();
        let err = pruefe_exportierbarkeit(&kontext).unwrap_err();
        assert!(matches!(err, crate::error::AppError::Validation { feld, .. } if feld == "kaeuferreferenz"));
    }

    #[test]
    fn pruefe_exportierbarkeit_akzeptiert_vollstaendigen_kontext() {
        assert!(pruefe_exportierbarkeit(&test_kontext(None, 9500)).is_ok());
    }
```

- [ ] **Step 2: Tests schlagen fehl** — Run: `cd src-tauri && cargo test xrechnung:: -- pruefe_exportierbarkeit` → FAIL (Funktion existiert nicht).

- [ ] **Step 3: Implementierung** — ergänzen in `xrechnung.rs`:

```rust
use crate::error::AppError;

pub fn pruefe_exportierbarkeit(kontext: &BelegKontext) -> AppResult<()> {
    if kontext.firma.steuernummer.trim().is_empty() && kontext.firma.ust_idnr.trim().is_empty() {
        return Err(AppError::Validation {
            feld: "steuernummer".into(),
            meldung: "Für den XRechnung-Export ist eine Steuernummer oder USt-IdNr. erforderlich".into(),
        });
    }
    if kontext.kunde_kaeuferreferenz.trim().is_empty() {
        return Err(AppError::Validation {
            feld: "kaeuferreferenz".into(),
            meldung: "Für den XRechnung-Export ist eine Käuferreferenz beim Kunden erforderlich".into(),
        });
    }
    Ok(())
}
```

(`use crate::error::AppError;` ggf. mit dem bereits vorhandenen `use crate::error::AppResult;` zu einer Zeile zusammenführen, falls die Datei bereits einen `use`-Block für `crate::error` hat.)

- [ ] **Step 4: Tests grün** — Run: `cd src-tauri && cargo test xrechnung::` → PASS (8 Tests insgesamt in diesem Modul).

- [ ] **Step 5: Voller Testlauf** — Run: `cd src-tauri && cargo test` → PASS.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: Pflichtfeldprüfung für XRechnung-Export"`

---

### Task 7: ZUGFeRD-Einbettung — technischer Durchstich

**Files:**
- Create: `src-tauri/resources/srgb.icc` (ICC-Profil), `src-tauri/src/dokument/zugferd.rs`
- Modify: `src-tauri/src/dokument/mod.rs`

**Interfaces:**
- Produces: `dokument::zugferd::einbetten(pdf_bytes: Vec<u8>, xml: &str) -> AppResult<Vec<u8>>`

**Ziel dieses Tasks:** verifizieren, wie `lopdf` + `xmp-writer` tatsächlich Datei-Anhänge und PDF/A-3-Metadaten in ein bestehendes PDF einbetten — die konkrete `lopdf`-API (Objektreferenzen, `Dictionary`-Aufbau für `/EmbeddedFiles`, `/AF`) vor der Implementierung gegen `cargo doc -p lopdf --open` bzw. die docs.rs-Seite der installierten Version verifizieren.

- [ ] **Step 1: ICC-Profil besorgen**

```bash
curl -L -o src-tauri/resources/srgb.icc \
  "https://github.com/saucecontrol/Compact-ICC-Profiles/raw/master/profiles/sRGB-v4.icc"
```

Falls die URL nicht mehr gültig ist: ein freies sRGB-ICC-Profil (z. B. von color.org oder aus einem lokal installierten Betriebssystem-Farbprofilordner) unter demselben Pfad ablegen.

- [ ] **Step 2: Failing Test** — `src-tauri/src/dokument/zugferd.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn einbetten_fuegt_anhang_und_metadaten_hinzu() {
        let minimales_pdf = crate::dokument::pdf::rendern(&crate::dokument::pdf::tests::test_kontext(), None).unwrap();
        let xml = "<rsm:CrossIndustryInvoice></rsm:CrossIndustryInvoice>";
        let ergebnis = einbetten(minimales_pdf, xml).unwrap();

        assert!(ergebnis.starts_with(b"%PDF-"));
        let text = String::from_utf8_lossy(&ergebnis);
        assert!(text.contains("factur-x.xml"), "Anhang-Dateiname fehlt im PDF");
        assert!(text.contains("zugferd:pdfa:CrossIndustryDocument"), "XMP-Namespace fehlt im PDF");
    }
}
```

Nutzt die in Task 4 auf `pub(crate)` angehobene `test_kontext()`-Hilfsfunktion aus `pdf.rs`s Testmodul wieder, statt den Testaufbau zu duplizieren. Voraussetzung dafür ist die in Task 4 vorgenommene Änderung der Moduldeklaration auf `#[cfg(test)] pub(crate) mod tests` — ein privates `mod tests` wäre von `zugferd.rs` aus nicht erreichbar.

- [ ] **Step 3: Tests schlagen fehl** — Run: `cd src-tauri && cargo test zugferd::` → FAIL (Modul/Funktion existiert nicht).

- [ ] **Step 4: Implementierung** — `src-tauri/src/dokument/zugferd.rs` (oberhalb des Testmoduls):

```rust
use crate::error::{AppError, AppResult};
use lopdf::{Dictionary, Document, Object, Stream};
use xmp_writer::XmpWriter;

const ICC_PROFIL: &[u8] = include_bytes!("../../resources/srgb.icc");

pub fn einbetten(pdf_bytes: Vec<u8>, xml: &str) -> AppResult<Vec<u8>> {
    let mut doc = Document::load_mem(&pdf_bytes)
        .map_err(|e| AppError::Technisch(format!("PDF konnte nicht geladen werden: {e}")))?;

    // XMP-Metadaten
    let mut xmp = XmpWriter::new();
    xmp.pdfa_extension_schema_container_for_zugferd(); // Platzhalter-Aufruf: exakten Methodennamen der installierten xmp-writer-Version
                                                         // gegen docs.rs verifizieren (PDF/A- und ZUGFeRD-Namespace-Registrierung).
    xmp.namespace("zf", "urn:zugferd:pdfa:CrossIndustryDocument:invoice:2p0#");
    xmp.creator(["Kleinunternehmer-Verwaltung"]);
    let xmp_bytes = xmp.finish(None).into_bytes();
    let xmp_stream = Stream::new(Dictionary::from_iter([
        ("Type".into(), Object::Name(b"Metadata".to_vec())),
        ("Subtype".into(), Object::Name(b"XML".to_vec())),
    ]), xmp_bytes);
    let xmp_id = doc.add_object(xmp_stream);

    // Eingebettete XML-Datei (factur-x.xml, ZUGFeRD-Standardname)
    let datei_stream = Stream::new(Dictionary::from_iter([
        ("Type".into(), Object::Name(b"EmbeddedFile".to_vec())),
        ("Subtype".into(), Object::Name(b"text/xml".to_vec())),
    ]), xml.as_bytes().to_vec());
    let datei_id = doc.add_object(datei_stream);
    let filespec = Dictionary::from_iter([
        ("Type".into(), Object::Name(b"Filespec".to_vec())),
        ("F".into(), Object::string_literal("factur-x.xml")),
        ("UF".into(), Object::string_literal("factur-x.xml")),
        ("AFRelationship".into(), Object::Name(b"Data".to_vec())),
        ("EF".into(), Object::Dictionary(Dictionary::from_iter([
            ("F".into(), Object::Reference(datei_id)),
        ]))),
    ]);
    let filespec_id = doc.add_object(filespec);

    // OutputIntent (PDF/A-Pflichtangabe)
    let icc_stream = Stream::new(Dictionary::from_iter([
        ("N".into(), Object::Integer(3)),
    ]), ICC_PROFIL.to_vec());
    let icc_id = doc.add_object(icc_stream);
    let output_intent = Dictionary::from_iter([
        ("Type".into(), Object::Name(b"OutputIntent".to_vec())),
        ("S".into(), Object::Name(b"GTS_PDFA1".to_vec())),
        ("OutputConditionIdentifier".into(), Object::string_literal("sRGB IEC61966-2.1")),
        ("DestOutputProfile".into(), Object::Reference(icc_id)),
    ]);
    let output_intent_id = doc.add_object(output_intent);

    // Im Katalog verankern
    let katalog_id = doc.catalog_mut()
        .map_err(|e| AppError::Technisch(format!("PDF-Katalog nicht gefunden: {e}")))?;
    katalog_id.set("Metadata", Object::Reference(xmp_id));
    katalog_id.set("OutputIntents", Object::Array(vec![Object::Reference(output_intent_id)]));
    katalog_id.set("Names", Object::Dictionary(Dictionary::from_iter([
        ("EmbeddedFiles", Object::Dictionary(Dictionary::from_iter([
            ("Names", Object::Array(vec![
                Object::string_literal("factur-x.xml"),
                Object::Reference(filespec_id),
            ])),
        ]))),
    ])));
    katalog_id.set("AF", Object::Array(vec![Object::Reference(filespec_id)]));

    let mut ausgabe = Vec::new();
    doc.save_to(&mut ausgabe)
        .map_err(|e| AppError::Technisch(format!("PDF konnte nicht gespeichert werden: {e}")))?;
    Ok(ausgabe)
}
```

`src-tauri/src/dokument/mod.rs` erweitern: `pub mod zugferd;`. `Cargo.toml`: `lopdf`/`xmp-writer` sind bereits aus Task 1 vorhanden.

**Wichtiger Hinweis für die Umsetzung:** Der Aufruf `xmp.pdfa_extension_schema_container_for_zugferd()` ist ein Platzhalter für „hier fehlt noch die konkrete API-Recherche" — anders als der Rest dieses Plans, wo Platzhalter unzulässig sind, ist das hier bewusst der Kern des Durchstichs: Vor der Implementierung `cargo doc -p xmp-writer --open` (bzw. docs.rs) konsultieren, die tatsächlichen Methodennamen für (a) PDF/A-Konformitätsangaben und (b) benutzerdefinierte Namensräume ermitteln, und diese Zeile durch echte Aufrufe ersetzen. Falls `xmp-writer` keine fertige PDF/A-3-Unterstützung bietet, die Pflichtangaben (Konformitätslevel, Teil, Namespace) manuell über die generische `namespace`/`property`-API des Writers setzen.

**Namensraum-Frage (im Durchstich klären):** Die Spec nennt `urn:zugferd:pdfa:CrossIndustryDocument:invoice:2p0#` (ZUGFeRD-2.0-Namensraum); neuere ZUGFeRD-2.x-Versionen sind mit Factur-X harmonisiert und verwenden faktisch `urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#` mit Präfix `fx`. Im Durchstich gegen die aktuelle ZUGFeRD-2.x-Spezifikation prüfen, welcher Namensraum korrekt ist, und dann Code UND Test konsistent auf diesen festlegen (der Plan verwendet vorerst durchgängig die zugferd-Variante — Test prüft auf `zugferd:pdfa:CrossIndustryDocument`, Code registriert denselben Namensraum; bei einem Wechsel auf factur-x beide zusammen ändern).

**Zusätzlich prüfen:** ob `typst-pdf` (aus Task 3/4) über `PdfOptions` bereits einen PDF/A-Konformitätsmodus anbietet (siehe Spec-Hinweis „neuere Typst-Versionen bieten einen nativen PDF/A-Exportmodus"). Falls ja, diesen in `pdf::rendern` aktivieren — das reduziert den hier nötigen Nachbearbeitungsumfang (OutputIntent ggf. schon vorhanden) und sollte in `zugferd::einbetten` entsprechend schlanker ausfallen (nur noch Attachment-Einbettung statt vollem OutputIntent-Aufbau).

- [ ] **Step 5: Kompilieren & Test** — Run: `cd src-tauri && cargo test zugferd::` → nach Ersetzen des Platzhalter-Aufrufs durch echte API-Calls: PASS.

- [ ] **Step 6: Voller Testlauf** — Run: `cd src-tauri && cargo test` → PASS.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: ZUGFeRD-Einbettung (XML-Attachment, PDF/A-3-Metadaten)"`

---

### Task 8: Tauri-Commands & Export-Speicherung

**Files:**
- Create: `src-tauri/src/dokument/export.rs`
- Modify: `src-tauri/src/dokument/mod.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: Tauri-Commands `beleg_pdf_exportieren`, `rechnung_xrechnung_exportieren`, `rechnung_zugferd_exportieren`

- [ ] **Step 1: Implementierung** — `src-tauri/src/dokument/export.rs`:

```rust
use crate::dokument::{kontext::kontext_aus_beleg, pdf, xrechnung, zugferd};
use crate::error::AppResult;
use sqlx::SqlitePool;
use tauri::Manager;

fn dateiname_sicher(nummer: &str) -> String {
    nummer.replace(['/', '\\'], "-")
}

fn im_app_verzeichnis_ablegen(app: &tauri::AppHandle, dateiname: &str, bytes: &[u8]) -> AppResult<()> {
    let verzeichnis = app.path().app_data_dir()
        .map_err(|e| crate::error::AppError::Technisch(e.to_string()))?
        .join("Belege");
    std::fs::create_dir_all(&verzeichnis)
        .map_err(|e| crate::error::AppError::Technisch(e.to_string()))?;
    std::fs::write(verzeichnis.join(dateiname), bytes)
        .map_err(|e| crate::error::AppError::Technisch(e.to_string()))?;
    Ok(())
}

async fn firma_logo(pool: &SqlitePool) -> AppResult<Option<Vec<u8>>> {
    crate::commands::firma::logo_get(pool).await
}

fn pruefe_ist_rechnung(kontext: &crate::dokument::kontext::BelegKontext) -> AppResult<()> {
    if kontext.beleg.typ != "rechnung" {
        return Err(crate::error::AppError::Validation {
            feld: "typ".into(),
            meldung: "Nur Rechnungen können als XRechnung/ZUGFeRD exportiert werden".into(),
        });
    }
    Ok(())
}

#[tauri::command]
pub async fn beleg_pdf_exportieren(
    app: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    id: String,
) -> AppResult<Vec<u8>> {
    let kontext = kontext_aus_beleg(&pool, id).await?;
    let logo = firma_logo(&pool).await?;
    let bytes = pdf::rendern(&kontext, logo.as_deref())?;
    let nummer = kontext.beleg.nummer.clone().unwrap_or_else(|| kontext.beleg.id.clone());
    im_app_verzeichnis_ablegen(&app, &format!("{}.pdf", dateiname_sicher(&nummer)), &bytes)?;
    Ok(bytes)
}

#[tauri::command]
pub async fn rechnung_xrechnung_exportieren(
    app: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    id: String,
) -> AppResult<Vec<u8>> {
    let kontext = kontext_aus_beleg(&pool, id).await?;
    pruefe_ist_rechnung(&kontext)?;
    xrechnung::pruefe_exportierbarkeit(&kontext)?;
    let xml = xrechnung::xml_erzeugen(&kontext)?;
    let nummer = kontext.beleg.nummer.clone().unwrap_or_else(|| kontext.beleg.id.clone());
    let bytes = xml.into_bytes();
    im_app_verzeichnis_ablegen(&app, &format!("{}.xrechnung.xml", dateiname_sicher(&nummer)), &bytes)?;
    Ok(bytes)
}

#[tauri::command]
pub async fn rechnung_zugferd_exportieren(
    app: tauri::AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    id: String,
) -> AppResult<Vec<u8>> {
    let kontext = kontext_aus_beleg(&pool, id).await?;
    pruefe_ist_rechnung(&kontext)?;
    xrechnung::pruefe_exportierbarkeit(&kontext)?;
    let logo = firma_logo(&pool).await?;
    let pdf_bytes = pdf::rendern(&kontext, logo.as_deref())?;
    let xml = xrechnung::xml_erzeugen(&kontext)?;
    let bytes = zugferd::einbetten(pdf_bytes, &xml)?;
    let nummer = kontext.beleg.nummer.clone().unwrap_or_else(|| kontext.beleg.id.clone());
    im_app_verzeichnis_ablegen(&app, &format!("{}.zugferd.pdf", dateiname_sicher(&nummer)), &bytes)?;
    Ok(bytes)
}
```

`src-tauri/src/dokument/mod.rs` erweitern: `pub mod export;`

`src-tauri/src/lib.rs`, `invoke_handler`-Liste erweitern:

```rust
            commands::belege::offene_posten_list,
            dokument::export::beleg_pdf_exportieren,
            dokument::export::rechnung_xrechnung_exportieren,
            dokument::export::rechnung_zugferd_exportieren
```

(`commands::belege::offene_posten_list` ist der letzte bestehende Eintrag aus Plan 2 — davor das Komma ergänzen, die drei neuen danach anfügen.)

Nur Unit-Test hier: `dateiname_sicher` (reine Funktion, leicht isoliert testbar):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dateiname_sicher_ersetzt_schraegstriche() {
        assert_eq!(dateiname_sicher("RE-2026/0001"), "RE-2026-0001");
        assert_eq!(dateiname_sicher("RE-2026-0001"), "RE-2026-0001");
    }
}
```

Die drei Tauri-Commands selbst sind dünne Orchestrierung bereits getesteter Bausteine (`kontext_aus_beleg`, `pdf::rendern`, `xrechnung::*`, `zugferd::einbetten`) und werden nicht zusätzlich isoliert unit-getestet — konsistent mit dem in `commands::belege` etablierten Muster, wonach `#[tauri::command]`-Wrapper selbst keine eigenen Tests bekommen.

- [ ] **Step 2: Kompilieren** — Run: `cd src-tauri && cargo build` → PASS. Run: `cd src-tauri && cargo test` → PASS (alle bisherigen + 1 neuer Test).

- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat: Tauri-Commands für PDF-/XRechnung-/ZUGFeRD-Export"`

---

### Task 9: Frontend-API erweitern

**Files:**
- Modify: `src/api.ts`

**Interfaces:**
- Produces: `api.belege.pdfExportieren`, `api.belege.xrechnungExportieren`, `api.belege.zugferdExportieren`

- [ ] **Step 1: `api.ts` erweitern** — im `api.belege`-Namensraum ergänzen (nach `offenePosten`):

```typescript
    pdfExportieren: (id: string) => invoke<number[]>("beleg_pdf_exportieren", { id }),
    xrechnungExportieren: (id: string) => invoke<number[]>("rechnung_xrechnung_exportieren", { id }),
    zugferdExportieren: (id: string) => invoke<number[]>("rechnung_zugferd_exportieren", { id }),
```

(Rückgabetyp `number[]`, da Tauri `Vec<u8>` als JSON-Zahlenarray serialisiert — analog zu `firma.logoGet`, das bereits `number[] | null` verwendet.)

- [ ] **Step 2: Test ergänzen** — in `src/api.test.ts`, im bestehenden `describe("api", ...)`-Block:

```typescript
  it("ruft beleg_pdf_exportieren per invoke auf", async () => {
    await api.belege.pdfExportieren("b1");
    expect(invoke).toHaveBeenCalledWith("beleg_pdf_exportieren", { id: "b1" });
  });
```

- [ ] **Step 3: Test grün** — Run: `npm test` → PASS.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: Frontend-API für Dokument-Export"`

---

### Task 10: Export-Buttons im BelegEditor

**Files:**
- Modify: `src/pages/BelegEditor.tsx`
- Test: `src/pages/BelegEditor.test.tsx` (erweitern)

**Interfaces:**
- Consumes: `api.belege.pdfExportieren`/`xrechnungExportieren`/`zugferdExportieren`, `@tauri-apps/plugin-dialog` (`save`), `@tauri-apps/plugin-fs` (`writeFile`)

- [ ] **Step 1: Failing Test** — ergänzen in `src/pages/BelegEditor.test.tsx` (im bestehenden `vi.mock("../api", ...)`-Objekt `api.belege` um `pdfExportieren: vi.fn().mockResolvedValue([1, 2, 3])` ergänzen; neuer Test):

```tsx
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn().mockResolvedValue("/pfad/rechnung.pdf") }));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeFile: vi.fn().mockResolvedValue(undefined) }));

// ... innerhalb describe("BelegEditor", ...):
  it("exportiert ein PDF über den Speichern-Dialog", async () => {
    // WICHTIG: Die Standard-Fixture des Testfiles hat Status "entwurf" — in dem Zustand
    // wird der Export-Button gar nicht gerendert. Deshalb hier api.belege.get auf eine
    // GESTELLTE Rechnung um-mocken (gleiches Re-Mock-Idiom wie bei den bestehenden
    // Stellen-/Zahlungen-Tests in diesem File verwenden):
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: { id: "b1", typ: "rechnung", nummer: "RE-2026-0001", status: "gestellt", kunde_id: "k1",
        datum: "2026-07-11", leistungsdatum: "2026-07-11", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9500, ursprungsangebot_id: null, storno_von_id: null },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 9500,
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Als PDF exportieren" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Als PDF exportieren" }));
    await waitFor(() => expect(api.belege.pdfExportieren).toHaveBeenCalledWith("b1"));
  });
```

(`api` muss dafür aus `../api` importiert sein — falls noch nicht vorhanden, `import { api } from "../api";` ergänzen; da `../api` gemockt ist, greift man über den gemockten Export darauf zu. Falls das Testfile für seine Statuswechsel-Tests ein anderes Re-Mock-Idiom als `vi.mocked(...)` etabliert hat, dieses Idiom übernehmen.)

- [ ] **Step 2: FAIL verifizieren** — `npm test` → FAIL (Button existiert nicht).

- [ ] **Step 3: Implementierung** — in `src/pages/BelegEditor.tsx`: Import ergänzen (`import { save } from "@tauri-apps/plugin-dialog"; import { writeFile } from "@tauri-apps/plugin-fs";`), Handler-Funktionen und Buttons hinzufügen (im `BelegEditor`-Hauptkomponente, nach der bestehenden `positionLoeschen`-Funktion):

```tsx
  async function pdfExportieren() {
    setFehler(null);
    try {
      const bytes = await api.belege.pdfExportieren(beleg.id);
      const ziel = await save({ defaultPath: `${beleg.nummer ?? beleg.id}.pdf`, filters: [{ name: "PDF", extensions: ["pdf"] }] });
      if (ziel) {
        await writeFile(ziel, new Uint8Array(bytes));
      }
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function xrechnungExportieren() {
    setFehler(null);
    try {
      const bytes = await api.belege.xrechnungExportieren(beleg.id);
      const ziel = await save({ defaultPath: `${beleg.nummer ?? beleg.id}.xml`, filters: [{ name: "XML", extensions: ["xml"] }] });
      if (ziel) {
        await writeFile(ziel, new Uint8Array(bytes));
      }
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function zugferdExportieren() {
    setFehler(null);
    try {
      const bytes = await api.belege.zugferdExportieren(beleg.id);
      const ziel = await save({ defaultPath: `${beleg.nummer ?? beleg.id}-zugferd.pdf`, filters: [{ name: "PDF", extensions: ["pdf"] }] });
      if (ziel) {
        await writeFile(ziel, new Uint8Array(bytes));
      }
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Buttons im JSX ergänzen, direkt nach dem bestehenden `<p>Summe: {formatCent(beleg.summe_cent)}</p>`:

```tsx
      {beleg.status !== "entwurf" && (
        <button type="button" onClick={pdfExportieren}>
          Als PDF exportieren
        </button>
      )}
      {beleg.typ === "rechnung" && beleg.status !== "entwurf" && (
        <>
          <button type="button" onClick={xrechnungExportieren}>
            Als XRechnung (XML) exportieren
          </button>
          <button type="button" onClick={zugferdExportieren}>
            Als ZUGFeRD-Rechnung exportieren
          </button>
        </>
      )}
```

- [ ] **Step 4: PASS verifizieren** — `npm test` → PASS. `npm run build` → kompiliert.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: Export-Buttons (PDF, XRechnung, ZUGFeRD) im BelegEditor"`

---

## Abschluss Plan 3

Nach Task 10: `cd src-tauri && cargo test` (alle Rust-Tests), `npm test`, `npm run build`.

**Manueller Prüfschritt (dokumentiert, nicht automatisiert):** Eine Rechnung im laufenden `npm run tauri dev` stellen, alle drei Exporte durchführen, dann:
1. Die erzeugte ZUGFeRD-PDF in einem PDF-Viewer öffnen (z. B. Vorschau.app oder Adobe Reader) und prüfen, dass der Anhang `factur-x.xml` sichtbar/extrahierbar ist.
2. Die XRechnung-XML-Datei optional gegen den KoSIT-Referenzvalidator (https://github.com/itplr-kosit/validator, lokale Ausführung) oder einen Online-Validator prüfen.
3. Beide Prüfungen sind informativ für diesen Plan — Fehlschläge sind kein Grund, diesen Plan zu blockieren, sondern Grundlage für eine spätere Nachbesserung, sobald eine CI-Pipeline mit automatisierter Validierung existiert (siehe „Explizit außerhalb dieses Plans" in der Spec).
