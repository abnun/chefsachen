pub mod eingangsrechnung_parse;
pub mod export;
pub mod kontext;
/// Nur für Tests: ruft den amtlichen KoSIT-Validator auf. Gehört nicht in den
/// Auslieferungsbau — die App validiert nicht, sie erzeugt.
#[cfg(test)]
pub mod kosit;
/// Nur für Tests: prüft erzeugte PDFs mit veraPDF gegen die PDF/A-Regeln.
#[cfg(test)]
pub mod verapdf;
pub mod pdf;
pub mod vorlage;
pub mod vorschau;
pub mod xrechnung;
pub mod zugferd;

/// Die Zahlungsbedingung als Satz.
///
/// Steht hier und nicht zweimal: Die PDF und die XRechnung nannten dasselbe
/// unterschiedlich — die eine „Zahlbar bis 17.08.2026 (14 Tage)", die andere
/// „Zahlbar innerhalb von 14 Tagen". Zwei Formulierungen desselben Sachverhalts
/// laufen auseinander, sobald eine davon angefasst wird.
///
/// Ein Zahlungsziel von null Tagen heißt „sofort". Vorher stand dort „Zahlbar
/// bis <Belegdatum> (0 Tage)" — sachlich richtig und trotzdem unbrauchbar.
///
/// Bewusst abgeleitet und nicht als freies Textfeld: Derselbe Wert bestimmt
/// auch das Fälligkeitsdatum der XRechnung (BT-9) und die Berechnung offener
/// Posten. Ein Satz, der „30 Tage" verspricht, während im Feld 14 steht, wäre
/// ein Widerspruch im selben Dokument — maschinenlesbar das eine, lesbar das
/// andere.
pub fn zahlungsbedingung(datum_iso: &str, zahlungsziel_tage: i64) -> String {
    if zahlungsziel_tage <= 0 {
        return "Zahlbar sofort ohne Abzug.".into();
    }
    let tage = zahlungsziel_tage;
    match faelligkeitsdatum_deutsch(datum_iso, tage) {
        // Ohne lesbares Belegdatum bleibt die Tagesangabe — besser als nichts.
        None => format!("Zahlbar ohne Abzug innerhalb von {tage} Tagen."),
        Some(datum) => format!("Zahlbar ohne Abzug bis zum {datum} ({tage} Tage)."),
    }
}

/// Fälligkeitsdatum als `TT.MM.JJJJ`, oder `None` bei unlesbarem Belegdatum.
pub fn faelligkeitsdatum_deutsch(datum_iso: &str, zahlungsziel_tage: i64) -> Option<String> {
    chrono::NaiveDate::parse_from_str(datum_iso, "%Y-%m-%d")
        .ok()
        .and_then(|d| d.checked_add_signed(chrono::Duration::days(zahlungsziel_tage)))
        .map(|d| d.format("%d.%m.%Y").to_string())
}

#[cfg(test)]
mod zahlungsbedingung_tests {
    use super::*;

    #[test]
    fn null_tage_heissen_sofort() {
        // Vorher: „Zahlbar bis 10.07.2026 (0 Tage)".
        assert_eq!(zahlungsbedingung("2026-07-10", 0), "Zahlbar sofort ohne Abzug.");
    }

    #[test]
    fn nennt_das_datum_statt_den_empfaenger_rechnen_zu_lassen() {
        assert_eq!(
            zahlungsbedingung("2026-07-10", 14),
            "Zahlbar ohne Abzug bis zum 24.07.2026 (14 Tage)."
        );
    }

    #[test]
    fn faellt_ohne_lesbares_datum_auf_die_tagesangabe_zurueck() {
        assert_eq!(
            zahlungsbedingung("kein datum", 14),
            "Zahlbar ohne Abzug innerhalb von 14 Tagen."
        );
    }

    #[test]
    fn behandelt_einen_unsinnigen_negativwert_wie_sofort() {
        // Die Validierung lässt ihn nicht zu; käme er doch einmal durch, wäre
        // ein Fälligkeitsdatum in der Vergangenheit die schlechtere Antwort.
        assert_eq!(zahlungsbedingung("2026-07-10", -5), "Zahlbar sofort ohne Abzug.");
    }
}
