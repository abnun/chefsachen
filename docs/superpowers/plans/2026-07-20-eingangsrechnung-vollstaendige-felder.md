# Eingangsrechnung: Vollständige Felderfassung — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Beim Import einer Eingangsrechnung (XRechnung/ZUGFeRD) werden zusätzlich zu den bisherigen 5 Kernfeldern rund 20 weitere Felder (Anschriften, Steuernummer, Kontakt-E-Mail, Zahlungsbedingungen, Bankverbindung, Referenzen, Liefer-/Leistungsdatum) sowie mehrere Steuersatz-Zeilen geparst, gespeichert und angezeigt — als reine Anzeige, nicht editierbar.

**Architektur:** Migration fügt 20 Spalten auf `eingangsrechnung` sowie eine neue Tabelle `eingangsrechnungsteuer` hinzu. Die bestehenden CII-/UBL-Parser-State-Machines (`eingangsrechnung_parse.rs`) bekommen zusätzliche Ziel-Pfade in ihren bestehenden Match-Armen sowie ein zweites Wiederholungs-Paar (`in_steuerzeile`/`steuerzeilen_pfad`) analog zum bestehenden Positions-Pfad-Tracking. Die Commands-Schicht (`eingangsrechnungen.rs`) reicht die neuen Felder durch, ohne die Architektur zu ändern. Im Frontend zeigt eine neue, reine Anzeige-Komponente `EingangsrechnungZusatzfelder` die neuen Daten gruppiert an — verwendet sowohl in der Import-Vorschau als auch in der Detailansicht.

**Tech Stack:** Rust (`quick-xml`, `sqlx`/SQLite), React/TypeScript, Vitest, `cargo test`.

**Spec:** `docs/superpowers/specs/2026-07-20-eingangsrechnung-vollstaendige-felder-design.md`

---

## Feld-Referenz (für alle Tasks)

Die folgenden 20 neuen Skalarfelder (alle `String`, Default `""`) werden in Migration, Rust-Structs (Backend) und TypeScript-Interfaces (Frontend) identisch benannt:

`kaeufer_name`, `kaeufer_strasse`, `kaeufer_plz`, `kaeufer_ort`, `kaeufer_land`, `verkaeufer_strasse`, `verkaeufer_plz`, `verkaeufer_ort`, `verkaeufer_land`, `verkaeufer_steuernummer`, `verkaeufer_email`, `zahlungsbedingungen`, `faelligkeitsdatum`, `iban`, `bic`, `bankname`, `bestellnummer`, `leitweg_id`, `lieferantennummer`, `leistungsdatum`.

Dazu die neue Steuerzeilen-Liste (mehrere Sätze pro Rechnung): `nettobetrag_cent: i64`, `steuersatz_promille: i64`, `steuerbetrag_cent: i64`.

---

### Task 1: Datenmodell (Migration)

**Files:**
- Create: `src-tauri/migrations/0004_eingangsrechnung_erweitert.sql`

- [ ] **Step 1: Migration schreiben**

```sql
ALTER TABLE eingangsrechnung ADD COLUMN kaeufer_name TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN kaeufer_strasse TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN kaeufer_plz TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN kaeufer_ort TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN kaeufer_land TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN verkaeufer_strasse TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN verkaeufer_plz TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN verkaeufer_ort TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN verkaeufer_land TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN verkaeufer_steuernummer TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN verkaeufer_email TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN zahlungsbedingungen TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN faelligkeitsdatum TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN iban TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN bic TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN bankname TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN bestellnummer TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN leitweg_id TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN lieferantennummer TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN leistungsdatum TEXT NOT NULL DEFAULT '';

CREATE TABLE eingangsrechnungsteuer (
  id TEXT PRIMARY KEY,
  eingangsrechnung_id TEXT NOT NULL REFERENCES eingangsrechnung(id),
  nettobetrag_cent INTEGER NOT NULL DEFAULT 0,
  steuersatz_promille INTEGER NOT NULL DEFAULT 0,
  steuerbetrag_cent INTEGER NOT NULL DEFAULT 0,
  reihenfolge INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
```

- [ ] **Step 2: Migration anwenden lassen und prüfen**

Run: `cd src-tauri && cargo test db::tests::init_db_legt_datei_an_und_migriert -- --nocapture`
Expected: PASS (die Migration wird beim Testlauf automatisch ausgeführt — `sqlx::migrate!` in `db.rs` liest alle Dateien im `migrations`-Ordner; ein Fehler hier bedeutet ungültiges SQL).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/migrations/0004_eingangsrechnung_erweitert.sql
git commit -m "feat: Datenmodell für vollständige Eingangsrechnung-Felderfassung"
```

---

### Task 2: Backend — CII-Parser erweitern

**Files:**
- Modify: `src-tauri/src/dokument/eingangsrechnung_parse.rs`

- [ ] **Step 1: `GeparsteRechnung` und neue `GeparsteSteuerzeile` erweitern**

Ersetze den bestehenden Struct-Block (Zeilen 5–13):

```rust
#[derive(Debug, Clone, Default, PartialEq)]
pub struct GeparsteRechnung {
    pub rechnungssteller_name: String,
    pub rechnungsnummer: String,
    pub rechnungsdatum: String,
    pub betrag_cent: i64,
    pub waehrung: String,
    pub positionen: Vec<GeparstePosition>,
    pub kaeufer_name: String,
    pub kaeufer_strasse: String,
    pub kaeufer_plz: String,
    pub kaeufer_ort: String,
    pub kaeufer_land: String,
    pub verkaeufer_strasse: String,
    pub verkaeufer_plz: String,
    pub verkaeufer_ort: String,
    pub verkaeufer_land: String,
    pub verkaeufer_steuernummer: String,
    pub verkaeufer_email: String,
    pub zahlungsbedingungen: String,
    pub faelligkeitsdatum: String,
    pub iban: String,
    pub bic: String,
    pub bankname: String,
    pub bestellnummer: String,
    pub leitweg_id: String,
    pub lieferantennummer: String,
    pub leistungsdatum: String,
    pub steuerzeilen: Vec<GeparsteSteuerzeile>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct GeparsteSteuerzeile {
    pub nettobetrag_cent: i64,
    pub steuersatz_promille: i64,
    pub steuerbetrag_cent: i64,
}
```

- [ ] **Step 2: Failing Test — Round-Trip-Felder erweitern**

Ersetze den Test `parse_cii_extrahiert_kernfelder_und_position_aus_eigenem_export` (Zeilen 276–294):

```rust
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

    // Zusatzfelder, die der eigene Generator bereits schreibt (Round-Trip-testbar).
    assert_eq!(ergebnis.kaeufer_name, "ACME GmbH");
    assert_eq!(ergebnis.kaeufer_strasse, "Kundenweg 5");
    assert_eq!(ergebnis.kaeufer_plz, "10117");
    assert_eq!(ergebnis.kaeufer_ort, "Berlin");
    assert_eq!(ergebnis.kaeufer_land, "DE");
    assert_eq!(ergebnis.verkaeufer_strasse, "Weg 1");
    assert_eq!(ergebnis.verkaeufer_plz, "10115");
    assert_eq!(ergebnis.verkaeufer_ort, "Berlin");
    assert_eq!(ergebnis.verkaeufer_land, "DE");
    assert_eq!(ergebnis.verkaeufer_steuernummer, "DE123456789");
    assert_eq!(ergebnis.bestellnummer, "PO-42");
    assert_eq!(ergebnis.leitweg_id, "991-12345-67");
    assert_eq!(ergebnis.zahlungsbedingungen, "Zahlbar innerhalb von 14 Tagen");
    assert_eq!(ergebnis.iban, "DE00 1234 5678");
    assert_eq!(ergebnis.bic, "ABCDDEFF");

    // Regressionstest für die Kopf-/Positions-Steuerzeilen-Kollision: der eigene
    // Generator schreibt pro Position eine ApplicableTradeTax (CategoryCode "E",
    // 0 %), aber KEINE Kopf-Steuerzeile. Würde die Prüfreihenfolge im Parser die
    // positionsinterne ApplicableTradeTax fälschlich als Kopf-Steuerzeile werten,
    // wäre steuerzeilen hier nicht leer.
    assert!(ergebnis.steuerzeilen.is_empty());
}
```

- [ ] **Step 3: Test laufen lassen — muss fehlschlagen**

Run: `cd src-tauri && cargo test parse_cii_extrahiert_kernfelder_und_position_aus_eigenem_export`
Expected: FAIL (Compile-Fehler: `no field 'kaeufer_name' on type 'GeparsteRechnung'` bzw. später Assertion-Fehler auf leere Strings, da der Parser die Felder noch nicht befüllt)

- [ ] **Step 4: Failing Test — handgeschriebene Fixture für nicht round-trip-testbare Felder + mehrere Steuersätze**

Füge im `tests`-Modul (nach `parse_cii_lehnt_xml_ohne_kernfelder_ab`, vor `const UBL_BEISPIEL`) hinzu:

```rust
const CII_ZUSATZFELDER_BEISPIEL: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocument>
    <ram:ID>RE-2026-9000</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">20260701</udt:DateTimeString></ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:SpecifiedTradeProduct><ram:Name>Testposition</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice><ram:ChargeAmount>50.00</ram:ChargeAmount></ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">2.000</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>E</ram:CategoryCode>
          <ram:RateApplicablePercent>0</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>100.00</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:ID>LFT-777</ram:ID>
        <ram:Name>Gemischt GmbH</ram:Name>
        <ram:URIUniversalCommunication>
          <ram:URIID schemeID="EM">kontakt@gemischt-beispiel.de</ram:URIID>
        </ram:URIUniversalCommunication>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty><ram:Name>Käufer GmbH</ram:Name></ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent>
        <ram:OccurrenceDateTime><udt:DateTimeString format="102">20260628</udt:DateTimeString></ram:OccurrenceDateTime>
      </ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:PayeePartyCreditorFinancialAccount><ram:IBANID>DE11 2222 3333</ram:IBANID></ram:PayeePartyCreditorFinancialAccount>
        <ram:PayeeSpecifiedCreditorFinancialInstitution>
          <ram:BICID>TESTDE81XXX</ram:BICID>
          <ram:Name>Testbank AG</ram:Name>
        </ram:PayeeSpecifiedCreditorFinancialInstitution>
      </ram:SpecifiedTradeSettlementPaymentMeans>
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>19.00</ram:CalculatedAmount>
        <ram:BasisAmount>100.00</ram:BasisAmount>
        <ram:RateApplicablePercent>19</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>7.00</ram:CalculatedAmount>
        <ram:BasisAmount>100.00</ram:BasisAmount>
        <ram:RateApplicablePercent>7</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime><udt:DateTimeString format="102">20260715</udt:DateTimeString></ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:GrandTotalAmount>226.00</ram:GrandTotalAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>"#;

