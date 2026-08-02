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

/// Regelsteuersatz. Für die Schätzung der Nachzahlung wird durchgängig 19 %
/// angesetzt; ermäßigte Umsätze (7 %) kennt die App nicht, die Schätzung liegt
/// dann höher als die tatsächliche Last.
pub const REGELSTEUERSATZ_PROZENT: i64 = 19;

/// Rechnet die im Bruttobetrag enthaltene Umsatzsteuer heraus.
///
/// Wer ohne Steuerausweis fakturiert und nachträglich steuerpflichtig wird,
/// schuldet die Steuer **aus** dem vereinnahmten Betrag — der Kunde hat nur
/// diesen gezahlt. Aus 1.190 € werden also 190 € Steuer, nicht 226,10 €.
pub fn ust_aus_brutto_cent(brutto_cent: i64, satz_prozent: i64) -> i64 {
    if brutto_cent <= 0 || satz_prozent <= 0 {
        return 0;
    }
    // Kaufmännisch runden statt abschneiden.
    let zaehler = brutto_cent.saturating_mul(satz_prozent);
    let nenner = 100 + satz_prozent;
    (zaehler + nenner / 2) / nenner
}

/// Geldbetrag, der aus einer Grenzüberschreitung folgt.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Finanzfolge {
    /// Worauf sich die Schätzung bezieht.
    pub grundlage_cent: i64,
    /// Geschätzte Umsatzsteuerlast daraus.
    pub betrag_cent: i64,
    pub erlaeuterung: String,
}

/// Ein Hinweis zur Lage samt seiner Folgen.
///
/// Die reine Zahl hilft niemandem: Entscheidend ist, was aus dem Über- oder
/// Unterschreiten einer Grenze folgt, was das finanziell bedeutet und was jetzt
/// zu tun ist. Diese Texte gehören in die Domäne und nicht in die Oberfläche —
/// dort wären sie nicht prüfbar und würden mit der Rechenlogik auseinanderlaufen.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Hinweis {
    pub stufe: Warnstufe,
    /// Worum es geht, in einem Satz.
    pub titel: String,
    /// Was rechtlich gilt.
    pub bedeutung: String,
    /// Was das in Euro bedeutet, sofern bezifferbar.
    pub finanzielle_folge: Option<Finanzfolge>,
    /// Konkrete Schritte, abzuarbeiten von oben nach unten.
    pub handlung: Vec<String>,
}

const HINWEIS_STEUERBERATUNG: &str =
    "Besprechen Sie die Umstellung mit Ihrer Steuerberatung — die Fristen für \
     Voranmeldungen und die Behandlung offener Rechnungen hängen vom Einzelfall ab.";

