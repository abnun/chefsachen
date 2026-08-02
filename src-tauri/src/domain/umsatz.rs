//! Umsatzgrenzen der Kleinunternehmerregelung nach § 19 UStG.
//!
//! Seit 2025 gelten zwei Grenzen nebeneinander:
//!
//! * **25.000 € im vorangegangenen Kalenderjahr.** Wird sie überschritten,
//!   entfällt die Kleinunternehmerregelung für das gesamte Folgejahr.
//! * **100.000 € im laufenden Kalenderjahr.** Ihre Überschreitung beendet den
//!   Status sofort — nicht erst zum Jahreswechsel.
//!
//! Bemessungsgrundlage ist der nach **vereinnahmten** Entgelten bemessene
//! Gesamtumsatz (§ 19 Abs. 2 UStG). Maßgeblich ist also, wann Geld geflossen
//! ist, nicht wann eine Rechnung gestellt wurde. Erstattungen sind negative
//! Zahlungen und mindern den Umsatz entsprechend.
//!
//! **Sonderfall Gründungsjahr:** Wer neu gründet, hat kein Vorjahr. Dann tritt
//! die 25.000-€-Grenze an die Stelle der 100.000-€-Grenze und gilt bereits für
//! das laufende Jahr; ihre Überschreitung beendet den Status sofort. Ohne diese
//! Unterscheidung wäre ein Gründer, der 30.000 € umsetzt, fälschlich noch
//! Kleinunternehmer.
//!
//! Dieses Modul rechnet und bewertet nur; das Beschaffen der Zahlungen ist
//! Aufgabe der aufrufenden Schicht. Die Trennung hält die Rechenregeln ohne
//! Datenbank prüfbar.

// Beträge werden als `25_000_00` geschrieben: die letzten beiden Ziffern sind
// die Cent, davor die Euro mit Tausendertrennung. Clippys Vorschlag `2_500_000`
// wäre gleichmäßiger gruppiert, aber im Geldkontext deutlich schwerer zu lesen.
#![allow(clippy::inconsistent_digit_grouping)]


use serde::Serialize;

/// Umsatzgrenze des vorangegangenen Kalenderjahres (§ 19 Abs. 1 UStG).
pub const GRENZE_VORJAHR_CENT: i64 = 25_000_00;

/// Umsatzgrenze des laufenden Kalenderjahres (§ 19 Abs. 1 UStG).
pub const GRENZE_LAUFENDES_JAHR_CENT: i64 = 100_000_00;

/// Ab diesem Anteil an der Grenze wird gewarnt. Die Spezifikation verlangt eine
/// deutliche Warnung bereits ab 80 %, damit noch Zeit zum Reagieren bleibt.
const SCHWELLE_ANNAEHERUNG_PROZENT: i64 = 80;
const SCHWELLE_KRITISCH_PROZENT: i64 = 95;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Warnstufe {
    Keine,
    Annaeherung,
    Kritisch,
    Ueberschritten,
}

/// Bewertet einen Umsatz im Verhältnis zu seiner Grenze.
///
/// „Überschritten" bedeutet echtes Übersteigen: Ein Umsatz von genau 25.000 €
/// hält die Grenze ein, das Gesetz spricht von „nicht überschreiten".
pub fn warnstufe(umsatz_cent: i64, grenze_cent: i64) -> Warnstufe {
    if grenze_cent <= 0 {
        return Warnstufe::Keine;
    }
    if umsatz_cent > grenze_cent {
        return Warnstufe::Ueberschritten;
    }
    let prozent = anteil_prozent(umsatz_cent, grenze_cent);
    if prozent >= SCHWELLE_KRITISCH_PROZENT {
        Warnstufe::Kritisch
    } else if prozent >= SCHWELLE_ANNAEHERUNG_PROZENT {
        Warnstufe::Annaeherung
    } else {
        Warnstufe::Keine
    }
}

