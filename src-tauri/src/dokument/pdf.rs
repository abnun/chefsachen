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

    let eingabe = dict_aus_feldern([
        ("titel", titel.to_string()),
        ("nummer", kontext.beleg.nummer.clone().unwrap_or_default()),
        ("datum", kontext.beleg.datum.clone()),
        ("kunde_name", kontext.kunde_name.clone()),
        ("kunde_strasse", kontext.adresse_strasse.clone()),
        ("kunde_plz", kontext.adresse_plz.clone()),
        ("kunde_ort", kontext.adresse_ort.clone()),
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
