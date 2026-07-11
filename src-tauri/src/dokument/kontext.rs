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

/// Kunden- und Adressfelder für einen `BelegKontext`. Als benanntes Struct statt
/// Tupel, damit ein künftiges Umsortieren/Einfügen eines Feldes in nur einem der
/// beiden Erzeugungspfade (Snapshot vs. Live-Daten) einen Compilefehler statt
/// eines stillen Feld-Vertauschers erzeugt.
struct KundenFelder {
    name: String,
    kundennummer: String,
    ust_idnr: String,
    email: String,
    leitweg_id: String,
    kaeuferreferenz: String,
    adresse_strasse: String,
    adresse_plz: String,
    adresse_ort: String,
    adresse_land: String,
}

fn kundenfelder_aus_snapshot(snapshot: &serde_json::Value) -> KundenFelder {
    let kunde_feld = &snapshot["kunde"];
    let adresse = snapshot.get("adresse");
    KundenFelder {
        name: feld_str(kunde_feld, "name"),
        kundennummer: feld_str(kunde_feld, "kundennummer"),
        ust_idnr: feld_str(kunde_feld, "ust_idnr"),
        email: feld_str(kunde_feld, "email"),
        leitweg_id: feld_str(kunde_feld, "leitweg_id"),
        kaeuferreferenz: feld_str(kunde_feld, "kaeuferreferenz"),
        adresse_strasse: adresse.map(|a| feld_str(a, "strasse")).unwrap_or_default(),
        adresse_plz: adresse.map(|a| feld_str(a, "plz")).unwrap_or_default(),
        adresse_ort: adresse.map(|a| feld_str(a, "ort")).unwrap_or_default(),
        adresse_land: adresse.map(|a| feld_str(a, "land")).unwrap_or_default(),
    }
}

fn kundenfelder_aus_live_daten(kunde_detail: &crate::commands::kunden::KundeDetail) -> KundenFelder {
    let adresse = kunde_detail.adressen.iter().find(|a| a.typ == "rechnung" && a.ist_standard);
    KundenFelder {
        name: kunde_detail.kunde.name.clone(),
        kundennummer: kunde_detail.kunde.kundennummer.clone(),
        ust_idnr: kunde_detail.kunde.ust_idnr.clone(),
        email: kunde_detail.kunde.email.clone(),
        leitweg_id: kunde_detail.kunde.leitweg_id.clone(),
        kaeuferreferenz: kunde_detail.kunde.kaeuferreferenz.clone(),
        adresse_strasse: adresse.map(|a| a.strasse.clone()).unwrap_or_default(),
        adresse_plz: adresse.map(|a| a.plz.clone()).unwrap_or_default(),
        adresse_ort: adresse.map(|a| a.ort.clone()).unwrap_or_default(),
        adresse_land: adresse.map(|a| a.land.clone()).unwrap_or_default(),
    }
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

    let kf = if snapshot_hat_erweiterte_felder {
        kundenfelder_aus_snapshot(&snapshot)
    } else {
        // Alter Snapshot ohne die E-Rechnungs-Felder (vor dieser Erweiterung gestellt) -> Live-Daten als Fallback.
        let kunde_detail = crate::commands::kunden::get(pool, detail.beleg.kunde_id.clone()).await?;
        kundenfelder_aus_live_daten(&kunde_detail)
    };

    Ok(BelegKontext {
        beleg: detail.beleg, positionen: detail.positionen, firma,
        kunde_name: kf.name, kunde_kundennummer: kf.kundennummer, kunde_ust_idnr: kf.ust_idnr,
        kunde_email: kf.email, kunde_leitweg_id: kf.leitweg_id, kunde_kaeuferreferenz: kf.kaeuferreferenz,
        adresse_strasse: kf.adresse_strasse, adresse_plz: kf.adresse_plz,
        adresse_ort: kf.adresse_ort, adresse_land: kf.adresse_land,
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
    async fn kontext_aus_beleg_faellt_bei_altem_snapshot_auf_live_daten_zurueck() {
        let (_dir, pool) = test_pool().await;
        let kunde = crate::commands::kunden::create(&pool, crate::commands::kunden::KundeNeu {
            typ: "firma".into(), name: "Beta AG".into(), zahlungsziel_tage: 14,
            notizen: "".into(), ust_idnr: "".into(), email: "beta@example.com".into(),
            leitweg_id: "".into(), kaeuferreferenz: "".into(),
        }).await.unwrap();
        crate::commands::kunden::adresse_speichern(&pool, crate::commands::kunden::Adresse {
            id: "".into(), kunde_id: kunde.id.clone(), typ: "rechnung".into(),
            strasse: "Hauptstraße 42".into(), plz: "80331".into(), ort: "München".into(),
            land: "DE".into(), ist_standard: true,
        }).await.unwrap();
        let artikel = crate::commands::artikel::create(&pool, crate::commands::artikel::ArtikelNeu {
            bezeichnung: "Beratung".into(), beschreibung: "".into(),
            einheit_id: "e0000000-0000-0000-0000-000000000001".into(),
            standardpreis_cent: 9500,
        }).await.unwrap();
        let beleg = crate::commands::belege::create(&pool, crate::commands::belege::BelegNeu {
            typ: "rechnung".into(), kunde_id: kunde.id.clone(), datum: "2026-07-11".into(),
            leistungsdatum: "2026-07-11".into(), zahlungsziel_tage: 14,
            kopftext: "".into(), fusstext: "".into(),
        }).await.unwrap();
        crate::commands::belege::position_speichern(&pool, crate::commands::belege::BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel.id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        let gestellt = crate::commands::belege::stellen(&pool, beleg.id).await.unwrap();

        // Alten Snapshot ohne die erweiterten E-Rechnungs-Felder simulieren
        // (so wie er vor der Erweiterung geschrieben worden wäre).
        let alter_snapshot = serde_json::json!({
            "kunde": { "name": "Beta AG", "kundennummer": kunde.kundennummer, "ust_idnr": "" },
            "adresse": { "strasse": "Alte Adresse 1", "plz": "00000", "ort": "Nirgendwo", "land": "DE" },
            "firma": {},
        });
        sqlx::query("UPDATE beleg SET kunde_snapshot = ? WHERE id = ?")
            .bind(alter_snapshot.to_string()).bind(&gestellt.id)
            .execute(&pool).await.unwrap();

        let kontext = kontext_aus_beleg(&pool, gestellt.id).await.unwrap();
        assert_eq!(kontext.kunde_email, "beta@example.com");
        assert_eq!(kontext.adresse_strasse, "Hauptstraße 42");
        assert_eq!(kontext.adresse_plz, "80331");
        assert_eq!(kontext.adresse_ort, "München");
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
