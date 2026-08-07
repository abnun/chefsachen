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

/// Netto-Einzelpreis (BT-146) bei Regelbesteuerung, als Euro-Betrag mit vier
/// Nachkommastellen. Abgeleitet aus dem Zeilennetto statt einzeln gerundet:
/// Ein auf ganze Cent gerundeter Stückpreis multipliziert seinen
/// Rundungsfehler mit der Menge, und ab wenigen Stück meldet die
/// Peppol-Prüfung PEPPOL-EN16931-R120 (Zeilenbetrag ≠ Menge × Preis,
/// Toleranz ±0,02 €). Vier Nachkommastellen sind für Preise ausdrücklich
/// zulässig und halten die Abweichung bei üblichen Mengen unter der Toleranz.
fn netto_einzelpreis_dezimal(zeilennetto_cent: i64, menge_x1000: i64) -> String {
    debug_assert!(menge_x1000 > 0);
    // Euro × 10^4: netto_cent/100 € geteilt durch menge/1000 Stück.
    let zaehler = i128::from(zeilennetto_cent) * 100_000;
    let nenner = i128::from(menge_x1000);
    let gerundet = ((2 * zaehler + nenner) / (2 * nenner)) as i64;
    format!("{}.{:04}", gerundet / 10_000, gerundet % 10_000)
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

/// Steuerkategorie (BT-151/BT-118) bei Regelbesteuerung. 0 % ist Kategorie „Z"
/// (Nullsatz), nicht „S mit 0.00" — BR-S-5 verlangt bei „S" einen Satz über
/// null. Weder S noch Z tragen einen Befreiungsgrund (BR-S-8, BR-Z-8 —
/// ExemptionReason ist der Kategorie E vorbehalten).
fn steuerkategorie(satz_prozent: i64) -> &'static str {
    if satz_prozent > 0 { "S" } else { "Z" }
}

/// Prozentsatz im von der Norm erwarteten Dezimalformat, z. B. „19.00".
fn satz_zu_dezimal(satz_prozent: i64) -> String {
    format!("{satz_prozent}.00")
}

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


/// Dünne Hülle um den XML-Schreiber.
///
/// Geschrieben wird in einen Puffer im Arbeitsspeicher. Ein Schreibfehler kann
/// dort nicht auftreten — `quick_xml` gibt trotzdem ein `Result` zurück, weil
/// es auch auf Dateien und Netzverbindungen schreiben kann.
///
/// Das führte im Erzeuger zu über hundert `.unwrap()`. Jedes einzelne wäre ein
/// Absturz des Programms, und über hundert Stellen liest niemand darauf durch,
/// ob eine davon doch erreichbar ist. Hier steht die Annahme an genau einer
/// Stelle, mit Begründung — und der Erzeuger wird nebenbei lesbar.
struct Xml {
    writer: Writer<Cursor<Vec<u8>>>,
}

impl Xml {
    fn neu() -> Self {
        Self { writer: Writer::new_with_indent(Cursor::new(Vec::new()), b' ', 2) }
    }

    /// Der einzige Punkt, an dem die Unfehlbarkeit des Schreibens angenommen wird.
    fn schreibe(&mut self, ereignis: Event<'_>) {
        self.writer
            .write_event(ereignis)
            .expect("Schreiben in einen Vec<u8> kann nicht fehlschlagen");
    }

    fn deklaration(&mut self) {
        self.schreibe(Event::Decl(BytesDecl::new("1.0", Some("UTF-8"), None)));
    }

    /// Öffnendes Element.
    fn auf(&mut self, tag: &str) {
        self.schreibe(Event::Start(BytesStart::new(tag)));
    }

    /// Öffnendes Element mit Attributen.
    fn auf_mit(&mut self, tag: &str, attribute: &[(&str, &str)]) {
        self.schreibe(Event::Start(
            BytesStart::new(tag).with_attributes(attribute.iter().copied()),
        ));
    }

    /// Schließendes Element.
    fn zu(&mut self, tag: &str) {
        self.schreibe(Event::End(BytesEnd::new(tag)));
    }

    fn text(&mut self, inhalt: &str) {
        self.schreibe(Event::Text(BytesText::new(inhalt)));
    }

    /// Element mit Textinhalt in einem Zug.
    fn feld(&mut self, tag: &str, inhalt: &str) {
        self.auf(tag);
        self.text(inhalt);
        self.zu(tag);
    }


    fn fertig(self) -> String {
        String::from_utf8(self.writer.into_inner().into_inner())
            .expect("erzeugtes XML besteht aus gültigem UTF-8")
    }
}

/// Schreibt eine Betragsangabe.
///
/// In der CII-Syntax trägt ausschließlich `ram:TaxTotalAmount` das Attribut
/// `currencyID`; an allen anderen Betragselementen ist es untersagt
/// (Regel CII-DT-031). Die UBL-Syntax handhabt das genau umgekehrt — eine
/// Verwechslung, die ohne normkonformen Prüfer kaum auffällt.
fn schreibe_betrag(xml: &mut Xml, tag: &str, cent: i64) {
    xml.auf(tag);
    xml.text(&cent_zu_dezimal(cent));
    xml.zu(tag);
}

