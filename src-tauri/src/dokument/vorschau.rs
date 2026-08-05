//! Vorschau der Belegvorlage.
//!
//! Ohne sie ist jedes Einstellen Raten: Man verstellt einen Rand, exportiert
//! eine echte Rechnung, sieht nach — und wiederholt das. Die Vorschau zeigt das
//! Ergebnis unmittelbar, mit den eigenen Firmendaten und dem eigenen Logo, aber
//! an einem erfundenen Beleg.
//!
//! Als SVG und nicht als PDF: Die Inhaltsrichtlinie der Anwendung verbietet
//! eingebettete Objekte (`object-src 'none'`) und fremde Rahmenquellen. Ein
//! Bild über eine `data:`-URL ist bereits erlaubt — die Vorschau kostet also
//! keine Aufweichung der Richtlinie. Nebenbei ist ein SVG in jeder Größe
//! scharf und braucht keinen PDF-Betrachter.

use crate::dokument::kontext::BelegKontext;
use crate::dokument::vorlage::Vorlage;
use crate::error::{AppError, AppResult};
use sqlx::SqlitePool;

/// Ein erfundener Beleg, an dem sich das Aussehen beurteilen lässt.
///
/// Bewusst mit mehreren Positionen unterschiedlicher Länge: An einer einzelnen
/// Zeile sieht man weder, wie die Tabelle umbricht, noch ob die Spalten in
/// vernünftigem Verhältnis stehen.
fn muster_beleg(firma: crate::commands::firma::Firma) -> BelegKontext {
    use crate::commands::belege::{Beleg, Belegposition};

    let position = |nr: &str, bez: &str, einheit: &str, preis: i64, menge: i64| Belegposition {
        id: nr.into(),
        beleg_id: "muster".into(),
        artikel_id: None,
        bezeichnung: bez.into(),
        einheit_kuerzel: einheit.into(),
        einzelpreis_cent: preis,
        menge,
        positionssumme_cent: preis * menge / 1000,
        reihenfolge: 0,
    };

    let positionen = vec![
        position("p1", "Beratung und Konzeption", "Std.", 9500, 4000),
        position("p2", "Umsetzung der Startseite einschließlich Bildbearbeitung", "Std.", 8500, 12500),
        position("p3", "Schulung vor Ort", "Tag", 65000, 1000),
    ];
    let summe = positionen.iter().map(|p| p.positionssumme_cent).sum();

    BelegKontext {
        offener_betrag_cent: summe,
        beleg: Beleg {
            id: "muster".into(),
            typ: "rechnung".into(),
            nummer: Some("RE-2026-0042".into()),
            status: "gestellt".into(),
            kunde_id: "muster".into(),
            datum: "2026-03-15".into(),
            leistungsdatum: "2026-03-15".into(),
            leistungsdatum_bis: None,
            gueltig_bis: None,
            zahlungsziel_tage: 14,
            kopftext: "Sehr geehrte Damen und Herren,\n\nwie vereinbart stellen wir Ihnen die folgenden Leistungen in Rechnung.".into(),
            fusstext: "Vielen Dank für Ihren Auftrag.".into(),
            summe_cent: summe,
            ursprungsangebot_id: None,
            storno_von_id: None,
            kunde_snapshot: String::new(),
            kunde_snapshot_name: None,
            bezahlt_cent: 0,
            zahlungsstand: None,
            faellig_am: None,
            adresse_id: None,
            ansprechpartner_id: None,
        },
        positionen,
        firma,
        kunde_ansprechpartner: "Frau Dr. Beispiel".into(),
        kunde_name: "Musterkunde GmbH".into(),
        kunde_kundennummer: "KD-0042".into(),
        kunde_ust_idnr: String::new(),
        kunde_email: String::new(),
        kunde_leitweg_id: String::new(),
        kunde_kaeuferreferenz: String::new(),
        adresse_strasse: "Musterstraße 12".into(),
        adresse_plz: "12345".into(),
        adresse_ort: "Musterstadt".into(),
        adresse_land: "DE".into(),
        storno_von_nummer: None,
    }
}

