# E-Rechnungs-Empfang Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Nutzer kann eine per E-Mail erhaltene E-Rechnung (XRechnung-XML oder ZUGFeRD-PDF) manuell in die App importieren; die App liest die Kerndaten strukturiert aus, zeigt sie menschenlesbar an und archiviert die Original-Datei unveränderbar und dauerhaft.

**Architecture:** Neue Tabellen `eingangsrechnung`/`eingangsrechnungposition` (bewusst ohne `deleted_at` — kein Lösch-Pfad). Ein neues Parsing-Modul liest sowohl UBL- als auch CII-XML-Syntax strukturiert per `quick_xml::Reader` (Pfad-Tracking, nicht Substring-Suche) und extrahiert eingebettetes XML aus ZUGFeRD-PDFs per `lopdf` (Umkehrung der bestehenden `zugferd::einbetten`-Funktion). Ein zweistufiger Command-Ablauf (`import_vorschau` → `speichern`) trennt Analyse von Persistierung, damit Duplikate vor dem Speichern erkannt werden können. `format` und `manuell_erfasst` werden beim Speichern serverseitig aus den Datei-Bytes neu abgeleitet, nie vom Frontend übernommen. Frontend bekommt eine neue Seite (Liste + Import-Vorschau) und eine neue Detailseite, analog zum bestehenden Kunden/KundeDetail-Muster.

**Tech Stack:** Rust/sqlx/SQLite/quick-xml/lopdf (Backend), React/TypeScript/Vitest (Frontend), Tauri 2.

---

### Task 1: Backend — Datenmodell (Migration + Structs)

**Files:**
- Create: `src-tauri/migrations/0003_eingangsrechnung.sql`
- Create: `src-tauri/src/commands/eingangsrechnungen.rs`
- Modify: `src-tauri/src/commands/mod.rs`

- [ ] **Step 1: Migration schreiben**

```sql
CREATE TABLE eingangsrechnung (
  id TEXT PRIMARY KEY,
  dateiname TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('xrechnung','zugferd')),
  rohdatei BLOB NOT NULL,
  rechnungssteller_name TEXT NOT NULL DEFAULT '',
  rechnungsnummer TEXT NOT NULL DEFAULT '',
  rechnungsdatum TEXT NOT NULL DEFAULT '',
  betrag_cent INTEGER NOT NULL DEFAULT 0,
  waehrung TEXT NOT NULL DEFAULT 'EUR',
  manuell_erfasst INTEGER NOT NULL DEFAULT 0,
  importiert_am TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE eingangsrechnungposition (
  id TEXT PRIMARY KEY,
  eingangsrechnung_id TEXT NOT NULL REFERENCES eingangsrechnung(id),
  bezeichnung TEXT NOT NULL,
  menge INTEGER NOT NULL DEFAULT 1000,
  einzelpreis_cent INTEGER NOT NULL DEFAULT 0,
  positionssumme_cent INTEGER NOT NULL DEFAULT 0,
  reihenfolge INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
```

Speichern unter `src-tauri/migrations/0003_eingangsrechnung.sql`. Bewusst keine `deleted_at`-Spalte auf `eingangsrechnung` — kein Lösch-Pfad ist vorgesehen (siehe Spec).

- [ ] **Step 2: Struct-Modul anlegen mit fehlschlagendem Test**

`src-tauri/src/commands/eingangsrechnungen.rs` (neue Datei):

```rust
use crate::db::jetzt;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Eingangsrechnung {
    pub id: String,
    pub dateiname: String,
    pub format: String,
    pub rechnungssteller_name: String,
    pub rechnungsnummer: String,
    pub rechnungsdatum: String,
    pub betrag_cent: i64,
    pub waehrung: String,
    pub manuell_erfasst: bool,
    pub importiert_am: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct EingangsrechnungPosition {
    pub id: String,
    pub eingangsrechnung_id: String,
    pub bezeichnung: String,
    pub menge: i64,
    pub einzelpreis_cent: i64,
    pub positionssumme_cent: i64,
    pub reihenfolge: i64,
}

#[derive(Debug, Serialize)]
pub struct EingangsrechnungDetail {
    pub eingangsrechnung: Eingangsrechnung,
    pub positionen: Vec<EingangsrechnungPosition>,
}

const EINGANGSRECHNUNG_SPALTEN: &str = "id, dateiname, format, rechnungssteller_name, rechnungsnummer, rechnungsdatum, betrag_cent, waehrung, manuell_erfasst, importiert_am";

pub async fn list(pool: &SqlitePool) -> AppResult<Vec<Eingangsrechnung>> {
    let sql = format!("SELECT {EINGANGSRECHNUNG_SPALTEN} FROM eingangsrechnung ORDER BY rechnungsdatum DESC");
    Ok(sqlx::query_as(&sql).fetch_all(pool).await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn test_pool() -> (tempfile::TempDir, sqlx::SqlitePool) {
        let dir = tempfile::tempdir().unwrap();
        let p = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        (dir, p)
    }

    #[tokio::test]
    async fn list_liefert_leere_liste_ohne_eintraege() {
        let (_dir, pool) = test_pool().await;
        let liste = list(&pool).await.unwrap();
        assert!(liste.is_empty());
    }
}
```

- [ ] **Step 3: Modul registrieren**

`src-tauri/src/commands/mod.rs`, vorher:

```rust
pub mod artikel;
pub mod belege;
pub mod einheiten;
pub mod einstellungen;
pub mod firma;
pub mod kunden;
```

nachher:

```rust
pub mod artikel;
pub mod belege;
pub mod einheiten;
pub mod eingangsrechnungen;
pub mod einstellungen;
pub mod firma;
pub mod kunden;
```

- [ ] **Step 4: Test läuft**

Run: `cd src-tauri && cargo test list_liefert_leere_liste_ohne_eintraege`
Erwartet: PASS (Migration wird beim `init_db` automatisch über `sqlx::migrate!` angewendet).

- [ ] **Step 5: Volle Rust-Suite + Build**

Run: `cd src-tauri && cargo test` → 112/112 (111 bisherige + 1 neuer Test)
Run: `cd src-tauri && cargo build` → PASS

- [ ] **Step 6: Commit**

```bash
git add src-tauri/migrations/0003_eingangsrechnung.sql src-tauri/src/commands/eingangsrechnungen.rs src-tauri/src/commands/mod.rs
git commit -m "feat: Datenmodell für Eingangsrechnungen"
```

---

### Task 2: Backend — CII-Parser

**Files:**
- Create: `src-tauri/src/dokument/eingangsrechnung_parse.rs`
- Modify: `src-tauri/src/dokument/mod.rs`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

`src-tauri/src/dokument/eingangsrechnung_parse.rs` (neue Datei):

```rust
use crate::error::{AppError, AppResult};
use quick_xml::events::Event;
use quick_xml::reader::Reader;

#[derive(Debug, Clone, Default, PartialEq)]
pub struct GeparsteRechnung {
    pub rechnungssteller_name: String,
    pub rechnungsnummer: String,
    pub rechnungsdatum: String,
    pub betrag_cent: i64,
    pub waehrung: String,
    pub positionen: Vec<GeparstePosition>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct GeparstePosition {
    pub bezeichnung: String,
    pub menge: i64,
    pub einzelpreis_cent: i64,
    pub positionssumme_cent: i64,
}

/// Wandelt einen Dezimal-String ("95.50", "2.5", "10") in eine Festkomma-Ganzzahl
/// mit dem angegebenen Faktor (100 für Cent, 1000 für Menge) um. Überzählige
/// Nachkommastellen werden abgeschnitten (nicht gerundet) — für Cent- und
/// Mengenfelder in eingehenden Rechnungen ausreichend genau.
fn dezimal_zu_festkomma(text: &str, nachkommastellen: usize, faktor: i64) -> i64 {
    let text = text.trim();
    let negativ = text.starts_with('-');
    let text = text.trim_start_matches('-');
    let (ganz, nachkomma) = text.split_once('.').unwrap_or((text, ""));
    let ganz: i64 = ganz.parse().unwrap_or(0);
    let nachkomma_gekuerzt = if nachkomma.len() > nachkommastellen { &nachkomma[..nachkommastellen] } else { nachkomma };
    let nachkomma_padded = format!("{:0<width$}", nachkomma_gekuerzt, width = nachkommastellen);
    let nachkomma_wert: i64 = if nachkommastellen == 0 { 0 } else { nachkomma_padded.parse().unwrap_or(0) };
    let wert = ganz * faktor + nachkomma_wert;
    if negativ { -wert } else { wert }
}

/// "20260711" -> "2026-07-11" (CII-Datumsformat, siehe `xrechnung::xml_erzeugen`,
/// das `datum.replace('-', "")` beim Schreiben verwendet).
fn formatiere_cii_datum(text: &str) -> String {
    if text.len() == 8 {
        format!("{}-{}-{}", &text[0..4], &text[4..6], &text[6..8])
    } else {
        text.to_string()
    }
}

fn parse_cii(xml: &str) -> AppResult<GeparsteRechnung> {
    let mut reader = Reader::from_str(xml);
    let mut pfad: Vec<String> = Vec::new();
    let mut zeilen_pfad: Vec<String> = Vec::new();
    let mut ergebnis = GeparsteRechnung::default();
    let mut in_zeile = false;
    let mut aktuelle_zeile = GeparstePosition::default();

    loop {
        match reader.read_event().map_err(|e| AppError::Technisch(format!("XML ist nicht wohlgeformt: {e}")))? {
            Event::Eof => break,
            Event::Start(e) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).into_owned();
                if name == "ram:IncludedSupplyChainTradeLineItem" {
                    in_zeile = true;
                    aktuelle_zeile = GeparstePosition::default();
                    zeilen_pfad.clear();
                } else if in_zeile {
                    zeilen_pfad.push(name.clone());
                }
                pfad.push(name);
            }
            Event::Text(t) => {
                let text = t.unescape().map_err(|e| AppError::Technisch(format!("XML ist nicht wohlgeformt: {e}")))?.into_owned();
                if in_zeile {
                    match zeilen_pfad.join("/").as_str() {
                        "ram:SpecifiedTradeProduct/ram:Name" => aktuelle_zeile.bezeichnung = text,
                        "ram:SpecifiedLineTradeAgreement/ram:NetPriceProductTradePrice/ram:ChargeAmount" =>
                            aktuelle_zeile.einzelpreis_cent = dezimal_zu_festkomma(&text, 2, 100),
                        "ram:SpecifiedLineTradeDelivery/ram:BilledQuantity" =>
                            aktuelle_zeile.menge = dezimal_zu_festkomma(&text, 3, 1000),
                        "ram:SpecifiedLineTradeSettlement/ram:SpecifiedTradeSettlementLineMonetarySummation/ram:LineTotalAmount" =>
                            aktuelle_zeile.positionssumme_cent = dezimal_zu_festkomma(&text, 2, 100),
                        _ => {}
                    }
                } else {
                    match pfad.join("/").as_str() {
                        "rsm:CrossIndustryInvoice/rsm:ExchangedDocument/ram:ID" => ergebnis.rechnungsnummer = text,
                        "rsm:CrossIndustryInvoice/rsm:ExchangedDocument/ram:IssueDateTime/udt:DateTimeString" =>
                            ergebnis.rechnungsdatum = formatiere_cii_datum(&text),
                        "rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:Name" =>
                            ergebnis.rechnungssteller_name = text,
                        "rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:InvoiceCurrencyCode" =>
                            ergebnis.waehrung = text,
                        "rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:GrandTotalAmount" =>
                            ergebnis.betrag_cent = dezimal_zu_festkomma(&text, 2, 100),
                        _ => {}
                    }
                }
            }
            Event::End(_) => {
                if let Some(name) = pfad.pop() {
                    if name == "ram:IncludedSupplyChainTradeLineItem" {
                        in_zeile = false;
                        ergebnis.positionen.push(std::mem::take(&mut aktuelle_zeile));
                    } else if in_zeile {
                        zeilen_pfad.pop();
                    }
                }
            }
            _ => {}
        }
    }

    if ergebnis.rechnungsnummer.is_empty() && ergebnis.rechnungssteller_name.is_empty() {
        return Err(AppError::Technisch("Konnte keine Kernfelder aus der CII-Rechnung extrahieren".into()));
    }
    if ergebnis.waehrung.is_empty() {
        ergebnis.waehrung = "EUR".into();
    }
    Ok(ergebnis)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_cii_extrahiert_kernfelder_und_position_aus_eigenem_export() {
        // Round-Trip mit unserem eigenen CII-Export (xrechnung::xml_erzeugen) statt
        // einer handgeschriebenen Fixture — garantiert, dass der Parser echtes,
        // vom eigenen Schreiber erzeugtes XML korrekt liest.
        let kontext = crate::dokument::xrechnung::tests::test_kontext(None, 9500);
        let xml = crate::dokument::xrechnung::xml_erzeugen(&kontext).unwrap();
        let ergebnis = parse_cii(&xml).unwrap();

        assert_eq!(ergebnis.rechnungsnummer, "RE-2026-0001");
        assert_eq!(ergebnis.rechnungssteller_name, "Meine Firma");
        assert_eq!(ergebnis.waehrung, "EUR");
        assert_eq!(ergebnis.betrag_cent, 9500);
        assert_eq!(ergebnis.positionen.len(), 1);
        assert_eq!(ergebnis.positionen[0].bezeichnung, "Beratung");
        assert_eq!(ergebnis.positionen[0].einzelpreis_cent, 9500);
        assert_eq!(ergebnis.positionen[0].menge, 1000);
        assert_eq!(ergebnis.positionen[0].positionssumme_cent, 9500);
    }

    #[test]
    fn parse_cii_lehnt_xml_ohne_kernfelder_ab() {
        let err = parse_cii("<rsm:CrossIndustryInvoice></rsm:CrossIndustryInvoice>").unwrap_err();
        assert!(matches!(err, AppError::Technisch(_)));
    }
}
```