/// Anteil des Umsatzes an der Grenze in Prozent, abgerundet und bei 0 beginnend.
///
/// Ein negativer Umsatz (mehr erstattet als vereinnahmt) ergibt 0 % statt eines
/// negativen Werts — für einen Fortschrittsbalken wäre alles andere sinnlos.
pub fn anteil_prozent(umsatz_cent: i64, grenze_cent: i64) -> i64 {
    if grenze_cent <= 0 || umsatz_cent <= 0 {
        return 0;
    }
    umsatz_cent.saturating_mul(100) / grenze_cent
}

/// Die für das laufende Jahr maßgebliche Obergrenze.
///
/// Im Regelfall 100.000 €. Im Gründungsjahr gibt es kein Vorjahr, an dem die
/// 25.000-€-Grenze ansetzen könnte — sie gilt dann unmittelbar für das laufende
/// Jahr.
pub fn grenze_laufendes_jahr_cent(ist_gruendungsjahr: bool) -> i64 {
    if ist_gruendungsjahr {
        GRENZE_VORJAHR_CENT
    } else {
        GRENZE_LAUFENDES_JAHR_CENT
    }
}

/// Ergebnis der Statusprüfung für das laufende Jahr.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Statusbefund {
    /// Die Kleinunternehmerregelung ist anwendbar.
    Gegeben,
    /// Der Vorjahresumsatz überschritt 25.000 € — die Regelung entfällt für das
    /// gesamte laufende Jahr.
    EntfallenWegenVorjahr,
    /// Der laufende Umsatz überschritt 100.000 € — die Regelung endet sofort,
    /// nicht erst zum Jahreswechsel.
    EntfallenWegenLaufendemJahr,
}

/// Prüft, ob die Kleinunternehmerregelung im laufenden Jahr noch greift.
///
/// Die Vorjahresgrenze wird zuerst geprüft: Sie entscheidet über das gesamte
/// Jahr, während die laufende Grenze erst ab ihrer Überschreitung wirkt. Im
/// Gründungsjahr entfällt die Vorjahresprüfung, und für das laufende Jahr gilt
/// die niedrigere Grenze (siehe `grenze_laufendes_jahr_cent`).
pub fn statusbefund(
    umsatz_vorjahr_cent: i64,
    umsatz_laufend_cent: i64,
    ist_gruendungsjahr: bool,
) -> Statusbefund {
    if !ist_gruendungsjahr && umsatz_vorjahr_cent > GRENZE_VORJAHR_CENT {
        Statusbefund::EntfallenWegenVorjahr
    } else if umsatz_laufend_cent > grenze_laufendes_jahr_cent(ist_gruendungsjahr) {
        Statusbefund::EntfallenWegenLaufendemJahr
    } else {
        Statusbefund::Gegeben
    }
}

/// Ein Hinweis zur Lage samt seiner Folgen.
///
/// Die reine Zahl hilft niemandem: Entscheidend ist, was aus dem Über- oder
/// Unterschreiten einer Grenze folgt und was jetzt zu tun ist. Diese Texte
/// gehören deshalb in die Domäne und nicht in die Oberfläche — dort wären sie
/// nicht prüfbar und würden mit der Rechenlogik auseinanderlaufen.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Hinweis {
    pub stufe: Warnstufe,
    /// Worum es geht, in einem Satz.
    pub titel: String,
    /// Was das konkret bedeutet.
    pub bedeutung: String,
    /// Was daraus zu tun ist.
    pub handlung: String,
}

