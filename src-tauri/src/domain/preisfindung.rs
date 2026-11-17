use crate::error::AppResult;
use sqlx::SqlitePool;

/// Ermittelt den für ein Belegdatum geltenden Preis: Kundenpreis vor Standardpreis.
///
/// Die Sortierung endet auf `id`, damit das Ergebnis auch dann eindeutig ist,
/// wenn wider Erwarten zwei Sätze mit demselben Gültig-ab-Datum existieren.
/// Verhindert werden solche Dubletten seit P4.6 beim Speichern; der Tiebreaker
/// ist die zweite Verteidigungslinie — ein Preis darf unter keinen Umständen
/// vom Zufall abhängen.
pub async fn effektiver_preis(pool: &SqlitePool, artikel_id: &str, kunde_id: &str, belegdatum: &str) -> AppResult<i64> {
    let kp: Option<(i64,)> = sqlx::query_as(
        "SELECT preis_cent FROM kundenpreis \
         WHERE artikel_id = ? AND kunde_id = ? AND deleted_at IS NULL \
           AND (gueltig_ab IS NULL OR gueltig_ab <= ?) \
           AND (gueltig_bis IS NULL OR gueltig_bis >= ?) \
         ORDER BY gueltig_ab IS NULL, gueltig_ab DESC, id LIMIT 1")
        .bind(artikel_id).bind(kunde_id).bind(belegdatum).bind(belegdatum)
        .fetch_optional(pool).await?;
    if let Some((preis,)) = kp { return Ok(preis); }
    let std: (i64,) = sqlx::query_as("SELECT standardpreis_cent FROM artikel WHERE id = ?")
        .bind(artikel_id).fetch_one(pool).await?;
    Ok(std.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::artikel::{create as artikel_create, kundenpreis_speichern, ArtikelNeu, Kundenpreis};
    use crate::commands::kunden::{create as kunde_create, KundeNeu};

    async fn test_pool() -> (tempfile::TempDir, sqlx::SqlitePool) {
        let dir = tempfile::tempdir().unwrap();
        let p = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        (dir, p)
    }

    /// Legt Kunde + Artikel (Standardpreis 9500 Cent, Einheit "Stunde" aus Seed) an.
    async fn setup(pool: &sqlx::SqlitePool) -> (String, String) {
        let kunde = kunde_create(pool, KundeNeu {
            typ: "firma".into(), name: "ACME GmbH".into(), zahlungsziel_tage: 14,
            notizen: "".into(), ust_idnr: "".into(), email: "".into(),
            leitweg_id: "".into(), kaeuferreferenz: "".into(),
        }).await.unwrap();
        let artikel = artikel_create(pool, ArtikelNeu {
            bezeichnung: "Beratung".into(), beschreibung: "".into(),
            einheit_id: "e0000000-0000-0000-0000-000000000001".into(),
            standardpreis_cent: 9500, ust_satz_prozent: 19,
        }).await.unwrap();
        (artikel.id, kunde.id)
    }

    async fn preis_anlegen(pool: &sqlx::SqlitePool, artikel_id: &str, kunde_id: &str, cent: i64, ab: Option<&str>) {
        kundenpreis_speichern(pool, Kundenpreis {
            id: "".into(), artikel_id: artikel_id.into(), kunde_id: kunde_id.into(),
            preis_cent: cent, gueltig_ab: ab.map(String::from), gueltig_bis: None,
        }).await.unwrap();
    }

    #[tokio::test]
    async fn ohne_kundenpreis_gilt_standardpreis() {
        let (_dir, pool) = test_pool().await;
        let (artikel_id, kunde_id) = setup(&pool).await;
        assert_eq!(effektiver_preis(&pool, &artikel_id, &kunde_id, "2026-07-06").await.unwrap(), 9500);
    }

    #[tokio::test]
    async fn kundenpreis_ohne_datum_gilt_immer() {
        let (_dir, pool) = test_pool().await;
        let (artikel_id, kunde_id) = setup(&pool).await;
        preis_anlegen(&pool, &artikel_id, &kunde_id, 8000, None).await;
        assert_eq!(effektiver_preis(&pool, &artikel_id, &kunde_id, "2026-07-06").await.unwrap(), 8000);
    }

    #[tokio::test]
    async fn gueltig_ab_wird_am_belegdatum_gemessen() {
        let (_dir, pool) = test_pool().await;
        let (artikel_id, kunde_id) = setup(&pool).await;
        preis_anlegen(&pool, &artikel_id, &kunde_id, 8000, Some("2026-01-01")).await;
        preis_anlegen(&pool, &artikel_id, &kunde_id, 7000, Some("2026-08-01")).await;
        assert_eq!(effektiver_preis(&pool, &artikel_id, &kunde_id, "2026-07-06").await.unwrap(), 8000);
        assert_eq!(effektiver_preis(&pool, &artikel_id, &kunde_id, "2026-09-01").await.unwrap(), 7000);
    }

    #[tokio::test]
    async fn doppelter_kundenpreis_gleiches_gueltig_ab_wird_abgelehnt() {
        let (_dir, pool) = test_pool().await;
        let (artikel_id, kunde_id) = setup(&pool).await;
        preis_anlegen(&pool, &artikel_id, &kunde_id, 8000, None).await;
        let err = kundenpreis_speichern(&pool, Kundenpreis {
            id: "".into(), artikel_id: artikel_id.clone(), kunde_id: kunde_id.clone(),
            preis_cent: 7500, gueltig_ab: None, gueltig_bis: None,
        }).await.unwrap_err();
        assert!(matches!(err, crate::error::AppError::Validation { .. }));
    }

    async fn befristet(pool: &sqlx::SqlitePool, artikel_id: &str, kunde_id: &str, cent: i64, ab: Option<&str>, bis: Option<&str>) {
        kundenpreis_speichern(pool, Kundenpreis {
            id: "".into(), artikel_id: artikel_id.into(), kunde_id: kunde_id.into(),
            preis_cent: cent, gueltig_ab: ab.map(String::from), gueltig_bis: bis.map(String::from),
        }).await.unwrap();
    }

    #[tokio::test]
    async fn befristeter_preis_gilt_bis_einschliesslich_zum_letzten_tag() {
        let (_dir, pool) = test_pool().await;
        let (artikel_id, kunde_id) = setup(&pool).await;
        befristet(&pool, &artikel_id, &kunde_id, 7000, Some("2026-07-01"), Some("2026-07-31")).await;
        assert_eq!(effektiver_preis(&pool, &artikel_id, &kunde_id, "2026-06-30").await.unwrap(), 9500);
        assert_eq!(effektiver_preis(&pool, &artikel_id, &kunde_id, "2026-07-01").await.unwrap(), 7000);
        assert_eq!(effektiver_preis(&pool, &artikel_id, &kunde_id, "2026-07-31").await.unwrap(), 7000);
        assert_eq!(effektiver_preis(&pool, &artikel_id, &kunde_id, "2026-08-01").await.unwrap(), 9500);
    }

    #[tokio::test]
    async fn nach_ablauf_des_befristeten_preises_gilt_der_unbefristete_wieder() {
        let (_dir, pool) = test_pool().await;
        let (artikel_id, kunde_id) = setup(&pool).await;
        preis_anlegen(&pool, &artikel_id, &kunde_id, 8500, None).await;
        befristet(&pool, &artikel_id, &kunde_id, 7000, Some("2026-07-01"), Some("2026-07-31")).await;
        assert_eq!(effektiver_preis(&pool, &artikel_id, &kunde_id, "2026-07-15").await.unwrap(), 7000);
        assert_eq!(effektiver_preis(&pool, &artikel_id, &kunde_id, "2026-08-15").await.unwrap(), 8500);
    }

    #[tokio::test]
    async fn befristung_ohne_beginn_gilt_bis_zum_ende() {
        let (_dir, pool) = test_pool().await;
        let (artikel_id, kunde_id) = setup(&pool).await;
        befristet(&pool, &artikel_id, &kunde_id, 7000, None, Some("2026-07-31")).await;
        assert_eq!(effektiver_preis(&pool, &artikel_id, &kunde_id, "2026-01-01").await.unwrap(), 7000);
        assert_eq!(effektiver_preis(&pool, &artikel_id, &kunde_id, "2026-08-01").await.unwrap(), 9500);
    }

    #[tokio::test]
    async fn ende_vor_beginn_wird_abgelehnt() {
        let (_dir, pool) = test_pool().await;
        let (artikel_id, kunde_id) = setup(&pool).await;
        let err = kundenpreis_speichern(&pool, Kundenpreis {
            id: "".into(), artikel_id, kunde_id, preis_cent: 7000,
            gueltig_ab: Some("2026-08-01".into()), gueltig_bis: Some("2026-07-31".into()),
        }).await.unwrap_err();
        assert!(matches!(err, crate::error::AppError::Validation { feld, .. } if feld == "gueltig_bis"));
    }

    #[tokio::test]
    async fn gueltig_bis_wird_gespeichert_und_in_beiden_listen_geliefert() {
        let (_dir, pool) = test_pool().await;
        let (artikel_id, kunde_id) = setup(&pool).await;
        befristet(&pool, &artikel_id, &kunde_id, 7000, Some("2026-07-01"), Some("2026-07-31")).await;
        let je_artikel = crate::commands::artikel::kundenpreis_liste(&pool, artikel_id).await.unwrap();
        assert_eq!(je_artikel[0].gueltig_bis.as_deref(), Some("2026-07-31"));
        let je_kunde = crate::commands::artikel::kundenpreise_je_kunde(&pool, kunde_id).await.unwrap();
        assert_eq!(je_kunde[0].gueltig_bis.as_deref(), Some("2026-07-31"));
    }
}
