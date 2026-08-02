// Beträge werden als `25_000_00` geschrieben: die letzten beiden Ziffern sind
// die Cent, davor die Euro mit Tausendertrennung. Clippys Vorschlag `2_500_000`
// wäre gleichmäßiger gruppiert, aber im Geldkontext deutlich schwerer zu lesen.
#![allow(clippy::inconsistent_digit_grouping)]

use crate::domain::umsatz::{
    anteil_prozent, grenze_laufendes_jahr_cent, hinweise, statusbefund, warnstufe, Hinweis,
    Statusbefund, Warnstufe, GRENZE_VORJAHR_CENT,
};
use crate::error::AppResult;
use serde::Serialize;
use sqlx::SqlitePool;

/// Kennzahlen zu einer der beiden Umsatzgrenzen.
#[derive(Debug, Serialize)]
pub struct Grenze {
    pub umsatz_cent: i64,
    pub grenze_cent: i64,
    pub anteil_prozent: i64,
    pub warnstufe: Warnstufe,
}

/// Überwachung der Kleinunternehmergrenzen nach § 19 UStG.
///
/// Entsteht nur, wenn die Firma tatsächlich als Kleinunternehmer geführt wird —
/// bei Regelbesteuerung sind die Grenzen bedeutungslos und ihre Anzeige wäre
/// irreführend.
#[derive(Debug, Serialize)]
pub struct Umsatzgrenzen {
    /// Umsatz des laufenden Jahres gegen die 25.000-€-Grenze. Sie entscheidet
    /// darüber, ob die Regelung im **nächsten** Jahr noch gilt.
    pub laufendes_jahr_gegen_vorjahresgrenze: Grenze,
    /// Umsatz des laufenden Jahres gegen die 100.000-€-Grenze. Ihre
    /// Überschreitung beendet den Status sofort.
    pub laufendes_jahr_gegen_jahresgrenze: Grenze,
    /// Umsatz des Vorjahres gegen die 25.000-€-Grenze. Sie entscheidet darüber,
    /// ob die Regelung im laufenden Jahr überhaupt gilt.
    pub vorjahr_gegen_vorjahresgrenze: Grenze,
    pub befund: Statusbefund,
    /// Ob das laufende Jahr das Gründungsjahr ist — dann gilt die niedrigere Grenze.
    pub ist_gruendungsjahr: bool,
    /// Was die Lage konkret bedeutet und was zu tun ist. Absteigend nach Dringlichkeit.
    pub hinweise: Vec<Hinweis>,
}

#[derive(Debug, Serialize)]
pub struct OffeneRechnung {
    pub id: String,
    pub nummer: String,
    pub kunde_name: String,
    pub datum: String,
    pub faellig_am: String,
    /// Negative Werte bedeuten überfällig, positive verbleibende Tage.
    pub tage_bis_faellig: i64,
    pub offener_betrag_cent: i64,
}

#[derive(Debug, Serialize)]
pub struct OffenesAngebot {
    pub id: String,
    pub nummer: String,
    pub kunde_name: String,
    pub datum: String,
    pub summe_cent: i64,
}

#[derive(Debug, Serialize)]
pub struct LetzterBeleg {
    pub id: String,
    pub typ: String,
    pub nummer: String,
    pub kunde_name: String,
    pub status: String,
    pub summe_cent: i64,
}

#[derive(Debug, Serialize)]
pub struct Dashboard {
    pub jahr: i32,
    pub umsatz_laufendes_jahr_cent: i64,
    pub umsatz_vorjahr_cent: i64,
    /// `None`, wenn die Firma nicht als Kleinunternehmer geführt wird.
    pub umsatzgrenzen: Option<Umsatzgrenzen>,
    pub offene_rechnungen: Vec<OffeneRechnung>,
    pub offene_angebote: Vec<OffenesAngebot>,
    pub letzte_belege: Vec<LetzterBeleg>,
}

