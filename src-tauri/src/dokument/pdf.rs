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

/// Übersetzt das `Firma.kleinunternehmer`-Flag in den String-Wert, der als Typst-Input
/// dient (analog zur bestehenden `hat_logo`-Konvention: "ja"/leerer String statt eines
/// echten Bool, da `typst-as-lib` hier nur String-Werte entgegennimmt, siehe `dict_aus_feldern`).
/// Steuert im Template (`rechnung.typ`), ob der § 19 UStG-Hinweis angezeigt wird.
fn kleinunternehmer_flag(firma: &crate::commands::firma::Firma) -> &'static str {
    if firma.kleinunternehmer { "ja" } else { "" }
}

/// Wandelt ein ISO-Datum ("2026-07-11") in die deutsche Schreibweise
/// ("11.07.2026"). Auf einer deutschen Rechnung ist die ISO-Form unüblich und
/// wird von Empfängern leicht falsch gelesen. Unerwartete Eingaben bleiben
/// unverändert — ein Datumsformat ist kein Grund, den Export scheitern zu lassen.
fn datum_format(iso: &str) -> String {
    let teile: Vec<&str> = iso.split('-').collect();
    match teile.as_slice() {
        [jahr, monat, tag] if jahr.len() == 4 && monat.len() == 2 && tag.len() == 2 => {
            format!("{tag}.{monat}.{jahr}")
        }
        _ => iso.to_string(),
    }
}

/// Leistungsangabe für die Rechnung: Einzeldatum oder Zeitraum.
fn leistung_anzeigen(kontext: &BelegKontext) -> String {
    let von = datum_format(&kontext.beleg.leistungsdatum);
    match kontext.beleg.leistungsdatum_bis.as_deref().filter(|b| !b.trim().is_empty()) {
        Some(bis) => format!("{von} – {}", datum_format(bis)),
        None => von,
    }
}

/// Gruppiert eine IBAN in Viererblöcke, wie sie üblicherweise gedruckt wird.
/// Das erleichtert das Abtippen und die Sichtprüfung erheblich.
fn iban_format(iban: &str) -> String {
    let kompakt: String = iban.chars().filter(|c| !c.is_whitespace()).collect();
    kompakt
        .as_bytes()
        .chunks(4)
        .map(|c| String::from_utf8_lossy(c).into_owned())
        .collect::<Vec<_>>()
        .join(" ")
}

/// Das Land des Empfängers gehört nur auf die Rechnung, wenn es vom eigenen
/// abweicht — bei einer Inlandsrechnung wäre „DE" unter der Adresse nur Rauschen.
fn land_anzeigen(land_kunde: &str, land_firma: &str) -> String {
    if land_kunde.is_empty() || land_kunde.eq_ignore_ascii_case(land_firma) {
        String::new()
    } else {
        land_kunde.to_string()
    }
}

