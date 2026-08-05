//! Umsatzsteuer aus Bruttobeträgen herausrechnen.
//!
//! Die Anwendung speichert ausschließlich Bruttopreise — der Kunde zahlt
//! nach dem Wechsel zur Regelbesteuerung denselben Betrag wie vorher. Netto
//! und Steuer sind daher abgeleitete Größen. Dieses Modul ist die einzige
//! Stelle, die diese Ableitung rechnet: `vorschau.rs` hatte zeitweise eine
//! eigene, abweichende Rundung — genau solcher Drift zwischen Anzeige und
//! Export soll hier nicht wieder entstehen.
//!
//! Gerundet wird symmetrisch (kaufmännisch, weg von null), damit ein Storno
//! mit negierten Beträgen exakt die negierte Aufschlüsselung des
//! Ursprungsbelegs ergibt.

use serde::Serialize;

/// Eine Zeile der Steueraufschlüsselung: alle Positionen eines Steuersatzes
/// zusammengefasst. Es gilt immer `netto_cent + ust_cent == brutto_cent`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SteuerZeile {
    pub satz_prozent: i64,
    pub netto_cent: i64,
    pub ust_cent: i64,
    pub brutto_cent: i64,
}

/// Kaufmännisch gerundete Division, weg von null. `f64` wäre naheliegender,
/// verliert aber bei großen Cent-Beträgen Präzision — hier bleibt alles
/// ganzzahlig.
fn runde_division(zaehler: i128, nenner: i128) -> i64 {
    debug_assert!(nenner > 0);
    let vorzeichen: i128 = if zaehler < 0 { -1 } else { 1 };
    ((2 * zaehler + vorzeichen * nenner) / (2 * nenner)) as i64
}

/// Die im Bruttobetrag enthaltene Umsatzsteuer: `round(brutto · s / (100 + s))`.
pub fn ust_aus_brutto(brutto_cent: i64, satz_prozent: i64) -> i64 {
    if satz_prozent == 0 {
        return 0;
    }
    runde_division(
        i128::from(brutto_cent) * i128::from(satz_prozent),
        i128::from(100 + satz_prozent),
    )
}

/// Gruppiert Positionen (Steuersatz, Bruttobetrag) je Satz und rechnet die
/// Steuer **auf der Gruppensumme** heraus — nicht je Position einzeln, denn
/// die Summe einzeln gerundeter Beträge wiche um bis zu einen halben Cent je
/// Position von der Gruppenrundung ab. So gilt exakt:
/// `Σ (netto + ust) = Σ brutto = beleg.summe_cent`.
///
/// Sortiert absteigend nach Satz (19, 7, 0), damit die Reihenfolge auf
/// Dokumenten stabil ist.
pub fn aufschluesselung(positionen: &[(i64, i64)]) -> Vec<SteuerZeile> {
    let mut saetze: Vec<i64> = positionen.iter().map(|(satz, _)| *satz).collect();
    saetze.sort_unstable_by(|a, b| b.cmp(a));
    saetze.dedup();

    saetze
        .into_iter()
        .map(|satz| {
            let brutto: i64 = positionen
                .iter()
                .filter(|(s, _)| *s == satz)
                .map(|(_, betrag)| betrag)
                .sum();
            let ust = ust_aus_brutto(brutto, satz);
            SteuerZeile { satz_prozent: satz, netto_cent: brutto - ust, ust_cent: ust, brutto_cent: brutto }
        })
        .collect()
}

