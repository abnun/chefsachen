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
    // Vorzeichen wie bei cent_zu_dezimal explizit behandeln, sonst entstünde
    // bei -1500 die Zeichenfolge "-1.-500".
    let vorzeichen = if menge_x1000 < 0 { "-" } else { "" };
    let betrag = menge_x1000.abs();
    format!("{}{}.{:03}", vorzeichen, betrag / 1000, betrag % 1000)
}

/// Kennung des Profils, dem die erzeugte Datei entspricht (BT-24). Ohne sie kann
/// ein Empfänger die Datei keinem Regelwerk zuordnen — der amtliche Validator
/// findet dann kein Prüfszenario und weist das Dokument ungeprüft zurück.
/// Der Namensraum wechselte mit XRechnung 3.0 von `xoev-de:kosit:standard`
/// auf `xeinkauf.de:kosit` — die alte Kennung passt auf kein Prüfszenario mehr.
const PROFIL_KENNUNG: &str =
    "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0";

/// Geschäftsprozess-Kennung (BT-23). XRechnung verlangt sie zwingend
/// (PEPPOL-EN16931-R001); für eine gewöhnliche Rechnungsstellung ist das der
/// Standardwert aus dem PEPPOL-Billing-Profil.
const GESCHAEFTSPROZESS: &str = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";

/// Begründung der Steuerbefreiung (BT-120) für Kleinunternehmer nach § 19 UStG.
const BEFREIUNGSGRUND: &str = "Kleinunternehmer gemäß § 19 UStG";

/// Übersetzt die im Programm gepflegten Einheitenkürzel in UN/ECE-Rec-20-Codes,
/// wie sie EN 16931 verlangt. Unbekannte Kürzel werden zu C62 (Stück) —
/// dem neutralen Sammelcode —, damit ein selbst angelegtes Kürzel den Export
/// nicht scheitern lässt.
fn einheit_zu_unece(kuerzel: &str) -> &'static str {
    match kuerzel.trim().trim_end_matches('.').to_lowercase().as_str() {
        "std" | "stunde" | "stunden" | "h" => "HUR",
        "tag" | "tage" | "d" => "DAY",
        "km" => "KMT",
        "kg" => "KGM",
        "m" | "meter" => "MTR",
        "m2" | "qm" => "MTK",
        "l" | "liter" => "LTR",
        "monat" | "monate" => "MON",
        "woche" | "wochen" => "WEE",
        "pauschale" | "psch" => "LS",
        _ => "C62",
    }
}

/// Addiert Tage auf ein ISO-Datum und liefert das Ergebnis als YYYYMMDD.
/// Wird für das Fälligkeitsdatum (BT-9) gebraucht, das sich im Datenmodell nur
/// mittelbar aus Belegdatum und Zahlungsziel ergibt.
fn faelligkeit_yyyymmdd(datum_iso: &str, zahlungsziel_tage: i64) -> Option<String> {
    let datum = chrono::NaiveDate::parse_from_str(datum_iso, "%Y-%m-%d").ok()?;
    let faellig = datum.checked_add_signed(chrono::Duration::days(zahlungsziel_tage))?;
    Some(faellig.format("%Y%m%d").to_string())
}

/// Schreibt eine Betragsangabe.
///
/// In der CII-Syntax trägt ausschließlich `ram:TaxTotalAmount` das Attribut
/// `currencyID`; an allen anderen Betragselementen ist es untersagt
/// (Regel CII-DT-031). Die UBL-Syntax handhabt das genau umgekehrt — eine
/// Verwechslung, die ohne normkonformen Prüfer kaum auffällt.
fn schreibe_betrag(writer: &mut Writer<Cursor<Vec<u8>>>, tag: &str, cent: i64) {
    writer.write_event(Event::Start(BytesStart::new(tag))).unwrap();
    writer.write_event(Event::Text(BytesText::new(&cent_zu_dezimal(cent)))).unwrap();
    writer.write_event(Event::End(BytesEnd::new(tag))).unwrap();
}