**Wichtig:** `test_kontext` in `xrechnung.rs` ist aktuell `fn test_kontext(...)` innerhalb von `#[cfg(test)] mod tests` **ohne** `pub`. Für den Round-Trip-Test hier muss sie sichtbar gemacht werden — siehe Step 2.

- [ ] **Step 2: `test_kontext` in `xrechnung.rs` sichtbar machen**

`src-tauri/src/dokument/xrechnung.rs`, vorher (in `mod tests`):

```rust
    fn test_kontext(storno_von: Option<&str>, summe_cent: i64) -> BelegKontext {
```

nachher:

```rust
    pub(crate) fn test_kontext(storno_von: Option<&str>, summe_cent: i64) -> BelegKontext {
```

- [ ] **Step 3: Modul registrieren**

`src-tauri/src/dokument/mod.rs`, vorher:

```rust
pub mod export;
pub mod kontext;
pub mod pdf;
pub mod xrechnung;
pub mod zugferd;
```

nachher:

```rust
pub mod eingangsrechnung_parse;
pub mod export;
pub mod kontext;
pub mod pdf;
pub mod xrechnung;
pub mod zugferd;
```

- [ ] **Step 4: Tests laufen**

Run: `cd src-tauri && cargo test parse_cii`
Erwartet: PASS (2/2).

- [ ] **Step 5: Volle Rust-Suite + Build**

Run: `cd src-tauri && cargo test` → 114/114
Run: `cd src-tauri && cargo build` → PASS

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/dokument/eingangsrechnung_parse.rs src-tauri/src/dokument/mod.rs src-tauri/src/dokument/xrechnung.rs
git commit -m "feat: CII-Parser für eingehende XRechnungen"
```

---

### Task 3: Backend — UBL-Parser

**Files:**
- Modify: `src-tauri/src/dokument/eingangsrechnung_parse.rs`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

Ans Ende von `mod tests` in `eingangsrechnung_parse.rs` anhängen:

```rust
    const UBL_BEISPIEL: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>RE-2026-0042</cbc:ID>
  <cbc:IssueDate>2026-07-15</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Lieferant GmbH</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:LegalMonetaryTotal>
    <cbc:TaxInclusiveAmount>238.00</cbc:TaxInclusiveAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>2</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount>238.00</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>Bürobedarf</cbc:Name>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount>119.00</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>"#;

    #[test]
    fn parse_ubl_extrahiert_kernfelder_und_position() {
        let ergebnis = parse_ubl(UBL_BEISPIEL).unwrap();
        assert_eq!(ergebnis.rechnungsnummer, "RE-2026-0042");
        assert_eq!(ergebnis.rechnungsdatum, "2026-07-15");
        assert_eq!(ergebnis.rechnungssteller_name, "Lieferant GmbH");
        assert_eq!(ergebnis.waehrung, "EUR");
        assert_eq!(ergebnis.betrag_cent, 23800);
        assert_eq!(ergebnis.positionen.len(), 1);
        assert_eq!(ergebnis.positionen[0].bezeichnung, "Bürobedarf");
        assert_eq!(ergebnis.positionen[0].menge, 2000);
        assert_eq!(ergebnis.positionen[0].einzelpreis_cent, 11900);
        assert_eq!(ergebnis.positionen[0].positionssumme_cent, 23800);
    }

    #[test]
    fn parse_ubl_faellt_auf_partyname_zurueck_ohne_registrationname() {
        let xml = UBL_BEISPIEL.replace(
            "<cac:PartyLegalEntity>\n        <cbc:RegistrationName>Lieferant GmbH</cbc:RegistrationName>\n      </cac:PartyLegalEntity>",
            "<cac:PartyName>\n        <cbc:Name>Lieferant GmbH (PartyName)</cbc:Name>\n      </cac:PartyName>",
        );
        let ergebnis = parse_ubl(&xml).unwrap();
        assert_eq!(ergebnis.rechnungssteller_name, "Lieferant GmbH (PartyName)");
    }
```

- [ ] **Step 2: Test läuft nicht (kompiliert nicht)**

Run: `cd src-tauri && cargo test parse_ubl`
Erwartet: Kompilierfehler — `parse_ubl` existiert noch nicht.

- [ ] **Step 3: `parse_ubl` implementieren**

In `eingangsrechnung_parse.rs`, nach `parse_cii` (vor `#[cfg(test)]`) einfügen:

```rust
fn parse_ubl(xml: &str) -> AppResult<GeparsteRechnung> {
    let mut reader = Reader::from_str(xml);
    let mut pfad: Vec<String> = Vec::new();
    let mut zeilen_pfad: Vec<String> = Vec::new();
    let mut ergebnis = GeparsteRechnung::default();
    let mut steller_registrierungsname = String::new();
    let mut steller_partyname = String::new();
    let mut in_zeile = false;
    let mut aktuelle_zeile = GeparstePosition::default();

    loop {
        match reader.read_event().map_err(|e| AppError::Technisch(format!("XML ist nicht wohlgeformt: {e}")))? {
            Event::Eof => break,
            Event::Start(e) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).into_owned();
                if name == "cac:InvoiceLine" {
                    in_zeile = true;
                    aktuelle_zeile = GeparstePosition::default();
                    zeilen_pfad.clear();
                } else if in_zeile {
                    zeilen_pfad.push(name.clone());
                }
                pfad.push(name);
            }
            Event::Text(t) => {
                let text = t.unescape().map_err(|e| AppError::Technisch(format!("XML ist nicht wohlgeformt: {e}")))?.into_owned();
                if in_zeile {
                    match zeilen_pfad.join("/").as_str() {
                        "cac:Item/cbc:Name" => aktuelle_zeile.bezeichnung = text,
                        "cac:Price/cbc:PriceAmount" => aktuelle_zeile.einzelpreis_cent = dezimal_zu_festkomma(&text, 2, 100),
                        "cbc:InvoicedQuantity" => aktuelle_zeile.menge = dezimal_zu_festkomma(&text, 3, 1000),
                        "cbc:LineExtensionAmount" => aktuelle_zeile.positionssumme_cent = dezimal_zu_festkomma(&text, 2, 100),
                        _ => {}
                    }
                } else {
                    match pfad.join("/").as_str() {
                        "Invoice/cbc:ID" => ergebnis.rechnungsnummer = text,
                        "Invoice/cbc:IssueDate" => ergebnis.rechnungsdatum = text,
                        "Invoice/cbc:DocumentCurrencyCode" => ergebnis.waehrung = text,
                        "Invoice/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount" =>
                            ergebnis.betrag_cent = dezimal_zu_festkomma(&text, 2, 100),
                        "Invoice/cac:AccountingSupplierParty/cac:Party/cac:PartyLegalEntity/cbc:RegistrationName" =>
                            steller_registrierungsname = text,
                        "Invoice/cac:AccountingSupplierParty/cac:Party/cac:PartyName/cbc:Name" =>
                            steller_partyname = text,
                        _ => {}
                    }
                }
            }
            Event::End(_) => {
                if let Some(name) = pfad.pop() {
                    if name == "cac:InvoiceLine" {
                        in_zeile = false;
                        ergebnis.positionen.push(std::mem::take(&mut aktuelle_zeile));
                    } else if in_zeile {
                        zeilen_pfad.pop();
                    }
                }
            }
            _ => {}
        }
    }

    ergebnis.rechnungssteller_name = if !steller_registrierungsname.is_empty() {
        steller_registrierungsname
    } else {
        steller_partyname
    };

    if ergebnis.rechnungsnummer.is_empty() && ergebnis.rechnungssteller_name.is_empty() {
        return Err(AppError::Technisch("Konnte keine Kernfelder aus der UBL-Rechnung extrahieren".into()));
    }
    if ergebnis.waehrung.is_empty() {
        ergebnis.waehrung = "EUR".into();
    }
    Ok(ergebnis)
}
```

- [ ] **Step 4: Tests laufen**

Run: `cd src-tauri && cargo test parse_ubl`
Erwartet: PASS (2/2).

- [ ] **Step 5: Volle Rust-Suite + Build**

Run: `cd src-tauri && cargo test` → 116/116
Run: `cd src-tauri && cargo build` → PASS

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/dokument/eingangsrechnung_parse.rs
git commit -m "feat: UBL-Parser für eingehende XRechnungen"
```

---

### Task 4: Backend — Formaterkennung, ZUGFeRD-Extraktion, Dispatch

**Files:**
- Modify: `src-tauri/src/dokument/eingangsrechnung_parse.rs`

- [ ] **Step 1: Fehlschlagende Tests schreiben**

Ans Ende von `mod tests` anhängen:

```rust
    #[test]
    fn erkenne_format_erkennt_pdf_an_magic_bytes() {
        assert_eq!(erkenne_format(b"%PDF-1.7 ..."), "zugferd");
        assert_eq!(erkenne_format(b"<rsm:CrossIndustryInvoice></rsm:CrossIndustryInvoice>"), "xrechnung");
    }

    #[test]
    fn parsen_erkennt_wurzelelement_und_delegiert() {
        let kontext = crate::dokument::xrechnung::tests::test_kontext(None, 9500);
        let cii_xml = crate::dokument::xrechnung::xml_erzeugen(&kontext).unwrap();
        assert_eq!(parsen(&cii_xml).unwrap().rechnungsnummer, "RE-2026-0001");
        assert_eq!(parsen(UBL_BEISPIEL).unwrap().rechnungsnummer, "RE-2026-0042");
    }

    #[test]
    fn parsen_lehnt_unbekanntes_wurzelelement_ab() {
        let err = parsen("<EtwasAnderes></EtwasAnderes>").unwrap_err();
        assert!(matches!(err, AppError::Technisch(_)));
    }

    #[test]
    fn xml_extrahieren_liest_eingebettete_xml_wieder_aus() {
        let minimales_pdf = crate::dokument::pdf::rendern(&crate::dokument::pdf::tests::test_kontext(), None).unwrap();
        let xml = "<rsm:CrossIndustryInvoice><rsm:ExchangedDocument><ram:ID>RE-1</ram:ID></rsm:ExchangedDocument></rsm:CrossIndustryInvoice>";
        let pdf_mit_anhang = crate::dokument::zugferd::einbetten(minimales_pdf, xml).unwrap();
        let extrahiert = xml_extrahieren(&pdf_mit_anhang).unwrap();
        assert_eq!(extrahiert, xml);
    }

    #[test]
    fn verarbeite_datei_erkennt_xrechnung_und_parst() {
        let kontext = crate::dokument::xrechnung::tests::test_kontext(None, 9500);
        let cii_xml = crate::dokument::xrechnung::xml_erzeugen(&kontext).unwrap();
        let (format, ergebnis) = verarbeite_datei(cii_xml.as_bytes());
        assert_eq!(format, "xrechnung");
        assert_eq!(ergebnis.unwrap().rechnungsnummer, "RE-2026-0001");
    }

    #[test]
    fn verarbeite_datei_erkennt_zugferd_und_parst() {
        let minimales_pdf = crate::dokument::pdf::rendern(&crate::dokument::pdf::tests::test_kontext(), None).unwrap();
        let kontext = crate::dokument::xrechnung::tests::test_kontext(None, 9500);
        let cii_xml = crate::dokument::xrechnung::xml_erzeugen(&kontext).unwrap();
        let pdf_mit_anhang = crate::dokument::zugferd::einbetten(minimales_pdf, &cii_xml).unwrap();
        let (format, ergebnis) = verarbeite_datei(&pdf_mit_anhang);
        assert_eq!(format, "zugferd");
        assert_eq!(ergebnis.unwrap().rechnungsnummer, "RE-2026-0001");
    }

    #[test]
    fn verarbeite_datei_liefert_fehler_bei_unlesbarer_datei_aber_erkennt_format() {
        let (format, ergebnis) = verarbeite_datei(b"nicht mal ansatzweise XML oder PDF");
        assert_eq!(format, "xrechnung");
        assert!(ergebnis.is_err());
    }