/// Leitet aus der Umsatzlage die Hinweise ab, die den Nutzer wirklich betreffen.
///
/// Absteigend nach Dringlichkeit: bereits eingetretene Folgen vor drohenden.
pub fn hinweise(
    umsatz_vorjahr_cent: i64,
    umsatz_laufend_cent: i64,
    ist_gruendungsjahr: bool,
) -> Vec<Hinweis> {
    let mut liste = Vec::new();
    let grenze_laufend = grenze_laufendes_jahr_cent(ist_gruendungsjahr);

    match statusbefund(umsatz_vorjahr_cent, umsatz_laufend_cent, ist_gruendungsjahr) {
        Statusbefund::EntfallenWegenVorjahr => {
            let ust = ust_aus_brutto_cent(umsatz_laufend_cent, REGELSTEUERSATZ_PROZENT);
            liste.push(Hinweis {
                stufe: Warnstufe::Ueberschritten,
                titel: "Die Kleinunternehmerregelung gilt in diesem Jahr nicht".into(),
                bedeutung: format!(
                    "Der Vorjahresumsatz lag mit {} über der Grenze von {}. Damit unterliegen \
                     alle Umsätze dieses Jahres der Regelbesteuerung — rückwirkend ab dem \
                     1. Januar, nicht erst ab einem bestimmten Zeitpunkt. Rechnungen, die Sie \
                     dieses Jahr ohne Steuerausweis gestellt haben, sind nachzuversteuern.",
                    euro(umsatz_vorjahr_cent),
                    euro(GRENZE_VORJAHR_CENT)
                ),
                finanzielle_folge: Some(Finanzfolge {
                    grundlage_cent: umsatz_laufend_cent,
                    betrag_cent: ust,
                    erlaeuterung: format!(
                        "Auf die bisher vereinnahmten {} entfallen rund {} Umsatzsteuer \
                         ({} % aus dem Bruttobetrag herausgerechnet). Diesen Betrag schulden \
                         Sie dem Finanzamt, auch wenn Sie ihn Ihren Kunden nie berechnet haben.",
                        euro(umsatz_laufend_cent),
                        euro(ust),
                        REGELSTEUERSATZ_PROZENT
                    ),
                }),
                handlung: vec![
                    format!(
                        "Legen Sie umgehend eine Rücklage von mindestens {} zurück — die \
                         Nachzahlung wird fällig, sobald die Voranmeldungen nachgeholt sind.",
                        euro(ust)
                    ),
                    "Stellen Sie die Firmendaten auf Regelbesteuerung um, damit neue \
                     Rechnungen Umsatzsteuer ausweisen und der § 19-Hinweis entfällt."
                        .into(),
                    "Berichtigen Sie bereits gestellte Rechnungen dort, wo es sich lohnt: \
                     Geschäftskunden können die nachberechnete Steuer als Vorsteuer abziehen \
                     und zahlen sie meist nach. Bei Privatkunden bleibt die Steuer in der \
                     Regel an Ihnen hängen."
                        .into(),
                    "Machen Sie im Gegenzug die Vorsteuer aus Ihren Eingangsrechnungen \
                     geltend — das mindert die Nachzahlung, oft erheblich."
                        .into(),
                    HINWEIS_STEUERBERATUNG.into(),
                ],
            });
        }
        Statusbefund::EntfallenWegenLaufendemJahr => {
            let ueberschuss = umsatz_laufend_cent - grenze_laufend;
            let ust = ust_aus_brutto_cent(ueberschuss, REGELSTEUERSATZ_PROZENT);
            liste.push(Hinweis {
                stufe: Warnstufe::Ueberschritten,
                titel: "Die Kleinunternehmerregelung ist unterjährig entfallen".into(),
                bedeutung: format!(
                    "Der Umsatz dieses Jahres liegt mit {} über der Grenze von {}. Der Status \
                     endet nicht erst zum Jahreswechsel, sondern mit dem Umsatz, der die Grenze \
                     reißt: Ab diesem Umsatz fällt Umsatzsteuer an, alle davor liegenden bleiben \
                     steuerfrei. Auch im nächsten Jahr gilt die Regelung nicht, da der \
                     Vorjahresumsatz dann über {} liegt.",
                    euro(umsatz_laufend_cent),
                    euro(grenze_laufend),
                    euro(GRENZE_VORJAHR_CENT)
                ),
                finanzielle_folge: Some(Finanzfolge {
                    grundlage_cent: ueberschuss,
                    betrag_cent: ust,
                    erlaeuterung: format!(
                        "Betroffen sind die {} oberhalb der Grenze. Darin stecken rund {} \
                         Umsatzsteuer ({} % aus dem Bruttobetrag herausgerechnet) — geschuldet \
                         auch dann, wenn die Rechnungen ohne Steuerausweis hinausgingen.",
                        euro(ueberschuss),
                        euro(ust),
                        REGELSTEUERSATZ_PROZENT
                    ),
                }),
                handlung: vec![
                    format!("Bilden Sie eine Rücklage von mindestens {} für die Nachzahlung.", euro(ust)),
                    "Weisen Sie ab sofort auf allen neuen Rechnungen Umsatzsteuer aus.".into(),
                    "Prüfen Sie, welche Rechnungen nach dem Überschreiten ohne Steuerausweis \
                     hinausgingen, und berichtigen Sie sie — bei Geschäftskunden ist das meist \
                     ohne Verlust möglich."
                        .into(),
                    "Machen Sie ab diesem Zeitpunkt die Vorsteuer aus Ihren Eingangsrechnungen \
                     geltend."
                        .into(),
                    "Melden Sie die Umsatzsteuer über die Voranmeldung an; im Jahr des \
                     Wechsels ist das häufig monatlich."
                        .into(),
                    HINWEIS_STEUERBERATUNG.into(),
                ],
            });
        }
        Statusbefund::Gegeben => {
            // Zuerst die sofort wirkende Grenze.
            let stufe_laufend = warnstufe(umsatz_laufend_cent, grenze_laufend);
            if stufe_laufend != Warnstufe::Keine {
                let rest = (grenze_laufend - umsatz_laufend_cent).max(0);
                liste.push(Hinweis {
                    stufe: stufe_laufend,
                    titel: format!("Nur noch {} bis zur Grenze dieses Jahres", euro(rest)),
                    bedeutung: format!(
                        "Der Umsatz liegt bei {} von {}. Wird die Grenze überschritten, endet \
                         die Kleinunternehmerregelung sofort — mit dem Umsatz, der sie reißt, \
                         nicht erst im nächsten Jahr. Ab da ist jede Leistung steuerpflichtig.",
                        euro(umsatz_laufend_cent),
                        euro(grenze_laufend)
                    ),
                    finanzielle_folge: None,
                    handlung: vec![
                        "Rechnen Sie durch, ob geplante Aufträge dieses Jahr noch unter der \
                         Grenze bleiben oder ob die Umstellung ansteht."
                            .into(),
                        format!(
                            "Falls Sie die Grenze reißen werden: Legen Sie ab sofort {} % \
                             jedes weiteren Rechnungsbetrags zurück. Ohne Rücklage müssen Sie \
                             die Steuer später aus eigener Tasche zahlen, denn beim Kunden \
                             lässt sie sich oft nicht mehr nachfordern.",
                            REGELSTEUERSATZ_PROZENT
                        ),
                        "Bereiten Sie die Umstellung vor: Preise kalkulieren, \
                         Rechnungsvorlagen anpassen, Voranmeldung anmelden."
                            .into(),
                    ],
                });
            }

            // Die 25.000-€-Grenze des laufenden Jahres entscheidet über das Folgejahr.
            // Im Gründungsjahr ist sie bereits oben abgehandelt.
            if !ist_gruendungsjahr {
                let stufe_folgejahr = warnstufe(umsatz_laufend_cent, GRENZE_VORJAHR_CENT);

                // Ist die 25.000-€-Marke bereits gerissen, steht der Wegfall im
                // Folgejahr fest. Ihn dann als „auf der Kippe" zu bezeichnen wäre
                // falsch — und der verbleibende Abstand wäre stets 0 €.
                if umsatz_laufend_cent > GRENZE_VORJAHR_CENT {
                    let ust = ust_aus_brutto_cent(umsatz_laufend_cent, REGELSTEUERSATZ_PROZENT);
                    liste.push(Hinweis {
                        stufe: Warnstufe::Ueberschritten,
                        titel: "Im nächsten Jahr gilt die Kleinunternehmerregelung nicht mehr"
                            .into(),
                        bedeutung: format!(
                            "Der Umsatz dieses Jahres liegt mit {} über {}. Damit steht fest: \
                             Ab dem 1. Januar des nächsten Jahres unterliegen alle Umsätze der \
                             Regelbesteuerung. Für das laufende Jahr ändert sich nichts — die \
                             hier gestellten Rechnungen bleiben steuerfrei.",
                            euro(umsatz_laufend_cent),
                            euro(GRENZE_VORJAHR_CENT)
                        ),
                        finanzielle_folge: Some(Finanzfolge {
                            grundlage_cent: umsatz_laufend_cent,
                            betrag_cent: ust,
                            erlaeuterung: format!(
                                "Zur Einordnung: Bei gleichbleibendem Umsatz wären im nächsten \
                                 Jahr rund {} Umsatzsteuer abzuführen. Wenn Sie den Betrag auf \
                                 die Preise aufschlagen, tragen ihn die Kunden; behalten Sie \
                                 die Preise bei, geht er von Ihrer Marge ab.",
                                euro(ust)
                            ),
                        }),
                        handlung: vec![
                            "Kalkulieren Sie Ihre Preise für das nächste Jahr neu — mit \
                             Umsatzsteuer. Bei Privatkunden ist das eine echte Preiserhöhung, \
                             bei Geschäftskunden nicht, sie ziehen die Vorsteuer ab."
                                .into(),
                            "Melden Sie sich rechtzeitig zur Umsatzsteuer-Voranmeldung an; im \
                             ersten Jahr ist meist monatlich abzugeben."
                                .into(),
                            "Stellen Sie die Firmendaten zum Jahreswechsel auf \
                             Regelbesteuerung um, damit der § 19-Hinweis von den Rechnungen \
                             verschwindet und die Steuer ausgewiesen wird."
                                .into(),
                            "Sammeln Sie ab Januar Eingangsrechnungen für den Vorsteuerabzug — \
                             größere Anschaffungen lohnen sich ab dann steuerlich mehr."
                                .into(),
                            HINWEIS_STEUERBERATUNG.into(),
                        ],
                    });
                } else if stufe_folgejahr != Warnstufe::Keine {
                    let rest = (GRENZE_VORJAHR_CENT - umsatz_laufend_cent).max(0);
                    liste.push(Hinweis {
                        stufe: stufe_folgejahr,
                        titel: "Der Status im nächsten Jahr steht auf der Kippe".into(),
                        bedeutung: format!(
                            "Der Umsatz dieses Jahres liegt bei {} — noch {} bis zu den {}, \
                             an denen sich entscheidet, ob die Kleinunternehmerregelung im \
                             nächsten Jahr noch gilt. Überschreiten Sie sie, entfällt die \
                             Regelung für das gesamte Folgejahr, und zwar ab dem 1. Januar.",
                            euro(umsatz_laufend_cent),
                            euro(rest),
                            euro(GRENZE_VORJAHR_CENT)
                        ),
                        finanzielle_folge: None,
                        handlung: vec![
                            "Entscheiden Sie bewusst: Aufträge ins nächste Jahr schieben und \
                             unter der Grenze bleiben — oder die Umstellung planen."
                                .into(),
                            format!(
                                "Bei Umstellung: Ihre Preise steigen für Privatkunden um {} %, \
                                 sofern Sie die Steuer aufschlagen. Für Geschäftskunden ändert \
                                 sich nichts, sie ziehen die Vorsteuer ab.",
                                REGELSTEUERSATZ_PROZENT
                            ),
                            "Denken Sie an den Vorteil der Umstellung: Ab dann können Sie die \
                             Vorsteuer aus Anschaffungen geltend machen."
                                .into(),
                            "Achtung bei einem freiwilligen Verzicht auf die Regelung: Er \
                             bindet Sie für fünf Kalenderjahre (§ 19 Abs. 3 UStG)."
                                .into(),
                        ],
                    });
                }
            }
        }
    }
    liste
}