/// Summe der in einem Kalenderjahr vereinnahmten Zahlungen.
///
/// § 19 Abs. 2 UStG bemisst den Gesamtumsatz nach vereinnahmten Entgelten:
/// Maßgeblich ist das Zahlungsdatum, nicht das Rechnungsdatum. Erstattungen
/// sind negative Zahlungen und mindern die Summe dadurch von selbst.
///
/// Zahlungen zu soft-gelöschten Belegen bleiben außen vor — ein gelöschter
/// Beleg soll den Umsatz nicht mehr beeinflussen.
async fn vereinnahmt_im_jahr(pool: &SqlitePool, jahr: i32) -> AppResult<i64> {
    let von = format!("{jahr}-01-01");
    let bis = format!("{jahr}-12-31");
    let summe: (Option<i64>,) = sqlx::query_as(
        "SELECT SUM(z.betrag_cent) FROM zahlung z \
         JOIN beleg b ON b.id = z.rechnung_id \
         WHERE z.deleted_at IS NULL AND b.deleted_at IS NULL \
           AND z.datum >= ? AND z.datum <= ?",
    )
    .bind(&von)
    .bind(&bis)
    .fetch_one(pool)
    .await?;
    Ok(summe.0.unwrap_or(0))
}

fn grenze_bilden(umsatz_cent: i64, grenze_cent: i64) -> Grenze {
    Grenze {
        umsatz_cent,
        grenze_cent,
        anteil_prozent: anteil_prozent(umsatz_cent, grenze_cent),
        warnstufe: warnstufe(umsatz_cent, grenze_cent),
    }
}

/// Tage von `heute` bis `ziel`; negativ, wenn `ziel` in der Vergangenheit liegt.
fn tage_bis(heute: chrono::NaiveDate, ziel: chrono::NaiveDate) -> i64 {
    (ziel - heute).num_days()
}