#[test]
fn parse_cii_extrahiert_nicht_generierbare_zusatzfelder_und_mehrere_steuersaetze() {
    let ergebnis = parse_cii(CII_ZUSATZFELDER_BEISPIEL).unwrap();

    assert_eq!(ergebnis.verkaeufer_email, "kontakt@gemischt-beispiel.de");
    assert_eq!(ergebnis.lieferantennummer, "LFT-777");
    assert_eq!(ergebnis.bankname, "Testbank AG");
    assert_eq!(ergebnis.leistungsdatum, "2026-06-28");
    assert_eq!(ergebnis.faelligkeitsdatum, "2026-07-15");

    // Genau eine Position — ihre eigene ApplicableTradeTax darf NICHT zusätzlich
    // als dritte Kopf-Steuerzeile landen (Kollisions-Regressionstest).
    assert_eq!(ergebnis.positionen.len(), 1);
    assert_eq!(ergebnis.steuerzeilen.len(), 2);
    assert_eq!(ergebnis.steuerzeilen[0].nettobetrag_cent, 10000);
    assert_eq!(ergebnis.steuerzeilen[0].steuersatz_promille, 190);
    assert_eq!(ergebnis.steuerzeilen[0].steuerbetrag_cent, 1900);
    assert_eq!(ergebnis.steuerzeilen[1].nettobetrag_cent, 10000);
    assert_eq!(ergebnis.steuerzeilen[1].steuersatz_promille, 70);
    assert_eq!(ergebnis.steuerzeilen[1].steuerbetrag_cent, 700);
}
```

- [ ] **Step 5: Test laufen lassen — muss fehlschlagen**

Run: `cd src-tauri && cargo test parse_cii_extrahiert_nicht_generierbare_zusatzfelder`
Expected: FAIL (alle neuen Felder sind noch leer/0, da der Parser sie nicht befüllt)

- [ ] **Step 6: Parser implementieren — Start-/End-Handler**

Ersetze in `parse_cii` (Zeilen 50–121) die komplette Funktion:

```rust
fn parse_cii(xml: &str) -> AppResult<GeparsteRechnung> {
    let mut reader = Reader::from_str(xml);
    let mut pfad: Vec<String> = Vec::new();
    let mut zeilen_pfad: Vec<String> = Vec::new();
    let mut steuerzeilen_pfad: Vec<String> = Vec::new();
    let mut ergebnis = GeparsteRechnung::default();
    let mut in_zeile = false;
    let mut in_steuerzeile = false;
    let mut aktuelle_zeile = GeparstePosition::default();
    let mut aktuelle_steuerzeile = GeparsteSteuerzeile::default();

    loop {
        match reader.read_event().map_err(|e| AppError::Technisch(format!("XML ist nicht wohlgeformt: {e}")))? {
            Event::Eof => break,
            Event::Start(e) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).into_owned();
                if name == "ram:IncludedSupplyChainTradeLineItem" {
                    in_zeile = true;
                    aktuelle_zeile = GeparstePosition::default();
                    zeilen_pfad.clear();
                } else if name == "ram:ApplicableTradeTax" && !in_zeile {
                    // Kopfebenen-Steuerzeile — siehe Spec-Abschnitt zur Kollision mit der
                    // positionsinternen ApplicableTradeTax. Die Bedingung `&& !in_zeile` ist
                    // entscheidend: ohne sie würde die positionsinterne ApplicableTradeTax
                    // fälschlich eine Kopf-Steuerzeile eröffnen.
                    in_steuerzeile = true;
                    aktuelle_steuerzeile = GeparsteSteuerzeile::default();
                    steuerzeilen_pfad.clear();
                } else if in_zeile {
                    zeilen_pfad.push(name.clone());
                } else if in_steuerzeile {
                    steuerzeilen_pfad.push(name.clone());
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
                } else if in_steuerzeile {
                    match steuerzeilen_pfad.join("/").as_str() {
                        "ram:BasisAmount" => aktuelle_steuerzeile.nettobetrag_cent = dezimal_zu_festkomma(&text, 2, 100),
                        "ram:CalculatedAmount" => aktuelle_steuerzeile.steuerbetrag_cent = dezimal_zu_festkomma(&text, 2, 100),
                        "ram:RateApplicablePercent" => aktuelle_steuerzeile.steuersatz_promille = dezimal_zu_festkomma(&text, 1, 10),
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
                        "rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:Name" =>
                            ergebnis.kaeufer_name = text,
                        "rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:PostalTradeAddress/ram:LineOne" =>
                            ergebnis.kaeufer_strasse = text,
                        "rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:PostalTradeAddress/ram:PostcodeCode" =>
                            ergebnis.kaeufer_plz = text,
                        "rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:PostalTradeAddress/ram:CityName" =>
                            ergebnis.kaeufer_ort = text,
                        "rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:PostalTradeAddress/ram:CountryID" =>
                            ergebnis.kaeufer_land = text,
                        "rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:PostalTradeAddress/ram:LineOne" =>
                            ergebnis.verkaeufer_strasse = text,
                        "rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:PostalTradeAddress/ram:PostcodeCode" =>
                            ergebnis.verkaeufer_plz = text,
                        "rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:PostalTradeAddress/ram:CityName" =>
                            ergebnis.verkaeufer_ort = text,
                        "rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:PostalTradeAddress/ram:CountryID" =>
                            ergebnis.verkaeufer_land = text,
                        "rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID" =>
                            ergebnis.verkaeufer_steuernummer = text,
                        "rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:URIUniversalCommunication/ram:URIID" =>
                            ergebnis.verkaeufer_email = text,
                        "rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:ID" =>
                            ergebnis.lieferantennummer = text,
                        "rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerOrderReferencedDocument/ram:IssuerAssignedID" =>
                            ergebnis.bestellnummer = text,
                        "rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:BuyerReference" =>
                            ergebnis.leitweg_id = text,
                        "rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery/ram:ActualDeliverySupplyChainEvent/ram:OccurrenceDateTime/udt:DateTimeString" =>
                            ergebnis.leistungsdatum = formatiere_cii_datum(&text),
                        "rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradePaymentTerms/ram:Description" =>
                            ergebnis.zahlungsbedingungen = text,
                        "rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradePaymentTerms/ram:DueDateDateTime/udt:DateTimeString" =>
                            ergebnis.faelligkeitsdatum = formatiere_cii_datum(&text),
                        "rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementPaymentMeans/ram:PayeePartyCreditorFinancialAccount/ram:IBANID" =>
                            ergebnis.iban = text,
                        "rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementPaymentMeans/ram:PayeeSpecifiedCreditorFinancialInstitution/ram:BICID" =>
                            ergebnis.bic = text,
                        "rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementPaymentMeans/ram:PayeeSpecifiedCreditorFinancialInstitution/ram:Name" =>
                            ergebnis.bankname = text,
                        _ => {}
                    }
                }
            }
            Event::End(_) => {
                if let Some(name) = pfad.pop() {
                    if name == "ram:IncludedSupplyChainTradeLineItem" {
                        in_zeile = false;
                        ergebnis.positionen.push(std::mem::take(&mut aktuelle_zeile));
                    } else if name == "ram:ApplicableTradeTax" && in_steuerzeile {
                        in_steuerzeile = false;
                        ergebnis.steuerzeilen.push(std::mem::take(&mut aktuelle_steuerzeile));
                    } else if in_zeile {
                        zeilen_pfad.pop();
                    } else if in_steuerzeile {
                        steuerzeilen_pfad.pop();
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
```

- [ ] **Step 7: Beide Tests laufen lassen — müssen bestehen**

Run: `cd src-tauri && cargo test parse_cii`
Expected: PASS (alle `parse_cii*`-Tests, inkl. der beiden neuen)

- [ ] **Step 8: Vollen Modultest laufen lassen**

Run: `cd src-tauri && cargo test eingangsrechnung_parse`
Expected: PASS (keine Regression in den bereits bestehenden Tests)

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/dokument/eingangsrechnung_parse.rs
git commit -m "feat: CII-Parser erfasst Zusatzfelder und Kopf-Steuerzeilen"
```

---

### Task 3: Backend — UBL-Parser erweitern

**Files:**
- Modify: `src-tauri/src/dokument/eingangsrechnung_parse.rs`

- [ ] **Step 1: Failing Test — neue Fixture mit allen Zusatzfeldern**

Füge im `tests`-Modul nach `parse_ubl_faellt_auf_partyname_zurueck_ohne_registrationname` hinzu:

```rust
const UBL_BEISPIEL_VOLLSTAENDIG: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>RE-2026-5000</cbc:ID>
  <cbc:IssueDate>2026-07-01</cbc:IssueDate>
  <cbc:DueDate>2026-07-20</cbc:DueDate>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>04011000-1234512345-06</cbc:BuyerReference>
  <cac:OrderReference><cbc:ID>BEST-2026-1</cbc:ID></cac:OrderReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>Lieferant GmbH (PartyName)</cbc:Name></cac:PartyName>
      <cac:PartyLegalEntity><cbc:RegistrationName>Lieferant GmbH</cbc:RegistrationName></cac:PartyLegalEntity>
      <cac:PostalAddress>
        <cbc:StreetName>Verkäuferweg 1</cbc:StreetName>
        <cbc:PostalZone>50667</cbc:PostalZone>
        <cbc:CityName>Köln</cbc:CityName>
        <cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme><cbc:CompanyID>DE999888777</cbc:CompanyID></cac:PartyTaxScheme>
      <cac:PartyIdentification><cbc:ID>LFT-321</cbc:ID></cac:PartyIdentification>
      <cac:Contact><cbc:ElectronicMail>info@lieferant-beispiel.de</cbc:ElectronicMail></cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyLegalEntity><cbc:RegistrationName>Käufer GmbH</cbc:RegistrationName></cac:PartyLegalEntity>
      <cac:PostalAddress>
        <cbc:StreetName>Käuferweg 2</cbc:StreetName>
        <cbc:PostalZone>10115</cbc:PostalZone>
        <cbc:CityName>Berlin</cbc:CityName>
        <cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:Delivery><cbc:ActualDeliveryDate>2026-06-29</cbc:ActualDeliveryDate></cac:Delivery>
  <cac:PaymentMeans>
    <cac:PayeeFinancialAccount>
      <cbc:ID>DE89 3704 0044 0532 0130 00</cbc:ID>
      <cac:FinancialInstitutionBranch>
        <cbc:ID>TESTDE81XXX</cbc:ID>
        <cac:FinancialInstitution><cbc:Name>Testbank UBL AG</cbc:Name></cac:FinancialInstitution>
      </cac:FinancialInstitutionBranch>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:PaymentTerms><cbc:Note>Zahlbar innerhalb von 14 Tagen</cbc:Note></cac:PaymentTerms>
  <cac:TaxTotal>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount>100.00</cbc:TaxableAmount>
      <cbc:TaxAmount>19.00</cbc:TaxAmount>
      <cac:TaxCategory><cbc:Percent>19</cbc:Percent></cac:TaxCategory>
    </cac:TaxSubtotal>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount>50.00</cbc:TaxableAmount>
      <cbc:TaxAmount>3.50</cbc:TaxAmount>
      <cac:TaxCategory><cbc:Percent>7</cbc:Percent></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:TaxInclusiveAmount>172.50</cbc:TaxInclusiveAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount>150.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Testposition</cbc:Name></cac:Item>
    <cac:Price><cbc:PriceAmount>150.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>"#;

#[test]
fn parse_ubl_extrahiert_alle_zusatzfelder_und_mehrere_steuersaetze() {
    let ergebnis = parse_ubl(UBL_BEISPIEL_VOLLSTAENDIG).unwrap();

    assert_eq!(ergebnis.kaeufer_name, "Käufer GmbH");
    assert_eq!(ergebnis.kaeufer_strasse, "Käuferweg 2");
    assert_eq!(ergebnis.kaeufer_plz, "10115");
    assert_eq!(ergebnis.kaeufer_ort, "Berlin");
    assert_eq!(ergebnis.kaeufer_land, "DE");
    assert_eq!(ergebnis.verkaeufer_strasse, "Verkäuferweg 1");
    assert_eq!(ergebnis.verkaeufer_plz, "50667");
    assert_eq!(ergebnis.verkaeufer_ort, "Köln");
    assert_eq!(ergebnis.verkaeufer_land, "DE");
    assert_eq!(ergebnis.verkaeufer_steuernummer, "DE999888777");
    assert_eq!(ergebnis.verkaeufer_email, "info@lieferant-beispiel.de");
    assert_eq!(ergebnis.lieferantennummer, "LFT-321");
    assert_eq!(ergebnis.bestellnummer, "BEST-2026-1");
    assert_eq!(ergebnis.leitweg_id, "04011000-1234512345-06");
    assert_eq!(ergebnis.leistungsdatum, "2026-06-29");
    assert_eq!(ergebnis.zahlungsbedingungen, "Zahlbar innerhalb von 14 Tagen");
    assert_eq!(ergebnis.faelligkeitsdatum, "2026-07-20");
    assert_eq!(ergebnis.iban, "DE89 3704 0044 0532 0130 00");
    assert_eq!(ergebnis.bic, "TESTDE81XXX");
    assert_eq!(ergebnis.bankname, "Testbank UBL AG");

    assert_eq!(ergebnis.positionen.len(), 1);
    assert_eq!(ergebnis.steuerzeilen.len(), 2);
    assert_eq!(ergebnis.steuerzeilen[0].nettobetrag_cent, 10000);
    assert_eq!(ergebnis.steuerzeilen[0].steuersatz_promille, 190);
    assert_eq!(ergebnis.steuerzeilen[0].steuerbetrag_cent, 1900);
    assert_eq!(ergebnis.steuerzeilen[1].nettobetrag_cent, 5000);
    assert_eq!(ergebnis.steuerzeilen[1].steuersatz_promille, 70);
    assert_eq!(ergebnis.steuerzeilen[1].steuerbetrag_cent, 350);
}
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `cd src-tauri && cargo test parse_ubl_extrahiert_alle_zusatzfelder_und_mehrere_steuersaetze`
Expected: FAIL (Assertions auf leere/0-Felder, da `parse_ubl` sie noch nicht befüllt)

- [ ] **Step 3: Parser implementieren**

Ersetze `parse_ubl` (Zeilen 123–199) komplett:

```rust
fn parse_ubl(xml: &str) -> AppResult<GeparsteRechnung> {
    let mut reader = Reader::from_str(xml);
    let mut pfad: Vec<String> = Vec::new();
    let mut zeilen_pfad: Vec<String> = Vec::new();
    let mut steuerzeilen_pfad: Vec<String> = Vec::new();
    let mut ergebnis = GeparsteRechnung::default();
    let mut steller_registrierungsname = String::new();
    let mut steller_partyname = String::new();
    let mut kaeufer_registrierungsname = String::new();
    let mut kaeufer_partyname = String::new();
    let mut in_zeile = false;
    let mut in_steuerzeile = false;
    let mut aktuelle_zeile = GeparstePosition::default();
    let mut aktuelle_steuerzeile = GeparsteSteuerzeile::default();

    loop {
        match reader.read_event().map_err(|e| AppError::Technisch(format!("XML ist nicht wohlgeformt: {e}")))? {
            Event::Eof => break,
            Event::Start(e) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).into_owned();
                if name == "cac:InvoiceLine" {
                    in_zeile = true;
                    aktuelle_zeile = GeparstePosition::default();
                    zeilen_pfad.clear();
                } else if name == "cac:TaxSubtotal" {
                    // UBL führt Steuerdaten nur dokumentweit (kein Kollisionsrisiko wie bei
                    // CII, siehe Spec) — daher kein zusätzlicher Guard nötig.
                    in_steuerzeile = true;
                    aktuelle_steuerzeile = GeparsteSteuerzeile::default();
                    steuerzeilen_pfad.clear();
                } else if in_zeile {
                    zeilen_pfad.push(name.clone());
                } else if in_steuerzeile {
                    steuerzeilen_pfad.push(name.clone());
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
                } else if in_steuerzeile {
                    match steuerzeilen_pfad.join("/").as_str() {
                        "cbc:TaxableAmount" => aktuelle_steuerzeile.nettobetrag_cent = dezimal_zu_festkomma(&text, 2, 100),
                        "cbc:TaxAmount" => aktuelle_steuerzeile.steuerbetrag_cent = dezimal_zu_festkomma(&text, 2, 100),
                        "cac:TaxCategory/cbc:Percent" => aktuelle_steuerzeile.steuersatz_promille = dezimal_zu_festkomma(&text, 1, 10),
                        _ => {}
                    }
                } else {
                    match pfad.join("/").as_str() {
                        "Invoice/cbc:ID" => ergebnis.rechnungsnummer = text,
                        "Invoice/cbc:IssueDate" => ergebnis.rechnungsdatum = text,
                        "Invoice/cbc:DueDate" => ergebnis.faelligkeitsdatum = text,
                        "Invoice/cbc:DocumentCurrencyCode" => ergebnis.waehrung = text,
                        "Invoice/cbc:BuyerReference" => ergebnis.leitweg_id = text,
                        "Invoice/cac:OrderReference/cbc:ID" => ergebnis.bestellnummer = text,
                        "Invoice/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount" =>
                            ergebnis.betrag_cent = dezimal_zu_festkomma(&text, 2, 100),
                        "Invoice/cac:AccountingSupplierParty/cac:Party/cac:PartyLegalEntity/cbc:RegistrationName" =>
                            steller_registrierungsname = text,
                        "Invoice/cac:AccountingSupplierParty/cac:Party/cac:PartyName/cbc:Name" =>
                            steller_partyname = text,
                        "Invoice/cac:AccountingSupplierParty/cac:Party/cac:PostalAddress/cbc:StreetName" =>
                            ergebnis.verkaeufer_strasse = text,
                        "Invoice/cac:AccountingSupplierParty/cac:Party/cac:PostalAddress/cbc:PostalZone" =>
                            ergebnis.verkaeufer_plz = text,
                        "Invoice/cac:AccountingSupplierParty/cac:Party/cac:PostalAddress/cbc:CityName" =>
                            ergebnis.verkaeufer_ort = text,
                        "Invoice/cac:AccountingSupplierParty/cac:Party/cac:PostalAddress/cac:Country/cbc:IdentificationCode" =>
                            ergebnis.verkaeufer_land = text,
                        "Invoice/cac:AccountingSupplierParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID" =>
                            ergebnis.verkaeufer_steuernummer = text,
                        "Invoice/cac:AccountingSupplierParty/cac:Party/cac:Contact/cbc:ElectronicMail" =>
                            ergebnis.verkaeufer_email = text,
                        "Invoice/cac:AccountingSupplierParty/cac:Party/cac:PartyIdentification/cbc:ID" =>
                            ergebnis.lieferantennummer = text,
                        "Invoice/cac:AccountingCustomerParty/cac:Party/cac:PartyLegalEntity/cbc:RegistrationName" =>
                            kaeufer_registrierungsname = text,
                        "Invoice/cac:AccountingCustomerParty/cac:Party/cac:PartyName/cbc:Name" =>
                            kaeufer_partyname = text,
                        "Invoice/cac:AccountingCustomerParty/cac:Party/cac:PostalAddress/cbc:StreetName" =>
                            ergebnis.kaeufer_strasse = text,
                        "Invoice/cac:AccountingCustomerParty/cac:Party/cac:PostalAddress/cbc:PostalZone" =>
                            ergebnis.kaeufer_plz = text,
                        "Invoice/cac:AccountingCustomerParty/cac:Party/cac:PostalAddress/cbc:CityName" =>
                            ergebnis.kaeufer_ort = text,
                        "Invoice/cac:AccountingCustomerParty/cac:Party/cac:PostalAddress/cac:Country/cbc:IdentificationCode" =>
                            ergebnis.kaeufer_land = text,
                        "Invoice/cac:Delivery/cbc:ActualDeliveryDate" => ergebnis.leistungsdatum = text,
                        "Invoice/cac:PaymentTerms/cbc:Note" => ergebnis.zahlungsbedingungen = text,
                        "Invoice/cac:PaymentMeans/cac:PayeeFinancialAccount/cbc:ID" => ergebnis.iban = text,
                        "Invoice/cac:PaymentMeans/cac:PayeeFinancialAccount/cac:FinancialInstitutionBranch/cbc:ID" =>
                            ergebnis.bic = text,
                        "Invoice/cac:PaymentMeans/cac:PayeeFinancialAccount/cac:FinancialInstitutionBranch/cac:FinancialInstitution/cbc:Name" =>
                            ergebnis.bankname = text,
                        _ => {}
                    }
                }
            }
            Event::End(_) => {
                if let Some(name) = pfad.pop() {
                    if name == "cac:InvoiceLine" {
                        in_zeile = false;
                        ergebnis.positionen.push(std::mem::take(&mut aktuelle_zeile));
                    } else if name == "cac:TaxSubtotal" {
                        in_steuerzeile = false;
                        ergebnis.steuerzeilen.push(std::mem::take(&mut aktuelle_steuerzeile));
                    } else if in_zeile {
                        zeilen_pfad.pop();
                    } else if in_steuerzeile {
                        steuerzeilen_pfad.pop();
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
    ergebnis.kaeufer_name = if !kaeufer_registrierungsname.is_empty() {
        kaeufer_registrierungsname
    } else {
        kaeufer_partyname
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

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `cd src-tauri && cargo test parse_ubl`
Expected: PASS (alle `parse_ubl*`-Tests)

- [ ] **Step 5: Vollen Modultest + Gesamttestlauf des Backends**

Run: `cd src-tauri && cargo test`
Expected: PASS (keine Regression in anderen Modulen, insbesondere `xrechnung`, `zugferd`, `pdf`)

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/dokument/eingangsrechnung_parse.rs
git commit -m "feat: UBL-Parser erfasst Zusatzfelder und mehrere Steuerzeilen"
```

---

### Task 4: Backend — Commands erweitern (Structs, Persistenz, Abfragen)

**Files:**
- Modify: `src-tauri/src/commands/eingangsrechnungen.rs`

- [ ] **Step 1: Structs erweitern**

Ersetze den Block von `Eingangsrechnung` bis `EingangsrechnungUpdate` (Zeilen 7–71) komplett:

```rust
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
    pub kaeufer_name: String,
    pub kaeufer_strasse: String,
    pub kaeufer_plz: String,
    pub kaeufer_ort: String,
    pub kaeufer_land: String,
    pub verkaeufer_strasse: String,
    pub verkaeufer_plz: String,
    pub verkaeufer_ort: String,
    pub verkaeufer_land: String,
    pub verkaeufer_steuernummer: String,
    pub verkaeufer_email: String,
    pub zahlungsbedingungen: String,
    pub faelligkeitsdatum: String,
    pub iban: String,
    pub bic: String,
    pub bankname: String,
    pub bestellnummer: String,
    pub leitweg_id: String,
    pub lieferantennummer: String,
    pub leistungsdatum: String,
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

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct EingangsrechnungSteuerzeile {
    pub id: String,
    pub eingangsrechnung_id: String,
    pub nettobetrag_cent: i64,
    pub steuersatz_promille: i64,
    pub steuerbetrag_cent: i64,
    pub reihenfolge: i64,
}

#[derive(Debug, Serialize)]
pub struct EingangsrechnungDetail {
    pub eingangsrechnung: Eingangsrechnung,
    pub positionen: Vec<EingangsrechnungPosition>,
    pub steuerzeilen: Vec<EingangsrechnungSteuerzeile>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EingangsrechnungPositionNeu {
    pub bezeichnung: String,
    pub menge: i64,
    pub einzelpreis_cent: i64,
    pub positionssumme_cent: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EingangsrechnungSteuerzeileNeu {
    pub nettobetrag_cent: i64,
    pub steuersatz_promille: i64,
    pub steuerbetrag_cent: i64,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct EingangsrechnungFelderNeu {
    pub rechnungssteller_name: String,
    pub rechnungsnummer: String,
    pub rechnungsdatum: String,
    pub betrag_cent: i64,
    pub waehrung: String,
    pub positionen: Vec<EingangsrechnungPositionNeu>,
    pub kaeufer_name: String,
    pub kaeufer_strasse: String,
    pub kaeufer_plz: String,
    pub kaeufer_ort: String,
    pub kaeufer_land: String,
    pub verkaeufer_strasse: String,
    pub verkaeufer_plz: String,
    pub verkaeufer_ort: String,
    pub verkaeufer_land: String,
    pub verkaeufer_steuernummer: String,
    pub verkaeufer_email: String,
    pub zahlungsbedingungen: String,
    pub faelligkeitsdatum: String,
    pub iban: String,
    pub bic: String,
    pub bankname: String,
    pub bestellnummer: String,
    pub leitweg_id: String,
    pub lieferantennummer: String,
    pub leistungsdatum: String,
    pub steuerzeilen: Vec<EingangsrechnungSteuerzeileNeu>,
}

#[derive(Debug, Serialize)]
pub struct EingangsrechnungVorschau {
    pub geparst: bool,
    pub felder: EingangsrechnungFelderNeu,
    pub ist_duplikat: bool,
}

#[derive(Debug, Deserialize)]
pub struct EingangsrechnungUpdate {
    pub id: String,
    pub rechnungssteller_name: String,
    pub rechnungsnummer: String,
    pub rechnungsdatum: String,
    pub betrag_cent: i64,
    pub waehrung: String,
}
```

`EingangsrechnungOriginal` (Zeilen 73–77) bleibt unverändert.

`#[derive(Default)]` auf `EingangsrechnungFelderNeu` (alle Feldtypen — `String`, `i64`, `Vec<T>` — implementieren `Default`) erlaubt es, in Tests und im Parse-Fehlschlag-Zweig nur die tatsächlich relevanten Felder zu setzen und den Rest per `..Default::default()` aufzufüllen, statt alle 20 neuen Zusatzfelder wiederholt einzeln leer zu belegen.

- [ ] **Step 2: `EINGANGSRECHNUNG_SPALTEN` um neue Spalten erweitern**

Ersetze Zeile 79:

```rust
const EINGANGSRECHNUNG_SPALTEN: &str = "id, dateiname, format, rechnungssteller_name, rechnungsnummer, rechnungsdatum, betrag_cent, waehrung, manuell_erfasst, importiert_am, kaeufer_name, kaeufer_strasse, kaeufer_plz, kaeufer_ort, kaeufer_land, verkaeufer_strasse, verkaeufer_plz, verkaeufer_ort, verkaeufer_land, verkaeufer_steuernummer, verkaeufer_email, zahlungsbedingungen, faelligkeitsdatum, iban, bic, bankname, bestellnummer, leitweg_id, lieferantennummer, leistungsdatum";
```

- [ ] **Step 3: Failing Test — `import_vorschau` reicht Zusatzfelder durch**

Ersetze `import_vorschau_erkennt_und_parst_xrechnung` (im `tests`-Modul):

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
    assert_eq!(vorschau.felder.kaeufer_name, "ACME GmbH");
    assert_eq!(vorschau.felder.verkaeufer_steuernummer, "DE123456789");
    assert_eq!(vorschau.felder.iban, "DE00 1234 5678");
}
```

- [ ] **Step 4: Test laufen lassen — muss fehlschlagen**

Run: `cd src-tauri && cargo test import_vorschau_erkennt_und_parst_xrechnung`
Expected: FAIL (Compile-Fehler: `EingangsrechnungFelderNeu` hat noch keine `kaeufer_name` etc., da `import_vorschau` sie noch nicht befüllt)

- [ ] **Step 5: `import_vorschau` implementieren**

Ersetze die `Ok(g) => (...)`-Zeile und den `Err(_) => (...)`-Block in `import_vorschau` (Zeilen 89–104):

```rust
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
            kaeufer_name: g.kaeufer_name, kaeufer_strasse: g.kaeufer_strasse, kaeufer_plz: g.kaeufer_plz,
            kaeufer_ort: g.kaeufer_ort, kaeufer_land: g.kaeufer_land,
            verkaeufer_strasse: g.verkaeufer_strasse, verkaeufer_plz: g.verkaeufer_plz,
            verkaeufer_ort: g.verkaeufer_ort, verkaeufer_land: g.verkaeufer_land,
            verkaeufer_steuernummer: g.verkaeufer_steuernummer, verkaeufer_email: g.verkaeufer_email,
            zahlungsbedingungen: g.zahlungsbedingungen, faelligkeitsdatum: g.faelligkeitsdatum,
            iban: g.iban, bic: g.bic, bankname: g.bankname,
            bestellnummer: g.bestellnummer, leitweg_id: g.leitweg_id,
            lieferantennummer: g.lieferantennummer, leistungsdatum: g.leistungsdatum,
            steuerzeilen: g.steuerzeilen.into_iter().map(|s| EingangsrechnungSteuerzeileNeu {
                nettobetrag_cent: s.nettobetrag_cent, steuersatz_promille: s.steuersatz_promille,
                steuerbetrag_cent: s.steuerbetrag_cent,
            }).collect(),
        }),
        Err(_) => (false, EingangsrechnungFelderNeu {
            waehrung: "EUR".into(),
            ..Default::default()
        }),
    };
```

- [ ] **Step 6: Test laufen lassen — muss bestehen**

Run: `cd src-tauri && cargo test import_vorschau`
Expected: PASS

- [ ] **Step 7: Failing Test — `speichern` persistiert Zusatzfelder und Steuerzeilen**

Füge im `tests`-Modul nach `speichern_persistiert_rohdatei_und_felder` hinzu (nutzt einen lokalen Helper `felder_mit_zusatzdaten`, um den bestehenden `beispiel_speichern`-Helper unverändert zu lassen):

```rust
fn felder_mit_zusatzdaten() -> EingangsrechnungFelderNeu {
    EingangsrechnungFelderNeu {
        rechnungssteller_name: "Gemischt GmbH".into(), rechnungsnummer: "RE-2026-9000".into(),
        rechnungsdatum: "2026-07-01".into(), betrag_cent: 22600, waehrung: "EUR".into(),
        positionen: vec![],
        kaeufer_name: "Käufer GmbH".into(), kaeufer_strasse: "Käuferweg 2".into(),
        kaeufer_plz: "10115".into(), kaeufer_ort: "Berlin".into(), kaeufer_land: "DE".into(),
        verkaeufer_strasse: "Verkäuferweg 1".into(), verkaeufer_plz: "50667".into(),
        verkaeufer_ort: "Köln".into(), verkaeufer_land: "DE".into(),
        verkaeufer_steuernummer: "DE999888777".into(), verkaeufer_email: "info@lieferant-beispiel.de".into(),
        zahlungsbedingungen: "Zahlbar innerhalb von 14 Tagen".into(), faelligkeitsdatum: "2026-07-15".into(),
        iban: "DE11 2222 3333".into(), bic: "TESTDE81XXX".into(), bankname: "Testbank AG".into(),
        bestellnummer: "BEST-1".into(), leitweg_id: "991-1".into(),
        lieferantennummer: "LFT-777".into(), leistungsdatum: "2026-06-28".into(),
        steuerzeilen: vec![
            EingangsrechnungSteuerzeileNeu { nettobetrag_cent: 10000, steuersatz_promille: 190, steuerbetrag_cent: 1900 },
            EingangsrechnungSteuerzeileNeu { nettobetrag_cent: 10000, steuersatz_promille: 70, steuerbetrag_cent: 700 },
        ],
    }
}

#[tokio::test]
async fn speichern_persistiert_zusatzfelder_und_steuerzeilen_in_einer_transaktion() {
    let (_dir, pool) = test_pool().await;
    let gespeichert = speichern(&pool, b"kein gueltiges XML".to_vec(), "gemischt.xml".into(), felder_mit_zusatzdaten()).await.unwrap();
    assert_eq!(gespeichert.kaeufer_name, "Käufer GmbH");
    assert_eq!(gespeichert.verkaeufer_steuernummer, "DE999888777");
    assert_eq!(gespeichert.iban, "DE11 2222 3333");

    let detail = get(&pool, gespeichert.id).await.unwrap();
    assert_eq!(detail.steuerzeilen.len(), 2);
    assert_eq!(detail.steuerzeilen[0].steuersatz_promille, 190);
    assert_eq!(detail.steuerzeilen[0].nettobetrag_cent, 10000);
    assert_eq!(detail.steuerzeilen[1].steuersatz_promille, 70);
}
```

- [ ] **Step 8: Test laufen lassen — muss fehlschlagen**

Run: `cd src-tauri && cargo test speichern_persistiert_zusatzfelder_und_steuerzeilen`
Expected: FAIL (Compile-Fehler, da `speichern`/`get` die neuen Felder/Tabelle noch nicht anfassen)

- [ ] **Step 9: `speichern` implementieren**

Ersetze in `speichern` (Zeilen 120–158) den `Eingangsrechnung`-Konstruktor und den INSERT-Block:

```rust
pub async fn speichern(
    pool: &SqlitePool,
    datei_bytes: Vec<u8>,
    dateiname: String,
    felder: EingangsrechnungFelderNeu,
) -> AppResult<Eingangsrechnung> {
    let format = crate::dokument::eingangsrechnung_parse::erkenne_format(&datei_bytes).to_string();
    let (_, geparst) = crate::dokument::eingangsrechnung_parse::verarbeite_datei(&datei_bytes);
    let manuell_erfasst = geparst.is_err();

    let eingangsrechnung = Eingangsrechnung {
        id: Uuid::new_v4().to_string(), dateiname, format,
        rechnungssteller_name: felder.rechnungssteller_name, rechnungsnummer: felder.rechnungsnummer,
        rechnungsdatum: felder.rechnungsdatum, betrag_cent: felder.betrag_cent, waehrung: felder.waehrung,
        manuell_erfasst, importiert_am: jetzt(),
        kaeufer_name: felder.kaeufer_name, kaeufer_strasse: felder.kaeufer_strasse,
        kaeufer_plz: felder.kaeufer_plz, kaeufer_ort: felder.kaeufer_ort, kaeufer_land: felder.kaeufer_land,
        verkaeufer_strasse: felder.verkaeufer_strasse, verkaeufer_plz: felder.verkaeufer_plz,
        verkaeufer_ort: felder.verkaeufer_ort, verkaeufer_land: felder.verkaeufer_land,
        verkaeufer_steuernummer: felder.verkaeufer_steuernummer, verkaeufer_email: felder.verkaeufer_email,
        zahlungsbedingungen: felder.zahlungsbedingungen, faelligkeitsdatum: felder.faelligkeitsdatum,
        iban: felder.iban, bic: felder.bic, bankname: felder.bankname,
        bestellnummer: felder.bestellnummer, leitweg_id: felder.leitweg_id,
        lieferantennummer: felder.lieferantennummer, leistungsdatum: felder.leistungsdatum,
    };

    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO eingangsrechnung (id, dateiname, format, rohdatei, rechnungssteller_name, rechnungsnummer, rechnungsdatum, betrag_cent, waehrung, manuell_erfasst, importiert_am, kaeufer_name, kaeufer_strasse, kaeufer_plz, kaeufer_ort, kaeufer_land, verkaeufer_strasse, verkaeufer_plz, verkaeufer_ort, verkaeufer_land, verkaeufer_steuernummer, verkaeufer_email, zahlungsbedingungen, faelligkeitsdatum, iban, bic, bankname, bestellnummer, leitweg_id, lieferantennummer, leistungsdatum, created_at, updated_at) \
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(&eingangsrechnung.id).bind(&eingangsrechnung.dateiname).bind(&eingangsrechnung.format)
        .bind(&datei_bytes).bind(&eingangsrechnung.rechnungssteller_name).bind(&eingangsrechnung.rechnungsnummer)
        .bind(&eingangsrechnung.rechnungsdatum).bind(eingangsrechnung.betrag_cent).bind(&eingangsrechnung.waehrung)
        .bind(eingangsrechnung.manuell_erfasst).bind(&eingangsrechnung.importiert_am)
        .bind(&eingangsrechnung.kaeufer_name).bind(&eingangsrechnung.kaeufer_strasse)
        .bind(&eingangsrechnung.kaeufer_plz).bind(&eingangsrechnung.kaeufer_ort).bind(&eingangsrechnung.kaeufer_land)
        .bind(&eingangsrechnung.verkaeufer_strasse).bind(&eingangsrechnung.verkaeufer_plz)
        .bind(&eingangsrechnung.verkaeufer_ort).bind(&eingangsrechnung.verkaeufer_land)
        .bind(&eingangsrechnung.verkaeufer_steuernummer).bind(&eingangsrechnung.verkaeufer_email)
        .bind(&eingangsrechnung.zahlungsbedingungen).bind(&eingangsrechnung.faelligkeitsdatum)
        .bind(&eingangsrechnung.iban).bind(&eingangsrechnung.bic).bind(&eingangsrechnung.bankname)
        .bind(&eingangsrechnung.bestellnummer).bind(&eingangsrechnung.leitweg_id)
        .bind(&eingangsrechnung.lieferantennummer).bind(&eingangsrechnung.leistungsdatum)
        .bind(jetzt()).bind(jetzt())
        .execute(&mut *tx).await?;

    for (i, pos) in felder.positionen.iter().enumerate() {
        sqlx::query("INSERT INTO eingangsrechnungposition (id, eingangsrechnung_id, bezeichnung, menge, einzelpreis_cent, positionssumme_cent, reihenfolge, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
            .bind(Uuid::new_v4().to_string()).bind(&eingangsrechnung.id).bind(&pos.bezeichnung)
            .bind(pos.menge).bind(pos.einzelpreis_cent).bind(pos.positionssumme_cent).bind(i as i64)
            .bind(jetzt()).bind(jetzt())
            .execute(&mut *tx).await?;
    }
    for (i, s) in felder.steuerzeilen.iter().enumerate() {
        sqlx::query("INSERT INTO eingangsrechnungsteuer (id, eingangsrechnung_id, nettobetrag_cent, steuersatz_promille, steuerbetrag_cent, reihenfolge, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)")
            .bind(Uuid::new_v4().to_string()).bind(&eingangsrechnung.id)
            .bind(s.nettobetrag_cent).bind(s.steuersatz_promille).bind(s.steuerbetrag_cent).bind(i as i64)
            .bind(jetzt()).bind(jetzt())
            .execute(&mut *tx).await?;
    }
    tx.commit().await?;

    Ok(eingangsrechnung)
}
```

- [ ] **Step 10: `get` implementieren**

Ersetze `get` (Zeilen 160–168):

```rust
pub async fn get(pool: &SqlitePool, id: String) -> AppResult<EingangsrechnungDetail> {
    let sql = format!("SELECT {EINGANGSRECHNUNG_SPALTEN} FROM eingangsrechnung WHERE id = ?");
    let eingangsrechnung: Eingangsrechnung = sqlx::query_as(&sql).bind(&id).fetch_optional(pool).await?.ok_or(AppError::NichtGefunden)?;
    let positionen: Vec<EingangsrechnungPosition> = sqlx::query_as(
        "SELECT id, eingangsrechnung_id, bezeichnung, menge, einzelpreis_cent, positionssumme_cent, reihenfolge \
         FROM eingangsrechnungposition WHERE eingangsrechnung_id = ? ORDER BY reihenfolge")
        .bind(&id).fetch_all(pool).await?;
    let steuerzeilen: Vec<EingangsrechnungSteuerzeile> = sqlx::query_as(
        "SELECT id, eingangsrechnung_id, nettobetrag_cent, steuersatz_promille, steuerbetrag_cent, reihenfolge \
         FROM eingangsrechnungsteuer WHERE eingangsrechnung_id = ? ORDER BY reihenfolge")
        .bind(&id).fetch_all(pool).await?;
    Ok(EingangsrechnungDetail { eingangsrechnung, positionen, steuerzeilen })
}
```

`update()` bleibt unverändert (Zeilen 170–178) — keine der neuen Spalten wird dort angefasst.

- [ ] **Step 11: Neue Tests laufen lassen — müssen bestehen**

Run: `cd src-tauri && cargo test speichern_persistiert_zusatzfelder_und_steuerzeilen`
Expected: PASS

- [ ] **Step 12: Failing Test — `update` fasst weiterhin keine neuen Spalten an**

Erweitere `update_korrigiert_kernfelder_aber_nicht_manuell_erfasst` um eine Assertion (ersetze den ganzen Test):

```rust
#[tokio::test]
async fn update_korrigiert_kernfelder_aber_nicht_neue_spalten() {
    let (_dir, pool) = test_pool().await;
    let mut felder = felder_mit_zusatzdaten();
    felder.rechnungsnummer = "RE-2026-0001".into();
    felder.rechnungsdatum = "2026-07-11".into();
    felder.betrag_cent = 9500;
    felder.rechnungssteller_name = "Meine Firma".into();
    let gespeichert = speichern(&pool, b"kein gueltiges XML".to_vec(), "gemischt.xml".into(), felder).await.unwrap();

    let aktualisiert = update(&pool, EingangsrechnungUpdate {
        id: gespeichert.id.clone(), rechnungssteller_name: "Korrigierte Firma".into(),
        rechnungsnummer: "RE-2026-0001".into(), rechnungsdatum: "2026-07-11".into(),
        betrag_cent: 9500, waehrung: "EUR".into(),
    }).await.unwrap();

    assert_eq!(aktualisiert.rechnungssteller_name, "Korrigierte Firma");
    assert!(!aktualisiert.manuell_erfasst);
    // Die neuen Spalten bleiben unverändert, da eingangsrechnung_update sie nicht anfasst.
    assert_eq!(aktualisiert.kaeufer_name, "Käufer GmbH");
    assert_eq!(aktualisiert.verkaeufer_steuernummer, "DE999888777");
}
```

Ersetze den bestehenden Test `update_korrigiert_kernfelder_aber_nicht_manuell_erfasst` durch diesen (Namensänderung spiegelt die erweiterte Prüfung wider).

- [ ] **Step 13: Test laufen lassen — muss bestehen**

Run: `cd src-tauri && cargo test update_korrigiert_kernfelder_aber_nicht_neue_spalten`
Expected: PASS

- [ ] **Step 14: Bestehende Tests anpassen, die `EingangsrechnungFelderNeu` konstruieren**

Vier Stellen konstruieren `EingangsrechnungFelderNeu` literal mit allen Feldern benannt und brechen sonst am Compiler, da die neuen Felder fehlen. Dank `#[derive(Default)]` (Step 1) genügt `..Default::default()` für die 20 neuen Zusatzfelder plus `steuerzeilen`. Ersetze alle vier Fundstellen wie folgt:

`beispiel_speichern` (Helper-Funktion):

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
        ..Default::default()
    };
    speichern(pool, xml.into_bytes(), "rechnung.xml".into(), felder).await.unwrap()
}
```

`speichern_markiert_manuell_erfasst_bei_nicht_parsbarer_datei`:

```rust
#[tokio::test]
async fn speichern_markiert_manuell_erfasst_bei_nicht_parsbarer_datei() {
    let (_dir, pool) = test_pool().await;
    let felder = EingangsrechnungFelderNeu {
        rechnungssteller_name: "Von Hand eingetragen".into(), rechnungsnummer: "X-1".into(),
        rechnungsdatum: "2026-07-11".into(), betrag_cent: 5000, waehrung: "EUR".into(),
        ..Default::default()
    };
    let gespeichert = speichern(&pool, b"kein gueltiges XML".to_vec(), "unbekannt.xml".into(), felder).await.unwrap();
    assert!(gespeichert.manuell_erfasst);
    assert_eq!(gespeichert.rechnungssteller_name, "Von Hand eingetragen");
}
```

`speichern_leitet_format_serverseitig_ab_unabhaengig_vom_dateinamen`:

```rust
#[tokio::test]
async fn speichern_leitet_format_serverseitig_ab_unabhaengig_vom_dateinamen() {
    // Kein `format`-Parameter im Command — auch bei einer .xml-benannten Datei
    // mit PDF-Inhalt wird das tatsächliche Format aus den Bytes bestimmt.
    let (_dir, pool) = test_pool().await;
    let minimales_pdf = crate::dokument::pdf::rendern(&crate::dokument::pdf::tests::test_kontext(), None).unwrap();
    let felder = EingangsrechnungFelderNeu { waehrung: "EUR".into(), ..Default::default() };
    let gespeichert = speichern(&pool, minimales_pdf, "täuschung.xml".into(), felder).await.unwrap();
    assert_eq!(gespeichert.format, "zugferd");
}
```

`original_exportieren_liefert_unveraenderte_rohdatei`:

```rust
#[tokio::test]
async fn original_exportieren_liefert_unveraenderte_rohdatei() {
    let (_dir, pool) = test_pool().await;
    let kontext = crate::dokument::xrechnung::tests::test_kontext(None, 9500);
    let xml = crate::dokument::xrechnung::xml_erzeugen(&kontext).unwrap();
    let felder = EingangsrechnungFelderNeu {
        rechnungssteller_name: "Meine Firma".into(), rechnungsnummer: "RE-2026-0001".into(),
        rechnungsdatum: "2026-07-11".into(), betrag_cent: 9500, waehrung: "EUR".into(),
        ..Default::default()
    };
    let gespeichert = speichern(&pool, xml.clone().into_bytes(), "rechnung.xml".into(), felder).await.unwrap();
    let original = original_exportieren(&pool, gespeichert.id).await.unwrap();
    assert_eq!(original.dateiname, "rechnung.xml");
    assert_eq!(String::from_utf8(original.bytes).unwrap(), xml);
}
```

- [ ] **Step 15: Gesamten Modultest laufen lassen**

Run: `cd src-tauri && cargo test`
Expected: PASS (kompletter Backend-Testlauf, keine Compile-Fehler, keine Regression)

- [ ] **Step 16: Commit**

```bash
git add src-tauri/src/commands/eingangsrechnungen.rs
git commit -m "feat: Commands persistieren und liefern Zusatzfelder und Steuerzeilen"
```

---

### Task 5: Frontend — API-Typen erweitern

**Files:**
- Modify: `src/api.ts`

- [ ] **Step 1: Interfaces erweitern**

Ersetze den Block von `EingangsrechnungPosition` bis `EingangsrechnungDetail` (Zeilen 151–193):

```ts
export interface EingangsrechnungPosition {
  bezeichnung: string;
  menge: number;
  einzelpreis_cent: number;
  positionssumme_cent: number;
}
export interface EingangsrechnungSteuerzeile {
  nettobetrag_cent: number;
  steuersatz_promille: number;
  steuerbetrag_cent: number;
}
export interface EingangsrechnungFelderNeu {
  rechnungssteller_name: string;
  rechnungsnummer: string;
  rechnungsdatum: string;
  betrag_cent: number;
  waehrung: string;
  positionen: EingangsrechnungPosition[];
  kaeufer_name: string;
  kaeufer_strasse: string;
  kaeufer_plz: string;
  kaeufer_ort: string;
  kaeufer_land: string;
  verkaeufer_strasse: string;
  verkaeufer_plz: string;
  verkaeufer_ort: string;
  verkaeufer_land: string;
  verkaeufer_steuernummer: string;
  verkaeufer_email: string;
  zahlungsbedingungen: string;
  faelligkeitsdatum: string;
  iban: string;
  bic: string;
  bankname: string;
  bestellnummer: string;
  leitweg_id: string;
  lieferantennummer: string;
  leistungsdatum: string;
  steuerzeilen: EingangsrechnungSteuerzeile[];
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
  kaeufer_name: string;
  kaeufer_strasse: string;
  kaeufer_plz: string;
  kaeufer_ort: string;
  kaeufer_land: string;
  verkaeufer_strasse: string;
  verkaeufer_plz: string;
  verkaeufer_ort: string;
  verkaeufer_land: string;
  verkaeufer_steuernummer: string;
  verkaeufer_email: string;
  zahlungsbedingungen: string;
  faelligkeitsdatum: string;
  iban: string;
  bic: string;
  bankname: string;
  bestellnummer: string;
  leitweg_id: string;
  lieferantennummer: string;
  leistungsdatum: string;
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
  steuerzeilen: EingangsrechnungSteuerzeile[];
}
```

- [ ] **Step 2: TypeScript-Check laufen lassen**

Run: `npx tsc --noEmit`
Expected: FAIL — Fehler in `src/pages/Eingangsrechnungen.test.tsx` und `src/pages/EingangsrechnungDetail.test.tsx`: die dort verwendeten Mock-Objekte für `felder`/`eingangsrechnung`/`get`-Rückgabewerte erfüllen die erweiterten Interfaces nicht mehr (fehlende Felder). Das ist erwartet — wird in Task 7/8 mit den Mock-Anpassungen behoben. Kein separater Fix-Schritt hier: die Mocks werden erst dort berührt, wenn die jeweilige Seite ohnehin angepasst wird.

- [ ] **Step 3: Commit**

```bash
git add src/api.ts
git commit -m "feat: Frontend-Typen für Eingangsrechnung-Zusatzfelder"
```

---

### Task 6: Frontend — Komponente `EingangsrechnungZusatzfelder`

**Files:**
- Create: `src/components/EingangsrechnungZusatzfelder.tsx`
- Create: `src/components/EingangsrechnungZusatzfelder.test.tsx`

- [ ] **Step 1: Failing Test schreiben**

```tsx
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EingangsrechnungZusatzfelder } from "./EingangsrechnungZusatzfelder";

afterEach(cleanup);

const LEERE_FELDER = {
  kaeufer_name: "", kaeufer_strasse: "", kaeufer_plz: "", kaeufer_ort: "", kaeufer_land: "",
  verkaeufer_strasse: "", verkaeufer_plz: "", verkaeufer_ort: "", verkaeufer_land: "",
  verkaeufer_steuernummer: "", verkaeufer_email: "",
  zahlungsbedingungen: "", faelligkeitsdatum: "", iban: "", bic: "", bankname: "",
  bestellnummer: "", leitweg_id: "", lieferantennummer: "", leistungsdatum: "",
  waehrung: "EUR", steuerzeilen: [],
};

describe("EingangsrechnungZusatzfelder", () => {
  it("zeigt nichts an, wenn alle Felder leer sind", () => {
    const { container } = render(<EingangsrechnungZusatzfelder {...LEERE_FELDER} />);
    expect(container.textContent).toBe("");
  });

  it("zeigt befüllte Felder gruppiert an und blendet leere Gruppen aus", () => {
    render(<EingangsrechnungZusatzfelder {...LEERE_FELDER}
      verkaeufer_strasse="Weg 1" verkaeufer_plz="10115" verkaeufer_ort="Berlin" verkaeufer_land="DE"
      verkaeufer_steuernummer="DE123456789" verkaeufer_email="info@lieferant.de"
      iban="DE00 1234 5678" bic="ABCDDEFF"
    />);
    expect(screen.getByText("DE123456789")).toBeTruthy();
    expect(screen.getByText("info@lieferant.de")).toBeTruthy();
    // Exakter String statt Regex: eine Regex würde sowohl den <span> als auch das
    // umschließende <p> ("IBAN: DE00 1234 5678") als Treffer werten und
    // "multiple elements found" auslösen — exact-Matching trifft nur den <span>.
    expect(screen.getByText("DE00 1234 5678")).toBeTruthy();
    // Gruppe "Referenzen" (Bestellnummer/Leitweg-ID) ist komplett leer -> Überschrift fehlt.
    expect(screen.queryByText("Referenzen")).toBeNull();
  });

  it("zeigt eine Tabelle mit einer Zeile je Steuersatz", () => {
    render(<EingangsrechnungZusatzfelder {...LEERE_FELDER}
      steuerzeilen={[
        { nettobetrag_cent: 10000, steuersatz_promille: 190, steuerbetrag_cent: 1900 },
        { nettobetrag_cent: 5000, steuersatz_promille: 70, steuerbetrag_cent: 350 },
      ]}
    />);
    expect(screen.getByText("100,00 €")).toBeTruthy();
    expect(screen.getByText("19,0 %")).toBeTruthy();
    expect(screen.getByText("19,00 €")).toBeTruthy();
    expect(screen.getByText("7,0 %")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npx vitest run src/components/EingangsrechnungZusatzfelder.test.tsx`
Expected: FAIL (Modul `./EingangsrechnungZusatzfelder` existiert noch nicht)

- [ ] **Step 3: Komponente implementieren**

```tsx
import type { EingangsrechnungSteuerzeile } from "../api";
import { formatCentMitWaehrung } from "../geld";

export interface EingangsrechnungZusatzfelderProps {
  kaeufer_name: string;
  kaeufer_strasse: string;
  kaeufer_plz: string;
  kaeufer_ort: string;
  kaeufer_land: string;
  verkaeufer_strasse: string;
  verkaeufer_plz: string;
  verkaeufer_ort: string;
  verkaeufer_land: string;
  verkaeufer_steuernummer: string;
  verkaeufer_email: string;
  zahlungsbedingungen: string;
  faelligkeitsdatum: string;
  iban: string;
  bic: string;
  bankname: string;
  bestellnummer: string;
  leitweg_id: string;
  lieferantennummer: string;
  leistungsdatum: string;
  waehrung: string;
  steuerzeilen: EingangsrechnungSteuerzeile[];
}

function Feld({ label, wert }: { label: string; wert: string }) {
  if (!wert) return null;
  return <p>{label}: <span>{wert}</span></p>;
}

function formatAdresse(strasse: string, plz: string, ort: string, land: string): string {
  const zeile1 = strasse;
  const zeile2 = [plz, ort].filter(Boolean).join(" ");
  return [zeile1, zeile2, land].filter(Boolean).join(", ");
}

export function EingangsrechnungZusatzfelder(p: EingangsrechnungZusatzfelderProps) {
  const verkaeuferAdresse = formatAdresse(p.verkaeufer_strasse, p.verkaeufer_plz, p.verkaeufer_ort, p.verkaeufer_land);
  const kaeuferAdresse = formatAdresse(p.kaeufer_strasse, p.kaeufer_plz, p.kaeufer_ort, p.kaeufer_land);

  const zeigtRechnungssteller = !!(verkaeuferAdresse || p.verkaeufer_steuernummer || p.verkaeufer_email || p.lieferantennummer);
  const zeigtRechnungsempfaenger = !!(p.kaeufer_name || kaeuferAdresse);
  const zeigtZahlung = !!(p.zahlungsbedingungen || p.faelligkeitsdatum || p.iban || p.bic || p.bankname);
  const zeigtReferenzen = !!(p.bestellnummer || p.leitweg_id);
  const zeigtLeistungsdatum = !!p.leistungsdatum;
  const zeigtSteuern = p.steuerzeilen.length > 0;

  return (
    <>
      {zeigtRechnungssteller && (
        <div className="karte">
          <h3>Rechnungssteller</h3>
          <Feld label="Anschrift" wert={verkaeuferAdresse} />
          <Feld label="Steuernummer/USt-IdNr." wert={p.verkaeufer_steuernummer} />
          <Feld label="E-Mail" wert={p.verkaeufer_email} />
          <Feld label="Lieferantennummer" wert={p.lieferantennummer} />
        </div>
      )}
      {zeigtRechnungsempfaenger && (
        <div className="karte">
          <h3>Rechnungsempfänger</h3>
          <Feld label="Name" wert={p.kaeufer_name} />
          <Feld label="Anschrift" wert={kaeuferAdresse} />
        </div>
      )}
      {zeigtZahlung && (
        <div className="karte">
          <h3>Zahlung</h3>
          <Feld label="Zahlungsbedingungen" wert={p.zahlungsbedingungen} />
          <Feld label="Fälligkeitsdatum" wert={p.faelligkeitsdatum} />
          <Feld label="IBAN" wert={p.iban} />
          <Feld label="BIC" wert={p.bic} />
          <Feld label="Bank" wert={p.bankname} />
        </div>
      )}
      {zeigtReferenzen && (
        <div className="karte">
          <h3>Referenzen</h3>
          <Feld label="Bestellnummer" wert={p.bestellnummer} />
          <Feld label="Leitweg-ID" wert={p.leitweg_id} />
        </div>
      )}
      {zeigtLeistungsdatum && (
        <div className="karte">
          <h3>Liefer-/Leistungsdatum</h3>
          <Feld label="Datum" wert={p.leistungsdatum} />
        </div>
      )}
      {zeigtSteuern && (
        <div className="karte">
          <h3>Steuern</h3>
          <table className="tabelle">
            <thead>
              <tr>
                <th>Netto</th>
                <th>Satz</th>
                <th>Steuerbetrag</th>
              </tr>
            </thead>
            <tbody>
              {p.steuerzeilen.map((s, i) => (
                <tr key={i}>
                  <td>{formatCentMitWaehrung(s.nettobetrag_cent, p.waehrung)}</td>
                  <td>{(s.steuersatz_promille / 10).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %</td>
                  <td>{formatCentMitWaehrung(s.steuerbetrag_cent, p.waehrung)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `npx vitest run src/components/EingangsrechnungZusatzfelder.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/EingangsrechnungZusatzfelder.tsx src/components/EingangsrechnungZusatzfelder.test.tsx
git commit -m "feat: Komponente EingangsrechnungZusatzfelder (gruppierte Anzeige)"
```

---

### Task 7: Frontend — Einbindung in `Eingangsrechnungen.tsx` (Import-Vorschau)

**Files:**
- Modify: `src/pages/Eingangsrechnungen.tsx`
- Modify: `src/pages/Eingangsrechnungen.test.tsx`

- [ ] **Step 1: Bestehende Mocks reparieren**

Alle `felder`-Objekte im `vi.mock("../api", ...)`-Block und in `importVorschau`-Overrides (Zeilen 18–25, 90–93, 106–109) müssen um die 19 neuen String-Felder (leer) plus `steuerzeilen: []` ergänzt werden, sonst schlägt der TypeScript-Check fehl. Beispiel für den Haupt-Mock:

```ts
importVorschau: vi.fn().mockResolvedValue({
  geparst: true,
  felder: {
    rechnungssteller_name: "Neuer Lieferant", rechnungsnummer: "RE-9999",
    rechnungsdatum: "2026-07-19", betrag_cent: 10000, waehrung: "EUR", positionen: [],
    kaeufer_name: "", kaeufer_strasse: "", kaeufer_plz: "", kaeufer_ort: "", kaeufer_land: "",
    verkaeufer_strasse: "", verkaeufer_plz: "", verkaeufer_ort: "", verkaeufer_land: "",
    verkaeufer_steuernummer: "", verkaeufer_email: "",
    zahlungsbedingungen: "", faelligkeitsdatum: "", iban: "", bic: "", bankname: "",
    bestellnummer: "", leitweg_id: "", lieferantennummer: "", leistungsdatum: "",
    steuerzeilen: [],
  },
  ist_duplikat: false,
}),
```

Wende dasselbe Muster auf die beiden `importVorschau.mockResolvedValueOnce(...)`-Aufrufe in den Tests `zeigt bei Parse-Fehlschlag ...` und `warnt bei Duplikat ...` an.

- [ ] **Step 2: Failing Test — Zusatzfelder erscheinen in der Vorschau**

Füge einen neuen Test hinzu (an beliebiger Stelle vor dem Kommentar zu den `speichern()`-Tests):

```ts
it("zeigt Zusatzfelder in der Vorschau, sobald sie geparst wurden", async () => {
  const { api } = await import("../api");
  vi.mocked(api.eingangsrechnungen.importVorschau).mockResolvedValueOnce({
    geparst: true,
    felder: {
      rechnungssteller_name: "Neuer Lieferant", rechnungsnummer: "RE-9999",
      rechnungsdatum: "2026-07-19", betrag_cent: 10000, waehrung: "EUR", positionen: [],
      kaeufer_name: "", kaeufer_strasse: "", kaeufer_plz: "", kaeufer_ort: "", kaeufer_land: "",
      verkaeufer_strasse: "Lieferantenweg 9", verkaeufer_plz: "50667", verkaeufer_ort: "Köln", verkaeufer_land: "DE",
      verkaeufer_steuernummer: "DE123456789", verkaeufer_email: "",
      zahlungsbedingungen: "", faelligkeitsdatum: "", iban: "", bic: "", bankname: "",
      bestellnummer: "", leitweg_id: "", lieferantennummer: "", leistungsdatum: "",
      steuerzeilen: [],
    },
    ist_duplikat: false,
  });
  render(<Eingangsrechnungen onOeffnen={() => {}} />);
  await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Importieren" }));
  await waitFor(() => expect(screen.getByText("Neuer Lieferant")).toBeTruthy());
  expect(screen.getByText("DE123456789")).toBeTruthy();
});
```

- [ ] **Step 3: Test laufen lassen — muss fehlschlagen**

Run: `npx vitest run src/pages/Eingangsrechnungen.test.tsx -t "zeigt Zusatzfelder in der Vorschau"`
Expected: FAIL (Text "DE123456789" wird noch nirgends gerendert)

- [ ] **Step 4: `Eingangsrechnungen.tsx` einbinden**

Ergänze den Import (Zeile 4–7):

```tsx
import { api, type AppFehler, type Eingangsrechnung, type EingangsrechnungFelderNeu, type EingangsrechnungVorschau } from "../api";
import { Bestaetigungsdialog } from "../components/Bestaetigungsdialog";
import { EingangsrechnungZusatzfelder } from "../components/EingangsrechnungZusatzfelder";
import { Fehler } from "../components/Fehler";
import { formatCentMitWaehrung, formatMenge, parseEuro } from "../geld";
```

Füge direkt nach der schließenden `</table>` der Positionstabelle (nach Zeile 191, vor dem `<button type="submit" ...>`) ein:

```tsx
          {vorschau.geparst && (
            <EingangsrechnungZusatzfelder
              kaeufer_name={vorschau.felder.kaeufer_name}
              kaeufer_strasse={vorschau.felder.kaeufer_strasse}
              kaeufer_plz={vorschau.felder.kaeufer_plz}
              kaeufer_ort={vorschau.felder.kaeufer_ort}
              kaeufer_land={vorschau.felder.kaeufer_land}
              verkaeufer_strasse={vorschau.felder.verkaeufer_strasse}
              verkaeufer_plz={vorschau.felder.verkaeufer_plz}
              verkaeufer_ort={vorschau.felder.verkaeufer_ort}
              verkaeufer_land={vorschau.felder.verkaeufer_land}
              verkaeufer_steuernummer={vorschau.felder.verkaeufer_steuernummer}
              verkaeufer_email={vorschau.felder.verkaeufer_email}
              zahlungsbedingungen={vorschau.felder.zahlungsbedingungen}
              faelligkeitsdatum={vorschau.felder.faelligkeitsdatum}
              iban={vorschau.felder.iban}
              bic={vorschau.felder.bic}
              bankname={vorschau.felder.bankname}
              bestellnummer={vorschau.felder.bestellnummer}
              leitweg_id={vorschau.felder.leitweg_id}
              lieferantennummer={vorschau.felder.lieferantennummer}
              leistungsdatum={vorschau.felder.leistungsdatum}
              waehrung={vorschau.felder.waehrung}
              steuerzeilen={vorschau.felder.steuerzeilen}
            />
          )}
```

(Bewusst nur bei `vorschau.geparst` gerendert — bei Parse-Fehlschlag sind alle Zusatzfelder ohnehin leer und die Komponente würde nichts anzeigen, aber so bleibt die Absicht im Code explizit.)

- [ ] **Step 5: Test laufen lassen — muss bestehen**

Run: `npx vitest run src/pages/Eingangsrechnungen.test.tsx`
Expected: PASS (alle Tests der Datei)

- [ ] **Step 6: TypeScript-Check**

Run: `npx tsc --noEmit`
Expected: FAIL nur noch mit Fehlern in `EingangsrechnungDetail.test.tsx` (folgt in Task 8) — keine Fehler mehr in `Eingangsrechnungen.tsx`/`.test.tsx`.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Eingangsrechnungen.tsx src/pages/Eingangsrechnungen.test.tsx
git commit -m "feat: Zusatzfelder in der Eingangsrechnung-Importvorschau anzeigen"
```

---

### Task 8: Frontend — Einbindung in `EingangsrechnungDetail.tsx`

**Files:**
- Modify: `src/pages/EingangsrechnungDetail.tsx`
- Modify: `src/pages/EingangsrechnungDetail.test.tsx`

- [ ] **Step 1: Bestehenden Mock reparieren**

Der `api.eingangsrechnungen.get`-Mock (Zeilen 15–25) muss um die 19 neuen String-Felder auf `eingangsrechnung` sowie `steuerzeilen: []` auf der obersten Ebene des Rückgabewerts ergänzt werden:

```ts
get: vi.fn().mockResolvedValue({
  eingangsrechnung: {
    id: "e1", dateiname: "rechnung.xml", format: "xrechnung",
    rechnungssteller_name: "Lieferant GmbH", rechnungsnummer: "RE-2026-0042",
    rechnungsdatum: "2026-07-15", betrag_cent: 23800, waehrung: "EUR",
    manuell_erfasst: false, importiert_am: "2026-07-19T10:00:00Z",
    kaeufer_name: "", kaeufer_strasse: "", kaeufer_plz: "", kaeufer_ort: "", kaeufer_land: "",
    verkaeufer_strasse: "Lieferantenweg 9", verkaeufer_plz: "50667", verkaeufer_ort: "Köln", verkaeufer_land: "DE",
    verkaeufer_steuernummer: "DE123456789", verkaeufer_email: "",
    zahlungsbedingungen: "", faelligkeitsdatum: "", iban: "", bic: "", bankname: "",
    bestellnummer: "", leitweg_id: "", lieferantennummer: "", leistungsdatum: "",
  },
  positionen: [
    { bezeichnung: "Bürobedarf", menge: 2000, einzelpreis_cent: 11900, positionssumme_cent: 23800 },
  ],
  steuerzeilen: [{ nettobetrag_cent: 20000, steuersatz_promille: 190, steuerbetrag_cent: 3800 }],
}),
```

- [ ] **Step 2: Failing Test — Zusatzfelder erscheinen im Detail**

Füge einen neuen Test hinzu:

```ts
it("zeigt Zusatzfelder und Steuerzeilen in der Detailansicht", async () => {
  render(<EingangsrechnungDetail id="e1" />);
  await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
  expect(screen.getByText("DE123456789")).toBeTruthy();
  expect(screen.getByText("19,0 %")).toBeTruthy();
});
```

- [ ] **Step 3: Test laufen lassen — muss fehlschlagen**

Run: `npx vitest run src/pages/EingangsrechnungDetail.test.tsx -t "zeigt Zusatzfelder und Steuerzeilen"`
Expected: FAIL (Text "DE123456789" wird noch nirgends gerendert)

- [ ] **Step 4: `EingangsrechnungDetail.tsx` einbinden**

Ergänze den Import (Zeilen 4–6):

```tsx
import { api, type AppFehler, type EingangsrechnungDetail as EingangsrechnungDetailTyp } from "../api";
import { EingangsrechnungZusatzfelder } from "../components/EingangsrechnungZusatzfelder";
import { Fehler } from "../components/Fehler";
import { formatCentMitWaehrung, formatMenge, parseEuro } from "../geld";
```

Füge nach der schließenden `</table>` der Positionstabelle (nach Zeile 158, dem Ende der `return`-JSX) ein, direkt vor dem schließenden `</div>` der Komponente:

```tsx
      <EingangsrechnungZusatzfelder
        kaeufer_name={detail.eingangsrechnung.kaeufer_name}
        kaeufer_strasse={detail.eingangsrechnung.kaeufer_strasse}
        kaeufer_plz={detail.eingangsrechnung.kaeufer_plz}
        kaeufer_ort={detail.eingangsrechnung.kaeufer_ort}
        kaeufer_land={detail.eingangsrechnung.kaeufer_land}
        verkaeufer_strasse={detail.eingangsrechnung.verkaeufer_strasse}
        verkaeufer_plz={detail.eingangsrechnung.verkaeufer_plz}
        verkaeufer_ort={detail.eingangsrechnung.verkaeufer_ort}
        verkaeufer_land={detail.eingangsrechnung.verkaeufer_land}
        verkaeufer_steuernummer={detail.eingangsrechnung.verkaeufer_steuernummer}
        verkaeufer_email={detail.eingangsrechnung.verkaeufer_email}
        zahlungsbedingungen={detail.eingangsrechnung.zahlungsbedingungen}
        faelligkeitsdatum={detail.eingangsrechnung.faelligkeitsdatum}
        iban={detail.eingangsrechnung.iban}
        bic={detail.eingangsrechnung.bic}
        bankname={detail.eingangsrechnung.bankname}
        bestellnummer={detail.eingangsrechnung.bestellnummer}
        leitweg_id={detail.eingangsrechnung.leitweg_id}
        lieferantennummer={detail.eingangsrechnung.lieferantennummer}
        leistungsdatum={detail.eingangsrechnung.leistungsdatum}
        waehrung={detail.eingangsrechnung.waehrung}
        steuerzeilen={detail.steuerzeilen}
      />
```

(Direkt unterhalb der Positionstabelle platziert, unabhängig vom Bearbeiten-/Lesemodus der Kernfelder-Karte — die Zusatzfelder sind immer reine Anzeige und wechseln nicht mit `bearbeitenModus`.)

- [ ] **Step 5: Test laufen lassen — muss bestehen**

Run: `npx vitest run src/pages/EingangsrechnungDetail.test.tsx`
Expected: PASS (alle Tests der Datei)

- [ ] **Step 6: Commit**

```bash
git add src/pages/EingangsrechnungDetail.tsx src/pages/EingangsrechnungDetail.test.tsx
git commit -m "feat: Zusatzfelder und Steuerzeilen in der Eingangsrechnung-Detailansicht anzeigen"
```

---

### Task 9: Abschlussprüfung

**Files:** keine Änderungen — reine Verifikation.

- [ ] **Step 1: Vollständiger Backend-Testlauf**

Run: `cd src-tauri && cargo test`
Expected: PASS, alle Module (inkl. `eingangsrechnung_parse`, `commands::eingangsrechnungen`, `xrechnung`, `zugferd`, `pdf`, `db`)

- [ ] **Step 2: Clippy (falls im Projekt üblich)**

Run: `cd src-tauri && cargo clippy --all-targets -- -D warnings`
Expected: PASS ohne Warnungen (bei Abweichungen: gezielt beheben, keine pauschalen `#[allow(...)]`)

- [ ] **Step 3: Vollständiger Frontend-Testlauf**

Run: `npx vitest run`
Expected: PASS, alle Test-Dateien inkl. der neuen `EingangsrechnungZusatzfelder.test.tsx`

- [ ] **Step 4: TypeScript-Check**

Run: `npx tsc --noEmit`
Expected: PASS ohne Fehler

- [ ] **Step 5: Manuelle Prüfung im Tauri-Dev-Modus**

Run: `npm run tauri dev` (oder die im Projekt übliche Startvariante)

Import der bereits vorhandenen Beispieldatei `~/Desktop/beispiel-eingangsrechnung-vollstaendig.xml` (enthält Anschriften, Steuernummer, E-Mail, IBAN/BIC, Zahlungsbedingungen, Bestellnummer, Leitweg-ID, Lieferantennummer, Leistungsdatum und eine Steuerzeile) durchführen und prüfen:
- Vorschau zeigt die neuen Felder gruppiert an (Rechnungssteller, Rechnungsempfänger, Zahlung, Referenzen, Liefer-/Leistungsdatum, Steuern-Tabelle)
- Nach Speichern zeigt die Detailansicht dieselben Felder
- Die 4 Kernfelder bleiben im Bearbeiten-Modus editierbar; die neuen Felder erscheinen nirgends als Eingabefeld
- `eingangsrechnung_update` (Speichern im Bearbeiten-Modus) verändert die Zusatzfelder nicht (z. B. Steuernummer bleibt nach einer Kernfeld-Korrektur erhalten)

- [ ] **Step 6: Finaler Review und Merge**

Kompletten Diff seit Abzweigung von `main` durchsehen (Migration, beide Parser, Commands, Frontend-Typen, neue Komponente, beide Seiten). Bei Auffälligkeiten: gezielt nachbessern, dann erneut Schritt 1+3+4 laufen lassen. Abschließend auf `main` mergen (kein separater Worktree wurde für diese Änderung angelegt — direkt auf `main` commitiert wie der übrige Verlauf dieser Session).