/// Schreibt `ram:TaxTotalAmount` — das einzige Betragselement in CII, das
/// `currencyID` tragen muss.
fn schreibe_steuersumme(writer: &mut Writer<Cursor<Vec<u8>>>, cent: i64) {
    writer.write_event(Event::Start(BytesStart::new("ram:TaxTotalAmount")
        .with_attributes([("currencyID", "EUR")]))).unwrap();
    writer.write_event(Event::Text(BytesText::new(&cent_zu_dezimal(cent)))).unwrap();
    writer.write_event(Event::End(BytesEnd::new("ram:TaxTotalAmount"))).unwrap();
}

pub fn xml_erzeugen(kontext: &BelegKontext) -> AppResult<String> {
    let mut writer = Writer::new_with_indent(Cursor::new(Vec::new()), b' ', 2);
    let type_code = if kontext.beleg.storno_von_id.is_some() { "384" } else { "380" };

    writer.write_event(Event::Decl(BytesDecl::new("1.0", Some("UTF-8"), None))).unwrap();
    writer.write_event(Event::Start(BytesStart::new("rsm:CrossIndustryInvoice")
        .with_attributes([
            ("xmlns:rsm", "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"),
            ("xmlns:ram", "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"),
            ("xmlns:udt", "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"),
        ]))).unwrap();

    // ExchangedDocumentContext MUSS laut CII-Schema das erste Kind sein und
    // trägt die Profilkennung (BT-24). Fehlt sie, ordnet kein Empfängersystem
    // die Datei einem Regelwerk zu.
    writer.write_event(Event::Start(BytesStart::new("rsm:ExchangedDocumentContext"))).unwrap();
    writer.write_event(Event::Start(BytesStart::new("ram:BusinessProcessSpecifiedDocumentContextParameter"))).unwrap();
    schreibe_text(&mut writer, "ram:ID", GESCHAEFTSPROZESS);
    writer.write_event(Event::End(BytesEnd::new("ram:BusinessProcessSpecifiedDocumentContextParameter"))).unwrap();
    writer.write_event(Event::Start(BytesStart::new("ram:GuidelineSpecifiedDocumentContextParameter"))).unwrap();
    schreibe_text(&mut writer, "ram:ID", PROFIL_KENNUNG);
    writer.write_event(Event::End(BytesEnd::new("ram:GuidelineSpecifiedDocumentContextParameter"))).unwrap();
    writer.write_event(Event::End(BytesEnd::new("rsm:ExchangedDocumentContext"))).unwrap();

    // ExchangedDocument: Belegkopf
    writer.write_event(Event::Start(BytesStart::new("rsm:ExchangedDocument"))).unwrap();
    schreibe_text(&mut writer, "ram:ID", kontext.beleg.nummer.as_deref().unwrap_or(""));
    schreibe_text(&mut writer, "ram:TypeCode", type_code);
    writer.write_event(Event::Start(BytesStart::new("ram:IssueDateTime"))).unwrap();
    writer.write_event(Event::Start(BytesStart::new("udt:DateTimeString")
        .with_attributes([("format", "102")]))).unwrap();
    writer.write_event(Event::Text(BytesText::new(&kontext.beleg.datum.replace('-', "")))).unwrap();
    writer.write_event(Event::End(BytesEnd::new("udt:DateTimeString"))).unwrap();
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
        // BR-27: Der Einzelpreis darf nicht negativ sein. Bei einer Korrektur
        // (TypeCode 384) trägt der Beleg negierte Preise; die Norm erwartet dort
        // positive Beträge, die Korrektur-Semantik steckt im TypeCode.
        schreibe_betrag(&mut writer, "ram:ChargeAmount", pos.einzelpreis_cent.abs());
        writer.write_event(Event::End(BytesEnd::new("ram:NetPriceProductTradePrice"))).unwrap();
        writer.write_event(Event::End(BytesEnd::new("ram:SpecifiedLineTradeAgreement"))).unwrap();
        writer.write_event(Event::Start(BytesStart::new("ram:SpecifiedLineTradeDelivery"))).unwrap();
        writer.write_event(Event::Start(BytesStart::new("ram:BilledQuantity")
            .with_attributes([("unitCode", einheit_zu_unece(&pos.einheit_kuerzel))]))).unwrap();
        writer.write_event(Event::Text(BytesText::new(&menge_zu_dezimal(pos.menge)))).unwrap();
        writer.write_event(Event::End(BytesEnd::new("ram:BilledQuantity"))).unwrap();
        writer.write_event(Event::End(BytesEnd::new("ram:SpecifiedLineTradeDelivery"))).unwrap();
        writer.write_event(Event::Start(BytesStart::new("ram:SpecifiedLineTradeSettlement"))).unwrap();
        writer.write_event(Event::Start(BytesStart::new("ram:ApplicableTradeTax"))).unwrap();
        schreibe_text(&mut writer, "ram:TypeCode", "VAT");
        schreibe_text(&mut writer, "ram:CategoryCode", "E");
        schreibe_text(&mut writer, "ram:RateApplicablePercent", "0.00");
        writer.write_event(Event::End(BytesEnd::new("ram:ApplicableTradeTax"))).unwrap();
        writer.write_event(Event::Start(BytesStart::new("ram:SpecifiedTradeSettlementLineMonetarySummation"))).unwrap();
        schreibe_betrag(&mut writer, "ram:LineTotalAmount", pos.positionssumme_cent.abs());
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
    // SELLER CONTACT (BG-6) — in XRechnung Pflicht (BR-DE-2). Im CII-Schema
    // steht der Kontakt vor der Anschrift.
    writer.write_event(Event::Start(BytesStart::new("ram:DefinedTradeContact"))).unwrap();
    let kontakt = if kontext.firma.kontakt_name.trim().is_empty() {
        kontext.firma.name.trim()
    } else {
        kontext.firma.kontakt_name.trim()
    };
    schreibe_text(&mut writer, "ram:PersonName", kontakt);
    writer.write_event(Event::Start(BytesStart::new("ram:TelephoneUniversalCommunication"))).unwrap();
    schreibe_text(&mut writer, "ram:CompleteNumber", kontext.firma.telefon.trim());
    writer.write_event(Event::End(BytesEnd::new("ram:TelephoneUniversalCommunication"))).unwrap();
    writer.write_event(Event::Start(BytesStart::new("ram:EmailURIUniversalCommunication"))).unwrap();
    schreibe_text(&mut writer, "ram:URIID", kontext.firma.email.trim());
    writer.write_event(Event::End(BytesEnd::new("ram:EmailURIUniversalCommunication"))).unwrap();
    writer.write_event(Event::End(BytesEnd::new("ram:DefinedTradeContact"))).unwrap();
    writer.write_event(Event::Start(BytesStart::new("ram:PostalTradeAddress"))).unwrap();
    schreibe_text(&mut writer, "ram:PostcodeCode", &kontext.firma.plz);
    schreibe_text(&mut writer, "ram:LineOne", &kontext.firma.strasse);
    schreibe_text(&mut writer, "ram:CityName", &kontext.firma.ort);
    schreibe_text(&mut writer, "ram:CountryID", &kontext.firma.land);
    writer.write_event(Event::End(BytesEnd::new("ram:PostalTradeAddress"))).unwrap();
    // BT-34: elektronische Adresse des Verkäufers, in XRechnung Pflicht (BR-DE-5).
    // scheme EM = E-Mail.
    if !kontext.firma.email.trim().is_empty() {
        writer.write_event(Event::Start(BytesStart::new("ram:URIUniversalCommunication"))).unwrap();
        writer.write_event(Event::Start(BytesStart::new("ram:URIID")
            .with_attributes([("schemeID", "EM")]))).unwrap();
        writer.write_event(Event::Text(BytesText::new(kontext.firma.email.trim()))).unwrap();
        writer.write_event(Event::End(BytesEnd::new("ram:URIID"))).unwrap();
        writer.write_event(Event::End(BytesEnd::new("ram:URIUniversalCommunication"))).unwrap();
    }
    // BT-31/BT-32: Die USt-IdNr. trägt schemeID "VA", die Steuernummer "FC".
    // Vorher war das Element hart auf ust_idnr verdrahtet — ein Kleinunternehmer
    // ohne USt-IdNr. (der Regelfall) bekam ein leeres <ram:ID/>.
    let (steuer_id, steuer_schema) = if !kontext.firma.ust_idnr.trim().is_empty() {
        (kontext.firma.ust_idnr.as_str(), "VA")
    } else {
        (kontext.firma.steuernummer.as_str(), "FC")
    };
    if !steuer_id.trim().is_empty() {
        writer.write_event(Event::Start(BytesStart::new("ram:SpecifiedTaxRegistration"))).unwrap();
        writer.write_event(Event::Start(BytesStart::new("ram:ID")
            .with_attributes([("schemeID", steuer_schema)]))).unwrap();
        writer.write_event(Event::Text(BytesText::new(steuer_id))).unwrap();
        writer.write_event(Event::End(BytesEnd::new("ram:ID"))).unwrap();
        writer.write_event(Event::End(BytesEnd::new("ram:SpecifiedTaxRegistration"))).unwrap();
    }
    writer.write_event(Event::End(BytesEnd::new("ram:SellerTradeParty"))).unwrap();
    writer.write_event(Event::Start(BytesStart::new("ram:BuyerTradeParty"))).unwrap();
    schreibe_text(&mut writer, "ram:Name", &kontext.kunde_name);
    writer.write_event(Event::Start(BytesStart::new("ram:PostalTradeAddress"))).unwrap();
    schreibe_text(&mut writer, "ram:PostcodeCode", &kontext.adresse_plz);
    schreibe_text(&mut writer, "ram:LineOne", &kontext.adresse_strasse);
    schreibe_text(&mut writer, "ram:CityName", &kontext.adresse_ort);
    schreibe_text(&mut writer, "ram:CountryID", &kontext.adresse_land);
    writer.write_event(Event::End(BytesEnd::new("ram:PostalTradeAddress"))).unwrap();
    // BT-49: elektronische Adresse des Käufers, in XRechnung Pflicht (BR-DE-6).
    if !kontext.kunde_email.trim().is_empty() {
        writer.write_event(Event::Start(BytesStart::new("ram:URIUniversalCommunication"))).unwrap();
        writer.write_event(Event::Start(BytesStart::new("ram:URIID")
            .with_attributes([("schemeID", "EM")]))).unwrap();
        writer.write_event(Event::Text(BytesText::new(kontext.kunde_email.trim()))).unwrap();
        writer.write_event(Event::End(BytesEnd::new("ram:URIID"))).unwrap();
        writer.write_event(Event::End(BytesEnd::new("ram:URIUniversalCommunication"))).unwrap();
    }
    writer.write_event(Event::End(BytesEnd::new("ram:BuyerTradeParty"))).unwrap();
    if !kontext.kunde_leitweg_id.is_empty() && !kontext.kunde_kaeuferreferenz.is_empty() {
        // Wenn die Leitweg-ID BT-10 belegt, bleibt die Käuferreferenz als Bestellreferenz erhalten.
        writer.write_event(Event::Start(BytesStart::new("ram:BuyerOrderReferencedDocument"))).unwrap();
        schreibe_text(&mut writer, "ram:IssuerAssignedID", &kontext.kunde_kaeuferreferenz);
        writer.write_event(Event::End(BytesEnd::new("ram:BuyerOrderReferencedDocument"))).unwrap();
    }
    writer.write_event(Event::End(BytesEnd::new("ram:ApplicableHeaderTradeAgreement"))).unwrap();

    // ApplicableHeaderTradeDelivery ist im CII-Schema Pflicht (minOccurs=1) und
    // trägt das Leistungsdatum (BT-72) — dieselbe Pflichtangabe nach § 14 UStG,
    // die der eigene Eingangsrechnungs-Parser bei fremden Rechnungen ausliest.
    writer.write_event(Event::Start(BytesStart::new("ram:ApplicableHeaderTradeDelivery"))).unwrap();
    writer.write_event(Event::Start(BytesStart::new("ram:ActualDeliverySupplyChainEvent"))).unwrap();
    writer.write_event(Event::Start(BytesStart::new("ram:OccurrenceDateTime"))).unwrap();
    writer.write_event(Event::Start(BytesStart::new("udt:DateTimeString")
        .with_attributes([("format", "102")]))).unwrap();
    writer.write_event(Event::Text(BytesText::new(&kontext.beleg.leistungsdatum.replace('-', "")))).unwrap();
    writer.write_event(Event::End(BytesEnd::new("udt:DateTimeString"))).unwrap();
    writer.write_event(Event::End(BytesEnd::new("ram:OccurrenceDateTime"))).unwrap();
    writer.write_event(Event::End(BytesEnd::new("ram:ActualDeliverySupplyChainEvent"))).unwrap();
    writer.write_event(Event::End(BytesEnd::new("ram:ApplicableHeaderTradeDelivery"))).unwrap();

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
    // Kopf-Steuerzeile (BG-23). Hier — nicht auf Positionsebene — werten
    // Empfängersysteme die Steuerbefreiung aus. Ohne diesen Block ist die
    // Kleinunternehmer-Kennzeichnung faktisch nicht vorhanden (BR-E-1, BR-E-10).
    let netto = kontext.beleg.summe_cent.abs();
    writer.write_event(Event::Start(BytesStart::new("ram:ApplicableTradeTax"))).unwrap();
    schreibe_betrag(&mut writer, "ram:CalculatedAmount", 0);
    schreibe_text(&mut writer, "ram:TypeCode", "VAT");
    schreibe_text(&mut writer, "ram:ExemptionReason", BEFREIUNGSGRUND);
    schreibe_betrag(&mut writer, "ram:BasisAmount", netto);
    schreibe_text(&mut writer, "ram:CategoryCode", "E");
    schreibe_text(&mut writer, "ram:RateApplicablePercent", "0.00");
    writer.write_event(Event::End(BytesEnd::new("ram:ApplicableTradeTax"))).unwrap();

    writer.write_event(Event::Start(BytesStart::new("ram:SpecifiedTradePaymentTerms"))).unwrap();
    schreibe_text(&mut writer, "ram:Description",
        &format!("Zahlbar innerhalb von {} Tagen", kontext.beleg.zahlungsziel_tage));
    // BT-9: konkretes Fälligkeitsdatum. Das Datenmodell kennt nur das
    // Zahlungsziel in Tagen; die Norm erwartet ein Datum.
    if let Some(faellig) = faelligkeit_yyyymmdd(&kontext.beleg.datum, kontext.beleg.zahlungsziel_tage) {
        writer.write_event(Event::Start(BytesStart::new("ram:DueDateDateTime"))).unwrap();
        writer.write_event(Event::Start(BytesStart::new("udt:DateTimeString")
            .with_attributes([("format", "102")]))).unwrap();
        writer.write_event(Event::Text(BytesText::new(&faellig))).unwrap();
        writer.write_event(Event::End(BytesEnd::new("udt:DateTimeString"))).unwrap();
        writer.write_event(Event::End(BytesEnd::new("ram:DueDateDateTime"))).unwrap();
    }
    writer.write_event(Event::End(BytesEnd::new("ram:SpecifiedTradePaymentTerms"))).unwrap();

    writer.write_event(Event::Start(BytesStart::new("ram:SpecifiedTradeSettlementHeaderMonetarySummation"))).unwrap();
    // BT-106 fehlte bisher ganz — ohne sie ist die Summenprobe BR-CO-10 verletzt.
    let positionssumme: i64 = kontext.positionen.iter().map(|p| p.positionssumme_cent.abs()).sum();
    schreibe_betrag(&mut writer, "ram:LineTotalAmount", positionssumme);
    schreibe_betrag(&mut writer, "ram:TaxBasisTotalAmount", netto);
    schreibe_steuersumme(&mut writer, 0);
    schreibe_betrag(&mut writer, "ram:GrandTotalAmount", netto);
    schreibe_betrag(&mut writer, "ram:DuePayableAmount", netto);
    writer.write_event(Event::End(BytesEnd::new("ram:SpecifiedTradeSettlementHeaderMonetarySummation"))).unwrap();

    // BG-3: Bei einer Korrektur (TypeCode 384) muss auf die Vorrechnung
    // verwiesen werden — sonst ist nicht erkennbar, was korrigiert wird.
    if let Some(nummer) = &kontext.storno_von_nummer {
        writer.write_event(Event::Start(BytesStart::new("ram:InvoiceReferencedDocument"))).unwrap();
        schreibe_text(&mut writer, "ram:IssuerAssignedID", nummer);
        writer.write_event(Event::End(BytesEnd::new("ram:InvoiceReferencedDocument"))).unwrap();
    }
    writer.write_event(Event::End(BytesEnd::new("ram:ApplicableHeaderTradeSettlement"))).unwrap();

    writer.write_event(Event::End(BytesEnd::new("rsm:SupplyChainTradeTransaction"))).unwrap();
    writer.write_event(Event::End(BytesEnd::new("rsm:CrossIndustryInvoice"))).unwrap();
    // Die Elementreihenfolge folgt dem CII-Schema; abgesichert durch den
    // Normkonformitätstest gegen den amtlichen KoSIT-Validator.

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
                iban: "DE02120300000000202051".into(), bic: "BYLADEM1001".into(), email: "rechnung@meine-firma.de".into(), telefon: "030 123456".into(), kontakt_name: "Max Mustermann".into(), gruendungsjahr: None, kleinunternehmer: true, eingerichtet: true,
            },
            kunde_name: "ACME GmbH".into(), kunde_kundennummer: "KD-0001".into(), kunde_ust_idnr: "".into(),
            kunde_email: "acme@example.com".into(), kunde_leitweg_id: "991-12345-67".into(),
            kunde_kaeuferreferenz: "PO-42".into(),
            adresse_strasse: "Kundenweg 5".into(), adresse_plz: "10117".into(), adresse_ort: "Berlin".into(),
            adresse_land: "DE".into(),
            storno_von_nummer: storno_von.map(|_| "RE-2026-0001".to_string()),
        }
    }

    /// Prüft die erzeugte XRechnung gegen die amtlichen Regeln der KoSIT —
    /// derselbe Validator, den Rechnungsempfänger einsetzen.
    ///
    /// Alle übrigen Tests dieses Moduls vergleichen nur Zeichenketten und
    /// bestätigen damit lediglich, dass der Code tut, was er tut. Ob das
    /// Ergebnis der Norm EN 16931 entspricht, kann nur ein normkonformer
    /// Prüfer beantworten.
    ///
    /// Fehlen Validator oder Java-Laufzeit, überspringt sich der Test mit einem
    /// Hinweis (siehe `scripts/kosit-vorbereiten.sh`). In der CI sind beide
    /// vorhanden, dort läuft er bei jedem Durchlauf.
    #[test]
    fn xrechnung_ist_normkonform() {
        if let Some(grund) = crate::dokument::kosit::nicht_verfuegbar_weil() {
            eprintln!("übersprungen: {grund}");
            return;
        }
        let xml = xml_erzeugen(&test_kontext(None, 9500)).unwrap();
        let bericht = crate::dokument::kosit::validieren(&xml).expect("Validator-Aufruf fehlgeschlagen");
        assert!(
            bericht.gueltig,
            "Die erzeugte XRechnung wurde abgelehnt. Befunde ({}):\n{}",
            bericht.befunde().len(),
            bericht.befunde().iter().map(|v| format!("  - {v}")).collect::<Vec<_>>().join("\n")
        );
    }

    #[test]
    fn storno_xrechnung_ist_normkonform() {
        if let Some(grund) = crate::dokument::kosit::nicht_verfuegbar_weil() {
            eprintln!("übersprungen: {grund}");
            return;
        }
        let xml = xml_erzeugen(&test_kontext(Some("r1"), -9500)).unwrap();
        let bericht = crate::dokument::kosit::validieren(&xml).expect("Validator-Aufruf fehlgeschlagen");
        assert!(
            bericht.gueltig,
            "Die erzeugte Storno-XRechnung wurde abgelehnt. Befunde ({}):\n{}",
            bericht.befunde().len(),
            bericht.befunde().iter().map(|v| format!("  - {v}")).collect::<Vec<_>>().join("\n")
        );
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
        assert!(xml.contains("<ram:IBANID>DE02120300000000202051</ram:IBANID>"));
        assert!(xml.contains("<ram:BICID>BYLADEM1001</ram:BICID>"));
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
        assert!(xml.contains("<ram:IBANID>DE02120300000000202051</ram:IBANID>"));
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
