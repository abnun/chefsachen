use crate::error::{AppError, AppResult};

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

#[cfg(test)]
mod tests {
    use super::*;

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