/// Schreibt `ram:TaxTotalAmount` — das einzige Betragselement in CII, das
/// `currencyID` tragen muss.
fn schreibe_steuersumme(xml: &mut Xml, cent: i64) {
    xml.auf_mit("ram:TaxTotalAmount", &[("currencyID", "EUR")]);
    xml.text(&cent_zu_dezimal(cent));
    xml.zu("ram:TaxTotalAmount");
}

pub fn xml_erzeugen(kontext: &BelegKontext) -> AppResult<String> {
    let mut xml = Xml::neu();
    let type_code = if kontext.beleg.storno_von_id.is_some() { "384" } else { "380" };

    // Regelbesteuerung: Die gespeicherten Beträge sind brutto, die Norm will
    // Nettobeträge. Alles wird vorab auf den Absolutwerten gerechnet — die
    // Beträge stehen im XML durchweg als `.abs()` (Storno-Semantik trägt der
    // TypeCode 384), und so bleiben die Summenproben auch im Storno exakt.
    let regelbesteuert = !kontext.firma.kleinunternehmer;
    let brutto_je_position: Vec<(i64, i64)> = kontext
        .positionen
        .iter()
        .map(|p| (p.ust_satz_prozent, p.positionssumme_cent.abs()))
        .collect();
    let positionsnetti = crate::domain::steuer::positions_netti(&brutto_je_position);
    let steuerzeilen = crate::domain::steuer::aufschluesselung(&brutto_je_position);

    xml.deklaration();
    xml.auf_mit("rsm:CrossIndustryInvoice", &[
            ("xmlns:rsm", "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"),
            ("xmlns:ram", "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"),
            ("xmlns:udt", "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"),
        ]);

    // ExchangedDocumentContext MUSS laut CII-Schema das erste Kind sein und
    // trägt die Profilkennung (BT-24). Fehlt sie, ordnet kein Empfängersystem
    // die Datei einem Regelwerk zu.
    xml.auf("rsm:ExchangedDocumentContext");
    xml.auf("ram:BusinessProcessSpecifiedDocumentContextParameter");
    xml.feld( "ram:ID", GESCHAEFTSPROZESS);
    xml.zu("ram:BusinessProcessSpecifiedDocumentContextParameter");
    xml.auf("ram:GuidelineSpecifiedDocumentContextParameter");
    xml.feld( "ram:ID", PROFIL_KENNUNG);
    xml.zu("ram:GuidelineSpecifiedDocumentContextParameter");
    xml.zu("rsm:ExchangedDocumentContext");

    // ExchangedDocument: Belegkopf
    xml.auf("rsm:ExchangedDocument");
    xml.feld( "ram:ID", kontext.beleg.nummer.as_deref().unwrap_or(""));
    xml.feld( "ram:TypeCode", type_code);
    xml.auf("ram:IssueDateTime");
    xml.auf_mit("udt:DateTimeString", &[("format", "102")]);
    xml.text(&kontext.beleg.datum.replace('-', ""));
    xml.zu("udt:DateTimeString");
    xml.zu("ram:IssueDateTime");
    xml.zu("rsm:ExchangedDocument");

    // SupplyChainTradeTransaction: Positionen, Parteien, Summen, Zahlungsbedingungen
    xml.auf("rsm:SupplyChainTradeTransaction");

    for (i, pos) in kontext.positionen.iter().enumerate() {
        xml.auf("ram:IncludedSupplyChainTradeLineItem");
        xml.auf("ram:AssociatedDocumentLineDocument");
        xml.feld( "ram:LineID", &(i + 1).to_string());
        xml.zu("ram:AssociatedDocumentLineDocument");
        xml.auf("ram:SpecifiedTradeProduct");
        xml.feld( "ram:Name", &pos.bezeichnung);
        xml.zu("ram:SpecifiedTradeProduct");
        xml.auf("ram:SpecifiedLineTradeAgreement");
        xml.auf("ram:NetPriceProductTradePrice");
        // BR-27: Der Einzelpreis darf nicht negativ sein. Bei einer Korrektur
        // (TypeCode 384) trägt der Beleg negierte Preise; die Norm erwartet dort
        // positive Beträge, die Korrektur-Semantik steckt im TypeCode.
        // Bei Regelbesteuerung ist BT-146 der Netto-Einzelpreis — der
        // gespeicherte Preis ist brutto, die Steuer wird herausgerechnet
        // (abgeleitet aus dem Zeilennetto, siehe netto_einzelpreis_dezimal).
        if regelbesteuert {
            xml.feld( "ram:ChargeAmount", &netto_einzelpreis_dezimal(positionsnetti[i], pos.menge.abs()));
        } else {
            schreibe_betrag(&mut xml, "ram:ChargeAmount", pos.einzelpreis_cent.abs());
        }
        xml.zu("ram:NetPriceProductTradePrice");
        xml.zu("ram:SpecifiedLineTradeAgreement");
        xml.auf("ram:SpecifiedLineTradeDelivery");
        xml.auf_mit("ram:BilledQuantity", &[("unitCode", einheit_zu_unece(&pos.einheit_kuerzel))]);
        xml.text(&menge_zu_dezimal(pos.menge));
        xml.zu("ram:BilledQuantity");
        xml.zu("ram:SpecifiedLineTradeDelivery");
        xml.auf("ram:SpecifiedLineTradeSettlement");
        xml.auf("ram:ApplicableTradeTax");
        xml.feld( "ram:TypeCode", "VAT");
        if regelbesteuert {
            xml.feld( "ram:CategoryCode", steuerkategorie(pos.ust_satz_prozent));
            xml.feld( "ram:RateApplicablePercent", &satz_zu_dezimal(pos.ust_satz_prozent));
        } else {
            xml.feld( "ram:CategoryCode", "E");
            xml.feld( "ram:RateApplicablePercent", "0.00");
        }
        xml.zu("ram:ApplicableTradeTax");
        xml.auf("ram:SpecifiedTradeSettlementLineMonetarySummation");
        // BT-131: netto (mit Rest-Cent-Verteilung, damit die Positionsnetti je
        // Satz exakt auf das Gruppennetto summieren — BR-45, BR-CO-10); bei
        // Kleinunternehmern unverändert der Bruttobetrag.
        let zeilensumme = if regelbesteuert { positionsnetti[i] } else { pos.positionssumme_cent.abs() };
        schreibe_betrag(&mut xml, "ram:LineTotalAmount", zeilensumme);
        xml.zu("ram:SpecifiedTradeSettlementLineMonetarySummation");
        xml.zu("ram:SpecifiedLineTradeSettlement");
        xml.zu("ram:IncludedSupplyChainTradeLineItem");
    }

    xml.auf("ram:ApplicableHeaderTradeAgreement");
    // BT-10 (BuyerReference): Bei XRechnung an öffentliche Auftraggeber gehört die
    // Leitweg-ID in BT-10 — sie hat Vorrang; ohne Leitweg-ID wird die Käuferreferenz gesendet.
    let buyer_reference = if kontext.kunde_leitweg_id.is_empty() {
        &kontext.kunde_kaeuferreferenz
    } else {
        &kontext.kunde_leitweg_id
    };
    xml.feld( "ram:BuyerReference", buyer_reference);
    xml.auf("ram:SellerTradeParty");
    // BR-CO-26 verlangt vom Verkäufer mindestens eine Kennung (BT-29/BT-30)
    // oder eine USt-IdNr. (BT-31, schemeID VA). Die bloße Steuernummer
    // (BT-32, schemeID FC) erfüllt die Regel NICHT — der amtliche Validator
    // lehnt fatal ab. Für den Übergangsfall „USt-IdNr. noch nicht erteilt"
    // wird die Steuernummer deshalb zusätzlich als Verkäufer-Kennung BT-29
    // geschrieben; mit USt-IdNr. bleibt die Datei unverändert.
    if kontext.firma.ust_idnr.trim().is_empty() && !kontext.firma.steuernummer.trim().is_empty() {
        xml.feld( "ram:ID", kontext.firma.steuernummer.trim());
    }
    xml.feld( "ram:Name", &kontext.firma.name);
    // SELLER CONTACT (BG-6) — in XRechnung Pflicht (BR-DE-2). Im CII-Schema
    // steht der Kontakt vor der Anschrift.
    xml.auf("ram:DefinedTradeContact");
    let kontakt = if kontext.firma.kontakt_name.trim().is_empty() {
        kontext.firma.name.trim()
    } else {
        kontext.firma.kontakt_name.trim()
    };
    xml.feld( "ram:PersonName", kontakt);
    xml.auf("ram:TelephoneUniversalCommunication");
    xml.feld( "ram:CompleteNumber", kontext.firma.telefon.trim());
    xml.zu("ram:TelephoneUniversalCommunication");
    xml.auf("ram:EmailURIUniversalCommunication");
    xml.feld( "ram:URIID", kontext.firma.email.trim());
    xml.zu("ram:EmailURIUniversalCommunication");
    xml.zu("ram:DefinedTradeContact");
    xml.auf("ram:PostalTradeAddress");
    xml.feld( "ram:PostcodeCode", &kontext.firma.plz);
    xml.feld( "ram:LineOne", &kontext.firma.strasse);
    xml.feld( "ram:CityName", &kontext.firma.ort);
    xml.feld( "ram:CountryID", &kontext.firma.land);
    xml.zu("ram:PostalTradeAddress");
    // BT-34: elektronische Adresse des Verkäufers, in XRechnung Pflicht (BR-DE-5).
    // scheme EM = E-Mail.
    if !kontext.firma.email.trim().is_empty() {
        xml.auf("ram:URIUniversalCommunication");
        xml.auf_mit("ram:URIID", &[("schemeID", "EM")]);
        xml.text(kontext.firma.email.trim());
        xml.zu("ram:URIID");
        xml.zu("ram:URIUniversalCommunication");
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
        xml.auf("ram:SpecifiedTaxRegistration");
        xml.auf_mit("ram:ID", &[("schemeID", steuer_schema)]);
        xml.text(steuer_id);
        xml.zu("ram:ID");
        xml.zu("ram:SpecifiedTaxRegistration");
    }
    xml.zu("ram:SellerTradeParty");
    xml.auf("ram:BuyerTradeParty");
    xml.feld( "ram:Name", &kontext.kunde_name);
    xml.auf("ram:PostalTradeAddress");
    xml.feld( "ram:PostcodeCode", &kontext.adresse_plz);
    xml.feld( "ram:LineOne", &kontext.adresse_strasse);
    xml.feld( "ram:CityName", &kontext.adresse_ort);
    xml.feld( "ram:CountryID", &kontext.adresse_land);
    xml.zu("ram:PostalTradeAddress");
    // BT-49: elektronische Adresse des Käufers, in XRechnung Pflicht (BR-DE-6).
    if !kontext.kunde_email.trim().is_empty() {
        xml.auf("ram:URIUniversalCommunication");
        xml.auf_mit("ram:URIID", &[("schemeID", "EM")]);
        xml.text(kontext.kunde_email.trim());
        xml.zu("ram:URIID");
        xml.zu("ram:URIUniversalCommunication");
    }
    xml.zu("ram:BuyerTradeParty");
    if !kontext.kunde_leitweg_id.is_empty() && !kontext.kunde_kaeuferreferenz.is_empty() {
        // Wenn die Leitweg-ID BT-10 belegt, bleibt die Käuferreferenz als Bestellreferenz erhalten.
        xml.auf("ram:BuyerOrderReferencedDocument");
        xml.feld( "ram:IssuerAssignedID", &kontext.kunde_kaeuferreferenz);
        xml.zu("ram:BuyerOrderReferencedDocument");
    }
    xml.zu("ram:ApplicableHeaderTradeAgreement");

    // ApplicableHeaderTradeDelivery ist im CII-Schema Pflicht (minOccurs=1) und
    // trägt das Leistungsdatum (BT-72) — dieselbe Pflichtangabe nach § 14 UStG,
    // die der eigene Eingangsrechnungs-Parser bei fremden Rechnungen ausliest.
    xml.auf("ram:ApplicableHeaderTradeDelivery");
    xml.auf("ram:ActualDeliverySupplyChainEvent");
    xml.auf("ram:OccurrenceDateTime");
    xml.auf_mit("udt:DateTimeString", &[("format", "102")]);
    xml.text(&kontext.beleg.leistungsdatum.replace('-', ""));
    xml.zu("udt:DateTimeString");
    xml.zu("ram:OccurrenceDateTime");
    xml.zu("ram:ActualDeliverySupplyChainEvent");
    xml.zu("ram:ApplicableHeaderTradeDelivery");

    xml.auf("ram:ApplicableHeaderTradeSettlement");
    xml.feld( "ram:InvoiceCurrencyCode", "EUR");
    // ram:SpecifiedTradeSettlementPaymentMeans steht laut CII-Schema vor
    // ram:SpecifiedTradePaymentTerms (Reihenfolge innerhalb von ApplicableHeaderTradeSettlement:
    // ...PaymentReference?, InvoiceCurrencyCode, PayeeTradeParty?, SpecifiedTradeSettlementPaymentMeans*,
    // ApplicableTradeTax*, ..., SpecifiedTradePaymentTerms*, ...). IBAN ist Pflicht für den Block,
    // BIC optional — bei leerer IBAN wird der gesamte Block ausgelassen statt eines leeren Elements.
    if !kontext.firma.iban.trim().is_empty() {
        xml.auf("ram:SpecifiedTradeSettlementPaymentMeans");
        xml.feld( "ram:TypeCode", "58");
        xml.auf("ram:PayeePartyCreditorFinancialAccount");
        xml.feld( "ram:IBANID", &kontext.firma.iban);
        xml.zu("ram:PayeePartyCreditorFinancialAccount");
        if !kontext.firma.bic.trim().is_empty() {
            xml.auf("ram:PayeeSpecifiedCreditorFinancialInstitution");
            xml.feld( "ram:BICID", &kontext.firma.bic);
            xml.zu("ram:PayeeSpecifiedCreditorFinancialInstitution");
        }
        xml.zu("ram:SpecifiedTradeSettlementPaymentMeans");
    }
    // Kopf-Steuerzeilen (BG-23). Hier — nicht auf Positionsebene — werten
    // Empfängersysteme die Steuer aus.
    let netto = kontext.beleg.summe_cent.abs();
    if regelbesteuert {
        // Eine Zeile je Steuersatz (BR-S-1/BR-Z-1); kein ExemptionReason —
        // der ist der Kategorie E vorbehalten (BR-S-8).
        for zeile in &steuerzeilen {
            xml.auf("ram:ApplicableTradeTax");
            schreibe_betrag(&mut xml, "ram:CalculatedAmount", zeile.ust_cent);
            xml.feld( "ram:TypeCode", "VAT");
            schreibe_betrag(&mut xml, "ram:BasisAmount", zeile.netto_cent);
            xml.feld( "ram:CategoryCode", steuerkategorie(zeile.satz_prozent));
            xml.feld( "ram:RateApplicablePercent", &satz_zu_dezimal(zeile.satz_prozent));
            xml.zu("ram:ApplicableTradeTax");
        }
    } else {
        // Ohne diesen Block ist die Kleinunternehmer-Kennzeichnung faktisch
        // nicht vorhanden (BR-E-1, BR-E-10).
        xml.auf("ram:ApplicableTradeTax");
        schreibe_betrag(&mut xml, "ram:CalculatedAmount", 0);
        xml.feld( "ram:TypeCode", "VAT");
        xml.feld( "ram:ExemptionReason", BEFREIUNGSGRUND);
        schreibe_betrag(&mut xml, "ram:BasisAmount", netto);
        xml.feld( "ram:CategoryCode", "E");
        xml.feld( "ram:RateApplicablePercent", "0.00");
        xml.zu("ram:ApplicableTradeTax");
    }

    // BG-14: Bei einem Leistungszeitraum gehört die Spanne in den
    // Abrechnungszeitraum. Sie steht laut CII-Schema vor den Zahlungsbedingungen.
    if let Some(bis) = kontext.beleg.leistungsdatum_bis.as_deref().filter(|b| !b.trim().is_empty()) {
        xml.auf("ram:BillingSpecifiedPeriod");
        for (tag, wert) in [
            ("ram:StartDateTime", kontext.beleg.leistungsdatum.as_str()),
            ("ram:EndDateTime", bis),
        ] {
            xml.auf(tag);
            xml.auf_mit("udt:DateTimeString", &[("format", "102")]);
            xml.text(&wert.replace('-', ""));
            xml.zu("udt:DateTimeString");
            xml.zu(tag);
        }
        xml.zu("ram:BillingSpecifiedPeriod");
    }

    xml.auf("ram:SpecifiedTradePaymentTerms");
    // Derselbe Wortlaut wie auf der PDF. Zwei Formulierungen desselben
    // Sachverhalts laufen auseinander, sobald eine davon angefasst wird — und
    // beide beschreiben hier dieselbe Zahl.
    xml.feld("ram:Description",
        &crate::dokument::zahlungsbedingung(&kontext.beleg.datum, kontext.beleg.zahlungsziel_tage));
    // BT-9: konkretes Fälligkeitsdatum. Das Datenmodell kennt nur das
    // Zahlungsziel in Tagen; die Norm erwartet ein Datum.
    if let Some(faellig) = faelligkeit_yyyymmdd(&kontext.beleg.datum, kontext.beleg.zahlungsziel_tage) {
        xml.auf("ram:DueDateDateTime");
        xml.auf_mit("udt:DateTimeString", &[("format", "102")]);
        xml.text(&faellig);
        xml.zu("udt:DateTimeString");
        xml.zu("ram:DueDateDateTime");
    }
    xml.zu("ram:SpecifiedTradePaymentTerms");

    xml.auf("ram:SpecifiedTradeSettlementHeaderMonetarySummation");
    if regelbesteuert {
        // Die Summenproben verlangen exakte Gleichheit: BT-106 = Σ BT-131
        // (BR-CO-10), BT-109 = Σ BT-116 (BR-CO-14 über BR-CO-13), BT-110 =
        // Σ BT-117 (BR-CO-14), BT-112 = BT-109 + BT-110 (BR-CO-15). Alle vier
        // sind hier durch Konstruktion erfüllt: Die Positionsnetti summieren
        // je Satz exakt auf das Gruppennetto, und netto + Steuer je Gruppe
        // ergibt exakt die gespeicherte Bruttosumme.
        let netto_gesamt: i64 = steuerzeilen.iter().map(|z| z.netto_cent).sum();
        let ust_gesamt: i64 = steuerzeilen.iter().map(|z| z.ust_cent).sum();
        debug_assert_eq!(netto_gesamt + ust_gesamt, netto, "Aufschlüsselung deckt die Belegsumme nicht");
        debug_assert_eq!(positionsnetti.iter().sum::<i64>(), netto_gesamt);
        schreibe_betrag(&mut xml, "ram:LineTotalAmount", netto_gesamt);
        schreibe_betrag(&mut xml, "ram:TaxBasisTotalAmount", netto_gesamt);
        schreibe_steuersumme(&mut xml, ust_gesamt);
        schreibe_betrag(&mut xml, "ram:GrandTotalAmount", netto);
        schreibe_betrag(&mut xml, "ram:DuePayableAmount", netto);
    } else {
        // BT-106 fehlte bisher ganz — ohne sie ist die Summenprobe BR-CO-10 verletzt.
        let positionssumme: i64 = kontext.positionen.iter().map(|p| p.positionssumme_cent.abs()).sum();
        schreibe_betrag(&mut xml, "ram:LineTotalAmount", positionssumme);
        schreibe_betrag(&mut xml, "ram:TaxBasisTotalAmount", netto);
        schreibe_steuersumme(&mut xml, 0);
        schreibe_betrag(&mut xml, "ram:GrandTotalAmount", netto);
        schreibe_betrag(&mut xml, "ram:DuePayableAmount", netto);
    }
    xml.zu("ram:SpecifiedTradeSettlementHeaderMonetarySummation");

    // BG-3: Bei einer Korrektur (TypeCode 384) muss auf die Vorrechnung
    // verwiesen werden — sonst ist nicht erkennbar, was korrigiert wird.
    if let Some(nummer) = &kontext.storno_von_nummer {
        xml.auf("ram:InvoiceReferencedDocument");
        xml.feld( "ram:IssuerAssignedID", nummer);
        xml.zu("ram:InvoiceReferencedDocument");
    }
    xml.zu("ram:ApplicableHeaderTradeSettlement");

    xml.zu("rsm:SupplyChainTradeTransaction");
    xml.zu("rsm:CrossIndustryInvoice");
    // Die Elementreihenfolge folgt dem CII-Schema; abgesichert durch den
    // Normkonformitätstest gegen den amtlichen KoSIT-Validator.

    Ok(xml.fertig())
}