```

- [ ] **Step 2: Tests laufen nicht (kompilieren nicht)**

Run: `cd src-tauri && cargo test erkenne_format`
Erwartet: Kompilierfehler — `erkenne_format`, `parsen`, `xml_extrahieren`, `verarbeite_datei` existieren noch nicht.

- [ ] **Step 3: Funktionen implementieren**

In `eingangsrechnung_parse.rs`, nach `parse_ubl` (vor `#[cfg(test)]`) einfügen:

```rust
pub fn erkenne_format(datei_bytes: &[u8]) -> &'static str {
    if datei_bytes.starts_with(b"%PDF") { "zugferd" } else { "xrechnung" }
}

pub fn parsen(xml: &str) -> AppResult<GeparsteRechnung> {
    let mut reader = Reader::from_str(xml);
    let wurzel = loop {
        match reader.read_event().map_err(|e| AppError::Technisch(format!("XML ist nicht wohlgeformt: {e}")))? {
            Event::Eof => return Err(AppError::Technisch("Leere oder ungültige XML-Datei".into())),
            Event::Start(e) | Event::Empty(e) => {
                break String::from_utf8_lossy(e.name().as_ref()).into_owned();
            }
            _ => continue,
        }
    };
    match wurzel.as_str() {
        "rsm:CrossIndustryInvoice" => parse_cii(xml),
        "Invoice" | "ubl:Invoice" | "CreditNote" | "ubl:CreditNote" => parse_ubl(xml),
        other => Err(AppError::Technisch(format!("Unbekanntes Rechnungsformat (Wurzelelement „{other}\")"))),
    }
}

/// Extrahiert die eingebettete Factur-X/ZUGFeRD-XML-Datei aus einem
/// PDF/A-3-Dokument (Umkehrung von `dokument::zugferd::einbetten`). Liest den
/// ersten Eintrag im Katalog-Feld `AF` (Associated Files) — `einbetten()`
/// hinterlegt dort genau eine Datei, daher kein Dateiname-Filter nötig.
pub fn xml_extrahieren(pdf_bytes: &[u8]) -> AppResult<String> {
    use lopdf::{Document, Object};

    let doc = Document::load_mem(pdf_bytes)
        .map_err(|e| AppError::Technisch(format!("PDF konnte nicht geladen werden: {e}")))?;

    let katalog = doc.catalog()
        .map_err(|e| AppError::Technisch(format!("PDF-Katalog nicht gefunden: {e}")))?;
    let af = katalog.get(b"AF")
        .and_then(Object::as_array)
        .map_err(|_| AppError::Technisch("Keine eingebettete Datei im PDF gefunden (kein AF-Eintrag)".into()))?;
    let filespec_ref = af.first()
        .and_then(|o| o.as_reference().ok())
        .ok_or_else(|| AppError::Technisch("AF-Eintrag ist leer".into()))?;
    let filespec = doc.get_object(filespec_ref)
        .and_then(Object::as_dict)
        .map_err(|e| AppError::Technisch(format!("Filespec nicht lesbar: {e}")))?;
    let ef = filespec.get(b"EF")
        .and_then(Object::as_dict)
        .map_err(|e| AppError::Technisch(format!("EF-Eintrag fehlt: {e}")))?;
    let datei_ref = ef.get(b"F")
        .and_then(Object::as_reference)
        .map_err(|e| AppError::Technisch(format!("Ungültige Datei-Referenz: {e}")))?;
    let stream = doc.get_object(datei_ref)
        .and_then(Object::as_stream)
        .map_err(|e| AppError::Technisch(format!("Anhang nicht lesbar: {e}")))?;
    String::from_utf8(stream.content.clone())
        .map_err(|e| AppError::Technisch(format!("Anhang ist kein gültiges UTF-8: {e}")))
}

/// Erkennt Format und versucht zu parsen. Liefert das erkannte Format immer
/// (unabhängig vom Parse-Ergebnis) — Aufrufer nutzen dieses Format serverseitig,
/// nie einen vom Frontend übergebenen Wert (Defense in Depth, siehe Commands).
pub fn verarbeite_datei(datei_bytes: &[u8]) -> (String, AppResult<GeparsteRechnung>) {
    let format = erkenne_format(datei_bytes);
    let xml_ergebnis: AppResult<String> = if format == "zugferd" {
        xml_extrahieren(datei_bytes)
    } else {
        String::from_utf8(datei_bytes.to_vec())
            .map_err(|e| AppError::Technisch(format!("Datei ist kein gültiges UTF-8: {e}")))
    };
    let geparst = xml_ergebnis.and_then(|xml| parsen(&xml));
    (format.to_string(), geparst)
}
```

**Hinweis für die Implementierung:** Die exakten Methodennamen auf `lopdf::Object` (`as_array`, `as_dict`, `as_reference`, `as_stream`) sind nach bestem Wissen angegeben, aber nicht selbst kompiliert verifiziert. Falls `cargo build` hier Fehler zu abweichenden Methodennamen wirft, in der lokal installierten `lopdf`-Doku (`cargo doc -p lopdf --open` oder `~/.cargo/registry/src/.../lopdf-0.35.*/src/object.rs`) nachschlagen und anpassen — die Struktur der Funktion (Katalog → AF-Array → Filespec-Dict → EF-Dict → Stream) bleibt dabei gleich.

- [ ] **Step 4: Tests laufen**

Run: `cd src-tauri && cargo test eingangsrechnung_parse`
Erwartet: PASS (alle Tests in diesem Modul, aktuell 8 Tests).

- [ ] **Step 5: Volle Rust-Suite + Build**

Run: `cd src-tauri && cargo test` → 122/122
Run: `cd src-tauri && cargo build` → PASS

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/dokument/eingangsrechnung_parse.rs
git commit -m "feat: Formaterkennung, ZUGFeRD-XML-Extraktion und Parser-Dispatch"
```

---

### Task 5: Backend — `eingangsrechnung_import_vorschau`

**Files:**
- Modify: `src-tauri/src/commands/eingangsrechnungen.rs`

- [ ] **Step 1: Fehlschlagende Tests schreiben**

In `eingangsrechnungen.rs`, Structs nach `EingangsrechnungDetail` ergänzen und Tests anhängen:

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct EingangsrechnungPositionNeu {
    pub bezeichnung: String,
    pub menge: i64,
    pub einzelpreis_cent: i64,
    pub positionssumme_cent: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EingangsrechnungFelderNeu {
    pub rechnungssteller_name: String,
    pub rechnungsnummer: String,
    pub rechnungsdatum: String,
    pub betrag_cent: i64,
    pub waehrung: String,
    pub positionen: Vec<EingangsrechnungPositionNeu>,
}

#[derive(Debug, Serialize)]
pub struct EingangsrechnungVorschau {
    pub geparst: bool,
    pub felder: EingangsrechnungFelderNeu,
    pub ist_duplikat: bool,
}
```

Tests ans Ende von `mod tests` anhängen (Import `crate::dokument::xrechnung` am Dateikopf des Testmoduls wird gebraucht — siehe Step 3):

```rust
    #[tokio::test]
    async fn import_vorschau_erkennt_und_parst_xrechnung() {
        let (_dir, pool) = test_pool().await;
        let kontext = crate::dokument::xrechnung::tests::test_kontext(None, 9500);
        let xml = crate::dokument::xrechnung::xml_erzeugen(&kontext).unwrap();
        let vorschau = import_vorschau(&pool, xml.into_bytes()).await.unwrap();
        assert!(vorschau.geparst);
        assert_eq!(vorschau.felder.rechnungsnummer, "RE-2026-0001");
        assert!(!vorschau.ist_duplikat);
    }

    #[tokio::test]
    async fn import_vorschau_liefert_leere_felder_bei_unlesbarer_datei() {
        let (_dir, pool) = test_pool().await;
        let vorschau = import_vorschau(&pool, b"kein gueltiges XML".to_vec()).await.unwrap();
        assert!(!vorschau.geparst);
        assert_eq!(vorschau.felder.rechnungsnummer, "");
    }

    #[tokio::test]
    async fn import_vorschau_erkennt_duplikat() {
        let (_dir, pool) = test_pool().await;
        sqlx::query("INSERT INTO eingangsrechnung (id, dateiname, format, rohdatei, rechnungssteller_name, rechnungsnummer, rechnungsdatum, betrag_cent, waehrung, manuell_erfasst, importiert_am, created_at, updated_at) VALUES ('x','a.xml','xrechnung',x'00','Meine Firma','RE-2026-0001','2026-07-11',9500,'EUR',0,'t','t','t')")
            .execute(&pool).await.unwrap();

        let kontext = crate::dokument::xrechnung::tests::test_kontext(None, 9500);
        let xml = crate::dokument::xrechnung::xml_erzeugen(&kontext).unwrap();
        let vorschau = import_vorschau(&pool, xml.into_bytes()).await.unwrap();
        assert!(vorschau.ist_duplikat);
    }
```

- [ ] **Step 2: Tests laufen nicht (kompilieren nicht)**

Run: `cd src-tauri && cargo test import_vorschau`
Erwartet: Kompilierfehler — `import_vorschau` existiert noch nicht.

- [ ] **Step 3: `import_vorschau` implementieren**

In `eingangsrechnungen.rs`, nach `list()` einfügen:

```rust
pub async fn import_vorschau(pool: &SqlitePool, datei_bytes: Vec<u8>) -> AppResult<EingangsrechnungVorschau> {
    let (_format, geparst) = crate::dokument::eingangsrechnung_parse::verarbeite_datei(&datei_bytes);
    let (geparst_ok, felder) = match geparst {
        Ok(g) => (true, EingangsrechnungFelderNeu {
            rechnungssteller_name: g.rechnungssteller_name,
            rechnungsnummer: g.rechnungsnummer,
            rechnungsdatum: g.rechnungsdatum,
            betrag_cent: g.betrag_cent,
            waehrung: g.waehrung,
            positionen: g.positionen.into_iter().map(|p| EingangsrechnungPositionNeu {
                bezeichnung: p.bezeichnung, menge: p.menge,
                einzelpreis_cent: p.einzelpreis_cent, positionssumme_cent: p.positionssumme_cent,
            }).collect(),
        }),
        Err(_) => (false, EingangsrechnungFelderNeu {
            rechnungssteller_name: String::new(), rechnungsnummer: String::new(),
            rechnungsdatum: String::new(), betrag_cent: 0, waehrung: "EUR".into(),
            positionen: vec![],
        }),
    };

    let ist_duplikat = if !felder.rechnungssteller_name.is_empty() && !felder.rechnungsnummer.is_empty() {
        let anzahl: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM eingangsrechnung WHERE rechnungssteller_name = ? AND rechnungsnummer = ?")
            .bind(&felder.rechnungssteller_name).bind(&felder.rechnungsnummer)
            .fetch_one(pool).await?;
        anzahl.0 > 0
    } else {
        false
    };

    Ok(EingangsrechnungVorschau { geparst: geparst_ok, felder, ist_duplikat })
}
```

