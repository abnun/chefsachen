//! ZUGFeRD-Einbettung: bettet eine CII-XML-Datei als PDF/A-3-Anhang ein und
//! ergänzt die dafür erforderlichen XMP-Metadaten sowie das PDF/A-OutputIntent.
//!
//! Namespace-Hinweis: Seit ZUGFeRD 2.1 wurde das XMP-Extension-Schema auf das
//! Factur-X-Schema harmonisiert (Präfix `fx`, Namespace
//! `urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#`). Das ältere,
//! ZUGFeRD-eigene Schema (Präfix `zf`, `urn:zugferd:...` bzw. historisch
//! `urn:ferd:...`) gilt seit 2.1 als veraltet. Diese Implementierung nutzt
//! daher konsequent das Factur-X-Schema, sowohl im Code als auch im Test.

use crate::error::{AppError, AppResult};
use lopdf::{dictionary, Document, Object, Stream};
use xmp_writer::{CustomNamespace, Namespace, XmpWriter};

const ICC_PROFIL: &[u8] = include_bytes!("../../resources/srgb.icc");

/// Namespace-URI des Factur-X/ZUGFeRD-2.x-XMP-Extension-Schemas.
const FACTUR_X_NAMESPACE_URI: &str = "urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#";
const FACTUR_X_PREFIX: &str = "fx";

fn factur_x_namespace<'a>() -> Namespace<'a> {
    Namespace::Custom(Box::new(CustomNamespace::new(
        "Factur-X/ZUGFeRD",
        FACTUR_X_PREFIX,
        FACTUR_X_NAMESPACE_URI,
    )))
}

/// Bettet die übergebene CII-XML (`xml`) als `factur-x.xml`-Anhang in das PDF
/// ein und ergänzt XMP-Metadaten (PDF/A-Identifikation + Factur-X-Schema)
/// sowie ein PDF/A-OutputIntent mit eingebettetem sRGB-ICC-Profil.
pub fn einbetten(pdf_bytes: Vec<u8>, xml: &str) -> AppResult<Vec<u8>> {
    let mut doc = Document::load_mem(&pdf_bytes)
        .map_err(|e| AppError::Technisch(format!("PDF konnte nicht geladen werden: {e}")))?;

    // XMP-Metadaten
    let mut xmp = XmpWriter::new();
    xmp.creator(["Kleinunternehmer-Verwaltung"]);

    // PDF/A-Identifikation (echtes, in xmp-writer eingebautes `pdfa`-Feature,
    // Namespace `pdfaid` = http://www.aiim.org/pdfa/ns/id/).
    xmp.pdfa_part(3);
    xmp.pdfa_conformance("B");

    // Factur-X/ZUGFeRD-2.x-Schema: kein eingebautes API in xmp-writer dafür
    // vorhanden, daher generischer benutzerdefinierter Namespace + einzelne
    // Elemente (Pflichtfelder laut Factur-X-Spezifikation).
    let fx = factur_x_namespace();
    xmp.element("DocumentFileName", fx.clone()).value("factur-x.xml");
    xmp.element("DocumentType", fx.clone()).value("INVOICE");
    xmp.element("Version", fx.clone()).value("1.0");
    xmp.element("ConformanceLevel", fx.clone()).value("BASIC");

    let xmp_bytes = xmp.finish(None).into_bytes();
    let xmp_stream = Stream::new(
        dictionary! {
            "Type" => "Metadata",
            "Subtype" => "XML",
        },
        xmp_bytes,
    );
    let xmp_id = doc.add_object(xmp_stream);

    // Eingebettete XML-Datei (factur-x.xml, ZUGFeRD-Standardname)
    let datei_stream = Stream::new(
        dictionary! {
            "Type" => "EmbeddedFile",
            "Subtype" => "text/xml",
        },
        xml.as_bytes().to_vec(),
    );
    let datei_id = doc.add_object(datei_stream);
    let filespec = dictionary! {
        "Type" => "Filespec",
        "F" => Object::string_literal("factur-x.xml"),
        "UF" => Object::string_literal("factur-x.xml"),
        "AFRelationship" => "Data",
        "EF" => dictionary! {
            "F" => Object::Reference(datei_id),
        },
    };
    let filespec_id = doc.add_object(filespec);

    // OutputIntent (PDF/A-Pflichtangabe)
    let icc_stream = Stream::new(
        dictionary! {
            "N" => 3,
        },
        ICC_PROFIL.to_vec(),
    );
    let icc_id = doc.add_object(icc_stream);
    let output_intent = dictionary! {
        "Type" => "OutputIntent",
        "S" => "GTS_PDFA1",
        "OutputConditionIdentifier" => Object::string_literal("sRGB IEC61966-2.1"),
        "DestOutputProfile" => Object::Reference(icc_id),
    };
    let output_intent_id = doc.add_object(output_intent);

    // Im Katalog verankern
    let katalog = doc
        .catalog_mut()
        .map_err(|e| AppError::Technisch(format!("PDF-Katalog nicht gefunden: {e}")))?;
    katalog.set("Metadata", Object::Reference(xmp_id));
    katalog.set(
        "OutputIntents",
        Object::Array(vec![Object::Reference(output_intent_id)]),
    );
    katalog.set(
        "Names",
        dictionary! {
            "EmbeddedFiles" => dictionary! {
                "Names" => Object::Array(vec![
                    Object::string_literal("factur-x.xml"),
                    Object::Reference(filespec_id),
                ]),
            },
        },
    );
    katalog.set("AF", Object::Array(vec![Object::Reference(filespec_id)]));

    let mut ausgabe = Vec::new();
    doc.save_to(&mut ausgabe)
        .map_err(|e| AppError::Technisch(format!("PDF konnte nicht gespeichert werden: {e}")))?;
    Ok(ausgabe)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn einbetten_fuegt_anhang_und_metadaten_hinzu() {
        let minimales_pdf =
            crate::dokument::pdf::rendern(&crate::dokument::pdf::tests::test_kontext(), None)
                .unwrap();
        let xml = "<rsm:CrossIndustryInvoice></rsm:CrossIndustryInvoice>";
        let ergebnis = einbetten(minimales_pdf, xml).unwrap();

        assert!(ergebnis.starts_with(b"%PDF-"));
        let text = String::from_utf8_lossy(&ergebnis);
        assert!(text.contains("factur-x.xml"), "Anhang-Dateiname fehlt im PDF");
        assert!(
            text.contains("factur-x:pdfa:CrossIndustryDocument"),
            "XMP-Namespace fehlt im PDF"
        );
    }
}