/// Formatiert einen Cent-Betrag als Euro-Angabe für Fließtext.
fn euro(cent: i64) -> String {
    let negativ = cent < 0;
    let betrag = cent.abs();
    let ganz = betrag / 100;
    let rest = betrag % 100;
    let mut text = ganz.to_string();
    // Tausenderpunkte von hinten einfügen.
    let mut i = text.len() as i64 - 3;
    while i > 0 {
        text.insert(i as usize, '.');
        i -= 3;
    }
    let vorzeichen = if negativ { "-" } else { "" };
    if rest == 0 {
        format!("{vorzeichen}{text} €")
    } else {
        format!("{vorzeichen}{text},{rest:02} €")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn euro_setzt_tausenderpunkte_und_cent_nur_wenn_noetig() {
        assert_eq!(euro(25_000_00), "25.000 €");
        assert_eq!(euro(100_000_00), "100.000 €");
        assert_eq!(euro(900_00), "900 €");
        assert_eq!(euro(1_234_56), "1.234,56 €");
        assert_eq!(euro(-500_00), "-500 €");
    }

    /// Wer ohne Steuerausweis fakturiert hat, schuldet die Steuer AUS dem
    /// vereinnahmten Betrag — nicht zusätzlich darauf. Der Unterschied ist
    /// erheblich: 190 € statt 226,10 € bei 1.190 € Umsatz.
    #[test]
    fn umsatzsteuer_wird_aus_dem_brutto_herausgerechnet() {
        assert_eq!(ust_aus_brutto_cent(1_190_00, 19), 190_00);
        // Ausnahmsweise ohne Cent-Trennung geschrieben: `1_596_64` läse Clippy als
        // vertippten Typsuffix `1_596_i64` und bräche den Lauf ab.
        assert_eq!(ust_aus_brutto_cent(10_000_00, 19), 159_664); // 1.596,64 €
        assert_eq!(ust_aus_brutto_cent(0, 19), 0);
        assert_eq!(ust_aus_brutto_cent(-100_00, 19), 0);
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
        assert!(h[0].bedeutung.contains("4.000 €"), "verbleibender Abstand fehlt");
        assert!(h[0].handlung.len() >= 3, "eine Handlungsanweisung reicht hier nicht");
        // Die Fünfjahresbindung bei freiwilligem Verzicht ist eine häufige Falle.
        assert!(h[0].handlung.iter().any(|z| z.contains("fünf Kalenderjahre")));
    }

    #[test]
    fn entfallener_status_wegen_vorjahr_nennt_die_folgen() {
        let h = hinweise(30_000_00, 12_000_00, false);
        assert_eq!(h.len(), 1);
        assert_eq!(h[0].stufe, Warnstufe::Ueberschritten);
        assert!(h[0].bedeutung.contains("Regelbesteuerung"));
        assert!(h[0].bedeutung.contains("1. Januar"), "die Rückwirkung muss benannt sein");
        assert!(h[0].handlung.iter().any(|z| z.contains("Vorsteuer")));
    }

    /// Der praktisch wichtigste Teil: Wie viel Geld muss zurückgelegt werden.
    #[test]
    fn entfallener_status_beziffert_die_nachzahlung() {
        let h = hinweise(30_000_00, 12_000_00, false);
        let folge = h[0].finanzielle_folge.as_ref().expect("Betrag fehlt");
        assert_eq!(folge.grundlage_cent, 12_000_00);
        assert_eq!(folge.betrag_cent, ust_aus_brutto_cent(12_000_00, 19));
        assert!(folge.erlaeuterung.contains("herausgerechnet"));
        assert!(
            h[0].handlung.iter().any(|z| z.contains("Rücklage")),
            "ohne Rücklagen-Hinweis fehlt die entscheidende Handlung"
        );
    }

    /// Beim unterjährigen Wegfall ist nur der Teil oberhalb der Grenze betroffen —
    /// nicht der gesamte Jahresumsatz.
    #[test]
    fn unterjaehriger_wegfall_beziffert_nur_den_ueberschuss() {
        let h = hinweise(0, 110_000_00, false);
        let folge = h[0].finanzielle_folge.as_ref().expect("Betrag fehlt");
        assert_eq!(folge.grundlage_cent, 10_000_00, "nur der Teil über 100.000 €");
        assert_eq!(folge.betrag_cent, ust_aus_brutto_cent(10_000_00, 19));
    }

    /// Beim unterjährigen Wegfall ist entscheidend, dass frühere Umsätze
    /// steuerfrei bleiben — sonst rechnet der Nutzer das ganze Jahr neu.
    #[test]
    fn unterjaehriger_wegfall_erklaert_die_zeitliche_wirkung() {
        let h = hinweise(0, 100_000_01, false);
        assert_eq!(h.len(), 1);
        assert!(h[0].bedeutung.contains("steuerfrei"));
        assert!(h[0].bedeutung.contains("100.000 €"));
        // Auch das Folgejahr ist betroffen — das übersehen viele.
        assert!(h[0].bedeutung.contains("nächsten Jahr"));
    }

    /// Ist die 25.000-€-Marke bereits überschritten, steht der Wegfall im Folgejahr
    /// fest. Er darf dann nicht als drohende Möglichkeit dargestellt werden — und
    /// ein „noch 0 € bis zur Grenze" wäre schlicht sinnlos.
    #[test]
    fn ueberschrittene_folgejahresgrenze_wird_als_feststehend_dargestellt() {
        let h = hinweise(0, 96_000_00, false);
        let folgejahr = h
            .iter()
            .find(|x| x.titel.contains("nächsten Jahr"))
            .expect("Hinweis zum Folgejahr fehlt");
        assert_eq!(folgejahr.stufe, Warnstufe::Ueberschritten);
        assert!(folgejahr.titel.contains("nicht mehr"), "war: {}", folgejahr.titel);
        assert!(folgejahr.bedeutung.contains("steht fest"));
        assert!(
            !folgejahr.bedeutung.contains("noch 0 €"),
            "sinnloser Restbetrag: {}",
            folgejahr.bedeutung
        );
        // Das laufende Jahr bleibt unberührt — das muss dastehen, sonst rechnet
        // der Nutzer die bereits gestellten Rechnungen neu.
        assert!(folgejahr.bedeutung.contains("bleiben steuerfrei"));
    }

    /// Vor dem Überschreiten muss der Rücklagen-Rat kommen, nicht erst danach —
    /// später ist die Steuer beim Kunden meist nicht mehr einzutreiben.
    #[test]
    fn vor_der_grenze_wird_zur_ruecklage_geraten() {
        let h = hinweise(0, 96_000_00, false);
        let laufend = h.iter().find(|x| x.titel.contains("dieses Jahres")).expect("Hinweis fehlt");
        assert!(laufend.handlung.iter().any(|z| z.contains("zurück")));
        assert!(laufend.handlung.iter().any(|z| z.contains("eigener Tasche")));
    }

    #[test]
    fn im_gruendungsjahr_nennt_der_hinweis_die_niedrigere_grenze() {
        let h = hinweise(0, 25_000_01, true);
        assert_eq!(h.len(), 1);
        assert!(h[0].bedeutung.contains("25.000 €"), "war: {}", h[0].bedeutung);
    }

    /// Jeder Hinweis muss dem Nutzer sagen, was zu tun ist — ein Befund ohne
    /// Handlungsanweisung lässt ihn ratlos zurück.
    #[test]
    fn jeder_hinweis_traegt_titel_bedeutung_und_handlung() {
        let lagen = [
            (0_i64, 21_000_00_i64, false),
            (0, 96_000_00, false),
            (0, 110_000_00, false),
            (30_000_00, 12_000_00, false),
            (0, 21_000_00, true),
            (0, 30_000_00, true),
        ];
        for (vorjahr, laufend, gruendung) in lagen {
            for h in hinweise(vorjahr, laufend, gruendung) {
                assert!(!h.titel.trim().is_empty(), "Titel fehlt bei {vorjahr}/{laufend}");
                assert!(!h.bedeutung.trim().is_empty(), "Bedeutung fehlt bei {vorjahr}/{laufend}");
                assert!(!h.handlung.is_empty(), "Handlung fehlt bei {vorjahr}/{laufend}");
                assert!(h.handlung.iter().all(|z| !z.trim().is_empty()));
            }
        }
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

#[cfg(test)]
mod muster {
    /// Gibt die Hinweistexte aller Lagen aus, damit sich die Formulierungen mit
    /// eigenen Augen prüfen lassen. Die Tests sichern nur Struktur und
    /// Schlüsselbegriffe — ob ein Satz verständlich ist, zeigen sie nicht.
    ///
    /// Aufruf: `cargo test -- muster --ignored --nocapture`
    #[test]
    #[ignore = "gibt Text zur Sichtprüfung aus, kein automatischer Test"]
    fn zeige_alle_hinweise() {
        let lagen = [
            ("Annäherung Folgejahr", 0_i64, 21_000_00_i64, false),
            ("Annäherung laufende Grenze", 0, 96_000_00, false),
            ("Unterjährig entfallen", 0, 110_000_00, false),
            ("Vorjahr überschritten", 30_000_00, 12_000_00, false),
            ("Gründungsjahr, Annäherung", 0, 21_000_00, true),
            ("Gründungsjahr, überschritten", 0, 30_000_00, true),
        ];
        for (name, vorjahr, laufend, gruendung) in lagen {
            println!("\n══════ {name} ══════");
            for h in super::hinweise(vorjahr, laufend, gruendung) {
                println!("\n[{:?}] {}", h.stufe, h.titel);
                println!("  {}", h.bedeutung);
                if let Some(f) = &h.finanzielle_folge {
                    println!("  → {}", f.erlaeuterung);
                }
                for (i, schritt) in h.handlung.iter().enumerate() {
                    println!("  {}. {}", i + 1, schritt);
                }
            }
        }
    }
}