Am Kopf der Datei (nach den bestehenden `use`-Zeilen) ergänzen, damit die Tests im `mod tests`-Block `crate::dokument::xrechnung::tests::test_kontext` erreichen können — keine Änderung nötig, `crate::`-Pfade sind bereits absolut auflösbar, sofern `test_kontext` `pub(crate)` ist (aus Task 2, Step 2).

- [ ] **Step 4: Tests laufen**

Run: `cd src-tauri && cargo test import_vorschau`
Erwartet: PASS (3/3).

- [ ] **Step 5: Volle Rust-Suite + Build**

Run: `cd src-tauri && cargo test` → 125/125
Run: `cd src-tauri && cargo build` → PASS

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/eingangsrechnungen.rs
git commit -m "feat: eingangsrechnung_import_vorschau mit Duplikaterkennung"
```

---

### Task 6: Backend — `eingangsrechnung_speichern`

**Files:**
- Modify: `src-tauri/src/commands/eingangsrechnungen.rs`

- [ ] **Step 1: Fehlschlagende Tests schreiben**

Ans Ende von `mod tests` anhängen:

```rust
    #[tokio::test]
    async fn speichern_persistiert_rohdatei_und_felder() {
        let (_dir, pool) = test_pool().await;
        let kontext = crate::dokument::xrechnung::tests::test_kontext(None, 9500);
        let xml = crate::dokument::xrechnung::xml_erzeugen(&kontext).unwrap();
        let felder = EingangsrechnungFelderNeu {
            rechnungssteller_name: "Meine Firma".into(), rechnungsnummer: "RE-2026-0001".into(),
            rechnungsdatum: "2026-07-11".into(), betrag_cent: 9500, waehrung: "EUR".into(),
            positionen: vec![EingangsrechnungPositionNeu {
                bezeichnung: "Beratung".into(), menge: 1000, einzelpreis_cent: 9500, positionssumme_cent: 9500,
            }],
        };
        let gespeichert = speichern(&pool, xml.into_bytes(), "rechnung.xml".into(), felder).await.unwrap();
        assert_eq!(gespeichert.format, "xrechnung");
        assert!(!gespeichert.manuell_erfasst);

        let liste = list(&pool).await.unwrap();
        assert_eq!(liste.len(), 1);
    }

    #[tokio::test]
    async fn speichern_markiert_manuell_erfasst_bei_nicht_parsbarer_datei() {
        let (_dir, pool) = test_pool().await;
        let felder = EingangsrechnungFelderNeu {
            rechnungssteller_name: "Von Hand eingetragen".into(), rechnungsnummer: "X-1".into(),
            rechnungsdatum: "2026-07-11".into(), betrag_cent: 5000, waehrung: "EUR".into(), positionen: vec![],
        };
        let gespeichert = speichern(&pool, b"kein gueltiges XML".to_vec(), "unbekannt.xml".into(), felder).await.unwrap();
        assert!(gespeichert.manuell_erfasst);
        assert_eq!(gespeichert.rechnungssteller_name, "Von Hand eingetragen");
    }

    #[tokio::test]
    async fn speichern_leitet_format_serverseitig_ab_unabhaengig_vom_dateinamen() {
        // Kein `format`-Parameter im Command — auch bei einer .xml-benannten Datei
        // mit PDF-Inhalt wird das tatsächliche Format aus den Bytes bestimmt.
        let (_dir, pool) = test_pool().await;
        let minimales_pdf = crate::dokument::pdf::rendern(&crate::dokument::pdf::tests::test_kontext(), None).unwrap();
        let felder = EingangsrechnungFelderNeu {
            rechnungssteller_name: "".into(), rechnungsnummer: "".into(),
            rechnungsdatum: "".into(), betrag_cent: 0, waehrung: "EUR".into(), positionen: vec![],
        };
        let gespeichert = speichern(&pool, minimales_pdf, "täuschung.xml".into(), felder).await.unwrap();
        assert_eq!(gespeichert.format, "zugferd");
    }
```

- [ ] **Step 2: Tests laufen nicht (kompilieren nicht)**

Run: `cd src-tauri && cargo test speichern_persistiert`
Erwartet: Kompilierfehler — `speichern` existiert noch nicht.

- [ ] **Step 3: `speichern` implementieren**

In `eingangsrechnungen.rs`, nach `import_vorschau` einfügen:

```rust
pub async fn speichern(
    pool: &SqlitePool,
    datei_bytes: Vec<u8>,
    dateiname: String,
    felder: EingangsrechnungFelderNeu,
) -> AppResult<Eingangsrechnung> {
    // format und manuell_erfasst werden IMMER serverseitig aus den tatsächlichen
    // Bytes neu abgeleitet — ein vom Frontend übergebener Wert wäre kein
    // Vertrauensanker (Defense in Depth, analog hat_offene_entwuerfe/kunde_delete).
    let format = crate::dokument::eingangsrechnung_parse::erkenne_format(&datei_bytes).to_string();
    let (_, geparst) = crate::dokument::eingangsrechnung_parse::verarbeite_datei(&datei_bytes);
    let manuell_erfasst = geparst.is_err();

    let eingangsrechnung = Eingangsrechnung {
        id: Uuid::new_v4().to_string(), dateiname, format,
        rechnungssteller_name: felder.rechnungssteller_name, rechnungsnummer: felder.rechnungsnummer,
        rechnungsdatum: felder.rechnungsdatum, betrag_cent: felder.betrag_cent, waehrung: felder.waehrung,
        manuell_erfasst, importiert_am: jetzt(),
    };

    let mut tx = pool.begin().await?;
    sqlx::query("INSERT INTO eingangsrechnung (id, dateiname, format, rohdatei, rechnungssteller_name, rechnungsnummer, rechnungsdatum, betrag_cent, waehrung, manuell_erfasst, importiert_am, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(&eingangsrechnung.id).bind(&eingangsrechnung.dateiname).bind(&eingangsrechnung.format)
        .bind(&datei_bytes).bind(&eingangsrechnung.rechnungssteller_name).bind(&eingangsrechnung.rechnungsnummer)
        .bind(&eingangsrechnung.rechnungsdatum).bind(eingangsrechnung.betrag_cent).bind(&eingangsrechnung.waehrung)
        .bind(eingangsrechnung.manuell_erfasst).bind(&eingangsrechnung.importiert_am).bind(jetzt()).bind(jetzt())
        .execute(&mut *tx).await?;

    for (i, pos) in felder.positionen.iter().enumerate() {
        sqlx::query("INSERT INTO eingangsrechnungposition (id, eingangsrechnung_id, bezeichnung, menge, einzelpreis_cent, positionssumme_cent, reihenfolge, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
            .bind(Uuid::new_v4().to_string()).bind(&eingangsrechnung.id).bind(&pos.bezeichnung)
            .bind(pos.menge).bind(pos.einzelpreis_cent).bind(pos.positionssumme_cent).bind(i as i64)
            .bind(jetzt()).bind(jetzt())
            .execute(&mut *tx).await?;
    }
    tx.commit().await?;

    Ok(eingangsrechnung)
}
```

- [ ] **Step 4: Tests laufen**

Run: `cd src-tauri && cargo test speichern`
Erwartet: PASS (3/3).

- [ ] **Step 5: Volle Rust-Suite + Build**

Run: `cd src-tauri && cargo test` → 128/128
Run: `cd src-tauri && cargo build` → PASS

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/eingangsrechnungen.rs
git commit -m "feat: eingangsrechnung_speichern mit serverseitiger Formaterkennung"
```

---

### Task 7: Backend — `get`/`update`/`original_exportieren` + Tauri-Registrierung

**Files:**
- Modify: `src-tauri/src/commands/eingangsrechnungen.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Fehlschlagende Tests schreiben**

Structs nach `EingangsrechnungVorschau` ergänzen:

```rust
#[derive(Debug, Deserialize)]
pub struct EingangsrechnungUpdate {
    pub id: String,
    pub rechnungssteller_name: String,
    pub rechnungsnummer: String,
    pub rechnungsdatum: String,
    pub betrag_cent: i64,
    pub waehrung: String,
}

#[derive(Debug, Serialize)]
pub struct EingangsrechnungOriginal {
    pub dateiname: String,
    pub bytes: Vec<u8>,
}
```

Tests ans Ende von `mod tests` anhängen:

```rust
    async fn beispiel_speichern(pool: &sqlx::SqlitePool) -> Eingangsrechnung {
        let kontext = crate::dokument::xrechnung::tests::test_kontext(None, 9500);
        let xml = crate::dokument::xrechnung::xml_erzeugen(&kontext).unwrap();
        let felder = EingangsrechnungFelderNeu {
            rechnungssteller_name: "Meine Firma".into(), rechnungsnummer: "RE-2026-0001".into(),
            rechnungsdatum: "2026-07-11".into(), betrag_cent: 9500, waehrung: "EUR".into(),
            positionen: vec![EingangsrechnungPositionNeu {
                bezeichnung: "Beratung".into(), menge: 1000, einzelpreis_cent: 9500, positionssumme_cent: 9500,
            }],
        };
        speichern(pool, xml.into_bytes(), "rechnung.xml".into(), felder).await.unwrap()
    }

    #[tokio::test]
    async fn get_liefert_detail_mit_positionen() {
        let (_dir, pool) = test_pool().await;
        let gespeichert = beispiel_speichern(&pool).await;
        let detail = get(&pool, gespeichert.id).await.unwrap();
        assert_eq!(detail.positionen.len(), 1);
        assert_eq!(detail.positionen[0].bezeichnung, "Beratung");
    }

    #[tokio::test]
    async fn get_liefert_nicht_gefunden_bei_unbekannter_id() {
        let (_dir, pool) = test_pool().await;
        let err = get(&pool, "unbekannt".into()).await.unwrap_err();
        assert!(matches!(err, AppError::NichtGefunden));
    }

    #[tokio::test]
    async fn update_korrigiert_kernfelder_aber_nicht_manuell_erfasst() {
        let (_dir, pool) = test_pool().await;
        let gespeichert = beispiel_speichern(&pool).await;
        let aktualisiert = update(&pool, EingangsrechnungUpdate {
            id: gespeichert.id.clone(), rechnungssteller_name: "Korrigierte Firma".into(),
            rechnungsnummer: "RE-2026-0001".into(), rechnungsdatum: "2026-07-11".into(),
            betrag_cent: 9500, waehrung: "EUR".into(),
        }).await.unwrap();
        assert_eq!(aktualisiert.rechnungssteller_name, "Korrigierte Firma");
        assert!(!aktualisiert.manuell_erfasst);
    }

    #[tokio::test]
    async fn original_exportieren_liefert_unveraenderte_rohdatei() {
        let (_dir, pool) = test_pool().await;
        let kontext = crate::dokument::xrechnung::tests::test_kontext(None, 9500);
        let xml = crate::dokument::xrechnung::xml_erzeugen(&kontext).unwrap();
        let felder = EingangsrechnungFelderNeu {
            rechnungssteller_name: "Meine Firma".into(), rechnungsnummer: "RE-2026-0001".into(),
            rechnungsdatum: "2026-07-11".into(), betrag_cent: 9500, waehrung: "EUR".into(), positionen: vec![],
        };
        let gespeichert = speichern(&pool, xml.clone().into_bytes(), "rechnung.xml".into(), felder).await.unwrap();
        let original = original_exportieren(&pool, gespeichert.id).await.unwrap();
        assert_eq!(original.dateiname, "rechnung.xml");
        assert_eq!(String::from_utf8(original.bytes).unwrap(), xml);
    }
```

- [ ] **Step 2: Tests laufen nicht (kompilieren nicht)**

Run: `cd src-tauri && cargo test get_liefert_detail`
Erwartet: Kompilierfehler — `get`, `update`, `original_exportieren` existieren noch nicht.

- [ ] **Step 3: Funktionen implementieren**

In `eingangsrechnungen.rs`, nach `speichern` einfügen:

```rust
pub async fn get(pool: &SqlitePool, id: String) -> AppResult<EingangsrechnungDetail> {
    let sql = format!("SELECT {EINGANGSRECHNUNG_SPALTEN} FROM eingangsrechnung WHERE id = ?");
    let eingangsrechnung: Eingangsrechnung = sqlx::query_as(&sql).bind(&id).fetch_optional(pool).await?.ok_or(AppError::NichtGefunden)?;
    let positionen: Vec<EingangsrechnungPosition> = sqlx::query_as(
        "SELECT id, eingangsrechnung_id, bezeichnung, menge, einzelpreis_cent, positionssumme_cent, reihenfolge \
         FROM eingangsrechnungposition WHERE eingangsrechnung_id = ? ORDER BY reihenfolge")
        .bind(&id).fetch_all(pool).await?;
    Ok(EingangsrechnungDetail { eingangsrechnung, positionen })
}

pub async fn update(pool: &SqlitePool, d: EingangsrechnungUpdate) -> AppResult<Eingangsrechnung> {
    let r = sqlx::query("UPDATE eingangsrechnung SET rechnungssteller_name=?, rechnungsnummer=?, rechnungsdatum=?, betrag_cent=?, waehrung=?, updated_at=? WHERE id=?")
        .bind(&d.rechnungssteller_name).bind(&d.rechnungsnummer).bind(&d.rechnungsdatum)
        .bind(d.betrag_cent).bind(&d.waehrung).bind(jetzt()).bind(&d.id)
        .execute(pool).await?;
    if r.rows_affected() == 0 { return Err(AppError::NichtGefunden); }
    let sql = format!("SELECT {EINGANGSRECHNUNG_SPALTEN} FROM eingangsrechnung WHERE id = ?");
    Ok(sqlx::query_as(&sql).bind(&d.id).fetch_optional(pool).await?.ok_or(AppError::NichtGefunden)?)
}

pub async fn original_exportieren(pool: &SqlitePool, id: String) -> AppResult<EingangsrechnungOriginal> {
    let row: Option<(String, Vec<u8>)> = sqlx::query_as("SELECT dateiname, rohdatei FROM eingangsrechnung WHERE id = ?")
        .bind(&id).fetch_optional(pool).await?;
    let (dateiname, bytes) = row.ok_or(AppError::NichtGefunden)?;
    Ok(EingangsrechnungOriginal { dateiname, bytes })
}

// Dünne Tauri-Wrapper
#[tauri::command]
pub async fn eingangsrechnung_import_vorschau(pool: tauri::State<'_, SqlitePool>, dateiBytes: Vec<u8>) -> AppResult<EingangsrechnungVorschau> {
    import_vorschau(&pool, dateiBytes).await
}
#[tauri::command]
pub async fn eingangsrechnung_speichern(pool: tauri::State<'_, SqlitePool>, dateiBytes: Vec<u8>, dateiname: String, felder: EingangsrechnungFelderNeu) -> AppResult<Eingangsrechnung> {
    speichern(&pool, dateiBytes, dateiname, felder).await
}
#[tauri::command]
pub async fn eingangsrechnung_list(pool: tauri::State<'_, SqlitePool>) -> AppResult<Vec<Eingangsrechnung>> {
    list(&pool).await
}
#[tauri::command]
pub async fn eingangsrechnung_get(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<EingangsrechnungDetail> {
    get(&pool, id).await
}
#[tauri::command]
pub async fn eingangsrechnung_update(pool: tauri::State<'_, SqlitePool>, daten: EingangsrechnungUpdate) -> AppResult<Eingangsrechnung> {
    update(&pool, daten).await
}
#[tauri::command]
pub async fn eingangsrechnung_original_exportieren(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<EingangsrechnungOriginal> {
    original_exportieren(&pool, id).await
}
```

**Hinweis:** Der Parameter heißt hier bewusst `dateiBytes` (camelCase) im Rust-Signatur-Text, weil Tauri v2 Frontend-Aufrufe per Konvention mit camelCase-Keys schickt und diese 1:1 auf die Rust-Parameternamen mappt (siehe bereits etabliertes Muster `kundenpreiseMitloeschen` in `artikel_delete`). `cargo fmt`/Clippy könnte hier ggf. `dateiBytes` als unüblichen Rust-Stil anmerken (Snake-Case ist Konvention) — falls das zu einem Clippy-Fehler statt nur einer Warnung führt, stattdessen `daten_bytes: Vec<u8>` im Rust-Code verwenden und im Frontend (Task 8) mit `datenBytes` aufrufen; wichtig ist nur, dass Rust- und Frontend-Seite exakt zusammenpassen.

- [ ] **Step 4: In `lib.rs` registrieren**

`src-tauri/src/lib.rs`, vorher:

```rust
            commands::einstellungen::nummernkreis_list,
            commands::einstellungen::nummernkreis_update
        ])
```

nachher:

```rust
            commands::einstellungen::nummernkreis_list,
            commands::einstellungen::nummernkreis_update,
            commands::eingangsrechnungen::eingangsrechnung_import_vorschau,
            commands::eingangsrechnungen::eingangsrechnung_speichern,
            commands::eingangsrechnungen::eingangsrechnung_list,
            commands::eingangsrechnungen::eingangsrechnung_get,
            commands::eingangsrechnungen::eingangsrechnung_update,
            commands::eingangsrechnungen::eingangsrechnung_original_exportieren
        ])
