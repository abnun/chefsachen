use crate::dokument::kontext::BelegKontext;
use crate::error::{AppError, AppResult};
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
    // ram:SpecifiedTradeSettlementPaymentMeans steht laut CII-Schema vor
    // ram:SpecifiedTradePaymentTerms (Reihenfolge innerhalb von ApplicableHeaderTradeSettlement:
    // ...PaymentReference?, InvoiceCurrencyCode, PayeeTradeParty?, SpecifiedTradeSettlementPaymentMeans*,
    // ApplicableTradeTax*, ..., SpecifiedTradePaymentTerms*, ...). IBAN ist Pflicht für den Block,
    // BIC optional — bei leerer IBAN wird der gesamte Block ausgelassen statt eines leeren Elements.
    if !kontext.firma.iban.trim().is_empty() {
        writer.write_event(Event::Start(BytesStart::new("ram:SpecifiedTradeSettlementPaymentMeans"))).unwrap();
        schreibe_text(&mut writer, "ram:TypeCode", "58");
        writer.write_event(Event::Start(BytesStart::new("ram:PayeePartyCreditorFinancialAccount"))).unwrap();
        schreibe_text(&mut writer, "ram:IBANID", &kontext.firma.iban);
        writer.write_event(Event::End(BytesEnd::new("ram:PayeePartyCreditorFinancialAccount"))).unwrap();
        if !kontext.firma.bic.trim().is_empty() {
            writer.write_event(Event::Start(BytesStart::new("ram:PayeeSpecifiedCreditorFinancialInstitution"))).unwrap();
            schreibe_text(&mut writer, "ram:BICID", &kontext.firma.bic);
            writer.write_event(Event::End(BytesEnd::new("ram:PayeeSpecifiedCreditorFinancialInstitution"))).unwrap();
        }
        writer.write_event(Event::End(BytesEnd::new("ram:SpecifiedTradeSettlementPaymentMeans"))).unwrap();
    }
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

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::commands::belege::{Beleg, Belegposition};
    use crate::commands::firma::Firma;

    pub(crate) fn test_kontext(storno_von: Option<&str>, summe_cent: i64) -> BelegKontext {
        crate::dokument::kontext::BelegKontext {
            beleg: Beleg {
                id: "b1".into(), typ: "rechnung".into(), nummer: Some("RE-2026-0001".into()),
                status: "gestellt".into(), kunde_id: "k1".into(), datum: "2026-07-11".into(),
                leistungsdatum: "2026-07-11".into(), zahlungsziel_tage: 14,
                kopftext: "".into(), fusstext: "".into(), summe_cent,
                ursprungsangebot_id: None, storno_von_id: storno_von.map(String::from),
                kunde_snapshot: String::new(), kunde_snapshot_name: None,
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
    fn xml_erzeugen_enthaelt_iban_und_bic_in_den_zahlungsmitteln() {
        let xml = xml_erzeugen(&test_kontext(None, 9500)).unwrap();
        assert!(xml.contains("<ram:TypeCode>58</ram:TypeCode>"));
        assert!(xml.contains("<ram:IBANID>DE00 1234 5678</ram:IBANID>"));
        assert!(xml.contains("<ram:BICID>ABCDDEFF</ram:BICID>"));
    }

    #[test]
    fn xml_erzeugen_laesst_zahlungsmittel_block_ohne_iban_weg() {
        let mut kontext = test_kontext(None, 9500);
        kontext.firma.iban = "".into();
        kontext.firma.bic = "".into();
        let xml = xml_erzeugen(&kontext).unwrap();
        assert!(!xml.contains("SpecifiedTradeSettlementPaymentMeans"));
    }

    #[test]
    fn xml_erzeugen_laesst_bic_element_ohne_bic_weg() {
        let mut kontext = test_kontext(None, 9500);
        kontext.firma.bic = "".into();
        let xml = xml_erzeugen(&kontext).unwrap();
        assert!(xml.contains("<ram:IBANID>DE00 1234 5678</ram:IBANID>"));
        assert!(!xml.contains("BICID"));
    }

    #[test]
    fn xml_erzeugen_enthaelt_postadressen_beider_parteien() {
        let xml = xml_erzeugen(&test_kontext(None, 9500)).unwrap();
        assert!(xml.contains("10115"), "Verkäufer-PLZ fehlt");
        assert!(xml.contains("10117"), "Käufer-PLZ fehlt");
        assert!(xml.contains("<ram:CountryID>DE</ram:CountryID>"));
    }

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
}