/// Kompiliert die Typst-Vorlage zum Dokument. Von `rendern` getrennt, weil der
/// Schritt „Dokument bauen" und der Schritt „nach PDF exportieren" verschiedene
/// Fehlerquellen haben und sich so einzeln prüfen lassen.
pub(crate) fn dokument_bauen(
    kontext: &BelegKontext,
    logo: Option<&[u8]>,
    vorlage: &crate::dokument::vorlage::Vorlage,
) -> AppResult<typst::layout::PagedDocument> {
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
            .enumerate()
            .map(|(i, p)| {
                serde_json::json!({
                    "nummer": (i + 1).to_string(),
                    "bezeichnung": p.bezeichnung,
                    // Getrennt, damit die Vorlage entscheiden kann, ob die
                    // Einheit eine eigene Spalte bekommt oder hinter der Menge
                    // steht. Zusammengesetzt ließe sie sich nicht mehr trennen.
                    "menge": menge_format(p.menge),
                    "einheit": p.einheit_kuerzel.clone(),
                    "einzelpreis": cent_format(p.einzelpreis_cent),
                    "summe": cent_format(p.positionssumme_cent),
                })
            })
            .collect::<Vec<_>>(),
    )
    .map_err(|e| AppError::Technisch(e.to_string()))?;

    let logo_dateiname = if vorlage.logo_position == crate::dokument::vorlage::LogoPosition::Keins {
        ""
    } else {
        logo.map(logo_dateiname).unwrap_or("")
    };

    let mut builder = TypstEngine::builder().main_file(VORLAGE).fonts([SCHRIFT]);
    if let Some(bytes) = logo {
        builder = builder.with_static_file_resolver([(logo_dateiname, bytes.to_vec())]);
    }
    let engine = builder.build();

    let mut felder: Vec<(&'static str, String)> = vec![
        ("titel", titel.to_string()),
        ("nummer", kontext.beleg.nummer.clone().unwrap_or_default()),
        ("datum", datum_format(&kontext.beleg.datum)),
        // Bei einem Zeitraum die Spanne ausweisen. § 14 Abs. 4 Nr. 6 UStG lässt
        // beides zu; ein Einzeldatum wäre bei einer Monatsabrechnung falsch.
        ("leistungsdatum", leistung_anzeigen(kontext)),
        ("leistung_beschriftung", if kontext.beleg.leistungsdatum_bis.is_some() {
            "Leistungszeitraum".to_string()
        } else {
            "Leistungsdatum".to_string()
        }),
        // Ein Angebot ist keine Zahlungsaufforderung; dort bleibt das Feld leer
        // und die Vorlage lässt die Zeile weg.
        ("zahlungsbedingung", if kontext.beleg.typ == "angebot" {
            String::new()
        } else {
            crate::dokument::zahlungsbedingung(&kontext.beleg.datum, kontext.beleg.zahlungsziel_tage)
        }),
        ("storno_von_nummer", kontext.storno_von_nummer.clone().unwrap_or_default()),
        ("kunde_ansprechpartner", kontext.kunde_ansprechpartner.clone()),
        ("kunde_name", kontext.kunde_name.clone()),
        ("kunde_strasse", kontext.adresse_strasse.clone()),
        ("kunde_plz", kontext.adresse_plz.clone()),
        ("kunde_ort", kontext.adresse_ort.clone()),
        ("kunde_land", land_anzeigen(&kontext.adresse_land, &kontext.firma.land)),
        ("firma_name", kontext.firma.name.clone()),
        ("firma_strasse", kontext.firma.strasse.clone()),
        ("firma_plz", kontext.firma.plz.clone()),
        ("firma_ort", kontext.firma.ort.clone()),
        // § 14 Abs. 4 Nr. 2 UStG: Steuernummer ODER USt-IdNr. ist Pflicht. Für
        // Kleinunternehmer ist die Steuernummer der Regelfall; hat jemand beides,
        // werden beide gedruckt.
        ("firma_steuernummer", kontext.firma.steuernummer.clone()),
        ("firma_ust_idnr", kontext.firma.ust_idnr.clone()),
        ("firma_iban", iban_format(&kontext.firma.iban)),
        ("firma_bic", kontext.firma.bic.clone()),
        ("positionen_json", positionen_json),
        ("summe", cent_format(kontext.beleg.summe_cent)),
        ("kopftext", kontext.beleg.kopftext.clone()),
        ("fusstext", kontext.beleg.fusstext.clone()),
        ("hat_logo", logo_dateiname.to_string()),
        ("kleinunternehmer", kleinunternehmer_flag(&kontext.firma).to_string()),
    ];
    felder.extend(vorlage.als_eingaben());
    let eingabe = dict_aus_feldern(felder);

    engine
        .compile_with_input(eingabe)
        .output
        .map_err(|e| AppError::Technisch(format!("Typst-Rendering fehlgeschlagen: {e:?}")))
}