```

- [ ] **Step 5: Tests laufen**

Run: `cd src-tauri && cargo test eingangsrechnungen::`
Erwartet: PASS (alle Tests in `commands::eingangsrechnungen`, aktuell 11 Tests).

- [ ] **Step 6: Volle Rust-Suite + Build**

Run: `cd src-tauri && cargo test` → 132/132
Run: `cd src-tauri && cargo build` → PASS

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands/eingangsrechnungen.rs src-tauri/src/lib.rs
git commit -m "feat: eingangsrechnung get/update/original_exportieren + Tauri-Registrierung"
```

---

### Task 8: Frontend — API-Anpassungen

**Files:**
- Modify: `src/api.ts`

- [ ] **Step 1: Typen und Namespace ergänzen**

`src/api.ts`, nach dem `OffenerPosten`-Interface (vor `AppFehler`) einfügen:

```ts
export interface EingangsrechnungPosition {
  bezeichnung: string;
  menge: number;
  einzelpreis_cent: number;
  positionssumme_cent: number;
}
export interface EingangsrechnungFelderNeu {
  rechnungssteller_name: string;
  rechnungsnummer: string;
  rechnungsdatum: string;
  betrag_cent: number;
  waehrung: string;
  positionen: EingangsrechnungPosition[];
}
export interface EingangsrechnungVorschau {
  geparst: boolean;
  felder: EingangsrechnungFelderNeu;
  ist_duplikat: boolean;
}
export interface Eingangsrechnung {
  id: string;
  dateiname: string;
  format: "xrechnung" | "zugferd";
  rechnungssteller_name: string;
  rechnungsnummer: string;
  rechnungsdatum: string;
  betrag_cent: number;
  waehrung: string;
  manuell_erfasst: boolean;
  importiert_am: string;
}
export interface EingangsrechnungUpdate {
  id: string;
  rechnungssteller_name: string;
  rechnungsnummer: string;
  rechnungsdatum: string;
  betrag_cent: number;
  waehrung: string;
}
export interface EingangsrechnungDetail {
  eingangsrechnung: Eingangsrechnung;
  positionen: EingangsrechnungPosition[];
}
export interface EingangsrechnungOriginal {
  dateiname: string;
  bytes: number[];
}
```

Am Ende des `api`-Objekts, nach `belege: { ... }`, vor der schließenden `};` ergänzen:

```ts
  eingangsrechnungen: {
    importVorschau: (dateiBytes: number[]) =>
      invoke<EingangsrechnungVorschau>("eingangsrechnung_import_vorschau", { dateiBytes }),
    speichern: (dateiBytes: number[], dateiname: string, felder: EingangsrechnungFelderNeu) =>
      invoke<Eingangsrechnung>("eingangsrechnung_speichern", { dateiBytes, dateiname, felder }),
    list: () => invoke<Eingangsrechnung[]>("eingangsrechnung_list"),
    get: (id: string) => invoke<EingangsrechnungDetail>("eingangsrechnung_get", { id }),
    update: (daten: EingangsrechnungUpdate) => invoke<Eingangsrechnung>("eingangsrechnung_update", { daten }),
    originalExportieren: (id: string) => invoke<EingangsrechnungOriginal>("eingangsrechnung_original_exportieren", { id }),
  },
```

- [ ] **Step 2: Build läuft**

Run: `npm run build`
Erwartet: PASS (reine Typ-/API-Erweiterung, keine bestehenden Aufrufstellen betroffen).

- [ ] **Step 3: Volle Frontend-Suite**

Run: `npm test` → 108/108 (unverändert)

- [ ] **Step 4: Commit**

```bash
git add src/api.ts
git commit -m "feat: Frontend-API für Eingangsrechnungen"
```

---

### Task 9: Frontend — `Bestaetigungsdialog` mit optionalem Button-Label

**Files:**
- Modify: `src/components/Bestaetigungsdialog.tsx`
- Modify: `src/components/Bestaetigungsdialog.test.tsx`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

Ans Ende von `describe("Bestaetigungsdialog", ...)` in `Bestaetigungsdialog.test.tsx` anhängen:

```tsx
  it("zeigt ein eigenes Bestätigen-Label, wenn übergeben", () => {
    render(
      <Bestaetigungsdialog
        text="Trotzdem importieren?"
        bestaetigenLabel="Trotzdem importieren"
        onAbbrechen={() => {}}
        onBestaetigen={() => {}}
      />,
    );
    expect(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Trotzdem importieren" }),
    ).toBeTruthy();
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: "Löschen" })).toBeNull();
  });

  it("zeigt weiterhin „Löschen" als Standard-Label ohne bestaetigenLabel", () => {
    render(<Bestaetigungsdialog text="Löschen?" onAbbrechen={() => {}} onBestaetigen={() => {}} />);
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" })).toBeTruthy();
  });
```

- [ ] **Step 2: Test läuft nicht**

Run: `npm test -- Bestaetigungsdialog`
Erwartet: FAIL — `bestaetigenLabel`-Prop wird ignoriert, Button zeigt immer "Löschen".

- [ ] **Step 3: `Bestaetigungsdialog` anpassen**

`src/components/Bestaetigungsdialog.tsx`, vorher:

```tsx
interface BestaetigungsdialogProps {
  text: string;
  onAbbrechen: () => void;
  onBestaetigen: () => void;
}
```

nachher:

```tsx
interface BestaetigungsdialogProps {
  text: string;
  bestaetigenLabel?: string;
  onAbbrechen: () => void;
  onBestaetigen: () => void;
}
```

Vorher:

```tsx
export function Bestaetigungsdialog({ text, onAbbrechen, onBestaetigen }: BestaetigungsdialogProps) {
```

nachher:

```tsx
export function Bestaetigungsdialog({ text, bestaetigenLabel, onAbbrechen, onBestaetigen }: BestaetigungsdialogProps) {
```

Vorher:

```tsx
          <button type="button" className="btn btn-gefahr" onClick={onBestaetigen}>
            Löschen
          </button>
```

nachher:

```tsx
          <button type="button" className="btn btn-gefahr" onClick={onBestaetigen}>
            {bestaetigenLabel ?? "Löschen"}
          </button>
```

- [ ] **Step 4: Tests laufen**

Run: `npm test -- Bestaetigungsdialog`
Erwartet: PASS (alle Tests dieser Datei).

- [ ] **Step 5: Volle Suite + Build**

Run: `npm test` → 110/110
Run: `npm run build` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/Bestaetigungsdialog.tsx src/components/Bestaetigungsdialog.test.tsx
git commit -m "feat: optionales Bestätigen-Label für Bestaetigungsdialog"
```

---

### Task 10: Frontend — Neue Seite (Nav, Routing, Liste)

**Files:**
- Modify: `src/components/Layout.tsx`
- Modify: `src/App.tsx`
- Create: `src/pages/Eingangsrechnungen.tsx`
- Create: `src/pages/Eingangsrechnungen.test.tsx`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

`src/pages/Eingangsrechnungen.test.tsx` (neue Datei):

```tsx
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