/// Leitet aus der Umsatzlage die Hinweise ab, die den Nutzer wirklich betreffen.
///
/// Die Reihenfolge ist absteigend nach Dringlichkeit: bereits eingetretene
/// Folgen vor drohenden.
pub fn hinweise(
    umsatz_vorjahr_cent: i64,
    umsatz_laufend_cent: i64,
    ist_gruendungsjahr: bool,
) -> Vec<Hinweis> {
    let mut liste = Vec::new();
    let grenze_laufend = grenze_laufendes_jahr_cent(ist_gruendungsjahr);

    match statusbefund(umsatz_vorjahr_cent, umsatz_laufend_cent, ist_gruendungsjahr) {
        Statusbefund::EntfallenWegenVorjahr => liste.push(Hinweis {
            stufe: Warnstufe::Ueberschritten,
            titel: "Die Kleinunternehmerregelung gilt in diesem Jahr nicht".into(),
            bedeutung: "Der Vorjahresumsatz lag über 25.000 €. Damit unterliegen alle Umsätze                         dieses Jahres der Regelbesteuerung — von Anfang an, nicht erst ab                         einem bestimmten Zeitpunkt."
                .into(),
            handlung: "Rechnungen müssen Umsatzsteuer ausweisen, und es sind                        Umsatzsteuer-Voranmeldungen abzugeben. Im Gegenzug ist der                        Vorsteuerabzug möglich. Stellen Sie die Firmendaten auf                        Regelbesteuerung um und sprechen Sie die Umstellung mit Ihrer                        Steuerberatung ab."
                .into(),
        }),
        Statusbefund::EntfallenWegenLaufendemJahr => liste.push(Hinweis {
            stufe: Warnstufe::Ueberschritten,
            titel: "Die Kleinunternehmerregelung ist unterjährig entfallen".into(),
            bedeutung: format!(
                "Der Umsatz dieses Jahres hat {} überschritten. Der Status endet nicht erst                  zum Jahreswechsel, sondern mit dem Umsatz, der die Grenze reißt: Ab diesem                  Umsatz fällt Umsatzsteuer an, die davor liegenden bleiben steuerfrei.",
                euro(grenze_laufend)
            ),
            handlung: "Ab sofort Umsatzsteuer in Rechnung stellen und die Umstellung mit                        Ihrer Steuerberatung klären. Bereits gestellte Rechnungen ohne                        Steuerausweis müssen unter Umständen berichtigt werden."
                .into(),
        }),
        Statusbefund::Gegeben => {
            // Drohende Folgen: erst die sofort wirkende Grenze, dann die fürs Folgejahr.
            let stufe_laufend = warnstufe(umsatz_laufend_cent, grenze_laufend);
            if stufe_laufend != Warnstufe::Keine {
                liste.push(Hinweis {
                    stufe: stufe_laufend,
                    titel: format!(
                        "Die {}-Grenze dieses Jahres rückt näher",
                        euro(grenze_laufend)
                    ),
                    bedeutung: "Wird sie überschritten, endet die Kleinunternehmerregelung                                 sofort — mit dem Umsatz, der die Grenze reißt, nicht erst im                                 nächsten Jahr."
                        .into(),
                    handlung: "Planen Sie die Umstellung auf Regelbesteuerung, bevor die                                Grenze fällt: Preise, Rechnungsvorlagen und Voranmeldungen                                brauchen Vorlauf."
                        .into(),
                });
            }

            // Die 25.000-€-Grenze des laufenden Jahres entscheidet über das Folgejahr.
            // Im Gründungsjahr ist sie bereits oben abgehandelt.
            if !ist_gruendungsjahr {
                let stufe_folgejahr = warnstufe(umsatz_laufend_cent, GRENZE_VORJAHR_CENT);
                if stufe_folgejahr != Warnstufe::Keine {
                    liste.push(Hinweis {
                        stufe: stufe_folgejahr,
                        titel: "Der Status im nächsten Jahr steht auf der Kippe".into(),
                        bedeutung: format!(
                            "Der Umsatz dieses Jahres nähert sich {} — dem Wert, an dem sich                              entscheidet, ob die Kleinunternehmerregelung im nächsten Jahr                              noch gilt. Überschreiten Sie ihn, entfällt sie für das gesamte                              Folgejahr.",
                            euro(GRENZE_VORJAHR_CENT)
                        ),
                        handlung: "Rechnen Sie durch, ob sich das Jahr noch unter der Grenze                                    halten lässt oder ob Sie für nächstes Jahr mit                                    Umsatzsteuer kalkulieren müssen."
                            .into(),
                    });
                }
            }
        }
    }
    liste
}