pub fn rendern(
    kontext: &BelegKontext,
    logo: Option<&[u8]>,
    vorlage: &crate::dokument::vorlage::Vorlage,
) -> AppResult<Vec<u8>> {
    let dokument = dokument_bauen(kontext, logo, vorlage)?;
    // PDF/A-3b anfordern: ZUGFeRD verlangt es, und ohne die Vorgabe hinge die
    // Konformität davon ab, dass die Vorlage zufällig nichts PDF/A-Widriges
    // enthält (etwa Transparenz oder eine nicht eingebettete Schrift).
    let standards = typst_pdf::PdfStandards::new(&[typst_pdf::PdfStandard::A_3b])
        .map_err(|e| AppError::Technisch(format!("PDF/A-Vorgabe abgelehnt: {e}")))?;
    let optionen = typst_pdf::PdfOptions { standards, ..Default::default() };
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
                leistungsdatum: "2026-07-11".into(), leistungsdatum_bis: None, zahlungsziel_tage: 14,
                kopftext: "Wie besprochen stelle ich Ihnen in Rechnung:".into(),
                fusstext: "Danke für Ihren Auftrag.".into(), summe_cent: 9500,
                ursprungsangebot_id: None, storno_von_id: None,
                kunde_snapshot: String::new(), kunde_snapshot_name: None,
                bezahlt_cent: 0, zahlungsstand: None, faellig_am: None,
                adresse_id: None, ansprechpartner_id: None,
            },
            positionen: vec![Belegposition {
                id: "p1".into(), beleg_id: "b1".into(), artikel_id: None,
                bezeichnung: "Beratung".into(), einheit_kuerzel: "Std.".into(),
                einzelpreis_cent: 9500, menge: 1000, positionssumme_cent: 9500, reihenfolge: 0,
            }],
            firma: Firma {
                id: "f1".into(), name: "Meine Firma".into(), strasse: "Weg 1".into(), plz: "10115".into(),
                ort: "Berlin".into(), land: "DE".into(), steuernummer: "12/345/67890".into(), ust_idnr: "".into(),
                iban: "DE02120300000000202051".into(), bic: "BYLADEM1001".into(),
                email: "rechnung@meine-firma.de".into(), telefon: "030 123456".into(),
                kontakt_name: "Max Mustermann".into(),
                gruendungsjahr: None,
                kleinunternehmer: true, eingerichtet: true,
            },
            kunde_ansprechpartner: String::new(), kunde_name: "ACME GmbH".into(), kunde_kundennummer: "KD-0001".into(), kunde_ust_idnr: "".into(),
            kunde_email: "".into(), kunde_leitweg_id: "".into(), kunde_kaeuferreferenz: "".into(),
            adresse_strasse: "Kundenweg 5".into(), adresse_plz: "10117".into(), adresse_ort: "Berlin".into(),
            adresse_land: "DE".into(),
            storno_von_nummer: None,
        }
    }

    /// Extrahiert den sichtbaren Text der gerenderten Rechnung.
    fn text(kontext: &BelegKontext) -> String {
        let bytes = rendern(kontext, None, &crate::dokument::vorlage::Vorlage::default()).unwrap();
        pdf_extract::extract_text_from_mem(&bytes).unwrap()
    }

    /// 2×3-Matrix, wie PDF sie für `cm` und `Tm` verwendet: [a b c d e f].
    type Matrix = [f32; 6];

    const EINHEIT: Matrix = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0];

    /// Verkettet zwei Matrizen — erst `m`, dann `n`.
    fn mal(m: Matrix, n: Matrix) -> Matrix {
        [
            m[0] * n[0] + m[1] * n[2],
            m[0] * n[1] + m[1] * n[3],
            m[2] * n[0] + m[3] * n[2],
            m[2] * n[1] + m[3] * n[3],
            m[4] * n[0] + m[5] * n[2] + n[4],
            m[4] * n[1] + m[5] * n[3] + n[5],
        ]
    }

    /// Textpositionen der ersten Seite in Punkten, gemessen von der linken
    /// **unteren** Ecke — so, wie PDF selbst rechnet.
    ///
    /// Typst schreibt die Positionen nicht absolut: Es spiegelt zunächst die
    /// y-Achse (`cm [1 0 0 -1 0 841.89]`, damit von oben gemessen wird) und
    /// verschiebt danach je Block. Die `Tm`-Werte allein sind daher
    /// blockrelativ und für sich genommen nichtssagend — die Matrizen müssen
    /// verkettet werden.
    fn textpositionen(bytes: &[u8]) -> Vec<(f32, f32)> {
        let doc = lopdf::Document::load_mem(bytes).unwrap();
        let (_, seite) = doc.get_pages().into_iter().next().unwrap();
        let inhalt = lopdf::content::Content::decode(&doc.get_page_content(seite).unwrap()).unwrap();

        let mut ctm = EINHEIT;
        let mut stapel: Vec<Matrix> = Vec::new();
        let mut positionen = Vec::new();

        for op in inhalt.operations {
            let werte = || -> Matrix {
                let mut m = EINHEIT;
                for (i, o) in op.operands.iter().take(6).enumerate() {
                    m[i] = o.as_float().unwrap_or(0.0);
                }
                m
            };
            match op.operator.as_str() {
                "q" => stapel.push(ctm),
                "Q" => ctm = stapel.pop().unwrap_or(EINHEIT),
                "cm" if op.operands.len() == 6 => ctm = mal(werte(), ctm),
                "Tm" if op.operands.len() == 6 => {
                    let m = mal(werte(), ctm);
                    positionen.push((m[4], m[5]));
                }
                _ => {}
            }
        }
        positionen
    }

    /// DIN 5008 Form A legt das Anschriftfeld auf 20 mm von links und 45 mm von
    /// oben, 85 mm breit und 40 mm hoch. Nur dort steht die Anschrift im
    /// Sichtfenster eines gewöhnlichen Umschlags (DIN lang, C6/5).
    ///
    /// Gemessen wird am erzeugten PDF, nicht an der Vorlage — sonst prüfte der
    /// Test die Quelle gegen sich selbst.
    #[test]
    fn die_anschrift_liegt_im_sichtfenster_nach_din_5008() {
        const MM: f32 = 72.0 / 25.4;

        // A4-Höhe. PDF misst von unten, die Norm von oben.
        const SEITENHOEHE: f32 = 297.0 * MM;

        // Ein Zehntelmillimeter Spiel. Typst rundet die Koordinaten beim
        // Schreiben, und exakt auf der Kante zu vergleichen ließe den Test an
        // vier Zehnmillionstel scheitern. Physisch hat ein Umschlagfenster
        // ohnehin mehr Spiel als das.
        const SPIEL: f32 = 0.1 * MM;

        let bytes = rendern(&test_kontext(), None, &crate::dokument::vorlage::Vorlage::default()).unwrap();
        let im_fenster: Vec<_> = textpositionen(&bytes)
            .into_iter()
            .map(|(x, y)| (x, SEITENHOEHE - y))
            .filter(|(x, y)| {
                (20.0 * MM - SPIEL..=105.0 * MM + SPIEL).contains(x)
                    && (45.0 * MM - SPIEL..=85.0 * MM + SPIEL).contains(y)
            })
            .collect();

        // Rücksendeangabe, Name, Straße, Ort — mindestens vier Zeilen.
        assert!(
            im_fenster.len() >= 4,
            "im Anschriftfeld stehen nur {} Zeilen, erwartet sind mindestens 4",
            im_fenster.len(),
        );

        // Der Block beginnt exakt an der linken Kante des Feldes.
        let links = im_fenster.iter().map(|(x, _)| *x).fold(f32::MAX, f32::min);
        assert!(
            (links - 20.0 * MM).abs() < 1.0,
            "linke Kante bei {:.1} mm statt 20 mm",
            links / MM,
        );
    }

    /// Dasselbe mit geänderten Seitenrändern.
    ///
    /// Das Anschriftfeld wird relativ zum Seitenrand platziert; die Vorlage
    /// rechnet die Normmaße dagegen. Käme der Rand an zwei Stellen aus
    /// verschiedenen Größen, verschöbe eine Randänderung das Feld aus dem
    /// Umschlagfenster — sichtbar erst, wenn die Post zurückkommt. Der Test
    /// oben prüft nur die Vorgabe und fiele darauf nicht herein.
    #[test]
    fn die_anschrift_bleibt_im_fenster_auch_bei_anderen_seitenraendern() {
        const MM: f32 = 72.0 / 25.4;
        const SEITENHOEHE: f32 = 297.0 * MM;
        const SPIEL: f32 = 0.1 * MM;

        for (oben, seitlich) in [(20.0, 15.0), (40.0, 30.0), (32.0, 18.0)] {
            let vorlage = crate::dokument::vorlage::Vorlage {
                rand_oben_mm: oben,
                rand_seitlich_mm: seitlich,
                ..Default::default()
            };
            let bytes = rendern(&test_kontext(), None, &vorlage).unwrap();
            let im_fenster: Vec<_> = textpositionen(&bytes)
                .into_iter()
                .map(|(x, y)| (x, SEITENHOEHE - y))
                .filter(|(x, y)| {
                    (20.0 * MM - SPIEL..=105.0 * MM + SPIEL).contains(x)
                        && (45.0 * MM - SPIEL..=85.0 * MM + SPIEL).contains(y)
                })
                .collect();

            assert!(
                im_fenster.len() >= 4,
                "bei Rand oben {oben} mm / seitlich {seitlich} mm stehen nur {} Zeilen im Fenster",
                im_fenster.len(),
            );
            let links = im_fenster.iter().map(|(x, _)| *x).fold(f32::MAX, f32::min);
            assert!(
                (links - 20.0 * MM).abs() < 1.0,
                "bei Rand seitlich {seitlich} mm liegt die linke Kante bei {:.1} mm statt 20 mm",
                links / MM,
            );
        }
    }

    /// Was sich abschalten lässt, verschwindet — und was nicht, bleibt.
    #[test]
    fn einstellungen_wirken_auf_den_beleg() {
        use crate::dokument::vorlage::{BankPosition, Vorlage};

        let ohne = Vorlage {
            spalte_nummer: false,
            spalte_einzelpreis: false,
            absenderzeile: false,
            ..Default::default()
        };
        let bytes = rendern(&test_kontext(), None, &ohne).unwrap();
        let t = pdf_extract::extract_text_from_mem(&bytes).unwrap();
        assert!(!t.contains("Pos."), "Positionsspalte trotz Abwahl:\n{t}");
        assert!(!t.contains("Einzelpreis"), "Einzelpreisspalte trotz Abwahl:\n{t}");

        // Pflichtangaben nach § 14 Abs. 4 Nr. 5 UStG lassen sich nicht abwählen.
        assert!(t.contains("Menge"), "Mengenspalte fehlt:\n{t}");
        assert!(t.contains("Beratung"), "Bezeichnung fehlt:\n{t}");
        assert!(t.contains("Summe"), "Summenspalte fehlt:\n{t}");

        // Eigene Einheitenspalte statt hinter der Menge.
        let mit_einheit = Vorlage { einheit_eigene_spalte: true, ..Default::default() };
        let t2 = pdf_extract::extract_text_from_mem(
            &rendern(&test_kontext(), None, &mit_einheit).unwrap()).unwrap();
        assert!(t2.contains("Einheit"), "Einheitenspalte fehlt:\n{t2}");

        // Die Bankverbindung wandert, verschwindet aber nicht.
        let nach_summe = Vorlage { bankverbindung: BankPosition::NachSumme, ..Default::default() };
        let t3 = pdf_extract::extract_text_from_mem(
            &rendern(&test_kontext(), None, &nach_summe).unwrap()).unwrap();
        assert!(t3.contains("Bankverbindung"), "Bankverbindung fehlt:\n{t3}");
    }

    #[test]
    fn positionen_sind_durchnummeriert() {
        // Ohne Nummer lässt sich am Telefon nicht auf eine Zeile verweisen
        // („Position 3 stimmt nicht"), und bei gleichlautenden Bezeichnungen
        // ist gar nicht klar, welche gemeint ist.
        let t = text(&test_kontext());
        assert!(t.contains("Pos."), "Spaltenkopf fehlt:\n{t}");
        assert!(t.contains("1"), "erste Positionsnummer fehlt:\n{t}");
    }

    #[test]
    fn rechnung_nennt_ein_konkretes_faelligkeitsdatum() {
        // „Zahlungsziel: 14 Tage" zwingt den Empfänger zum Rechnen — und ab
        // welchem Tag gezählt wird, steht nirgends.
        let kontext = test_kontext();
        let t = text(&kontext);
        assert!(t.contains("Zahlbar ohne Abzug bis zum"), "Zahlungsbedingung fehlt:\n{t}");
        // Belegdatum 2026-07-11 plus 14 Tage Zahlungsziel.
        assert!(t.contains("25.07.2026"), "falsches oder fehlendes Datum:\n{t}");
    }

    #[test]
    fn ein_angebot_nennt_keine_faelligkeit() {
        // Ein Angebot ist keine Zahlungsaufforderung.
        let mut kontext = test_kontext();
        kontext.beleg.typ = "angebot".into();
        let t = text(&kontext);
        assert!(!t.contains("Zahlbar"), "Angebot mit Zahlungsaufforderung:\n{t}");
    }

    #[test]
    fn eine_korrektur_verweist_auf_die_ursprungsrechnung() {
        // Ohne den Bezug ist eine Rechnungskorrektur für den Empfänger nicht
        // zuzuordnen — und für dessen Buchhaltung wertlos.
        let mut kontext = test_kontext();
        kontext.beleg.storno_von_id = Some("b0".into());
        kontext.storno_von_nummer = Some("RE-2026-0007".into());
        let t = text(&kontext);
        assert!(t.contains("RE-2026-0007"), "Bezug zur Ursprungsrechnung fehlt:\n{t}");
    }

    #[test]
    fn ansprechpartner_steht_ueber_der_anschrift() {
        // Bei größeren Kunden landet eine Rechnung ohne Namen in der
        // Poststelle und von dort irgendwo.
        let mut kontext = test_kontext();
        kontext.kunde_ansprechpartner = "Erika Musterfrau".into();
        let t = text(&kontext);
        assert!(t.contains("Erika Musterfrau"), "Ansprechpartner fehlt:\n{t}");

        let ohne = text(&test_kontext());
        // Ohne Ansprechpartner darf keine leere Zeile über der Anschrift stehen.
        assert!(!ohne.contains("Erika Musterfrau"));
    }

    /// § 14 Abs. 4 UStG zählt die Pflichtangaben einer Rechnung abschließend auf.
    /// Fehlt eine davon, ist die Rechnung formell fehlerhaft und der Empfänger
    /// kann sie zurückweisen. Der Test prüft daher am tatsächlich gesetzten
    /// Text, nicht an den Eingabefeldern.
    #[test]
    fn rechnung_enthaelt_die_pflichtangaben_nach_paragraf_14_ustg() {
        let t = text(&test_kontext());
        let fehlend: Vec<&str> = [
            ("Name des Ausstellers", "Meine Firma"),
            ("Anschrift des Ausstellers", "Weg 1"),
            ("Name des Empfängers", "ACME GmbH"),
            ("Anschrift des Empfängers", "Kundenweg 5"),
            ("Steuernummer", "12/345/67890"),
            ("Ausstellungsdatum", "11.07.2026"),
            ("Rechnungsnummer", "RE-2026-0001"),
            ("Bezeichnung der Leistung", "Beratung"),
            ("Menge", "1 Std."),
            ("Entgelt", "95,00"),
            ("Hinweis auf § 19 UStG", "19"),
        ]
        .iter()
        .filter(|(_, wert)| !t.contains(wert))
        .map(|(bezeichnung, _)| *bezeichnung)
        .collect();
        assert!(fehlend.is_empty(), "auf der Rechnung fehlen: {fehlend:?}\n\nText:\n{t}");
    }

    #[test]
    fn datum_wird_deutsch_formatiert() {
        assert_eq!(datum_format("2026-07-11"), "11.07.2026");
        // Unerwartete Eingaben bleiben unverändert, statt den Export zu stoppen.
        assert_eq!(datum_format(""), "");
        assert_eq!(datum_format("11.07.2026"), "11.07.2026");
        assert_eq!(datum_format("2026-7-1"), "2026-7-1");
    }

    #[test]
    fn iban_wird_in_viererbloecke_gruppiert() {
        assert_eq!(iban_format("DE02120300000000202051"), "DE02 1203 0000 0000 2020 51");
        // Bereits gruppierte Eingaben werden nicht doppelt getrennt.
        assert_eq!(iban_format("DE02 1203 0000 0000 2020 51"), "DE02 1203 0000 0000 2020 51");
        assert_eq!(iban_format(""), "");
    }

    #[test]
    fn land_erscheint_nur_bei_auslandsrechnung() {
        assert_eq!(land_anzeigen("DE", "DE"), "");
        assert_eq!(land_anzeigen("de", "DE"), "");
        assert_eq!(land_anzeigen("", "DE"), "");
        assert_eq!(land_anzeigen("AT", "DE"), "AT");
    }

    /// § 14 Abs. 4 Nr. 6 UStG lässt Zeitpunkt „oder Zeitraum" zu. Bei einer
    /// Monatsabrechnung wäre ein Einzeldatum sachlich falsch.
    #[test]
    fn leistungszeitraum_wird_als_spanne_ausgewiesen() {
        let mut kontext = test_kontext();
        kontext.beleg.leistungsdatum = "2026-07-01".into();
        kontext.beleg.leistungsdatum_bis = Some("2026-07-31".into());
        let t = text(&kontext);
        assert!(t.contains("Leistungszeitraum"), "Beschriftung fehlt.\n\nText:\n{t}");
        assert!(t.contains("01.07.2026"), "Beginn fehlt");
        assert!(t.contains("31.07.2026"), "Ende fehlt");
    }

    #[test]
    fn ohne_zeitraum_bleibt_es_beim_einzeldatum() {
        let t = text(&test_kontext());
        assert!(t.contains("Leistungsdatum"), "Beschriftung fehlt.\n\nText:\n{t}");
        assert!(!t.contains("Leistungszeitraum"));
    }

    /// Ohne Bankverbindung kann der Empfänger die Rechnung nicht bezahlen.
    /// Gesetzlich nicht zwingend, praktisch aber der Zweck des Dokuments.
    #[test]
    fn rechnung_enthaelt_die_bankverbindung() {
        let t = text(&test_kontext());
        assert!(t.contains("DE02 1203 0000 0000 2020 51"), "IBAN fehlt.\n\nText:\n{t}");
        assert!(t.contains("BYLADEM1001"), "BIC fehlt.\n\nText:\n{t}");
    }

    /// Der Kopftext wird im Editor gepflegt und aus Textbausteinen vorbelegt.
    /// Erscheint er nicht im PDF, ist das aus Nutzersicht Datenverlust.
    #[test]
    fn rechnung_enthaelt_den_kopftext() {
        let t = text(&test_kontext());
        assert!(t.contains("Wie besprochen"), "Kopftext fehlt.\n\nText:\n{t}");
    }

    /// Bei vielen Positionen bricht Typst um. Ohne Seitenzahl kann der Empfänger
    /// nicht erkennen, ob die Rechnung vollständig ist, und ohne wiederholten
    /// Tabellenkopf stehen ab Seite 2 namenlose Zahlenspalten.
    #[test]
    fn lange_rechnung_bekommt_seitenzahlen_und_wiederholten_tabellenkopf() {
        let mut kontext = test_kontext();
        let vorlage = kontext.positionen[0].clone();
        kontext.positionen = (0..60)
            .map(|i| Belegposition { id: format!("p{i}"), bezeichnung: format!("Leistung {i}"), ..vorlage.clone() })
            .collect();
        let t = text(&kontext);

        assert!(t.contains("Seite 1 von"), "Seitenzahl fehlt.\n\nText:\n{t}");
        assert!(t.contains("Leistung 59"), "letzte Position fehlt — Umbruch verschluckt Inhalt");
        let kopfzeilen = t.matches("Einzelpreis").count();
        assert!(kopfzeilen > 1, "Tabellenkopf wird auf Folgeseiten nicht wiederholt (gefunden: {kopfzeilen})");
    }

    /// Einseitige Rechnungen sollen keine Fußzeile tragen — "Seite 1 von 1" ist
    /// nur Ballast.
    #[test]
    fn einseitige_rechnung_hat_keine_seitenzahl() {
        let t = text(&test_kontext());
        assert!(!t.contains("Seite 1 von"), "einseitige Rechnung zeigt unnötige Seitenzahl.\n\nText:\n{t}");
    }

    /// Bei fehlender USt-IdNr. muss die Steuernummer stehen und umgekehrt —
    /// für Kleinunternehmer ist die Steuernummer der Regelfall.
    #[test]
    fn rechnung_zeigt_ust_idnr_wenn_vorhanden() {
        let mut kontext = test_kontext();
        kontext.firma.ust_idnr = "DE123456789".into();
        let t = text(&kontext);
        assert!(t.contains("DE123456789"), "USt-IdNr. fehlt.\n\nText:\n{t}");
    }

    #[test]
    fn rendern_mit_position_erzeugt_gueltige_pdf_bytes() {
        let bytes = rendern(&test_kontext(), None, &crate::dokument::vorlage::Vorlage::default()).unwrap();
        assert!(bytes.starts_with(b"%PDF-"), "Ausgabe beginnt nicht mit der PDF-Signatur");
        assert!(bytes.len() > 500, "PDF wirkt verdächtig klein");
    }

    // Hinweis zum Testansatz für den § 19 UStG-Hinweis: Ein inhaltlicher Test auf den
    // gerenderten PDF-Bytes (Text-Extraktion) wurde versucht (`lopdf::Document::extract_text`),
    // scheitert aber zuverlässig an `ToUnicodeCMap(Parse(Error))` — die von `typst-pdf` erzeugten
    // ToUnicode-CMaps sind mit `lopdf` 0.35 nicht kompatibel (unabhängig vom eingebetteten Text).
    // Daher wird hier stattdessen die Eingabe-Dict-Ebene geprüft: `kleinunternehmer_flag` ist die
    // einzige Stelle, die entscheidet, ob das Template den Hinweis zeigt (`#if sys.inputs.kleinunternehmer
    // == "ja"` in rechnung.typ), und `rendern_mit_kleinunternehmer_flag_erzeugt_gueltige_pdf_bytes` /
    // `rendern_ohne_kleinunternehmer_flag_erzeugt_gueltige_pdf_bytes` stellen zusätzlich sicher, dass
    // beide Zweige des Templates (mit und ohne den zusätzlichen `#if`-Block) fehlerfrei kompilieren.

    #[test]
    fn kleinunternehmer_flag_liefert_ja_wenn_firma_kleinunternehmer_ist() {
        let mut kontext = test_kontext();
        kontext.firma.kleinunternehmer = true;
        assert_eq!(kleinunternehmer_flag(&kontext.firma), "ja");
    }

    #[test]
    fn kleinunternehmer_flag_liefert_leeren_string_wenn_firma_kein_kleinunternehmer_ist() {
        let mut kontext = test_kontext();
        kontext.firma.kleinunternehmer = false;
        assert_eq!(kleinunternehmer_flag(&kontext.firma), "");
    }

    #[test]
    fn rendern_mit_kleinunternehmer_flag_erzeugt_gueltige_pdf_bytes() {
        let mut kontext = test_kontext();
        kontext.firma.kleinunternehmer = true;
        let bytes = rendern(&kontext, None, &crate::dokument::vorlage::Vorlage::default()).unwrap();
        assert!(bytes.starts_with(b"%PDF-"));
    }

    #[test]
    fn rendern_ohne_kleinunternehmer_flag_erzeugt_gueltige_pdf_bytes() {
        let mut kontext = test_kontext();
        kontext.firma.kleinunternehmer = false;
        let bytes = rendern(&kontext, None, &crate::dokument::vorlage::Vorlage::default()).unwrap();
        assert!(bytes.starts_with(b"%PDF-"));
    }

    #[test]
    fn rendern_storno_erzeugt_gueltige_pdf_bytes() {
        let mut kontext = test_kontext();
        kontext.beleg.storno_von_id = Some("r1".into());
        kontext.beleg.summe_cent = -9500;
        let bytes = rendern(&kontext, None, &crate::dokument::vorlage::Vorlage::default()).unwrap();
        assert!(bytes.starts_with(b"%PDF-"));
    }

    #[test]
    fn rendern_mit_logo_erzeugt_gueltige_pdf_bytes() {
        const LOGO: &[u8] = include_bytes!("../../resources/test/logo_1x1.png");
        let bytes = rendern(&test_kontext(), Some(LOGO), &crate::dokument::vorlage::Vorlage::default()).unwrap();
        assert!(bytes.starts_with(b"%PDF-"));
    }

    #[test]
    fn rendern_mit_jpeg_logo_erzeugt_gueltige_pdf_bytes() {
        const LOGO: &[u8] = include_bytes!("../../resources/test/logo_1x1.jpg");
        let bytes = rendern(&test_kontext(), Some(LOGO), &crate::dokument::vorlage::Vorlage::default()).unwrap();
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

#[cfg(test)]
mod muster {
    /// Schreibt eine Musterrechnung auf die Platte, um das Layout mit eigenen
    /// Augen prüfen zu können. Die Textprüfungen im Testmodul stellen sicher,
    /// dass alle Pflichtangaben vorhanden sind — ob die Seite auch gut aussieht,
    /// zeigen sie nicht.
    ///
    /// Aufruf: `MUSTER_PFAD=/tmp/muster.pdf cargo test -- muster --ignored`
    #[test]
    #[ignore = "erzeugt eine Datei zur Sichtprüfung, kein automatischer Test"]
    fn schreibe_muster_pdf() {
        let Ok(pfad) = std::env::var("MUSTER_PFAD") else {
            eprintln!("übersprungen: MUSTER_PFAD nicht gesetzt");
            return;
        };
        let bytes = super::rendern(&super::tests::test_kontext(), None, &crate::dokument::vorlage::Vorlage::default()).unwrap();
        std::fs::write(pfad, bytes).unwrap();
    }
}