vi.mock("../api", () => ({
  api: {
    eingangsrechnungen: {
      list: vi.fn().mockResolvedValue([
        {
          id: "e1", dateiname: "rechnung.xml", format: "xrechnung",
          rechnungssteller_name: "Lieferant GmbH", rechnungsnummer: "RE-2026-0042",
          rechnungsdatum: "2026-07-15", betrag_cent: 23800, waehrung: "EUR",
          manuell_erfasst: false, importiert_am: "2026-07-19T10:00:00Z",
        },
      ]),
      importVorschau: vi.fn(),
      speichern: vi.fn(),
    },
  },
}));
import { Eingangsrechnungen } from "./Eingangsrechnungen";

describe("Eingangsrechnungen", () => {
  it("zeigt die Liste importierter Eingangsrechnungen", async () => {
    render(<Eingangsrechnungen />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    expect(screen.getByText("RE-2026-0042")).toBeTruthy();
    expect(screen.getByText("238,00 €")).toBeTruthy();
  });

  it("zeigt keinen Löschen-Button", async () => {
    render(<Eingangsrechnungen />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Löschen" })).toBeNull();
  });
});
```

- [ ] **Step 2: Test läuft nicht**

Run: `npm test -- Eingangsrechnungen`
Erwartet: FAIL — Datei `./Eingangsrechnungen` existiert noch nicht.

- [ ] **Step 3: `Eingangsrechnungen.tsx` mit Liste implementieren**

`src/pages/Eingangsrechnungen.tsx` (neue Datei):

```tsx
import { useEffect, useState } from "react";
import { api, type AppFehler, type Eingangsrechnung } from "../api";
import { Fehler } from "../components/Fehler";
import { formatCent } from "../geld";

const FORMAT_LABEL: Record<string, string> = {
  xrechnung: "XRechnung",
  zugferd: "ZUGFeRD",
};

export function Eingangsrechnungen() {
  const [liste, setListe] = useState<Eingangsrechnung[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);

  function laden() {
    api.eingangsrechnungen
      .list()
      .then((l) => {
        setListe(l);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }

  useEffect(laden, []);

  return (
    <div>
      <h1 className="seiten-kopf">Eingangsrechnungen</h1>
      <Fehler fehler={fehler} />

      <div className="werkzeugleiste">
        <button type="button" className="btn btn-primaer">
          Importieren
        </button>
      </div>

      <table className="tabelle">
        <thead>
          <tr>
            <th>Rechnungssteller</th>
            <th>Nummer</th>
            <th>Datum</th>
            <th>Betrag</th>
            <th>Format</th>
          </tr>
        </thead>
        <tbody>
          {liste.map((e) => (
            <tr key={e.id}>
              <td>{e.rechnungssteller_name}</td>
              <td className="tabelle-num">{e.rechnungsnummer}</td>
              <td>{e.rechnungsdatum}</td>
              <td>{formatCent(e.betrag_cent)}</td>
              <td>{FORMAT_LABEL[e.format] ?? e.format}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Tests laufen**

Run: `npm test -- Eingangsrechnungen`
Erwartet: PASS (2/2).

- [ ] **Step 5: Nav-Eintrag ergänzen**

`src/components/Layout.tsx`, vorher:

```tsx
export type Seite = "kunden" | "artikel" | "angebote" | "rechnungen" | "einstellungen";
```

nachher:

```tsx
export type Seite = "kunden" | "artikel" | "angebote" | "rechnungen" | "eingangsrechnungen" | "einstellungen";
```

Vorher (Icon-Konstanten, nach `ICON_RECHNUNGEN`, vor `ICON_EINSTELLUNGEN`):

```tsx
const ICON_EINSTELLUNGEN = (
```

nachher:

```tsx
const ICON_EINGANGSRECHNUNGEN = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M5 3h7l3 3v11H5z" strokeLinejoin="round" />
    <path d="M12 3v3h3" strokeLinejoin="round" />
    <path d="M7 12.5 8.5 14 13 9.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ICON_EINSTELLUNGEN = (
```

Vorher:

```tsx
const NAV_EINTRAEGE: NavEintrag[] = [
  { seite: "kunden", label: t("nav.kunden"), icon: ICON_KUNDEN },
  { seite: "artikel", label: t("nav.artikel"), icon: ICON_ARTIKEL },
  { seite: "angebote", label: t("nav.angebote"), icon: ICON_ANGEBOTE },
  { seite: "rechnungen", label: t("nav.rechnungen"), icon: ICON_RECHNUNGEN },
  { seite: "einstellungen", label: t("nav.einstellungen"), icon: ICON_EINSTELLUNGEN },
];
```

nachher:

```tsx
const NAV_EINTRAEGE: NavEintrag[] = [
  { seite: "kunden", label: t("nav.kunden"), icon: ICON_KUNDEN },
  { seite: "artikel", label: t("nav.artikel"), icon: ICON_ARTIKEL },
  { seite: "angebote", label: t("nav.angebote"), icon: ICON_ANGEBOTE },
  { seite: "rechnungen", label: t("nav.rechnungen"), icon: ICON_RECHNUNGEN },
  { seite: "eingangsrechnungen", label: t("nav.eingangsrechnungen"), icon: ICON_EINGANGSRECHNUNGEN },
  { seite: "einstellungen", label: t("nav.einstellungen"), icon: ICON_EINSTELLUNGEN },
];
```

- [ ] **Step 6: i18n-Label ergänzen**

Datei mit `t("nav.rechnungen")` finden (`src/i18n.ts` oder ähnlich) und den passenden Eintrag `nav.rechnungen` ausfindig machen; direkt danach ergänzen:

```ts
"nav.eingangsrechnungen": "Eingangsrechnungen",
```

(Exakter Dateiname/Struktur ist dem Implementierer zu prüfen — `grep -rn "nav.rechnungen" src/i18n.ts`.)

- [ ] **Step 7: In `App.tsx` verdrahten**

`src/App.tsx`, Import ergänzen — vorher:

```tsx
import { Rechnungen } from "./pages/Rechnungen";
import { BelegEditor } from "./pages/BelegEditor";
```

nachher:

```tsx
import { Rechnungen } from "./pages/Rechnungen";
import { BelegEditor } from "./pages/BelegEditor";
import { Eingangsrechnungen } from "./pages/Eingangsrechnungen";
```

Vorher:

```tsx
      {seite === "einstellungen" && <Einstellungen />}
    </Layout>
```

nachher:

```tsx
      {seite === "eingangsrechnungen" && <Eingangsrechnungen />}
      {seite === "einstellungen" && <Einstellungen />}
    </Layout>
```

- [ ] **Step 8: Volle Suite + Build**

Run: `npm test` → 112/112
Run: `npm run build` → PASS

- [ ] **Step 9: Commit**

```bash
git add src/components/Layout.tsx src/App.tsx src/pages/Eingangsrechnungen.tsx src/pages/Eingangsrechnungen.test.tsx src/i18n.ts
git commit -m "feat: Seite Eingangsrechnungen mit Liste, Nav-Eintrag und Routing"
```

---

### Task 11: Frontend — Import-Vorschau (Datei wählen, Bearbeiten-Modus, Duplikat-Warnung, Speichern)

**Files:**
- Modify: `src/pages/Eingangsrechnungen.tsx`
- Modify: `src/pages/Eingangsrechnungen.test.tsx`

- [ ] **Step 1: Fehlschlagende Tests schreiben**

Am Kopf von `Eingangsrechnungen.test.tsx`, Mocks erweitern — vorher:

```tsx
vi.mock("../api", () => ({
  api: {
    eingangsrechnungen: {
      list: vi.fn().mockResolvedValue([
        {
          id: "e1", dateiname: "rechnung.xml", format: "xrechnung",
          rechnungssteller_name: "Lieferant GmbH", rechnungsnummer: "RE-2026-0042",
          rechnungsdatum: "2026-07-15", betrag_cent: 23800, waehrung: "EUR",
          manuell_erfasst: false, importiert_am: "2026-07-19T10:00:00Z",
        },
      ]),
      importVorschau: vi.fn(),
      speichern: vi.fn(),
    },
  },
}));
import { Eingangsrechnungen } from "./Eingangsrechnungen";
```

nachher:

```tsx
vi.mock("../api", () => ({
  api: {
    eingangsrechnungen: {
      list: vi.fn().mockResolvedValue([
        {
          id: "e1", dateiname: "rechnung.xml", format: "xrechnung",
          rechnungssteller_name: "Lieferant GmbH", rechnungsnummer: "RE-2026-0042",
          rechnungsdatum: "2026-07-15", betrag_cent: 23800, waehrung: "EUR",
          manuell_erfasst: false, importiert_am: "2026-07-19T10:00:00Z",
        },
      ]),
      importVorschau: vi.fn().mockResolvedValue({
        geparst: true,
        felder: {
          rechnungssteller_name: "Neuer Lieferant", rechnungsnummer: "RE-9999",
          rechnungsdatum: "2026-07-19", betrag_cent: 10000, waehrung: "EUR", positionen: [],
        },
        ist_duplikat: false,
      }),
      speichern: vi.fn().mockResolvedValue({
        id: "e2", dateiname: "neu.xml", format: "xrechnung",
        rechnungssteller_name: "Neuer Lieferant", rechnungsnummer: "RE-9999",
        rechnungsdatum: "2026-07-19", betrag_cent: 10000, waehrung: "EUR",
        manuell_erfasst: false, importiert_am: "2026-07-19T11:00:00Z",
      }),
    },
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn().mockResolvedValue("/pfad/rechnung.xml") }));
vi.mock("@tauri-apps/plugin-fs", () => ({ readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])) }));
import { fireEvent } from "@testing-library/react";
import { open } from "@tauri-apps/plugin-dialog";
import { Eingangsrechnungen } from "./Eingangsrechnungen";
```

`fireEvent` und `waitFor` sind bereits im obersten `import "@testing-library/react"`-Statement enthalten — `within` muss dort ergänzt werden. Vorher:

```tsx
import { cleanup, render, screen, waitFor } from "@testing-library/react";
```

nachher:

```tsx
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
```

(Der separate `import { fireEvent } from "@testing-library/react";` aus dem Mock-Block oben entfällt dann — nur eine gemeinsame Import-Zeile am Dateikopf.)

Neue Tests ans Ende von `describe("Eingangsrechnungen", ...)` anhängen:

```tsx
  it("zeigt nach Dateiauswahl die geparsten Felder nur als Text, mit Bearbeiten-Button", async () => {
    render(<Eingangsrechnungen />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Importieren" }));
    await waitFor(() => expect(screen.getByText("Neuer Lieferant")).toBeTruthy());
    expect(screen.queryByLabelText("Rechnungssteller")).toBeNull();
    expect(screen.getByRole("button", { name: "Bearbeiten" })).toBeTruthy();
  });

  it("wechselt nach Klick auf Bearbeiten in editierbare Felder", async () => {
    render(<Eingangsrechnungen />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Importieren" }));
    await waitFor(() => expect(screen.getByText("Neuer Lieferant")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    expect(screen.getByLabelText("Rechnungssteller")).toBeTruthy();
  });

  it("zeigt bei Parse-Fehlschlag sofort editierbare, leere Felder ohne Bearbeiten-Button", async () => {
    const { api } = await import("../api");
    vi.mocked(api.eingangsrechnungen.importVorschau).mockResolvedValueOnce({
      geparst: false,
      felder: { rechnungssteller_name: "", rechnungsnummer: "", rechnungsdatum: "", betrag_cent: 0, waehrung: "EUR", positionen: [] },
      ist_duplikat: false,
    });
    render(<Eingangsrechnungen />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Importieren" }));
    await waitFor(() => expect(screen.getByText(/Konnte nicht automatisch gelesen werden/)).toBeTruthy());
    expect(screen.getByLabelText("Rechnungssteller")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Bearbeiten" })).toBeNull();
  });

  it("speichert nach Bestätigung und zeigt die Liste ohne Vorschau", async () => {
    const { api } = await import("../api");
    render(<Eingangsrechnungen />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Importieren" }));
    await waitFor(() => expect(screen.getByText("Neuer Lieferant")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(api.eingangsrechnungen.speichern).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "Bearbeiten" })).toBeNull();
  });

  it("warnt bei Duplikat und speichert erst nach Bestätigung des Dialogs", async () => {
    const { api } = await import("../api");
    vi.mocked(api.eingangsrechnungen.importVorschau).mockResolvedValueOnce({
      geparst: true,
      felder: {
        rechnungssteller_name: "Lieferant GmbH", rechnungsnummer: "RE-2026-0042",
        rechnungsdatum: "2026-07-15", betrag_cent: 23800, waehrung: "EUR", positionen: [],
      },
      ist_duplikat: true,
    });
    render(<Eingangsrechnungen />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Importieren" }));
    await waitFor(() => expect(screen.getByText(/bereits importiert/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(api.eingangsrechnungen.speichern).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Trotzdem importieren" }));
    await waitFor(() => expect(api.eingangsrechnungen.speichern).toHaveBeenCalledTimes(1));
  });

  it("öffnet den Datei-Dialog mit XML/PDF-Filter beim Klick auf Importieren", async () => {
    render(<Eingangsrechnungen />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Importieren" }));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        expect.objectContaining({ filters: [{ name: "E-Rechnung", extensions: ["xml", "pdf"] }] }),
      ),
    );
  });
```

**Wichtig — Reihenfolge:** Kein `clearMocks`/`resetMocks` in der Vitest-Konfiguration dieses Projekts — wie bei allen vorherigen Wiring-Tasks in diesem Projekt müssen Tests, die `not.toHaveBeenCalled()` auf einem gemeinsam genutzten Mock prüfen (hier: der Duplikat-Test), vor jedem Test stehen, der denselben Mock (`api.eingangsrechnungen.speichern`) bereits erfolgreich aufgerufen hat. Der Duplikat-Test steht hier bewusst NACH dem regulären "speichert nach Bestätigung"-Test — das ist unproblematisch, weil der Duplikat-Test selbst `not.toHaveBeenCalled()` nur VOR seinem eigenen Bestätigen-Klick prüft, also nur den Aufruf-Stand innerhalb desselben Tests, nicht über Tests hinweg. Trotzdem: aus Konsistenzgründen mit dem Rest des Projekts sollte dieser Test so schreiben, dass er unabhängig von der Ausführungsreihenfolge korrekt bleibt — was hier der Fall ist, da die Assertion `not.toHaveBeenCalled()` unmittelbar nach dem Öffnen des Dialogs und vor dem eigenen Bestätigen-Klick erfolgt, nicht als alleinstehende Prüfung am Testanfang.

- [ ] **Step 2: Tests laufen nicht**

Run: `npm test -- Eingangsrechnungen`
Erwartet: FAIL — kein Import-Vorschau-Formular vorhanden.

- [ ] **Step 3: Import ergänzen**

`src/pages/Eingangsrechnungen.tsx`, vorher:

```tsx
import { useEffect, useState } from "react";
import { api, type AppFehler, type Eingangsrechnung } from "../api";
import { Fehler } from "../components/Fehler";
import { formatCent } from "../geld";
```

nachher:

```tsx
import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { api, type AppFehler, type Eingangsrechnung, type EingangsrechnungFelderNeu, type EingangsrechnungVorschau } from "../api";
import { Bestaetigungsdialog } from "../components/Bestaetigungsdialog";
import { Fehler } from "../components/Fehler";
import { formatCent, formatMenge } from "../geld";
```

- [ ] **Step 4: State und Handler ergänzen**

Vorher:

```tsx
export function Eingangsrechnungen() {
  const [liste, setListe] = useState<Eingangsrechnung[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);

  function laden() {
    api.eingangsrechnungen
      .list()
      .then((l) => {
        setListe(l);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }

  useEffect(laden, []);

  return (
```

nachher:

```tsx
export function Eingangsrechnungen() {
  const [liste, setListe] = useState<Eingangsrechnung[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [vorschau, setVorschau] = useState<EingangsrechnungVorschau | null>(null);
  const [dateiBytes, setDateiBytes] = useState<number[]>([]);
  const [dateiname, setDateiname] = useState("");
  const [bearbeitenModus, setBearbeitenModus] = useState(false);
  const [zeigeDuplikatWarnung, setZeigeDuplikatWarnung] = useState(false);

  function laden() {
    api.eingangsrechnungen
      .list()
      .then((l) => {
        setListe(l);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }

  useEffect(laden, []);

  async function dateiImportierenAuswaehlen() {
    const pfad = await open({ multiple: false, filters: [{ name: "E-Rechnung", extensions: ["xml", "pdf"] }] });
    if (!pfad || typeof pfad !== "string") return;
    const bytes = Array.from(await readFile(pfad));
    setDateiBytes(bytes);
    setDateiname(pfad.split(/[/\\]/).pop() ?? pfad);
    setFehler(null);
    try {
      const v = await api.eingangsrechnungen.importVorschau(bytes);
      setVorschau(v);
      setBearbeitenModus(false);
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  function feldAendern<K extends keyof EingangsrechnungFelderNeu>(feld: K, wert: EingangsrechnungFelderNeu[K]) {
    if (!vorschau) return;
    setVorschau({ ...vorschau, felder: { ...vorschau.felder, [feld]: wert } });
  }

  async function speichernAusfuehren() {
    if (!vorschau) return;
    setFehler(null);
    try {
      await api.eingangsrechnungen.speichern(dateiBytes, dateiname, vorschau.felder);
      setVorschau(null);
      setZeigeDuplikatWarnung(false);
      laden();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  function speichernKlick() {
    if (vorschau?.ist_duplikat) {
      setZeigeDuplikatWarnung(true);
      return;
    }
    speichernAusfuehren();
  }

  return (
```

- [ ] **Step 5: Render anpassen**

Vorher:

```tsx
      <div className="werkzeugleiste">
        <button type="button" className="btn btn-primaer">
          Importieren
        </button>
      </div>
```

nachher:

```tsx
      {zeigeDuplikatWarnung && (
        <Bestaetigungsdialog
          text={`Rechnung Nr. „${vorschau?.felder.rechnungsnummer}" von „${vorschau?.felder.rechnungssteller_name}" wurde bereits importiert. Trotzdem importieren?`}
          bestaetigenLabel="Trotzdem importieren"
          onAbbrechen={() => setZeigeDuplikatWarnung(false)}
          onBestaetigen={speichernAusfuehren}
        />
      )}

      <div className="werkzeugleiste">
        <button type="button" className="btn btn-primaer" onClick={dateiImportierenAuswaehlen}>
          Importieren
        </button>
      </div>

      {vorschau && (
        <form
          className="karte"
          onSubmit={(e) => {
            e.preventDefault();
            speichernKlick();
          }}
        >
          {!vorschau.geparst && (
            <p role="alert">Konnte nicht automatisch gelesen werden — bitte Felder von Hand eintragen.</p>
          )}
          {vorschau.ist_duplikat && !zeigeDuplikatWarnung && (
            <p>Diese Rechnung wurde möglicherweise bereits importiert.</p>
          )}

          {vorschau.geparst && !bearbeitenModus ? (
            <>
              <p>Rechnungssteller: {vorschau.felder.rechnungssteller_name}</p>
              <p>Nummer: {vorschau.felder.rechnungsnummer}</p>
              <p>Datum: {vorschau.felder.rechnungsdatum}</p>
              <p>Betrag: {formatCent(vorschau.felder.betrag_cent)}</p>
              <button type="button" className="btn" onClick={() => setBearbeitenModus(true)}>
                Bearbeiten
              </button>
            </>
          ) : (
            <>
              <label className="feld">
                Rechnungssteller
                <input
                  value={vorschau.felder.rechnungssteller_name}
                  onChange={(e) => feldAendern("rechnungssteller_name", e.currentTarget.value)}
                />
              </label>
              <label className="feld">
                Nummer
                <input
                  value={vorschau.felder.rechnungsnummer}
                  onChange={(e) => feldAendern("rechnungsnummer", e.currentTarget.value)}
                />
              </label>
              <label className="feld">
                Datum
                <input
                  type="date"
                  value={vorschau.felder.rechnungsdatum}
                  onChange={(e) => feldAendern("rechnungsdatum", e.currentTarget.value)}
                />
              </label>
              <label className="feld">
                Betrag (Cent)
                <input
                  type="number"
                  value={vorschau.felder.betrag_cent}
                  onChange={(e) => feldAendern("betrag_cent", Number(e.currentTarget.value))}
                />
              </label>
            </>
          )}

          {vorschau.felder.positionen.length > 0 && (
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Bezeichnung</th>
                  <th>Menge</th>
                  <th>Einzelpreis</th>
                  <th>Summe</th>
                </tr>
              </thead>
              <tbody>
                {vorschau.felder.positionen.map((p, i) => (
                  <tr key={i}>
                    <td>{p.bezeichnung}</td>
                    <td>{formatMenge(p.menge)}</td>
                    <td>{formatCent(p.einzelpreis_cent)}</td>
                    <td>{formatCent(p.positionssumme_cent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <button type="submit" className="btn btn-primaer">Speichern</button>
        </form>
      )}
```

**Wichtig — Label-Kollision vermieden:** Der Submit-Button im Formular heißt bewusst "Speichern", nicht "Importieren" — der Listen-Trigger-Button "Importieren" bleibt im DOM sichtbar, solange die Vorschau eingeblendet ist. Zwei gleichnamige Buttons würden `getByRole("button", { name: "Importieren" })` in Tests mehrdeutig machen (siehe Spec-Review-Fund).

**Wichtig — Label-Kollision vermieden:** Der Submit-Button im Formular heißt bewusst "Speichern", nicht "Importieren" — der Listen-Trigger-Button "Importieren" bleibt im DOM sichtbar, solange die Vorschau eingeblendet ist. Zwei gleichnamige Buttons würden `getByRole("button", { name: "Importieren" })` in Tests mehrdeutig machen (siehe Spec-Review-Fund).

- [ ] **Step 6: Tests laufen**

Run: `npm test -- Eingangsrechnungen`
Erwartet: PASS (alle Tests dieser Datei).

- [ ] **Step 7: Volle Suite + Build**

Run: `npm test` → 119/119
Run: `npm run build` → PASS

- [ ] **Step 8: Commit**

```bash
git add src/pages/Eingangsrechnungen.tsx src/pages/Eingangsrechnungen.test.tsx
git commit -m "feat: Import-Vorschau mit Bearbeiten-Modus und Duplikat-Warnung"
```

---

### Task 12: Frontend — Detailansicht

**Files:**
- Create: `src/pages/EingangsrechnungDetail.tsx`
- Create: `src/pages/EingangsrechnungDetail.test.tsx`
- Modify: `src/pages/Eingangsrechnungen.tsx` (Zeilen-Klick öffnet Detail)
- Modify: `src/App.tsx`

- [ ] **Step 1: Fehlschlagende Tests schreiben**

`src/pages/EingangsrechnungDetail.test.tsx` (neue Datei):

```tsx
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

const BEISPIEL_DETAIL = {
  eingangsrechnung: {
    id: "e1", dateiname: "rechnung.xml", format: "xrechnung" as const,
    rechnungssteller_name: "Lieferant GmbH", rechnungsnummer: "RE-2026-0042",
    rechnungsdatum: "2026-07-15", betrag_cent: 23800, waehrung: "EUR",
    manuell_erfasst: false, importiert_am: "2026-07-19T10:00:00Z",
  },
  positionen: [
    { bezeichnung: "Bürobedarf", menge: 2000, einzelpreis_cent: 11900, positionssumme_cent: 23800 },
  ],
};

vi.mock("../api", () => ({
  api: {
    eingangsrechnungen: {
      get: vi.fn().mockResolvedValue(BEISPIEL_DETAIL),
      update: vi.fn().mockResolvedValue(BEISPIEL_DETAIL.eingangsrechnung),
      originalExportieren: vi.fn().mockResolvedValue({ dateiname: "rechnung.xml", bytes: [1, 2, 3] }),
    },
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn().mockResolvedValue("/pfad/rechnung.xml") }));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeFile: vi.fn().mockResolvedValue(undefined) }));
import { writeFile } from "@tauri-apps/plugin-fs";
import { EingangsrechnungDetail } from "./EingangsrechnungDetail";

describe("EingangsrechnungDetail", () => {
  it("zeigt Kernfelder und Positionstabelle", async () => {
    render(<EingangsrechnungDetail id="e1" />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    expect(screen.getByText("RE-2026-0042")).toBeTruthy();
    expect(screen.getByText("Bürobedarf")).toBeTruthy();
    expect(screen.getByText("238,00 €")).toBeTruthy();
  });

  it("zeigt keinen Löschen-Button", async () => {
    render(<EingangsrechnungDetail id="e1" />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Löschen" })).toBeNull();
  });

  it("wechselt nach Bearbeiten-Klick in editierbare Felder und speichert per update", async () => {
    const { api } = await import("../api");
    render(<EingangsrechnungDetail id="e1" />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    fireEvent.change(screen.getByLabelText("Rechnungssteller"), { target: { value: "Korrigiert GmbH" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(api.eingangsrechnungen.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: "e1", rechnungssteller_name: "Korrigiert GmbH" }),
      ),
    );
  });

  it("exportiert die Original-Datei über den Speichern-Dialog", async () => {
    render(<EingangsrechnungDetail id="e1" />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Original-Datei exportieren" }));
    await waitFor(() =>
      expect(writeFile).toHaveBeenCalledWith("/pfad/rechnung.xml", new Uint8Array([1, 2, 3])),
    );
  });
});
```

- [ ] **Step 2: Test läuft nicht**

Run: `npm test -- EingangsrechnungDetail`
Erwartet: FAIL — Datei `./EingangsrechnungDetail` existiert noch nicht.

- [ ] **Step 3: `EingangsrechnungDetail.tsx` implementieren**

`src/pages/EingangsrechnungDetail.tsx` (neue Datei):

```tsx
import { useEffect, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { api, type AppFehler, type EingangsrechnungDetail as EingangsrechnungDetailTyp } from "../api";
import { Fehler } from "../components/Fehler";
import { formatCent, formatMenge } from "../geld";

interface EingangsrechnungDetailProps {
  id: string;
}

export function EingangsrechnungDetail({ id }: EingangsrechnungDetailProps) {
  const [detail, setDetail] = useState<EingangsrechnungDetailTyp | null>(null);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [bearbeitenModus, setBearbeitenModus] = useState(false);
  const [rechnungsstellerName, setRechnungsstellerName] = useState("");
  const [rechnungsnummer, setRechnungsnummer] = useState("");
  const [rechnungsdatum, setRechnungsdatum] = useState("");
  const [betragCent, setBetragCent] = useState(0);
  const [waehrung, setWaehrung] = useState("EUR");

  function laden() {
    api.eingangsrechnungen
      .get(id)
      .then((d) => {
        setDetail(d);
        setRechnungsstellerName(d.eingangsrechnung.rechnungssteller_name);
        setRechnungsnummer(d.eingangsrechnung.rechnungsnummer);
        setRechnungsdatum(d.eingangsrechnung.rechnungsdatum);
        setBetragCent(d.eingangsrechnung.betrag_cent);
        setWaehrung(d.eingangsrechnung.waehrung);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }

  useEffect(laden, [id]);

  async function speichern() {
    setFehler(null);
    try {
      await api.eingangsrechnungen.update({
        id, rechnungssteller_name: rechnungsstellerName, rechnungsnummer,
        rechnungsdatum, betrag_cent: betragCent, waehrung,
      });
      setBearbeitenModus(false);
      laden();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function originalExportieren() {
    setFehler(null);
    try {
      const original = await api.eingangsrechnungen.originalExportieren(id);
      const ziel = await save({ defaultPath: original.dateiname });
      if (ziel) {
        await writeFile(ziel, new Uint8Array(original.bytes));
      }
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  if (!detail) {
    return (
      <div>
        <Fehler fehler={fehler} />
      </div>
    );
  }

  return (
    <div>
      <h1 className="seiten-kopf">Eingangsrechnung</h1>
      <Fehler fehler={fehler} />

      {bearbeitenModus ? (
        <form
          className="karte"
          onSubmit={(e) => {
            e.preventDefault();
            speichern();
          }}
        >
          <label className="feld">
            Rechnungssteller
            <input value={rechnungsstellerName} onChange={(e) => setRechnungsstellerName(e.currentTarget.value)} />
          </label>
          <label className="feld">
            Nummer
            <input value={rechnungsnummer} onChange={(e) => setRechnungsnummer(e.currentTarget.value)} />
          </label>
          <label className="feld">
            Datum
            <input type="date" value={rechnungsdatum} onChange={(e) => setRechnungsdatum(e.currentTarget.value)} />
          </label>
          <label className="feld">
            Betrag (Cent)
            <input type="number" value={betragCent} onChange={(e) => setBetragCent(Number(e.currentTarget.value))} />
          </label>
          <button type="submit" className="btn btn-primaer">Speichern</button>
        </form>
      ) : (
        <div className="karte">
          <p>Rechnungssteller: {detail.eingangsrechnung.rechnungssteller_name}</p>
          <p>Nummer: {detail.eingangsrechnung.rechnungsnummer}</p>
          <p>Datum: {detail.eingangsrechnung.rechnungsdatum}</p>
          <p>Betrag: {formatCent(detail.eingangsrechnung.betrag_cent)}</p>
          <button type="button" className="btn" onClick={() => setBearbeitenModus(true)}>
            Bearbeiten
          </button>
          <button type="button" className="btn" onClick={originalExportieren}>
            Original-Datei exportieren
          </button>
        </div>
      )}

      <table className="tabelle">
        <thead>
          <tr>
            <th>Bezeichnung</th>
            <th>Menge</th>
            <th>Einzelpreis</th>
            <th>Summe</th>
          </tr>
        </thead>
        <tbody>
          {detail.positionen.map((p, i) => (
            <tr key={i}>
              <td>{p.bezeichnung}</td>
              <td>{formatMenge(p.menge)}</td>
              <td>{formatCent(p.einzelpreis_cent)}</td>
              <td>{formatCent(p.positionssumme_cent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Tests laufen**

Run: `npm test -- EingangsrechnungDetail`
Erwartet: PASS (4/4).

- [ ] **Step 5: Zeilen-Klick in der Liste öffnet Detail**

`src/pages/Eingangsrechnungen.tsx`, `EingangsrechnungenProps` ergänzen — vorher:

```tsx
export function Eingangsrechnungen() {
```

nachher:

```tsx
interface EingangsrechnungenProps {
  onOeffnen: (id: string) => void;
}

export function Eingangsrechnungen({ onOeffnen }: EingangsrechnungenProps) {
```

Vorher (Tabellenzeile):

```tsx
          {liste.map((e) => (
            <tr key={e.id}>
```

nachher:

```tsx
          {liste.map((e) => (
            <tr key={e.id} onClick={() => onOeffnen(e.id)}>
```

Vorher (Tabellen-Klasse):

```tsx
      <table className="tabelle">
        <thead>
          <tr>
            <th>Rechnungssteller</th>
```

nachher:

```tsx
      <table className="tabelle tabelle-klickbar">
        <thead>
          <tr>
            <th>Rechnungssteller</th>
```

In `Eingangsrechnungen.test.tsx` müssen alle bestehenden `render(<Eingangsrechnungen />)`-Aufrufe um die neue Pflicht-Prop ergänzt werden — vorher:

```tsx
render(<Eingangsrechnungen />);
```

nachher (jedes Vorkommen in der Datei, per Suchen&Ersetzen):

```tsx
render(<Eingangsrechnungen onOeffnen={() => {}} />);
```

- [ ] **Step 6: In `App.tsx` verdrahten**

Vorher:

```tsx
  const [formularBeimStartZiel, setFormularBeimStartZiel] = useState<"kunden" | "artikel" | null>(null);
```

nachher:

```tsx
  const [formularBeimStartZiel, setFormularBeimStartZiel] = useState<"kunden" | "artikel" | null>(null);
  const [ausgewaehlteEingangsrechnung, setAusgewaehlteEingangsrechnung] = useState<string | null>(null);
```

Vorher (in `navigiere`):

```tsx
  function navigiere(neueSeite: Seite) {
    setAusgewaehlterKunde(null);
    setKundeDetailStartReiter(null);
    setAusgewaehltesAngebot(null);
    setAusgewaehlteRechnung(null);
    setFormularBeimStartZiel(null);
    setSeite(neueSeite);
  }
```

nachher:

```tsx
  function navigiere(neueSeite: Seite) {
    setAusgewaehlterKunde(null);
    setKundeDetailStartReiter(null);
    setAusgewaehltesAngebot(null);
    setAusgewaehlteRechnung(null);
    setAusgewaehlteEingangsrechnung(null);
    setFormularBeimStartZiel(null);
    setSeite(neueSeite);
  }
```

Import ergänzen — vorher:

```tsx
import { Eingangsrechnungen } from "./pages/Eingangsrechnungen";
```

nachher:

```tsx
import { Eingangsrechnungen } from "./pages/Eingangsrechnungen";
import { EingangsrechnungDetail } from "./pages/EingangsrechnungDetail";
```

Vorher:

```tsx
      {seite === "eingangsrechnungen" && <Eingangsrechnungen />}
```

nachher:

```tsx
      {seite === "eingangsrechnungen" &&
        (ausgewaehlteEingangsrechnung ? (
          <EingangsrechnungDetail id={ausgewaehlteEingangsrechnung} />
        ) : (
          <Eingangsrechnungen onOeffnen={setAusgewaehlteEingangsrechnung} />
        ))}
```

- [ ] **Step 7: Volle Suite + Build**

Run: `npm test` → 123/123
Run: `npm run build` → PASS

- [ ] **Step 8: Commit**

```bash
git add src/pages/EingangsrechnungDetail.tsx src/pages/EingangsrechnungDetail.test.tsx src/pages/Eingangsrechnungen.tsx src/pages/Eingangsrechnungen.test.tsx src/App.tsx
git commit -m "feat: Detailansicht für Eingangsrechnungen mit Bearbeiten und Original-Export"
```

---

### Task 13: Abschlussprüfung

**Files:** keine Änderungen — reine Verifikation.

- [ ] **Step 1: Vollständige Frontend-Test-Suite**

Run: `npm test`
Erwartet: alle 123 Tests grün.

- [ ] **Step 2: Typecheck und Build**

Run: `npm run build`
Erwartet: `tsc && vite build` erfolgreich, keine Typfehler.

- [ ] **Step 3: Rust-Tests**

Run: `cd src-tauri && cargo test`
Erwartet: alle 132 Tests grün.

- [ ] **Step 4: Manuelle Abnahme (durch Auftraggeber)**

`npm run tauri dev` starten und folgende Abläufe einmal live durchklicken:
1. Eine eigene, zuvor über "Als XRechnung (XML) exportieren" erzeugte XML-Datei einer Rechnung als Eingangsrechnung importieren → Felder werden automatisch korrekt erkannt (eigener Firmenname als "Rechnungssteller", da wir hier die Perspektive tauschen — bewusst nur ein technischer Rundlauf-Test, kein realistisches Szenario).
2. Dieselbe Datei ein zweites Mal importieren → Duplikat-Warnung erscheint, Abbrechen funktioniert, "Trotzdem importieren" funktioniert.
3. Eine beliebige Textdatei (umbenannt in `.xml`) importieren → Parse-Fehlschlag-Hinweis erscheint, Felder sind leer und direkt editierbar, von Hand ausgefüllte Werte werden beim Speichern übernommen.
4. Eine über "Als ZUGFeRD-Rechnung exportieren" erzeugte PDF-Datei importieren → Felder werden aus dem eingebetteten XML korrekt gelesen, Format zeigt "ZUGFeRD".
5. In der Liste auf eine importierte Eingangsrechnung klicken → Detailansicht öffnet sich mit Positionstabelle.
6. In der Detailansicht "Bearbeiten" klicken, ein Feld ändern, speichern → Änderung wird übernommen und in der Liste sichtbar.
7. "Original-Datei exportieren" klicken → Speichern-Dialog öffnet sich, Datei landet unverändert am gewählten Ort.
8. Prüfen: nirgends in der Liste oder Detailansicht existiert ein Löschen-Button.
9. Hell- und Dunkelmodus stichprobenartig gegenprüfen.

- [ ] **Step 5: Commit (nur falls Schritt 4 Korrekturen ergab)**

Nur falls die manuelle Abnahme Anpassungen ergeben hat — sonst entfällt dieser Schritt.

---

## Nach Task 13

Alle 13 Tasks abgeschlossen → Merge nach `main` über `superpowers:finishing-a-development-branch`.