/// Formatiert einen Cent-Betrag als runde Euro-Angabe für Fließtext.
fn euro(cent: i64) -> String {
    let euro = cent / 100;
    let mut text = euro.to_string();
    // Tausenderpunkte von hinten einfügen.
    let mut i = text.len() as i64 - 3;
    while i > 0 {
        text.insert(i as usize, '.');
        i -= 3;
    }
    format!("{text} €")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn euro_setzt_tausenderpunkte() {
        assert_eq!(euro(25_000_00), "25.000 €");
        assert_eq!(euro(100_000_00), "100.000 €");
        assert_eq!(euro(900_00), "900 €");
    }

    #[test]
    fn ohne_annaeherung_gibt_es_keine_hinweise() {
        assert!(hinweise(10_000_00, 5_000_00, false).is_empty());
    }

    /// Der wichtigste Fall für die Planung: Der laufende Umsatz nähert sich der
    /// 25.000-€-Marke, die über das *nächste* Jahr entscheidet.
    #[test]
    fn annaeherung_an_die_folgejahresgrenze_wird_erklaert() {
        let h = hinweise(0, 21_000_00, false);
        assert_eq!(h.len(), 1);
        assert_eq!(h[0].stufe, Warnstufe::Annaeherung);
        assert!(h[0].titel.contains("nächsten Jahr"));
        assert!(h[0].bedeutung.contains("25.000 €"));
        assert!(!h[0].handlung.is_empty());
    }

    #[test]
    fn entfallener_status_wegen_vorjahr_nennt_die_folgen() {
        let h = hinweise(30_000_00, 0, false);
        assert_eq!(h.len(), 1);
        assert_eq!(h[0].stufe, Warnstufe::Ueberschritten);
        assert!(h[0].bedeutung.contains("Regelbesteuerung"));
        assert!(h[0].handlung.contains("Umsatzsteuer-Voranmeldungen")
            || h[0].handlung.contains("Voranmeldungen"));
    }

    /// Beim unterjährigen Wegfall ist entscheidend, dass frühere Umsätze
    /// steuerfrei bleiben — sonst rechnet der Nutzer das ganze Jahr neu.
    #[test]
    fn unterjaehriger_wegfall_erklaert_die_zeitliche_wirkung() {
        let h = hinweise(0, 100_000_01, false);
        assert_eq!(h.len(), 1);
        assert!(h[0].bedeutung.contains("steuerfrei"));
        assert!(h[0].bedeutung.contains("100.000 €"));
    }

    #[test]
    fn im_gruendungsjahr_nennt_der_hinweis_die_niedrigere_grenze() {
        let h = hinweise(0, 25_000_01, true);
        assert_eq!(h.len(), 1);
        assert!(h[0].bedeutung.contains("25.000 €"), "war: {}", h[0].bedeutung);
    }

    /// Im Gründungsjahr fallen beide Grenzen zusammen — der Nutzer soll nicht
    /// zweimal dasselbe lesen.
    #[test]
    fn im_gruendungsjahr_gibt_es_keinen_doppelten_hinweis() {
        let h = hinweise(0, 21_000_00, true);
        assert_eq!(h.len(), 1, "erwartet genau ein Hinweis, war: {h:?}");
    }

    #[test]
    fn warnstufe_meldet_erst_ab_achtzig_prozent() {
        let grenze = GRENZE_VORJAHR_CENT; // 25.000 €
        assert_eq!(warnstufe(0, grenze), Warnstufe::Keine);
        assert_eq!(warnstufe(19_999_00, grenze), Warnstufe::Keine); // 79,9 %
        assert_eq!(warnstufe(20_000_00, grenze), Warnstufe::Annaeherung); // exakt 80 %
        assert_eq!(warnstufe(23_749_00, grenze), Warnstufe::Annaeherung); // 94,9 %
        assert_eq!(warnstufe(23_750_00, grenze), Warnstufe::Kritisch); // exakt 95 %
    }

    /// Das Gesetz spricht von „nicht überschreiten" — der Grenzbetrag selbst ist
    /// also noch zulässig. Ein Cent darüber nicht mehr.
    #[test]
    fn grenzbetrag_gilt_als_eingehalten() {
        assert_eq!(warnstufe(GRENZE_VORJAHR_CENT, GRENZE_VORJAHR_CENT), Warnstufe::Kritisch);
        assert_eq!(warnstufe(GRENZE_VORJAHR_CENT + 1, GRENZE_VORJAHR_CENT), Warnstufe::Ueberschritten);
    }

    #[test]
    fn anteil_rechnet_prozente_und_faengt_sonderfaelle_ab() {
        assert_eq!(anteil_prozent(12_500_00, GRENZE_VORJAHR_CENT), 50);
        assert_eq!(anteil_prozent(GRENZE_VORJAHR_CENT, GRENZE_VORJAHR_CENT), 100);
        assert_eq!(anteil_prozent(50_000_00, GRENZE_VORJAHR_CENT), 200);
        // Mehr erstattet als vereinnahmt: kein negativer Fortschrittsbalken.
        assert_eq!(anteil_prozent(-100_00, GRENZE_VORJAHR_CENT), 0);
        assert_eq!(anteil_prozent(100_00, 0), 0);
    }

    #[test]
    fn anteil_laeuft_bei_sehr_grossen_betraegen_nicht_ueber() {
        assert_eq!(anteil_prozent(i64::MAX, GRENZE_VORJAHR_CENT), i64::MAX / GRENZE_VORJAHR_CENT);
    }

    #[test]
    fn status_ist_gegeben_wenn_beide_grenzen_eingehalten_sind() {
        assert_eq!(statusbefund(24_999_00, 99_999_00, false), Statusbefund::Gegeben);
        assert_eq!(
            statusbefund(GRENZE_VORJAHR_CENT, GRENZE_LAUFENDES_JAHR_CENT, false),
            Statusbefund::Gegeben,
            "die Grenzbeträge selbst sind noch zulässig"
        );
    }

    #[test]
    fn vorjahresgrenze_entscheidet_ueber_das_ganze_jahr() {
        assert_eq!(statusbefund(25_000_01, 0, false), Statusbefund::EntfallenWegenVorjahr);
    }

    #[test]
    fn laufende_grenze_beendet_den_status_sofort() {
        assert_eq!(statusbefund(0, 100_000_01, false), Statusbefund::EntfallenWegenLaufendemJahr);
    }

    /// Sind beide Grenzen gerissen, ist die Vorjahresgrenze die weitreichendere
    /// Aussage — sie gilt rückwirkend für das gesamte Jahr.
    #[test]
    fn vorjahr_hat_vorrang_wenn_beide_grenzen_gerissen_sind() {
        assert_eq!(statusbefund(30_000_00, 150_000_00, false), Statusbefund::EntfallenWegenVorjahr);
    }

    /// Im Gründungsjahr tritt die 25.000-€-Grenze an die Stelle der
    /// 100.000-€-Grenze. Ohne diese Unterscheidung gälte ein Gründer mit
    /// 30.000 € Umsatz fälschlich weiter als Kleinunternehmer.
    #[test]
    fn im_gruendungsjahr_gilt_die_niedrigere_grenze() {
        assert_eq!(grenze_laufendes_jahr_cent(true), GRENZE_VORJAHR_CENT);
        assert_eq!(grenze_laufendes_jahr_cent(false), GRENZE_LAUFENDES_JAHR_CENT);

        assert_eq!(statusbefund(0, 24_999_00, true), Statusbefund::Gegeben);
        assert_eq!(statusbefund(0, GRENZE_VORJAHR_CENT, true), Statusbefund::Gegeben);
        assert_eq!(
            statusbefund(0, 25_000_01, true),
            Statusbefund::EntfallenWegenLaufendemJahr,
            "im Gründungsjahr endet der Status schon bei 25.000 €"
        );
        // Ohne Gründungsjahr-Kennzeichnung wäre derselbe Umsatz unauffällig.
        assert_eq!(statusbefund(0, 25_000_01, false), Statusbefund::Gegeben);
    }

    /// Im Gründungsjahr gibt es kein Vorjahr — ein dort verbuchter Umsatz darf
    /// den Status nicht kippen.
    #[test]
    fn im_gruendungsjahr_wird_das_vorjahr_nicht_geprueft() {
        assert_eq!(statusbefund(90_000_00, 1_000_00, true), Statusbefund::Gegeben);
    }
}