pub async fn laden(pool: &SqlitePool, heute: chrono::NaiveDate) -> AppResult<Dashboard> {
    let jahr = heute.format("%Y").to_string().parse::<i32>().unwrap_or(1970);
    let umsatz_laufendes_jahr_cent = vereinnahmt_im_jahr(pool, jahr).await?;
    let umsatz_vorjahr_cent = vereinnahmt_im_jahr(pool, jahr - 1).await?;

    let firma = crate::commands::firma::get(pool).await?;
    // Ohne Angabe wird der Regelfall angenommen: ein Vorjahr existiert.
    let ist_gruendungsjahr = firma.gruendungsjahr == Some(jahr as i64);
    let umsatzgrenzen = if firma.kleinunternehmer {
        Some(Umsatzgrenzen {
            laufendes_jahr_gegen_vorjahresgrenze: grenze_bilden(
                umsatz_laufendes_jahr_cent,
                GRENZE_VORJAHR_CENT,
            ),
            laufendes_jahr_gegen_jahresgrenze: grenze_bilden(
                umsatz_laufendes_jahr_cent,
                grenze_laufendes_jahr_cent(ist_gruendungsjahr),
            ),
            vorjahr_gegen_vorjahresgrenze: grenze_bilden(umsatz_vorjahr_cent, GRENZE_VORJAHR_CENT),
            befund: statusbefund(umsatz_vorjahr_cent, umsatz_laufendes_jahr_cent, ist_gruendungsjahr),
            ist_gruendungsjahr,
            hinweise: hinweise(umsatz_vorjahr_cent, umsatz_laufendes_jahr_cent, ist_gruendungsjahr),
        })
    } else {
        None
    };

    // Offene Rechnungen: gestellt, noch nicht vollständig bezahlt. Stornobelege
    // bleiben außen vor — sie sind Gegenbuchungen, keine Forderungen.
    let offene_posten = crate::commands::belege::offene_posten(pool).await?;
    let mut offene_rechnungen: Vec<OffeneRechnung> = offene_posten
        .into_iter()
        .filter(|p| p.beleg.storno_von_id.is_none() && p.offener_betrag_cent > 0)
        .map(|p| {
            let faellig = chrono::NaiveDate::parse_from_str(&p.beleg.datum, "%Y-%m-%d")
                .ok()
                .and_then(|d| d.checked_add_signed(chrono::Duration::days(p.beleg.zahlungsziel_tage)));
            OffeneRechnung {
                id: p.beleg.id,
                nummer: p.beleg.nummer.unwrap_or_default(),
                kunde_name: p.beleg.kunde_snapshot_name.unwrap_or_default(),
                datum: p.beleg.datum,
                faellig_am: faellig.map(|d| d.to_string()).unwrap_or_default(),
                tage_bis_faellig: faellig.map(|d| tage_bis(heute, d)).unwrap_or(0),
                offener_betrag_cent: p.offener_betrag_cent,
            }
        })
        .collect();
    // Am dringendsten zuerst: die am längsten überfällige Rechnung oben.
    offene_rechnungen.sort_by_key(|r| r.tage_bis_faellig);

    let angebote: Vec<crate::commands::belege::Beleg> =
        crate::commands::belege::list(pool, Some("angebot".into()), None).await?;
    let offene_angebote = angebote
        .into_iter()
        .filter(|b| ["versendet", "angenommen"].contains(&b.status.as_str()))
        .map(|b| OffenesAngebot {
            id: b.id,
            nummer: b.nummer.unwrap_or_default(),
            kunde_name: b.kunde_snapshot_name.unwrap_or_default(),
            datum: b.datum,
            summe_cent: b.summe_cent,
        })
        .collect();

    let letzte: Vec<crate::commands::belege::Beleg> = sqlx::query_as(&format!(
        "SELECT {} FROM beleg WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 5",
        crate::commands::belege::BELEG_SPALTEN
    ))
    .fetch_all(pool)
    .await?;
    let letzte_belege = letzte
        .into_iter()
        .map(crate::commands::belege::mit_snapshot_name)
        .map(|b| LetzterBeleg {
            id: b.id,
            typ: b.typ,
            nummer: b.nummer.unwrap_or_default(),
            kunde_name: b.kunde_snapshot_name.unwrap_or_default(),
            status: b.status,
            summe_cent: b.summe_cent,
        })
        .collect();

    Ok(Dashboard {
        jahr,
        umsatz_laufendes_jahr_cent,
        umsatz_vorjahr_cent,
        umsatzgrenzen,
        offene_rechnungen,
        offene_angebote,
        letzte_belege,
    })
}