/// Erzeugt die Vorschau als SVG.
///
/// `einstellungen` sind die Werte, die gerade im Formular stehen — auch die
/// noch nicht gespeicherten. Sonst müsste man erst speichern, um zu sehen, was
/// man einstellt, und jeder Versuch änderte die laufende Geschäftspost.
#[tauri::command]
pub async fn vorlage_vorschau(
    pool: tauri::State<'_, SqlitePool>,
    einstellungen: Vec<(String, String)>,
) -> AppResult<String> {
    let firma = crate::commands::firma::get(&pool).await?;
    let logo = crate::dokument::export::firma_logo(&pool).await?;
    let vorlage = Vorlage::aus_paaren(&einstellungen);
    let kontext = muster_beleg(firma);

    let dokument = crate::dokument::pdf::dokument_bauen(&kontext, logo.as_deref(), &vorlage)?;
    let seite = dokument
        .pages
        .first()
        .ok_or_else(|| AppError::Technisch("Die Vorschau hat keine Seite".into()))?;
    Ok(typst_svg::svg(seite))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Die Vorschau muss dieselbe Vorlage benutzen wie der echte Export.
    ///
    /// Eine eigene Vorschau-Vorlage wäre der bequeme Weg und in diesem Projekt
    /// schon dreimal schiefgegangen: Die Kopien liefen auseinander, und was man
    /// sah, war nicht, was der Kunde bekam.
    #[test]
    fn zeigt_die_einstellungen_im_ergebnis() {
        let firma = crate::commands::firma::Firma {
            id: "f1".into(),
            name: "Meine Firma".into(),
            strasse: "Weg 1".into(),
            plz: "10115".into(),
            ort: "Berlin".into(),
            land: "DE".into(),
            steuernummer: "12/345/67890".into(),
            ust_idnr: String::new(),
            iban: "DE02120300000000202051".into(),
            bic: "BYLADEM1001".into(),
            email: String::new(),
            telefon: String::new(),
            fax: String::new(),
            kontakt_name: String::new(),
            gruendungsjahr: None,
            kleinunternehmer: true,
            eingerichtet: true,
        };
        let kontext = muster_beleg(firma);

        let svg = |paare: &[(String, String)]| {
            let vorlage = Vorlage::aus_paaren(paare);
            let dokument =
                crate::dokument::pdf::dokument_bauen(&kontext, None, &vorlage).unwrap();
            typst_svg::svg(dokument.pages.first().unwrap())
        };

        let mit = svg(&[]);
        let ohne = svg(&[("vorlage.spalte_einzelpreis".into(), "nein".into())]);

        // Am SVG selbst lässt sich der Text nicht ablesen — Typst schreibt
        // Glyphen als Pfade. Die Breite der Tabelle ändert sich aber, und das
        // schlägt auf die Länge des Dokuments durch.
        assert_ne!(mit, ohne, "Die Abwahl einer Spalte änderte die Vorschau nicht");
        assert!(mit.starts_with("<svg"), "kein SVG: {}", &mit[..60.min(mit.len())]);
    }

    #[test]
    fn der_musterbeleg_hat_mehrere_positionen() {
        // An einer einzelnen Zeile sieht man weder den Umbruch der Tabelle noch
        // das Verhältnis der Spalten.
        let firma = crate::commands::firma::Firma {
            id: "f1".into(), name: "F".into(), strasse: "W 1".into(), plz: "1".into(),
            ort: "B".into(), land: "DE".into(), steuernummer: "1".into(), ust_idnr: String::new(),
            iban: String::new(), bic: String::new(), email: String::new(), telefon: String::new(),
            fax: String::new(),
            kontakt_name: String::new(), gruendungsjahr: None, kleinunternehmer: true,
            eingerichtet: true,
        };
        let kontext = muster_beleg(firma);
        assert!(kontext.positionen.len() >= 3);
        // Die Summe muss zu den Positionen passen, sonst zeigt die Vorschau
        // einen Widerspruch, den es im echten Beleg nicht gibt.
        let summe: i64 = kontext.positionen.iter().map(|p| p.positionssumme_cent).sum();
        assert_eq!(kontext.beleg.summe_cent, summe);
    }
}
