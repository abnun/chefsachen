//! Erzeugt die SEPA-Girocode-Zahlungsaufforderung (EPC069-12) für Rechnungen.
//!
//! Baut dieselbe elfzeilige Nutzlast wie der eigene HTML-Prototyp
//! (`qr-code-generator/generator.html`), damit ein bereits geprüftes Format
//! übernommen wird statt eines zweiten, unabhängig entstandenen. Die Matrix
//! selbst zeichnet nicht dieses Modul, sondern die Typst-Vorlage — hier
//! entsteht nur die Rohdaten-Grundlage (Boolean-Gitter), im selben Stil wie
//! `domain::steuer` Zahlen liefert und `dokument::pdf` sie rendert.

use crate::error::{AppError, AppResult};

/// Kürzt auf eine Zeichenanzahl (nicht Byteanzahl — Namen mit Umlauten dürfen
/// nicht mitten in einem UTF-8-Zeichen abgeschnitten werden).
fn kappe(text: &str, max_zeichen: usize) -> String {
    text.chars().take(max_zeichen).collect()
}

/// Baut die EPC069-12-Nutzlast ("BCD"-Format) für einen SEPA-Girocode.
///
/// `betrag_cent` bleibt leer (kein Betrag im Code), wenn `None` — ein Girocode
/// ohne Betrag lässt den Zahlenden selbst eintragen. `betrag_cent` muss, wenn
/// gesetzt, nicht-negativ sein; das stellt der Aufrufer sicher (ein Girocode
/// über einen negativen Betrag ergäbe keinen gültigen Zahlungsauftrag).
pub fn epc_payload(name: &str, iban: &str, bic: &str, betrag_cent: Option<i64>, verwendungszweck: &str) -> String {
    debug_assert!(betrag_cent.is_none_or(|c| c >= 0), "Girocode-Betrag darf nicht negativ sein");
    let betrag = betrag_cent
        .map(|cent| format!("EUR{}.{:02}", cent / 100, cent % 100))
        .unwrap_or_default();
    [
        "BCD",
        "002",
        "1",
        "SCT",
        bic,
        &kappe(name, 70),
        iban,
        &betrag,
        "",
        "",
        &kappe(verwendungszweck, 140),
    ]
    .join("\n")
}