#[tauri::command]
pub async fn dashboard_laden(pool: tauri::State<'_, SqlitePool>) -> AppResult<Dashboard> {
    laden(&pool, chrono::Local::now().date_naive()).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::belege::{
        create as beleg_create, erfasse_zahlung, position_speichern, stellen, BelegNeu,
        BelegpositionNeu, ZahlungNeu,
    };

    async fn test_pool() -> (tempfile::TempDir, SqlitePool) {
        let dir = tempfile::tempdir().unwrap();
        let p = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        (dir, p)
    }

    fn tag(iso: &str) -> chrono::NaiveDate {
        chrono::NaiveDate::parse_from_str(iso, "%Y-%m-%d").unwrap()
    }

    /// Legt eine gestellte Rechnung über `betrag_cent` an und gibt ihre Id zurück.
    async fn rechnung_stellen(pool: &SqlitePool, betrag_cent: i64, datum: &str) -> String {
        let kunde_id = crate::commands::kunden::create(pool, crate::commands::kunden::KundeNeu {
            typ: "firma".into(), name: "ACME GmbH".into(), zahlungsziel_tage: 14,
            notizen: "".into(), ust_idnr: "".into(), email: "".into(),
            leitweg_id: "".into(), kaeuferreferenz: "".into(),
        }).await.unwrap().id;
        crate::commands::kunden::adresse_speichern(pool, crate::commands::kunden::Adresse {
            id: "".into(), kunde_id: kunde_id.clone(), typ: "rechnung".into(),
            strasse: "Weg 5".into(), plz: "10117".into(), ort: "Berlin".into(),
            land: "DE".into(), ist_standard: true,
        }).await.unwrap();
        let artikel_id = crate::commands::artikel::create(pool, crate::commands::artikel::ArtikelNeu {
            bezeichnung: "Leistung".into(), beschreibung: "".into(),
            einheit_id: "e0000000-0000-0000-0000-000000000001".into(),
            standardpreis_cent: betrag_cent,
        }).await.unwrap().id;
        let beleg = beleg_create(pool, BelegNeu {
            typ: "rechnung".into(), kunde_id, datum: datum.into(),
            leistungsdatum: datum.into(), zahlungsziel_tage: 14,
            kopftext: "".into(), fusstext: "".into(),
        }).await.unwrap();
        position_speichern(pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        stellen(pool, beleg.id).await.unwrap().id
    }

    async fn zahlen(pool: &SqlitePool, rechnung_id: &str, betrag_cent: i64, datum: &str) {
        erfasse_zahlung(pool, ZahlungNeu {
            rechnung_id: rechnung_id.into(), datum: datum.into(),
            betrag_cent, notiz: "".into(),
        }).await.unwrap();
    }

    /// § 19 Abs. 2 UStG bemisst den Gesamtumsatz nach vereinnahmten Entgelten.
    /// Maßgeblich ist also das Zahlungsdatum, nicht das Rechnungsdatum — eine im
    /// Dezember gestellte, im Januar bezahlte Rechnung zählt ins neue Jahr.
    #[tokio::test]
    async fn umsatz_zaehlt_nach_zahlungsdatum_nicht_nach_rechnungsdatum() {
        let (_dir, pool) = test_pool().await;
        let rechnung = rechnung_stellen(&pool, 10_000_00, "2025-12-20").await;
        zahlen(&pool, &rechnung, 10_000_00, "2026-01-15").await;

        let d = laden(&pool, tag("2026-06-01")).await.unwrap();
        assert_eq!(d.umsatz_vorjahr_cent, 0, "2025 floss kein Geld");
        assert_eq!(d.umsatz_laufendes_jahr_cent, 10_000_00);
    }

    /// Erstattungen sind negative Zahlungen und mindern den vereinnahmten Umsatz.
    #[tokio::test]
    async fn erstattung_mindert_den_umsatz() {
        let (_dir, pool) = test_pool().await;
        let rechnung = rechnung_stellen(&pool, 5_000_00, "2026-02-01").await;
        zahlen(&pool, &rechnung, 5_000_00, "2026-02-05").await;
        zahlen(&pool, &rechnung, -2_000_00, "2026-03-01").await;

        let d = laden(&pool, tag("2026-06-01")).await.unwrap();
        assert_eq!(d.umsatz_laufendes_jahr_cent, 3_000_00);
    }

    /// Bei Regelbesteuerung sind die Kleinunternehmergrenzen bedeutungslos —
    /// sie anzuzeigen wäre irreführend.
    #[tokio::test]
    async fn ohne_kleinunternehmerstatus_gibt_es_keine_grenzen() {
        let (_dir, pool) = test_pool().await;
        let mut firma = crate::commands::firma::get(&pool).await.unwrap();
        firma.name = "Meine Firma".into();
        firma.steuernummer = "12/345/67890".into();
        firma.kleinunternehmer = false;
        crate::commands::firma::save(&pool, firma).await.unwrap();

        let d = laden(&pool, tag("2026-06-01")).await.unwrap();
        assert!(d.umsatzgrenzen.is_none());
        // Der Jahresumsatz bleibt trotzdem sichtbar — er ist unabhängig davon nützlich.
        assert_eq!(d.umsatz_laufendes_jahr_cent, 0);
    }

    #[tokio::test]
    async fn mit_kleinunternehmerstatus_werden_beide_grenzen_ausgewiesen() {
        let (_dir, pool) = test_pool().await;
        let mut firma = crate::commands::firma::get(&pool).await.unwrap();
        firma.name = "Meine Firma".into();
        firma.steuernummer = "12/345/67890".into();
        firma.kleinunternehmer = true;
        crate::commands::firma::save(&pool, firma).await.unwrap();
        let rechnung = rechnung_stellen(&pool, 21_000_00, "2026-02-01").await;
        zahlen(&pool, &rechnung, 21_000_00, "2026-02-05").await;

        let g = laden(&pool, tag("2026-06-01")).await.unwrap().umsatzgrenzen.unwrap();
        assert_eq!(g.laufendes_jahr_gegen_vorjahresgrenze.anteil_prozent, 84);
        assert_eq!(g.laufendes_jahr_gegen_vorjahresgrenze.warnstufe, Warnstufe::Annaeherung);
        assert_eq!(g.laufendes_jahr_gegen_jahresgrenze.warnstufe, Warnstufe::Keine);
        assert_eq!(g.befund, Statusbefund::Gegeben);
    }

    #[tokio::test]
    async fn offene_rechnung_weist_faelligkeit_und_ueberfaelligkeit_aus() {
        let (_dir, pool) = test_pool().await;
        rechnung_stellen(&pool, 1_000_00, "2026-05-01").await;

        let d = laden(&pool, tag("2026-06-01")).await.unwrap();
        assert_eq!(d.offene_rechnungen.len(), 1);
        let r = &d.offene_rechnungen[0];
        assert_eq!(r.faellig_am, "2026-05-15", "Belegdatum plus 14 Tage Zahlungsziel");
        assert_eq!(r.tage_bis_faellig, -17, "seit 17 Tagen überfällig");
        assert_eq!(r.offener_betrag_cent, 1_000_00);
    }

    #[tokio::test]
    async fn bezahlte_rechnung_ist_kein_offener_posten_mehr() {
        let (_dir, pool) = test_pool().await;
        let rechnung = rechnung_stellen(&pool, 1_000_00, "2026-05-01").await;
        zahlen(&pool, &rechnung, 1_000_00, "2026-05-10").await;

        let d = laden(&pool, tag("2026-06-01")).await.unwrap();
        assert!(d.offene_rechnungen.is_empty());
    }

    /// Ein Stornobeleg ist eine Gegenbuchung, keine Forderung — er darf nicht als
    /// offener Posten erscheinen.
    #[tokio::test]
    async fn stornobeleg_ist_kein_offener_posten() {
        let (_dir, pool) = test_pool().await;
        let rechnung = rechnung_stellen(&pool, 1_000_00, "2026-05-01").await;
        crate::commands::belege::storniere_rechnung(&pool, rechnung).await.unwrap();

        let d = laden(&pool, tag("2026-06-01")).await.unwrap();
        assert!(
            d.offene_rechnungen.is_empty(),
            "weder die stornierte Rechnung noch der Gegenbeleg sind Forderungen, war: {:?}",
            d.offene_rechnungen
        );
    }

    #[tokio::test]
    async fn offene_rechnungen_stehen_nach_dringlichkeit() {
        let (_dir, pool) = test_pool().await;
        rechnung_stellen(&pool, 100_00, "2026-05-20").await; // fällig 03.06.
        rechnung_stellen(&pool, 200_00, "2026-04-01").await; // fällig 15.04., am längsten überfällig

        let d = laden(&pool, tag("2026-06-01")).await.unwrap();
        assert_eq!(d.offene_rechnungen[0].faellig_am, "2026-04-15");
        assert_eq!(d.offene_rechnungen[1].faellig_am, "2026-06-03");
    }
}
