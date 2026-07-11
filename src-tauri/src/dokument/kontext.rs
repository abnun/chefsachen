use crate::error::{AppError, AppResult};
use serde::Serialize;
use sqlx::SqlitePool;

#[derive(Debug, Serialize)]
pub struct BelegKontext {
    pub beleg: crate::commands::belege::Beleg,
    pub positionen: Vec<crate::commands::belege::Belegposition>,
    pub firma: crate::commands::firma::Firma,
    pub kunde_name: String,
    pub kunde_kundennummer: String,
    pub kunde_ust_idnr: String,
    pub kunde_email: String,
    pub kunde_leitweg_id: String,
    pub kunde_kaeuferreferenz: String,
    pub adresse_strasse: String,
    pub adresse_plz: String,
    pub adresse_ort: String,
    pub adresse_land: String,
}

fn feld_str(wert: &serde_json::Value, feld: &str) -> String {
    wert.get(feld).and_then(|v| v.as_str()).unwrap_or_default().to_string()
}

pub async fn kontext_aus_beleg(pool: &SqlitePool, beleg_id: String) -> AppResult<BelegKontext> {
    let detail = crate::commands::belege::get(pool, beleg_id.clone()).await?;
    if detail.beleg.status == "entwurf" {
        return Err(AppError::Validation {
            feld: "status".into(),
            meldung: "Nur gestellte Belege können exportiert werden".into(),
        });
    }
    let firma = crate::commands::firma::get(pool).await?;
    let snapshot_roh: (String,) = sqlx::query_as("SELECT kunde_snapshot FROM beleg WHERE id = ?")
        .bind(&beleg_id).fetch_one(pool).await?;
    let snapshot: serde_json::Value = serde_json::from_str(&snapshot_roh.0).unwrap_or(serde_json::Value::Null);
    let snapshot_hat_erweiterte_felder = snapshot.get("kunde").and_then(|k| k.get("email")).is_some();

    let (kunde_name, kunde_kundennummer, kunde_ust_idnr, kunde_email, kunde_leitweg_id, kunde_kaeuferreferenz,
         adresse_strasse, adresse_plz, adresse_ort, adresse_land) = if snapshot_hat_erweiterte_felder {
        let kunde_feld = &snapshot["kunde"];
        let adresse = snapshot.get("adresse");
        (
            feld_str(kunde_feld, "name"), feld_str(kunde_feld, "kundennummer"), feld_str(kunde_feld, "ust_idnr"),
            feld_str(kunde_feld, "email"), feld_str(kunde_feld, "leitweg_id"), feld_str(kunde_feld, "kaeuferreferenz"),
            adresse.map(|a| feld_str(a, "strasse")).unwrap_or_default(),
            adresse.map(|a| feld_str(a, "plz")).unwrap_or_default(),
            adresse.map(|a| feld_str(a, "ort")).unwrap_or_default(),
            adresse.map(|a| feld_str(a, "land")).unwrap_or_default(),
        )
    } else {
        // Alter Snapshot ohne die E-Rechnungs-Felder (vor dieser Erweiterung gestellt) -> Live-Daten als Fallback.
        let kunde_detail = crate::commands::kunden::get(pool, detail.beleg.kunde_id.clone()).await?;
        let adresse = kunde_detail.adressen.iter().find(|a| a.typ == "rechnung" && a.ist_standard);
        (
            kunde_detail.kunde.name, kunde_detail.kunde.kundennummer, kunde_detail.kunde.ust_idnr,
            kunde_detail.kunde.email, kunde_detail.kunde.leitweg_id, kunde_detail.kunde.kaeuferreferenz,
            adresse.map(|a| a.strasse.clone()).unwrap_or_default(),
            adresse.map(|a| a.plz.clone()).unwrap_or_default(),
            adresse.map(|a| a.ort.clone()).unwrap_or_default(),
            adresse.map(|a| a.land.clone()).unwrap_or_default(),
        )
    };

    Ok(BelegKontext {
        beleg: detail.beleg, positionen: detail.positionen, firma,
        kunde_name, kunde_kundennummer, kunde_ust_idnr, kunde_email, kunde_leitweg_id, kunde_kaeuferreferenz,
        adresse_strasse, adresse_plz, adresse_ort, adresse_land,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn test_pool() -> (tempfile::TempDir, sqlx::SqlitePool) {
        let dir = tempfile::tempdir().unwrap();
        let p = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        (dir, p)
    }

    async fn setup_gestellte_rechnung(pool: &sqlx::SqlitePool) -> String {
        let kunde = crate::commands::kunden::create(pool, crate::commands::kunden::KundeNeu {
            typ: "firma".into(), name: "ACME GmbH".into(), zahlungsziel_tage: 14,
            notizen: "".into(), ust_idnr: "".into(), email: "acme@example.com".into(),
            leitweg_id: "".into(), kaeuferreferenz: "".into(),
        }).await.unwrap();
        let artikel = crate::commands::artikel::create(pool, crate::commands::artikel::ArtikelNeu {
            bezeichnung: "Beratung".into(), beschreibung: "".into(),
            einheit_id: "e0000000-0000-0000-0000-000000000001".into(),
            standardpreis_cent: 9500,
        }).await.unwrap();
        let beleg = crate::commands::belege::create(pool, crate::commands::belege::BelegNeu {
            typ: "rechnung".into(), kunde_id: kunde.id.clone(), datum: "2026-07-11".into(),
            leistungsdatum: "2026-07-11".into(), zahlungsziel_tage: 14,
            kopftext: "".into(), fusstext: "Vielen Dank.".into(),
        }).await.unwrap();
        crate::commands::belege::position_speichern(pool, crate::commands::belege::BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel.id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        let gestellt = crate::commands::belege::stellen(pool, beleg.id).await.unwrap();
        gestellt.id
    }

    #[tokio::test]
    async fn kontext_aus_beleg_laedt_beleg_positionen_und_firma() {
        let (_dir, pool) = test_pool().await;
        let beleg_id = setup_gestellte_rechnung(&pool).await;
        let kontext = kontext_aus_beleg(&pool, beleg_id).await.unwrap();
        assert_eq!(kontext.positionen.len(), 1);
        assert_eq!(kontext.kunde_name, "ACME GmbH");
        assert_eq!(kontext.kunde_email, "acme@example.com");
    }

    #[tokio::test]
    async fn kontext_aus_beleg_lehnt_entwurf_ab() {
        let (_dir, pool) = test_pool().await;
        let kunde = crate::commands::kunden::create(&pool, crate::commands::kunden::KundeNeu {
            typ: "firma".into(), name: "ACME GmbH".into(), zahlungsziel_tage: 14,
            notizen: "".into(), ust_idnr: "".into(), email: "".into(),
            leitweg_id: "".into(), kaeuferreferenz: "".into(),
        }).await.unwrap();
        let beleg = crate::commands::belege::create(&pool, crate::commands::belege::BelegNeu {
            typ: "rechnung".into(), kunde_id: kunde.id, datum: "2026-07-11".into(),
            leistungsdatum: "2026-07-11".into(), zahlungsziel_tage: 14,
            kopftext: "".into(), fusstext: "".into(),
        }).await.unwrap();
        let err = kontext_aus_beleg(&pool, beleg.id).await.unwrap_err();
        assert!(matches!(err, crate::error::AppError::Validation { .. }));
    }
}
