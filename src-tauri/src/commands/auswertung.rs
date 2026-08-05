//! Jahresauswertung für den Jahresabschluss.
//!
//! Die Übersicht (`dashboard.rs`) rechnet den vereinnahmten Umsatz schon aus —
//! aber nur als eine Zahl, für das laufende und das vorangegangene Jahr, und
//! ohne dass sie herausginge. Spätestens beim Jahresabschluss braucht man
//! mehr: die einzelnen Zahlungseingänge eines beliebigen Jahres, mit Beleg und
//! Kunde, als Liste, die sich an den Steuerberater weiterreichen lässt.
//!
//! Bewusst kein Steuerformular und keine EÜR-Anlage. Diese Auswertung tut nur
//! die Zuarbeit: die vereinnahmten Beträge auflisten, nach dem Zuflussprinzip
//! aus § 19 Abs. 2 UStG — demselben Maßstab, den `dashboard.rs` schon
//! verwendet.

// Beträge werden als `25_000_00` geschrieben: die letzten beiden Ziffern sind
// die Cent, davor die Euro mit Tausendertrennung. Clippys Vorschlag `2_500_000`
// wäre gleichmäßiger gruppiert, aber im Geldkontext deutlich schwerer zu lesen.
#![allow(clippy::inconsistent_digit_grouping)]

use crate::error::AppResult;
use serde::Serialize;
use sqlx::SqlitePool;