/// Nettobetrag je Position, für die XRechnung (BT-131): Dort muss die Summe
/// der Positionsnetti eines Satzes **exakt** dem Gruppennetto entsprechen
/// (BR-45, BR-CO-10) — einzeln gerundete Netti verfehlen das um Rest-Cents.
///
/// Die Differenz wird cent-weise über die Positionen verteilt, betragsgrößte
/// zuerst (dort fällt ein Cent relativ am wenigsten auf). Nicht alles auf
/// eine Position: Der Rest wächst mit der Positionszahl, und viele kleine
/// Beträge könnten einer einzelnen Position sonst ein negatives Netto
/// eintragen (13 × 0,01 € bei 19 %: Rest −2 ct auf 1 ct Netto).
pub fn positions_netti(positionen: &[(i64, i64)]) -> Vec<i64> {
    let mut netti: Vec<i64> = positionen
        .iter()
        .map(|(satz, brutto)| brutto - ust_aus_brutto(*brutto, *satz))
        .collect();

    for zeile in aufschluesselung(positionen) {
        let mut indizes: Vec<usize> = positionen
            .iter()
            .enumerate()
            .filter(|(_, (s, _))| *s == zeile.satz_prozent)
            .map(|(i, _)| i)
            .collect();
        indizes.sort_by_key(|&i| std::cmp::Reverse(positionen[i].1.abs()));
        let summe: i64 = indizes.iter().map(|&i| netti[i]).sum();
        let rest = zeile.netto_cent - summe;
        // |rest| ≤ Positionen/2 (je Position höchstens ein halber Cent
        // Rundungsfehler) — reihum reicht also höchstens ein Cent je Position.
        let schritt = if rest > 0 { 1 } else { -1 };
        for n in 0..rest.unsigned_abs() as usize {
            netti[indizes[n % indizes.len()]] += schritt;
        }
    }
    netti
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn beispiel_des_nutzers_95_euro_brutto_bei_19_prozent() {
        // 95,00 € brutto → 15,17 € USt, 79,83 € netto.
        let zeilen = aufschluesselung(&[(19, 9500)]);
        assert_eq!(zeilen, vec![SteuerZeile { satz_prozent: 19, netto_cent: 7983, ust_cent: 1517, brutto_cent: 9500 }]);
    }

    #[test]
    fn gruppiert_je_satz_und_sortiert_absteigend() {
        let zeilen = aufschluesselung(&[(7, 1070), (19, 1190), (0, 500), (19, 2380)]);
        assert_eq!(
            zeilen,
            vec![
                SteuerZeile { satz_prozent: 19, netto_cent: 3000, ust_cent: 570, brutto_cent: 3570 },
                SteuerZeile { satz_prozent: 7, netto_cent: 1000, ust_cent: 70, brutto_cent: 1070 },
                SteuerZeile { satz_prozent: 0, netto_cent: 500, ust_cent: 0, brutto_cent: 500 },
            ]
        );
    }

    #[test]
    fn invariante_netto_plus_ust_gleich_brutto_fuer_jeden_betrag() {
        // Sweep statt Stichproben: Rundungsfehler zeigen sich an einzelnen
        // Beträgen, nicht an runden Beispielen.
        for brutto in 1..=1_000_000_i64 {
            for satz in [7_i64, 19] {
                let ust = ust_aus_brutto(brutto, satz);
                let netto = brutto - ust;
                assert_eq!(netto + ust, brutto);
                // Die Abweichung von der exakten Steuer bleibt unter einem
                // halben Cent — mehr ließe die BR-CO-17-Toleranz (±0,01 €)
                // der XRechnung reißen.
                let exakt = brutto as f64 * satz as f64 / (100.0 + satz as f64);
                assert!((ust as f64 - exakt).abs() <= 0.5, "brutto={brutto} satz={satz}");
            }
        }
    }

    #[test]
    fn storno_ist_exakt_die_negierte_aufschluesselung() {
        // Symmetrische Rundung: Bei „round half up" wiche z. B. die Hälfte
        // eines Cents im Storno um einen Cent ab — Ursprungsbeleg und Storno
        // höben sich dann nicht exakt auf.
        for brutto in [1_i64, 3, 9500, 12345, 99999] {
            for satz in [0_i64, 7, 19] {
                let plus = aufschluesselung(&[(satz, brutto)]);
                let minus = aufschluesselung(&[(satz, -brutto)]);
                assert_eq!(minus[0].ust_cent, -plus[0].ust_cent);
                assert_eq!(minus[0].netto_cent, -plus[0].netto_cent);
            }
        }
    }

    #[test]
    fn nullsatz_hat_keine_steuer() {
        let zeilen = aufschluesselung(&[(0, 12345)]);
        assert_eq!(zeilen, vec![SteuerZeile { satz_prozent: 0, netto_cent: 12345, ust_cent: 0, brutto_cent: 12345 }]);
    }

    #[test]
    fn leere_positionsliste_ergibt_keine_zeilen() {
        assert!(aufschluesselung(&[]).is_empty());
    }

    #[test]
    fn positions_netti_summieren_exakt_auf_das_gruppennetto() {
        // Drei 19-%-Positionen zu je 1,00 € brutto: einzeln gerundet je 84 ct
        // netto (252 ct), Gruppennetto von 3,00 € ist aber 252 ct — hier
        // zufällig gleich; 0,05 € erzeugt dagegen Rest-Cents. Der Test prüft
        // die Invariante über viele unrunde Kombinationen.
        let faelle: &[&[(i64, i64)]] = &[
            &[(19, 100), (19, 100), (19, 100)],
            &[(19, 5), (19, 5), (19, 5), (19, 5)],
            &[(19, 333), (7, 333), (19, 334), (0, 100)],
            &[(19, 9999), (19, 1), (7, 12345)],
        ];
        for positionen in faelle {
            let netti = positions_netti(positionen);
            for zeile in aufschluesselung(positionen) {
                let summe: i64 = positionen
                    .iter()
                    .zip(&netti)
                    .filter(|((s, _), _)| *s == zeile.satz_prozent)
                    .map(|(_, n)| n)
                    .sum();
                assert_eq!(summe, zeile.netto_cent, "satz={} in {positionen:?}", zeile.satz_prozent);
            }
        }
    }

    #[test]
    fn rest_cent_landet_auf_der_betragsgroessten_position() {
        // 4 × 0,05 € bei 19 %: einzeln je 4 ct netto (16 ct), Gruppennetto
        // von 20 ct ist 17 ct — 1 Rest-Cent auf die erste (bei Gleichstand
        // stabil sortierte) Position.
        let positionen = [(19, 5), (19, 5), (19, 5), (19, 5)];
        let netti = positions_netti(&positionen);
        assert_eq!(netti.iter().sum::<i64>(), 17);
        assert_eq!(netti, vec![5, 4, 4, 4]);
    }

    #[test]
    fn rest_cent_verteilung_macht_kein_positionsnetto_negativ() {
        // 13 × 0,01 € bei 19 %: Einzelnetti je 1 ct (Σ 13), Gruppennetto 11 —
        // Rest −2. Alles auf eine Position ergäbe dort −1 ct; verteilt gehen
        // zwei Positionen auf 0.
        let positionen: Vec<(i64, i64)> = std::iter::repeat_n((19_i64, 1_i64), 13).collect();
        let netti = positions_netti(&positionen);
        assert_eq!(netti.iter().sum::<i64>(), 11);
        assert!(netti.iter().all(|&n| n >= 0), "negatives Positionsnetto: {netti:?}");

        // Gegenrichtung: 10 × 0,04 € bei 19 % hat Rest +4 — verteilt bleibt
        // jedes Netto höchstens einen Cent über dem einzeln gerundeten Wert.
        let positionen: Vec<(i64, i64)> = std::iter::repeat_n((19_i64, 4_i64), 10).collect();
        let netti = positions_netti(&positionen);
        assert_eq!(netti.iter().sum::<i64>(), 34);
        assert!(netti.iter().all(|&n| n <= 4), "Positionsnetto über Brutto: {netti:?}");
    }
}
