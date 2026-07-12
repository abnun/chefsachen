use crate::dokument::kontext::BelegKontext;
use crate::error::{AppError, AppResult};
use typst::foundations::{Dict, Str, Value};
use typst_as_lib::TypstEngine;

const VORLAGE: &str = include_str!("../../templates/rechnung.typ");
const SCHRIFT: &[u8] = include_bytes!("../../resources/fonts/Inter.ttf");

/// Baut aus String-Paaren ein Typst-`Dict`, wie es `compile_with_input` erwartet.
///
/// `typst-as-lib` (0.14.4) bietet keine `Into<Dict>`-Implementierung für
/// `HashMap<String, String>` o. ä. — `Dict` implementiert stattdessen
/// `FromIterator<(Str, Value)>`, daher der manuelle Aufbau hier.
fn dict_aus_feldern(felder: impl IntoIterator<Item = (&'static str, String)>) -> Dict {
    felder
        .into_iter()
        .map(|(k, v)| (Str::from(k), Value::Str(Str::from(v))))
        .collect()
}

/// Formatiert eine Menge (fixkomma, 3 Nachkommastellen als i64 kodiert) nach deutscher
/// Konvention, wobei überflüssige Nullen entfernt werden (1000 -> "1", 1500 -> "1,5").
fn menge_format(menge_x1000: i64) -> String {
    let ganz = menge_x1000 / 1000;
    let rest = menge_x1000 % 1000;
    if rest == 0 {
        ganz.to_string()
    } else {
        format!("{},{:03}", ganz, rest)
            .trim_end_matches('0')
            .trim_end_matches(',')
            .to_string()
    }
}

/// Formatiert einen Cent-Betrag nach deutscher Konvention ("1234,56 €").
fn cent_format(cent: i64) -> String {
    // Vorzeichen explizit behandeln: bei -50 Cent liefert Integer-Division 0,
    // das Minus ginge sonst verloren ("0,50 €" statt "-0,50 €").
    let vorzeichen = if cent < 0 { "-" } else { "" };
    let betrag = cent.abs();
    format!("{}{},{:02} €", vorzeichen, betrag / 100, betrag % 100)
}

/// Ermittelt anhand der Magic Bytes den virtuellen Dateinamen für ein Logo-Bild,
/// damit Typsts Bild-Decoder das richtige Format erwartet (PNG vs. JPEG).
/// Bei unbekanntem/nicht erkennbarem Format wird `"logo.png"` als Fallback
/// verwendet — ein defektes Logo soll den Export nicht zum Absturz bringen.
fn logo_dateiname(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        "logo.png"
    } else if bytes.starts_with(&[0xFF, 0xD8]) {
        "logo.jpg"
    } else {
        "logo.png"
    }
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
        &kontext
            .positionen
            .iter()
            .map(|p| {
                serde_json::json!({
                    "bezeichnung": p.bezeichnung,
                    "menge": format!("{} {}", menge_format(p.menge), p.einheit_kuerzel),
                    "einzelpreis": cent_format(p.einzelpreis_cent),
                    "summe": cent_format(p.positionssumme_cent),
                })
            })
            .collect::<Vec<_>>(),
    )
    .map_err(|e| AppError::Technisch(e.to_string()))?;

    let logo_dateiname = logo.map(logo_dateiname).unwrap_or("");

    let mut builder = TypstEngine::builder().main_file(VORLAGE).fonts([SCHRIFT]);
    if let Some(bytes) = logo {
        builder = builder.with_static_file_resolver([(logo_dateiname, bytes.to_vec())]);
    }
    let engine = builder.build();

    let eingabe = dict_aus_feldern([
        ("titel", titel.to_string()),
        ("nummer", kontext.beleg.nummer.clone().unwrap_or_default()),
        ("datum", kontext.beleg.datum.clone()),
        ("leistungsdatum", kontext.beleg.leistungsdatum.clone()),
        ("zahlungsziel_tage", kontext.beleg.zahlungsziel_tage.to_string()),
        ("kunde_name", kontext.kunde_name.clone()),
        ("kunde_strasse", kontext.adresse_strasse.clone()),
        ("kunde_plz", kontext.adresse_plz.clone()),
        ("kunde_ort", kontext.adresse_ort.clone()),
        ("firma_name", kontext.firma.name.clone()),
        ("firma_strasse", kontext.firma.strasse.clone()),
        ("firma_plz", kontext.firma.plz.clone()),
        ("firma_ort", kontext.firma.ort.clone()),
        ("positionen_json", positionen_json),
        ("summe", cent_format(kontext.beleg.summe_cent)),
        ("fusstext", kontext.beleg.fusstext.clone()),
        ("hat_logo", logo_dateiname.to_string()),
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
pub(crate) mod tests {
    use super::*;
    use crate::commands::belege::{Beleg, Belegposition};
    use crate::commands::firma::Firma;

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
        assert!(bytes.starts_with(b"%PDF-"), "Ausgabe beginnt nicht mit der PDF-Signatur");
        assert!(bytes.len() > 500, "PDF wirkt verdächtig klein");
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

    #[test]
    fn rendern_mit_jpeg_logo_erzeugt_gueltige_pdf_bytes() {
        const LOGO: &[u8] = include_bytes!("../../resources/test/logo_1x1.jpg");
        let bytes = rendern(&test_kontext(), Some(LOGO)).unwrap();
        assert!(bytes.starts_with(b"%PDF-"));
    }

    #[test]
    fn logo_dateiname_erkennt_png() {
        assert_eq!(logo_dateiname(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A]), "logo.png");
    }

    #[test]
    fn logo_dateiname_erkennt_jpeg() {
        assert_eq!(logo_dateiname(&[0xFF, 0xD8, 0xFF, 0xE0]), "logo.jpg");
    }

    #[test]
    fn logo_dateiname_faellt_bei_unbekanntem_format_auf_png_zurueck() {
        assert_eq!(logo_dateiname(&[0x00, 0x01, 0x02, 0x03]), "logo.png");
        assert_eq!(logo_dateiname(&[]), "logo.png");
    }
}