/// Wandelt die EPC-Nutzlast in eine quadratische Hell/Dunkel-Matrix. Typst
/// zeichnet daraus Vektor-Rechtecke — es entsteht keine Bilddatei, anders als
/// beim Logo.
pub fn qr_matrix(payload: &str) -> AppResult<Vec<Vec<bool>>> {
    let code = qrcode::QrCode::new(payload.as_bytes())
        .map_err(|e| AppError::Technisch(format!("QR-Code konnte nicht erzeugt werden: {e}")))?;
    let breite = code.width();
    let farben = code.to_colors();
    Ok(farben
        .chunks(breite)
        .map(|zeile| zeile.iter().map(|f| *f == qrcode::Color::Dark).collect())
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn epc_payload_baut_die_elf_zeilen_der_epc069_12_nutzlast() {
        // Dieselben Beispieldaten wie der "Beispieldaten laden"-Knopf im
        // HTML-Prototyp (qr-code-generator/generator.html).
        let payload = epc_payload("Max Mustermann", "DE89370400440532013000", "", Some(2550), "Mitgliedsbeitrag");
        assert_eq!(
            payload,
            "BCD\n002\n1\nSCT\n\nMax Mustermann\nDE89370400440532013000\nEUR25.50\n\n\nMitgliedsbeitrag"
        );
    }

    #[test]
    fn epc_payload_laesst_den_betrag_leer_wenn_nicht_gesetzt() {
        let payload = epc_payload("Max Mustermann", "DE89370400440532013000", "", None, "");
        let zeilen: Vec<&str> = payload.split('\n').collect();
        assert_eq!(zeilen.len(), 11);
        assert_eq!(zeilen[7], "", "Betragszeile sollte leer sein");
    }

    #[test]
    fn epc_payload_traegt_die_bic_wenn_gesetzt() {
        let payload = epc_payload("Meine Firma", "DE02120300000000202051", "BYLADEM1001", Some(9500), "");
        let zeilen: Vec<&str> = payload.split('\n').collect();
        assert_eq!(zeilen[4], "BYLADEM1001");
    }

    #[test]
    fn epc_payload_kappt_einen_zu_langen_namen_auf_70_zeichen() {
        let langer_name = "A".repeat(100);
        let payload = epc_payload(&langer_name, "DE89370400440532013000", "", None, "");
        let zeilen: Vec<&str> = payload.split('\n').collect();
        assert_eq!(zeilen[5].chars().count(), 70);
    }

    #[test]
    fn epc_payload_kappt_einen_zu_langen_verwendungszweck_auf_140_zeichen() {
        let langer_zweck = "B".repeat(200);
        let payload = epc_payload("Meine Firma", "DE89370400440532013000", "", None, &langer_zweck);
        let zeilen: Vec<&str> = payload.split('\n').collect();
        assert_eq!(zeilen[10].chars().count(), 140);
    }

    #[test]
    fn epc_payload_kappt_umlaute_ohne_an_einer_zeichengrenze_abzustuerzen() {
        // "ü" ist im UTF-8 zwei Bytes breit — ein Kappen nach Byteanzahl
        // stürzte hier mitten im Zeichen ab.
        let name = "ü".repeat(71);
        let payload = epc_payload(&name, "DE89370400440532013000", "", None, "");
        let zeilen: Vec<&str> = payload.split('\n').collect();
        assert_eq!(zeilen[5].chars().count(), 70);
    }

    #[test]
    fn qr_matrix_erzeugt_ein_quadratisches_gitter_aus_mindestens_21_zeilen() {
        let matrix = qr_matrix("BCD\n002\n1\nSCT\n\nTest\nDE89370400440532013000\nEUR25.50\n\n\n").unwrap();
        assert!(matrix.len() >= 21, "QR-Version 1 hat mindestens 21 Module Breite");
        for zeile in &matrix {
            assert_eq!(zeile.len(), matrix.len(), "Gitter ist nicht quadratisch");
        }
        assert!(matrix.iter().flatten().any(|&dunkel| dunkel), "Gitter ist komplett leer");
    }

    #[test]
    fn qr_matrix_ist_fuer_dieselbe_eingabe_deterministisch() {
        let a = qr_matrix("BCD\n002\n1\nSCT\n\nTest\nDE89370400440532013000\n\n\n\n").unwrap();
        let b = qr_matrix("BCD\n002\n1\nSCT\n\nTest\nDE89370400440532013000\n\n\n\n").unwrap();
        assert_eq!(a, b);
    }

    /// Rundtrip statt Scanner: Da kein QR-Lesegerät in der CI verfügbar ist,
    /// beweist dieser Test die Struktur der Nutzlast, indem er sie wieder in
    /// ihre Felder zerlegt — genau wie eine Bank-App es täte.
    #[test]
    fn epc_payload_laesst_sich_wieder_in_seine_felder_zerlegen() {
        let payload = epc_payload("Meine Firma", "DE02120300000000202051", "BYLADEM1001", Some(9500), "Rechnung RE-2026-0001");
        let zeilen: Vec<&str> = payload.split('\n').collect();
        assert_eq!(zeilen[0], "BCD");
        assert_eq!(zeilen[1], "002");
        assert_eq!(zeilen[2], "1");
        assert_eq!(zeilen[3], "SCT");
        assert_eq!(zeilen[4], "BYLADEM1001");
        assert_eq!(zeilen[5], "Meine Firma");
        assert_eq!(zeilen[6], "DE02120300000000202051");
        assert_eq!(zeilen[7], "EUR95.00");
        assert_eq!(zeilen[8], "");
        assert_eq!(zeilen[9], "");
        assert_eq!(zeilen[10], "Rechnung RE-2026-0001");
    }
}