#[derive(Debug, Serialize, PartialEq)]
pub struct Vereinnahmung {
    pub datum: String,
    pub rechnung_nummer: String,
    pub kunde_name: String,
    pub betrag_cent: i64,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct Jahresauswertung {
    pub jahr: i32,
    pub summe_cent: i64,
    pub vereinnahmungen: Vec<Vereinnahmung>,
}

/// Vereinnahmte Zahlungen eines Kalenderjahres, mit Beleg und Kunde.
///
/// Dieselbe Abgrenzung wie in `dashboard::vereinnahmt_im_jahr`: maßgeblich ist
/// das Zahlungsdatum, nicht das Rechnungsdatum, und Zahlungen zu
/// soft-gelöschten Belegen bleiben außen vor. Eine Erstattung ist eine
/// negative Zahlung auf dieselbe Rechnung und erscheint hier als eigene
/// Zeile — sie in der Liste zu verschweigen widerspräche der GoBD-Forderung
/// nach Nachvollziehbarkeit.
pub async fn jahresauswertung(pool: &SqlitePool, jahr: i32) -> AppResult<Jahresauswertung> {
    let von = format!("{jahr}-01-01");
    let bis = format!("{jahr}-12-31");

    let zeilen: Vec<(String, Option<String>, String, i64)> = sqlx::query_as(
        "SELECT z.datum, b.nummer, b.kunde_snapshot, z.betrag_cent \
         FROM zahlung z JOIN beleg b ON b.id = z.rechnung_id \
         WHERE z.deleted_at IS NULL AND b.deleted_at IS NULL \
           AND z.datum >= ? AND z.datum <= ? \
         ORDER BY z.datum, z.created_at",
    )
    .bind(&von)
    .bind(&bis)
    .fetch_all(pool)
    .await?;

    let vereinnahmungen: Vec<Vereinnahmung> = zeilen
        .into_iter()
        .map(|(datum, nummer, kunde_snapshot, betrag_cent)| Vereinnahmung {
            datum,
            rechnung_nummer: nummer.unwrap_or_default(),
            kunde_name: super::belege::kunde_snapshot_name(&kunde_snapshot).unwrap_or_default(),
            betrag_cent,
        })
        .collect();

    let summe_cent = vereinnahmungen.iter().map(|v| v.betrag_cent).sum();

    Ok(Jahresauswertung { jahr, summe_cent, vereinnahmungen })
}

/// Jahre, für die es mindestens eine vereinnahmte Zahlung gibt — für die
/// Jahresauswahl.
///
/// Absteigend, jüngstes zuerst: Der Jahresabschluss betrifft in aller Regel
/// das zuletzt abgeschlossene Jahr.
pub async fn verfuegbare_jahre(pool: &SqlitePool) -> AppResult<Vec<i32>> {
    let jahre: Vec<(String,)> = sqlx::query_as(
        "SELECT DISTINCT substr(z.datum, 1, 4) FROM zahlung z \
         JOIN beleg b ON b.id = z.rechnung_id \
         WHERE z.deleted_at IS NULL AND b.deleted_at IS NULL \
         ORDER BY 1 DESC",
    )
    .fetch_all(pool)
    .await?;
    Ok(jahre.into_iter().filter_map(|(j,)| j.parse().ok()).collect())
}

#[tauri::command]
pub async fn auswertung_jahresauswertung(
    pool: tauri::State<'_, SqlitePool>,
    jahr: i32,
) -> AppResult<Jahresauswertung> {
    jahresauswertung(&pool, jahr).await
}

#[tauri::command]
pub async fn auswertung_verfuegbare_jahre(pool: tauri::State<'_, SqlitePool>) -> AppResult<Vec<i32>> {
    verfuegbare_jahre(&pool).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::belege::{create as beleg_create, erfasse_zahlung, position_speichern, stellen, BelegNeu, BelegpositionNeu, ZahlungNeu};

    async fn test_pool() -> (tempfile::TempDir, SqlitePool) {
        let dir = tempfile::tempdir().unwrap();
        let p = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        (dir, p)
    }

    /// Legt eine gestellte Rechnung über `betrag_cent` für einen Kunden mit
    /// dem angegebenen Namen an und gibt ihre Id zurück.
    async fn rechnung_stellen(pool: &SqlitePool, kunde_name: &str, betrag_cent: i64, datum: &str) -> String {
        let kunde_id = crate::commands::kunden::create(pool, crate::commands::kunden::KundeNeu {
            typ: "firma".into(), name: kunde_name.into(), zahlungsziel_tage: 14,
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
            standardpreis_cent: betrag_cent, ust_satz_prozent: 19,
        }).await.unwrap().id;
        let beleg = beleg_create(pool, BelegNeu {
            typ: "rechnung".into(), kunde_id, datum: datum.into(),
            leistungsdatum: datum.into(), leistungsdatum_bis: None, zahlungsziel_tage: 14,
            kopftext: "".into(), fusstext: "".into(),
        }).await.unwrap();
        position_speichern(pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();
        stellen(pool, beleg.id).await.unwrap().id
    }

    async fn zahlen(pool: &SqlitePool, rechnung_id: &str, betrag_cent: i64, datum: &str) {
        erfasse_zahlung(pool, ZahlungNeu {
            rechnung_id: rechnung_id.into(), datum: datum.into(),
            betrag_cent, notiz: "".into(),
        }).await.unwrap();
    }

    #[tokio::test]
    async fn listet_vereinnahmungen_eines_jahres_mit_beleg_und_kunde() {
        let (_dir, pool) = test_pool().await;
        let r1 = rechnung_stellen(&pool, "ACME GmbH", 10_000_00, "2026-02-01").await;
        zahlen(&pool, &r1, 10_000_00, "2026-02-05").await;
        let r2 = rechnung_stellen(&pool, "Beta AG", 5_000_00, "2026-06-01").await;
        zahlen(&pool, &r2, 5_000_00, "2026-06-10").await;

        let a = jahresauswertung(&pool, 2026).await.unwrap();
        assert_eq!(a.jahr, 2026);
        assert_eq!(a.summe_cent, 15_000_00);
        assert_eq!(a.vereinnahmungen.len(), 2);
        assert_eq!(a.vereinnahmungen[0].kunde_name, "ACME GmbH");
        assert_eq!(a.vereinnahmungen[0].betrag_cent, 10_000_00);
        assert_eq!(a.vereinnahmungen[1].kunde_name, "Beta AG");
    }

    /// § 19 Abs. 2 UStG: maßgeblich ist, wann das Geld floss — nicht wann die
    /// Rechnung gestellt wurde. Dieselbe Abgrenzung wie im Dashboard.
    #[tokio::test]
    async fn zaehlt_nach_zahlungsdatum_nicht_nach_rechnungsdatum() {
        let (_dir, pool) = test_pool().await;
        let r = rechnung_stellen(&pool, "ACME GmbH", 10_000_00, "2025-12-20").await;
        zahlen(&pool, &r, 10_000_00, "2026-01-15").await;

        assert_eq!(jahresauswertung(&pool, 2025).await.unwrap().summe_cent, 0);
        assert_eq!(jahresauswertung(&pool, 2026).await.unwrap().summe_cent, 10_000_00);
    }

    /// Eine Erstattung ist eine negative Zahlung und mindert die Summe — sie
    /// erscheint aber als eigene Zeile, nicht verrechnet, damit die Liste
    /// nachvollziehbar bleibt.
    #[tokio::test]
    async fn erstattung_erscheint_als_eigene_zeile_und_mindert_die_summe() {
        let (_dir, pool) = test_pool().await;
        let r = rechnung_stellen(&pool, "ACME GmbH", 5_000_00, "2026-02-01").await;
        zahlen(&pool, &r, 5_000_00, "2026-02-05").await;
        zahlen(&pool, &r, -2_000_00, "2026-03-01").await;

        let a = jahresauswertung(&pool, 2026).await.unwrap();
        assert_eq!(a.summe_cent, 3_000_00);
        assert_eq!(a.vereinnahmungen.len(), 2);
        assert_eq!(a.vereinnahmungen[1].betrag_cent, -2_000_00);
    }

    #[tokio::test]
    async fn ein_jahr_ohne_zahlungen_ist_leer_statt_ein_fehler() {
        let (_dir, pool) = test_pool().await;
        let a = jahresauswertung(&pool, 2026).await.unwrap();
        assert_eq!(a.summe_cent, 0);
        assert!(a.vereinnahmungen.is_empty());
    }

    #[tokio::test]
    async fn verfuegbare_jahre_nennt_nur_jahre_mit_vereinnahmten_zahlungen() {
        let (_dir, pool) = test_pool().await;
        assert!(verfuegbare_jahre(&pool).await.unwrap().is_empty());

        let r2025 = rechnung_stellen(&pool, "ACME GmbH", 1_000_00, "2025-11-01").await;
        zahlen(&pool, &r2025, 1_000_00, "2025-11-05").await;
        let r2026 = rechnung_stellen(&pool, "Beta AG", 2_000_00, "2026-01-01").await;
        zahlen(&pool, &r2026, 2_000_00, "2026-01-10").await;

        assert_eq!(verfuegbare_jahre(&pool).await.unwrap(), vec![2026, 2025]);
    }

    /// Ein gelöschter Beleg soll die Auswertung nicht mehr beeinflussen —
    /// dieselbe Regel wie beim Umsatz im Dashboard.
    ///
    /// Eine gestellte Rechnung lässt sich über die normale API nicht löschen
    /// (GoBD-Unveränderbarkeit, `pruefe_ist_entwurf`); das Soft-Delete wird
    /// deshalb direkt gesetzt — es geht hier nur um die Abfrage, nicht um den
    /// Lösch-Vorgang selbst.
    #[tokio::test]
    async fn geloeschter_beleg_bleibt_aussen_vor() {
        let (_dir, pool) = test_pool().await;
        let r = rechnung_stellen(&pool, "ACME GmbH", 1_000_00, "2026-02-01").await;
        zahlen(&pool, &r, 1_000_00, "2026-02-05").await;
        sqlx::query("UPDATE beleg SET deleted_at = '2026-03-01T00:00:00Z' WHERE id = ?")
            .bind(&r)
            .execute(&pool)
            .await
            .unwrap();

        let a = jahresauswertung(&pool, 2026).await.unwrap();
        assert!(a.vereinnahmungen.is_empty());
        assert!(verfuegbare_jahre(&pool).await.unwrap().is_empty());
    }
}
