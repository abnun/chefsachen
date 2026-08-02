//! Prüfung von IBAN und BIC.
//!
//! Eine falsche IBAN fällt sonst erst auf, wenn der Kunde nicht zahlen kann —
//! oder gar nicht: Der amtliche XRechnung-Validator lehnt ein Dokument bereits
//! bei einer syntaktisch falschen IBAN ab (Regel BR-DE-19). Aufgefallen ist das
//! nicht in der Theorie, sondern an eigenen Testdaten.
//!
//! Geprüft wird die Form und die Prüfsumme nach ISO 13616 (Modulo-97-10). Das
//! erkennt Tipp- und Zahlendreher zuverlässig, sagt aber nichts darüber, ob das
//! Konto existiert.

use crate::error::{AppError, AppResult};

/// Entfernt Leerzeichen und vereinheitlicht auf Großbuchstaben.
pub fn normalisieren(eingabe: &str) -> String {
    eingabe.chars().filter(|c| !c.is_whitespace()).collect::<String>().to_uppercase()
}

/// Prüft eine IBAN auf Form und Prüfsumme.
///
/// Ein leeres Feld gilt als gültig — die Bankverbindung ist nicht überall
/// Pflicht, und ein leeres Feld ist keine falsche Angabe.
pub fn pruefe_iban(eingabe: &str) -> AppResult<()> {
    let iban = normalisieren(eingabe);
    if iban.is_empty() {
        return Ok(());
    }
    let fehler = |meldung: &str| {
        Err(AppError::Validation { feld: "iban".into(), meldung: meldung.into() })
    };

    // ISO 13616: 2 Buchstaben Ländercode, 2 Ziffern Prüfsumme, dann bis zu
    // 30 alphanumerische Zeichen.
    if iban.len() < 15 || iban.len() > 34 {
        return fehler("IBAN hat eine unübliche Länge — bitte prüfen.");
    }
    if !iban[..2].chars().all(|c| c.is_ascii_alphabetic()) {
        return fehler("Die IBAN muss mit einem Ländercode aus zwei Buchstaben beginnen.");
    }
    if !iban[2..4].chars().all(|c| c.is_ascii_digit()) {
        return fehler("Nach dem Ländercode müssen zwei Prüfziffern folgen.");
    }
    if !iban.chars().all(|c| c.is_ascii_alphanumeric()) {
        return fehler("Die IBAN darf nur Buchstaben und Ziffern enthalten.");
    }
    if !pruefsumme_stimmt(&iban) {
        return fehler(
            "Die Prüfsumme der IBAN stimmt nicht — vermutlich ein Tippfehler oder Zahlendreher.",
        );
    }
    Ok(())
}

/// Modulo-97-10 nach ISO 7064: Die ersten vier Zeichen wandern ans Ende,
/// Buchstaben werden zu Zahlen (A=10 … Z=35), der Rest durch 97 muss 1 sein.
fn pruefsumme_stimmt(iban: &str) -> bool {
    let umgestellt: String = format!("{}{}", &iban[4..], &iban[..4]);
    let mut rest: u32 = 0;
    for c in umgestellt.chars() {
        let wert = if c.is_ascii_digit() {
            c as u32 - '0' as u32
        } else {
            c as u32 - 'A' as u32 + 10
        };
        // Zweistellige Werte in zwei Schritten verarbeiten, damit rest klein bleibt.
        rest = if wert < 10 { rest * 10 + wert } else { (rest * 100 + wert) % 97 };
        rest %= 97;
    }
    rest == 1
}

/// Prüft einen BIC auf seine Form (ISO 9362): 8 oder 11 Stellen.
///
/// Eine Prüfsumme gibt es beim BIC nicht; mehr als die Form lässt sich ohne
/// Verzeichnis nicht feststellen.
pub fn pruefe_bic(eingabe: &str) -> AppResult<()> {
    let bic = normalisieren(eingabe);
    if bic.is_empty() {
        return Ok(());
    }
    let fehler = |meldung: &str| {
        Err(AppError::Validation { feld: "bic".into(), meldung: meldung.into() })
    };
    if bic.len() != 8 && bic.len() != 11 {
        return fehler("Ein BIC besteht aus 8 oder 11 Zeichen.");
    }
    if !bic.chars().all(|c| c.is_ascii_alphanumeric()) {
        return fehler("Der BIC darf nur Buchstaben und Ziffern enthalten.");
    }
    if !bic[..4].chars().all(|c| c.is_ascii_alphabetic()) {
        return fehler("Die ersten vier Zeichen eines BIC sind der Bankcode aus Buchstaben.");
    }
    if !bic[4..6].chars().all(|c| c.is_ascii_alphabetic()) {
        return fehler("An Position 5 und 6 steht der Ländercode aus zwei Buchstaben.");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gueltige_ibans_werden_angenommen() {
        // Offizielle Beispiel-IBANs verschiedener Länder.
        for iban in [
            "DE02120300000000202051",
            "DE02 1203 0000 0000 2020 51",
            "de02120300000000202051",
            "AT611904300234573201",
            "CH9300762011623852957",
            "GB33BUKB20201555555555",
        ] {
            assert!(pruefe_iban(iban).is_ok(), "{iban} sollte gültig sein");
        }
    }

    /// Ein leeres Feld ist keine falsche Angabe — die Bankverbindung ist nicht
    /// überall Pflicht.
    #[test]
    fn leere_eingabe_ist_zulaessig() {
        assert!(pruefe_iban("").is_ok());
        assert!(pruefe_iban("   ").is_ok());
        assert!(pruefe_bic("").is_ok());
    }

    /// Der häufigste Fehler in der Praxis: ein Zahlendreher.
    #[test]
    fn zahlendreher_wird_erkannt() {
        // Zwei Ziffern vertauscht gegenüber der gültigen IBAN oben.
        let err = pruefe_iban("DE02120300000000202015").unwrap_err();
        assert!(matches!(&err, AppError::Validation { feld, .. } if feld == "iban"));
        let AppError::Validation { meldung, .. } = &err else { unreachable!() };
        assert!(meldung.contains("Prüfsumme"), "war: {meldung}");
    }

    #[test]
    fn formfehler_werden_einzeln_benannt() {
        let faelle = [
            ("DE0212", "Länge"),
            ("1202120300000000202051", "Ländercode"),
            ("DEXX120300000000202051", "Prüfziffern"),
            ("DE02-1203-0000-0000-2020", "Buchstaben und Ziffern"),
        ];
        for (eingabe, erwartet) in faelle {
            let err = pruefe_iban(eingabe).unwrap_err();
            let AppError::Validation { meldung, .. } = &err else { unreachable!() };
            assert!(
                meldung.contains(erwartet),
                "für {eingabe:?} wurde {erwartet:?} erwartet, war: {meldung}"
            );
        }
    }

    #[test]
    fn gueltige_bics_werden_angenommen() {
        for bic in ["BYLADEM1001", "BYLADEM1", "byladem1001", "DEUTDEFF500"] {
            assert!(pruefe_bic(bic).is_ok(), "{bic} sollte gültig sein");
        }
    }

    #[test]
    fn fehlerhafte_bics_werden_abgelehnt() {
        for bic in ["ABC", "BYLADEM10011", "1YLADEM1001", "BYLA1EM1001"] {
            assert!(pruefe_bic(bic).is_err(), "{bic} sollte abgelehnt werden");
        }
    }
}