pub fn pruefe_exportierbarkeit(kontext: &BelegKontext) -> AppResult<()> {
    if kontext.firma.steuernummer.trim().is_empty() && kontext.firma.ust_idnr.trim().is_empty() {
        return Err(AppError::Validation {
            feld: "steuernummer".into(),
            meldung: "Für den XRechnung-Export ist eine Steuernummer oder USt-IdNr. erforderlich".into(),
        });
    }
    if kontext.kunde_kaeuferreferenz.trim().is_empty() && kontext.kunde_leitweg_id.trim().is_empty() {
        return Err(AppError::Validation {
            feld: "kaeuferreferenz".into(),
            meldung: "Für den XRechnung-Export ist eine Käuferreferenz oder Leitweg-ID beim Kunden erforderlich".into(),
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
            offener_betrag_cent: summe_cent,
            beleg: Beleg {
                id: "b1".into(), typ: "rechnung".into(), nummer: Some("RE-2026-0001".into()),
                status: "gestellt".into(), kunde_id: "k1".into(), datum: "2026-07-11".into(),
                leistungsdatum: "2026-07-11".into(), leistungsdatum_bis: None, gueltig_bis: None,
                zahlungsziel_tage: 14,
                kopftext: "".into(), fusstext: "".into(), summe_cent,
                ursprungsangebot_id: None, storno_von_id: storno_von.map(String::from),
                kunde_snapshot: String::new(), kunde_snapshot_name: None,
                bezahlt_cent: 0, zahlungsstand: None, faellig_am: None,
                gesamtauftragswert_cent: None,
                adresse_id: None, ansprechpartner_id: None,
            },
            positionen: vec![Belegposition {
                id: "p1".into(), beleg_id: "b1".into(), artikel_id: None,
                bezeichnung: "Beratung".into(), einheit_kuerzel: "Std.".into(),
                einzelpreis_cent: 9500, menge: 1000, positionssumme_cent: 9500, ust_satz_prozent: 19, reihenfolge: 0,
            }],
            firma: Firma {
                id: "f1".into(), name: "Meine Firma".into(), strasse: "Weg 1".into(), plz: "10115".into(),
                ort: "Berlin".into(), land: "DE".into(), steuernummer: "12/345".into(), ust_idnr: "DE123456789".into(),
                iban: "DE02120300000000202051".into(), bic: "BYLADEM1001".into(), email: "rechnung@meine-firma.de".into(), telefon: "030 123456".into(), fax: String::new(), kontakt_name: "Max Mustermann".into(), gruendungsjahr: None, kleinunternehmer: true, eingerichtet: true,
            },
            kunde_ansprechpartner: String::new(), kunde_name: "ACME GmbH".into(), kunde_kundennummer: "KD-0001".into(), kunde_ust_idnr: "".into(),
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

    /// Auch mit Leistungszeitraum muss die Datei normkonform bleiben — BG-14
    /// hat im CII-Schema eine feste Position.
    #[test]
    fn xrechnung_mit_leistungszeitraum_ist_normkonform() {
        if let Some(grund) = crate::dokument::kosit::nicht_verfuegbar_weil() {
            eprintln!("übersprungen: {grund}");
            return;
        }
        let mut kontext = test_kontext(None, 9500);
        kontext.beleg.leistungsdatum = "2026-07-01".into();
        kontext.beleg.leistungsdatum_bis = Some("2026-07-31".into());
        let xml = xml_erzeugen(&kontext).unwrap();
        assert!(xml.contains("<ram:BillingSpecifiedPeriod>"), "BG-14 fehlt");

        let bericht = crate::dokument::kosit::validieren(&xml).expect("Validator-Aufruf");
        assert!(
            bericht.gueltig,
            "Abgelehnt. Befunde ({}):\n{}",
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

    /// Kontext eines regelbesteuerten Belegs: eine Position je übergebenem
    /// (Satz, Bruttobetrag); die Belegsumme ist deren Summe.
    pub(crate) fn regelbesteuert_kontext(storno_von: Option<&str>, positionen: &[(i64, i64)]) -> BelegKontext {
        let summe: i64 = positionen.iter().map(|(_, brutto)| brutto).sum();
        let mut kontext = test_kontext(storno_von, summe);
        kontext.firma.kleinunternehmer = false;
        kontext.positionen = positionen
            .iter()
            .enumerate()
            .map(|(i, (satz, brutto))| Belegposition {
                id: format!("p{i}"), beleg_id: "b1".into(), artikel_id: None,
                bezeichnung: format!("Leistung {i}"), einheit_kuerzel: "Std.".into(),
                einzelpreis_cent: *brutto, menge: 1000, positionssumme_cent: *brutto,
                ust_satz_prozent: *satz, reihenfolge: i as i64,
            })
            .collect();
        kontext
    }

    #[test]
    fn xml_erzeugen_rechnet_bei_regelbesteuerung_die_ust_heraus() {
        // 95,00 € brutto bei 19 % → 79,83 € netto, 15,17 € USt.
        let xml = xml_erzeugen(&regelbesteuert_kontext(None, &[(19, 9500)])).unwrap();
        assert!(xml.contains("<ram:CategoryCode>S</ram:CategoryCode>"));
        assert!(!xml.contains("<ram:CategoryCode>E</ram:CategoryCode>"));
        assert!(!xml.contains("ExemptionReason"), "S trägt keinen Befreiungsgrund (BR-S-8)");
        assert!(xml.contains("<ram:RateApplicablePercent>19.00</ram:RateApplicablePercent>"));
        assert!(xml.contains("<ram:BasisAmount>79.83</ram:BasisAmount>"));
        assert!(xml.contains("<ram:CalculatedAmount>15.17</ram:CalculatedAmount>"));
        assert!(xml.contains("<ram:TaxBasisTotalAmount>79.83</ram:TaxBasisTotalAmount>"));
        assert!(xml.contains(r#"<ram:TaxTotalAmount currencyID="EUR">15.17</ram:TaxTotalAmount>"#));
        assert!(xml.contains("<ram:GrandTotalAmount>95.00</ram:GrandTotalAmount>"));
        assert!(xml.contains("<ram:DuePayableAmount>95.00</ram:DuePayableAmount>"));
    }

    #[test]
    fn xml_erzeugen_setzt_kategorie_z_fuer_nullsatz() {
        let xml = xml_erzeugen(&regelbesteuert_kontext(None, &[(0, 9500)])).unwrap();
        // 0 % ist Kategorie Z, nicht „S mit 0.00" (BR-S-5).
        assert!(xml.contains("<ram:CategoryCode>Z</ram:CategoryCode>"));
        assert!(!xml.contains("<ram:CategoryCode>S</ram:CategoryCode>"));
        assert!(xml.contains(r#"<ram:TaxTotalAmount currencyID="EUR">0.00</ram:TaxTotalAmount>"#));
    }

    #[test]
    fn xml_erzeugen_schreibt_je_steuersatz_eine_kopfzeile() {
        let xml = xml_erzeugen(&regelbesteuert_kontext(None, &[(19, 11900), (7, 1070)])).unwrap();
        assert!(xml.contains("<ram:BasisAmount>100.00</ram:BasisAmount>"), "Netto der 19-%-Gruppe");
        assert!(xml.contains("<ram:CalculatedAmount>19.00</ram:CalculatedAmount>"));
        assert!(xml.contains("<ram:BasisAmount>10.00</ram:BasisAmount>"), "Netto der 7-%-Gruppe");
        assert!(xml.contains("<ram:CalculatedAmount>0.70</ram:CalculatedAmount>"));
        assert!(xml.contains(r#"<ram:TaxTotalAmount currencyID="EUR">19.70</ram:TaxTotalAmount>"#));
        assert!(xml.contains("<ram:GrandTotalAmount>129.70</ram:GrandTotalAmount>"));
    }

    #[test]
    fn xml_erzeugen_schreibt_ohne_ustidnr_die_steuernummer_als_verkaeuferkennung() {
        // BR-CO-26: Ohne USt-IdNr. (schemeID VA) braucht der Verkäufer eine
        // Kennung — die Steuernummer als BT-32/FC allein reicht dem amtlichen
        // Validator nicht.
        let mut kontext = test_kontext(None, 9500);
        kontext.firma.ust_idnr = "".into();
        let xml = xml_erzeugen(&kontext).unwrap();
        assert!(xml.contains("<ram:ID>12/345</ram:ID>"), "BT-29 fehlt:\n{xml}");

        // Mit USt-IdNr. bleibt die Datei unverändert ohne BT-29.
        let xml = xml_erzeugen(&test_kontext(None, 9500)).unwrap();
        assert!(!xml.contains("<ram:ID>12/345</ram:ID>"));
    }

    #[test]
    fn xrechnung_ohne_ustidnr_ist_normkonform() {
        if let Some(grund) = crate::dokument::kosit::nicht_verfuegbar_weil() {
            eprintln!("übersprungen: {grund}");
            return;
        }
        // Der Übergangsfall „regelbesteuert, USt-IdNr. noch nicht erteilt" —
        // und zugleich der Kleinunternehmer ohne USt-IdNr. (der Regelfall).
        // Beide liefen vorher in BR-CO-26 (fatal); die CI-Normtests sahen das
        // nie, weil test_kontext immer eine USt-IdNr. trägt.
        for regelbesteuert in [false, true] {
            let mut kontext = if regelbesteuert {
                regelbesteuert_kontext(None, &[(19, 9500)])
            } else {
                test_kontext(None, 9500)
            };
            kontext.firma.ust_idnr = "".into();
            let xml = xml_erzeugen(&kontext).unwrap();
            let bericht = crate::dokument::kosit::validieren(&xml).expect("Validator-Aufruf fehlgeschlagen");
            assert!(
                bericht.gueltig,
                "Abgelehnt (regelbesteuert={regelbesteuert}). Befunde ({}):\n{}",
                bericht.befunde().len(),
                bericht.befunde().iter().map(|v| format!("  - {v}")).collect::<Vec<_>>().join("\n")
            );
        }
    }

    #[test]
    fn regelbesteuerte_xrechnung_ist_normkonform() {
        if let Some(grund) = crate::dokument::kosit::nicht_verfuegbar_weil() {
            eprintln!("übersprungen: {grund}");
            return;
        }
        let xml = xml_erzeugen(&regelbesteuert_kontext(None, &[(19, 9500)])).unwrap();
        let bericht = crate::dokument::kosit::validieren(&xml).expect("Validator-Aufruf fehlgeschlagen");
        assert!(
            bericht.gueltig,
            "Die regelbesteuerte XRechnung wurde abgelehnt. Befunde ({}):\n{}",
            bericht.befunde().len(),
            bericht.befunde().iter().map(|v| format!("  - {v}")).collect::<Vec<_>>().join("\n")
        );
    }

    #[test]
    fn regelbesteuerte_xrechnung_mit_gemischten_saetzen_ist_normkonform() {
        if let Some(grund) = crate::dokument::kosit::nicht_verfuegbar_weil() {
            eprintln!("übersprungen: {grund}");
            return;
        }
        // Unrunde Beträge mit Absicht: Genau hier entstehen Rest-Cents, an
        // denen die Summenproben BR-45/BR-CO-10/BR-CO-14 scheitern würden.
        let xml = xml_erzeugen(&regelbesteuert_kontext(None, &[(19, 12345), (19, 5), (7, 999), (0, 100)])).unwrap();
        let bericht = crate::dokument::kosit::validieren(&xml).expect("Validator-Aufruf fehlgeschlagen");
        assert!(
            bericht.gueltig,
            "Die XRechnung mit gemischten Sätzen wurde abgelehnt. Befunde ({}):\n{}",
            bericht.befunde().len(),
            bericht.befunde().iter().map(|v| format!("  - {v}")).collect::<Vec<_>>().join("\n")
        );
    }

    #[test]
    fn regelbesteuerte_storno_xrechnung_ist_normkonform() {
        if let Some(grund) = crate::dokument::kosit::nicht_verfuegbar_weil() {
            eprintln!("übersprungen: {grund}");
            return;
        }
        // Storno trägt negierte Beträge; ins XML gehen Absolutwerte, die
        // Korrektur-Semantik steckt im TypeCode 384.
        let xml = xml_erzeugen(&regelbesteuert_kontext(Some("r1"), &[(19, -9500)])).unwrap();
        let bericht = crate::dokument::kosit::validieren(&xml).expect("Validator-Aufruf fehlgeschlagen");
        assert!(
            bericht.gueltig,
            "Die regelbesteuerte Storno-XRechnung wurde abgelehnt. Befunde ({}):\n{}",
            bericht.befunde().len(),
            bericht.befunde().iter().map(|v| format!("  - {v}")).collect::<Vec<_>>().join("\n")
        );
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
    fn pruefe_exportierbarkeit_verlangt_kaeuferreferenz_oder_leitweg_id() {
        let mut kontext = test_kontext(None, 9500);
        kontext.kunde_kaeuferreferenz = "".into();
        kontext.kunde_leitweg_id = "".into();
        let err = pruefe_exportierbarkeit(&kontext).unwrap_err();
        assert!(matches!(err, crate::error::AppError::Validation { feld, .. } if feld == "kaeuferreferenz"));
    }

    #[test]
    fn pruefe_exportierbarkeit_akzeptiert_nur_leitweg_id() {
        let mut kontext = test_kontext(None, 9500);
        kontext.kunde_kaeuferreferenz = "".into();
        assert!(pruefe_exportierbarkeit(&kontext).is_ok());
    }

    #[test]
    fn pruefe_exportierbarkeit_akzeptiert_vollstaendigen_kontext() {
        assert!(pruefe_exportierbarkeit(&test_kontext(None, 9500)).is_ok());
    }
}

