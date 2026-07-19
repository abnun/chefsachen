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
}
