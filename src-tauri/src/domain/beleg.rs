use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};

/// Kaufmännische Rundung (round half up) einer Positionssumme. `menge_x1000`
/// ist die Menge mit Faktor 1000 (2,5 Stück = 2500), `einzelpreis_cent` der
/// Einzelpreis in Cent. Rückgabe: gerundete Cent.
pub fn positionssumme_cent(menge_x1000: i64, einzelpreis_cent: i64) -> AppResult<i64> {
    if menge_x1000 <= 0 {
        return Err(AppError::Validation {
            feld: "menge".into(),
            meldung: "Menge muss größer als 0 sein".into(),
        });
    }
    if einzelpreis_cent < 0 {
        return Err(AppError::Validation {
            feld: "einzelpreis_cent".into(),
            meldung: "Einzelpreis darf nicht negativ sein".into(),
        });
    }
    let rohprodukt = menge_x1000 * einzelpreis_cent; // Cent * 1000
    Ok((rohprodukt + 500) / 1000)
}

/// Belegsumme = Summe der bereits gerundeten Positionssummen (keine erneute Rundung).
pub fn belegsumme_cent(positionssummen: &[i64]) -> i64 {
    positionssummen.iter().sum()
}

/// Zahlungslage einer gestellten Rechnung.
///
/// Bewusst **abgeleitet** statt in der Datenbank geführt: Zahlungen sind eigene
/// Datensätze, und ein gespeicherter Status müsste bei jeder Erfassung,
/// Korrektur und Löschung mitgezogen werden. Jede vergessene Stelle erzeugte
/// dann eine Rechnung, die als bezahlt gilt, ohne es zu sein. Abgeleitet kann
/// das nicht auseinanderlaufen.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Zahlungsstand {
    /// Noch keine Zahlung eingegangen.
    Offen,
    /// Teilweise bezahlt, es steht noch etwas aus.
    Teilbezahlt,
    /// Vollständig ausgeglichen.
    Bezahlt,
    /// Es ging mehr ein als gefordert — wird angezeigt, aber nicht verhindert.
    Ueberzahlt,
}

/// Leitet die Zahlungslage aus Rechnungssumme und Summe der Zahlungen ab.
///
/// Bei Stornobelegen ist die Summe negativ; dann dreht sich die Betrachtung um,
/// denn eine „Zahlung" ist dort eine Erstattung.
pub fn zahlungsstand(summe_cent: i64, bezahlt_cent: i64) -> Zahlungsstand {
    if summe_cent == 0 {
        return if bezahlt_cent == 0 { Zahlungsstand::Bezahlt } else { Zahlungsstand::Ueberzahlt };
    }
    let offen = summe_cent - bezahlt_cent;
    // Vorzeichen der Restforderung mit dem der Summe vergleichen: Bei einer
    // Gutschrift über -100 € bedeutet eine Erstattung von -100 € „erledigt".
    let gleiches_vorzeichen = (offen > 0) == (summe_cent > 0);
    if offen == 0 {
        Zahlungsstand::Bezahlt
    } else if !gleiches_vorzeichen {
        Zahlungsstand::Ueberzahlt
    } else if bezahlt_cent == 0 {
        Zahlungsstand::Offen
    } else {
        Zahlungsstand::Teilbezahlt
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zahlungsstand_deckt_die_normalfaelle_ab() {
        assert_eq!(zahlungsstand(10000, 0), Zahlungsstand::Offen);
        assert_eq!(zahlungsstand(10000, 4000), Zahlungsstand::Teilbezahlt);
        assert_eq!(zahlungsstand(10000, 10000), Zahlungsstand::Bezahlt);
        assert_eq!(zahlungsstand(10000, 12000), Zahlungsstand::Ueberzahlt);
    }

    /// Bei einem Stornobeleg ist die Summe negativ und eine „Zahlung" eine
    /// Erstattung. Ohne Vorzeichenbetrachtung gälte ein unerstatteter Storno
    /// fälschlich als überzahlt.
    #[test]
    fn zahlungsstand_beruecksichtigt_gutschriften() {
        assert_eq!(zahlungsstand(-10000, 0), Zahlungsstand::Offen);
        assert_eq!(zahlungsstand(-10000, -4000), Zahlungsstand::Teilbezahlt);
        assert_eq!(zahlungsstand(-10000, -10000), Zahlungsstand::Bezahlt);
        assert_eq!(zahlungsstand(-10000, -12000), Zahlungsstand::Ueberzahlt);
    }

    #[test]
    fn zahlungsstand_bei_nullsumme() {
        assert_eq!(zahlungsstand(0, 0), Zahlungsstand::Bezahlt);
        assert_eq!(zahlungsstand(0, 500), Zahlungsstand::Ueberzahlt);
    }

    #[test]
    fn rundet_kaufmaennisch_auf_und_ab() {
        assert_eq!(positionssumme_cent(1000, 9500).unwrap(), 9500); // 1 * 95,00 €
        assert_eq!(positionssumme_cent(2500, 9500).unwrap(), 23750); // 2,5 * 95,00 € = 237,50 €
        assert_eq!(positionssumme_cent(1333, 1000).unwrap(), 1333); // 1,333 * 10,00 € = 13,33 € (exakt)
        assert_eq!(positionssumme_cent(1, 5).unwrap(), 0); // 0,001 * 0,05 € = 0,00005 € -> 0 Cent
        assert_eq!(positionssumme_cent(500, 1).unwrap(), 1); // 0,5 * 0,01 € = 0,005 € -> rundet kaufmännisch auf 1 Cent
    }

    #[test]
    fn lehnt_ungueltige_menge_und_preis_ab() {
        assert!(positionssumme_cent(0, 100).is_err());
        assert!(positionssumme_cent(1000, -1).is_err());
    }

    #[test]
    fn belegsumme_summiert_positionen() {
        assert_eq!(belegsumme_cent(&[100, 250, 50]), 400);
        assert_eq!(belegsumme_cent(&[]), 0);
    }
}
