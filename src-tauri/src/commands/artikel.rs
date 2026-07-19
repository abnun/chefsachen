use crate::db::jetzt;
use crate::domain::nummernkreis::naechste_nummer;
use crate::domain::preisfindung::effektiver_preis;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Artikel {
    pub id: String,
    pub artikelnummer: String,
    pub bezeichnung: String,
    pub beschreibung: String,
    pub einheit_id: String,
    pub standardpreis_cent: i64,
    pub kundenpreise_anzahl: i64,
}

#[derive(Debug, Deserialize)]
pub struct ArtikelNeu {
    pub bezeichnung: String,
    pub beschreibung: String,
    pub einheit_id: String,
    pub standardpreis_cent: i64,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Kundenpreis {
    pub id: String,
    pub artikel_id: String,
    pub kunde_id: String,
    pub preis_cent: i64,
    pub gueltig_ab: Option<String>,
}

async fn pruefe_artikel(pool: &SqlitePool, bezeichnung: &str, standardpreis_cent: i64, einheit_id: &str) -> AppResult<()> {
    if bezeichnung.trim().is_empty() {
        return Err(AppError::Validation { feld: "bezeichnung".into(), meldung: "Bezeichnung darf nicht leer sein".into() });
    }
    if standardpreis_cent < 0 {
        return Err(AppError::Validation { feld: "standardpreis_cent".into(), meldung: "Standardpreis darf nicht negativ sein".into() });
    }
    let einheit_existiert: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM einheit WHERE id = ? AND deleted_at IS NULL")
        .bind(einheit_id).fetch_one(pool).await?;
    if einheit_existiert.0 == 0 {
        return Err(AppError::Validation { feld: "einheit_id".into(), meldung: "Einheit existiert nicht".into() });
    }
    Ok(())
}

pub async fn create(pool: &SqlitePool, d: ArtikelNeu) -> AppResult<Artikel> {
    pruefe_artikel(pool, &d.bezeichnung, d.standardpreis_cent, &d.einheit_id).await?;
    let artikelnummer = naechste_nummer(pool, "artikel").await?;
    let a = Artikel {
        id: Uuid::new_v4().to_string(),
        artikelnummer,
        bezeichnung: d.bezeichnung.trim().into(),
        beschreibung: d.beschreibung,
        einheit_id: d.einheit_id,
        standardpreis_cent: d.standardpreis_cent,
        kundenpreise_anzahl: 0,
    };
    sqlx::query("INSERT INTO artikel (id, artikelnummer, bezeichnung, beschreibung, einheit_id, standardpreis_cent, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)")
        .bind(&a.id).bind(&a.artikelnummer).bind(&a.bezeichnung).bind(&a.beschreibung)
        .bind(&a.einheit_id).bind(a.standardpreis_cent).bind(jetzt()).bind(jetzt())
        .execute(pool).await?;
    Ok(a)
}

pub async fn list(pool: &SqlitePool, suche: Option<String>) -> AppResult<Vec<Artikel>> {
    let muster = format!("%{}%", suche.unwrap_or_default().to_lowercase());
    Ok(sqlx::query_as(
        "SELECT a.id, a.artikelnummer, a.bezeichnung, a.beschreibung, a.einheit_id, a.standardpreis_cent, \
                (SELECT COUNT(*) FROM kundenpreis kp WHERE kp.artikel_id = a.id AND kp.deleted_at IS NULL) AS kundenpreise_anzahl \
         FROM artikel a WHERE a.deleted_at IS NULL AND (lower(a.bezeichnung) LIKE ? OR lower(a.artikelnummer) LIKE ?) ORDER BY a.bezeichnung")
        .bind(&muster).bind(&muster).fetch_all(pool).await?)
}

pub async fn update(pool: &SqlitePool, artikel: Artikel) -> AppResult<Artikel> {
    pruefe_artikel(pool, &artikel.bezeichnung, artikel.standardpreis_cent, &artikel.einheit_id).await?;
    // WICHTIG: artikelnummer wird hier bewusst NICHT geschrieben — die vergebene
    // Nummer ist nach der Vergabe unveränderlich, auch wenn `artikel.artikelnummer`
    // aus dem Frontend einen (ggf. veralteten) Wert enthält.
    let r = sqlx::query(
        "UPDATE artikel SET bezeichnung=?, beschreibung=?, einheit_id=?, standardpreis_cent=?, updated_at=? WHERE id=? AND deleted_at IS NULL")
        .bind(artikel.bezeichnung.trim()).bind(&artikel.beschreibung).bind(&artikel.einheit_id)
        .bind(artikel.standardpreis_cent).bind(jetzt()).bind(&artikel.id)
        .execute(pool).await?;
    if r.rows_affected() == 0 { return Err(AppError::NichtGefunden); }
    Ok(artikel)
}

pub async fn delete(pool: &SqlitePool, id: String, kundenpreise_mitloeschen: bool) -> AppResult<()> {
    let anzahl_kundenpreise: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM kundenpreis WHERE artikel_id = ? AND deleted_at IS NULL")
        .bind(&id).fetch_one(pool).await?;
    if anzahl_kundenpreise.0 > 0 && !kundenpreise_mitloeschen {
        return Err(AppError::Validation {
            feld: "id".into(),
            meldung: format!(
                "Artikel hat {} Kundenpreise — zum Löschen bestätigen, dass sie mitgelöscht werden sollen",
                anzahl_kundenpreise.0
            ),
        });
    }
    let mut tx = pool.begin().await?;
    if anzahl_kundenpreise.0 > 0 {
        sqlx::query("UPDATE kundenpreis SET deleted_at = ? WHERE artikel_id = ? AND deleted_at IS NULL")
            .bind(jetzt()).bind(&id).execute(&mut *tx).await?;
    }
    let r = sqlx::query("UPDATE artikel SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(jetzt()).bind(&id).execute(&mut *tx).await?;
    if r.rows_affected() == 0 { return Err(AppError::NichtGefunden); }
    tx.commit().await?;
    Ok(())
}

pub async fn kundenpreis_liste(pool: &SqlitePool, artikel_id: String) -> AppResult<Vec<Kundenpreis>> {
    Ok(sqlx::query_as(
        "SELECT id, artikel_id, kunde_id, preis_cent, gueltig_ab FROM kundenpreis \
         WHERE artikel_id = ? AND deleted_at IS NULL ORDER BY gueltig_ab")
        .bind(&artikel_id).fetch_all(pool).await?)
}

pub async fn kundenpreis_speichern(pool: &SqlitePool, mut kp: Kundenpreis) -> AppResult<Kundenpreis> {
    if kp.id.is_empty() {
        let vorhanden: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM kundenpreis \
             WHERE artikel_id = ? AND kunde_id = ? AND gueltig_ab IS ? AND deleted_at IS NULL")
            .bind(&kp.artikel_id).bind(&kp.kunde_id).bind(&kp.gueltig_ab)
            .fetch_one(pool).await?;
        if vorhanden.0 > 0 {
            return Err(AppError::Validation {
                feld: "gueltig_ab".into(),
                meldung: "Für diesen Kunden und dieses Gültig-ab-Datum existiert bereits ein Kundenpreis".into(),
            });
        }
        kp.id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO kundenpreis (id, artikel_id, kunde_id, preis_cent, gueltig_ab, created_at, updated_at) VALUES (?,?,?,?,?,?,?)")
            .bind(&kp.id).bind(&kp.artikel_id).bind(&kp.kunde_id).bind(kp.preis_cent)
            .bind(&kp.gueltig_ab).bind(jetzt()).bind(jetzt())
            .execute(pool).await?;
    } else {
        sqlx::query("UPDATE kundenpreis SET preis_cent=?, gueltig_ab=?, updated_at=? WHERE id=? AND deleted_at IS NULL")
            .bind(kp.preis_cent).bind(&kp.gueltig_ab).bind(jetzt()).bind(&kp.id)
            .execute(pool).await?;
    }
    Ok(kp)
}

pub async fn kundenpreis_entfernen(pool: &SqlitePool, id: String) -> AppResult<()> {
    let r = sqlx::query("UPDATE kundenpreis SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(jetzt()).bind(&id).execute(pool).await?;
    if r.rows_affected() == 0 { return Err(AppError::NichtGefunden); }
    Ok(())
}

// Dünne Tauri-Wrapper
#[tauri::command]
pub async fn artikel_list(pool: tauri::State<'_, SqlitePool>, suche: Option<String>) -> AppResult<Vec<Artikel>> {
    list(&pool, suche).await
}
#[tauri::command]
pub async fn artikel_create(pool: tauri::State<'_, SqlitePool>, daten: ArtikelNeu) -> AppResult<Artikel> {
    create(&pool, daten).await
}
#[tauri::command]
pub async fn artikel_update(pool: tauri::State<'_, SqlitePool>, artikel: Artikel) -> AppResult<Artikel> {
    update(&pool, artikel).await
}
#[tauri::command]
pub async fn artikel_delete(pool: tauri::State<'_, SqlitePool>, id: String, kundenpreise_mitloeschen: bool) -> AppResult<()> {
    delete(&pool, id, kundenpreise_mitloeschen).await
}
#[tauri::command]
pub async fn kundenpreis_list(pool: tauri::State<'_, SqlitePool>, artikel_id: String) -> AppResult<Vec<Kundenpreis>> {
    kundenpreis_liste(&pool, artikel_id).await
}
#[tauri::command]
pub async fn kundenpreis_save(pool: tauri::State<'_, SqlitePool>, kp: Kundenpreis) -> AppResult<Kundenpreis> {
    kundenpreis_speichern(&pool, kp).await
}
#[tauri::command]
pub async fn kundenpreis_delete(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<()> {
    kundenpreis_entfernen(&pool, id).await
}
#[tauri::command]
pub async fn preis_ermitteln(pool: tauri::State<'_, SqlitePool>, artikel_id: String, kunde_id: String, belegdatum: String) -> AppResult<i64> {
    effektiver_preis(&pool, &artikel_id, &kunde_id, &belegdatum).await
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn test_pool() -> (tempfile::TempDir, sqlx::SqlitePool) {
        let dir = tempfile::tempdir().unwrap();
        let p = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        (dir, p)
    }

    const STUNDE: &str = "e0000000-0000-0000-0000-000000000001";

    fn neu(bezeichnung: &str) -> ArtikelNeu {
        ArtikelNeu {
            bezeichnung: bezeichnung.into(), beschreibung: "".into(),
            einheit_id: STUNDE.into(), standardpreis_cent: 9500,
        }
    }

    async fn kunde(pool: &SqlitePool, name: &str) -> String {
        crate::commands::kunden::create(pool, crate::commands::kunden::KundeNeu {
            typ: "firma".into(), name: name.into(), zahlungsziel_tage: 14,
            notizen: "".into(), ust_idnr: "".into(), email: "".into(),
            leitweg_id: "".into(), kaeuferreferenz: "".into(),
        }).await.unwrap().id
    }

    #[tokio::test]
    async fn create_vergibt_artikelnummer() {
        let (_dir, pool) = test_pool().await;
        let a1 = create(&pool, neu("Beratung")).await.unwrap();
        let a2 = create(&pool, neu("Konzeption")).await.unwrap();
        assert_eq!(a1.artikelnummer, "ART-0001");
        assert_eq!(a2.artikelnummer, "ART-0002");
    }

    #[tokio::test]
    async fn leere_bezeichnung_gibt_validierungsfehler() {
        let (_dir, pool) = test_pool().await;
        let err = create(&pool, neu("  ")).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn negativer_standardpreis_gibt_validierungsfehler() {
        let (_dir, pool) = test_pool().await;
        let mut d = neu("Beratung");
        d.standardpreis_cent = -1;
        let err = create(&pool, d).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { feld, .. } if feld == "standardpreis_cent"));
    }

    #[tokio::test]
    async fn unbekannte_einheit_gibt_validierungsfehler() {
        let (_dir, pool) = test_pool().await;
        let mut d = neu("Beratung");
        d.einheit_id = "does-not-exist".into();
        let err = create(&pool, d).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { feld, .. } if feld == "einheit_id"));
    }

    #[tokio::test]
    async fn suche_filtert_nach_bezeichnung() {
        let (_dir, pool) = test_pool().await;
        create(&pool, neu("Beratung")).await.unwrap();
        create(&pool, neu("Konzeption")).await.unwrap();
        let treffer = list(&pool, Some("berat".into())).await.unwrap();
        assert_eq!(treffer.len(), 1);
        assert_eq!(treffer[0].bezeichnung, "Beratung");
    }

    #[tokio::test]
    async fn update_aendert_artikelnummer_nicht() {
        let (_dir, pool) = test_pool().await;
        let mut a = create(&pool, neu("Beratung")).await.unwrap();
        let alte_nummer = a.artikelnummer.clone();
        a.artikelnummer = "GEFAELSCHT".into();
        a.bezeichnung = "Beratung neu".into();
        update(&pool, a).await.unwrap();
        // Persistierter Wert bleibt unverändert, unabhängig davon, was im Update-Payload stand.
        let persistiert = list(&pool, None).await.unwrap().into_iter().next().unwrap();
        assert_eq!(persistiert.artikelnummer, alte_nummer);
        assert_eq!(persistiert.bezeichnung, "Beratung neu");
    }

    #[tokio::test]
    async fn delete_entfernt_aus_liste() {
        let (_dir, pool) = test_pool().await;
        let a = create(&pool, neu("Beratung")).await.unwrap();
        delete(&pool, a.id.clone(), false).await.unwrap();
        assert!(!list(&pool, None).await.unwrap().iter().any(|x| x.id == a.id));
    }

    #[tokio::test]
    async fn kundenpreis_doppelt_gleiches_gueltig_ab_wird_abgelehnt() {
        let (_dir, pool) = test_pool().await;
        let a = create(&pool, neu("Beratung")).await.unwrap();
        let k = kunde(&pool, "ACME GmbH").await;
        kundenpreis_speichern(&pool, Kundenpreis {
            id: "".into(), artikel_id: a.id.clone(), kunde_id: k.clone(),
            preis_cent: 8000, gueltig_ab: Some("2026-01-01".into()),
        }).await.unwrap();
        let err = kundenpreis_speichern(&pool, Kundenpreis {
            id: "".into(), artikel_id: a.id.clone(), kunde_id: k.clone(),
            preis_cent: 7000, gueltig_ab: Some("2026-01-01".into()),
        }).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { feld, .. } if feld == "gueltig_ab"));
    }

    #[tokio::test]
    async fn kundenpreis_update_umgeht_eindeutigkeitspruefung() {
        let (_dir, pool) = test_pool().await;
        let a = create(&pool, neu("Beratung")).await.unwrap();
        let k = kunde(&pool, "ACME GmbH").await;
        let kp = kundenpreis_speichern(&pool, Kundenpreis {
            id: "".into(), artikel_id: a.id.clone(), kunde_id: k.clone(),
            preis_cent: 8000, gueltig_ab: None,
        }).await.unwrap();
        let kp2 = kundenpreis_speichern(&pool, Kundenpreis {
            id: kp.id.clone(), artikel_id: a.id.clone(), kunde_id: k.clone(),
            preis_cent: 8500, gueltig_ab: None,
        }).await.unwrap();
        assert_eq!(kp2.id, kp.id);
        assert_eq!(kp2.preis_cent, 8500);
    }

    #[tokio::test]
    async fn list_liefert_kundenpreise_anzahl_korrekt() {
        let (_dir, pool) = test_pool().await;
        let a1 = create(&pool, neu("Beratung")).await.unwrap();
        let a2 = create(&pool, neu("Konzeption")).await.unwrap();
        let k = kunde(&pool, "ACME GmbH").await;
        kundenpreis_speichern(&pool, Kundenpreis {
            id: "".into(), artikel_id: a1.id.clone(), kunde_id: k.clone(),
            preis_cent: 8000, gueltig_ab: None,
        }).await.unwrap();
        let kp2 = kundenpreis_speichern(&pool, Kundenpreis {
            id: "".into(), artikel_id: a1.id.clone(), kunde_id: k.clone(),
            preis_cent: 8500, gueltig_ab: Some("2026-01-01".into()),
        }).await.unwrap();
        kundenpreis_entfernen(&pool, kp2.id).await.unwrap();

        let liste = list(&pool, None).await.unwrap();
        let gefunden_a1 = liste.iter().find(|x| x.id == a1.id).unwrap();
        let gefunden_a2 = liste.iter().find(|x| x.id == a2.id).unwrap();
        // a1 hat zwei Kundenpreise angelegt, einer davon wieder gelöscht -> zählt nur der verbleibende.
        assert_eq!(gefunden_a1.kundenpreise_anzahl, 1);
        // a2 hat gar keine Kundenpreise.
        assert_eq!(gefunden_a2.kundenpreise_anzahl, 0);
    }

    #[tokio::test]
    async fn delete_loescht_artikel_ohne_kundenpreise() {
        let (_dir, pool) = test_pool().await;
        let a = create(&pool, neu("Beratung")).await.unwrap();
        delete(&pool, a.id, false).await.unwrap();
        let liste = list(&pool, None).await.unwrap();
        assert!(liste.is_empty());
    }

    #[tokio::test]
    async fn delete_lehnt_ab_bei_kundenpreisen_ohne_bestaetigung() {
        let (_dir, pool) = test_pool().await;
        let a = create(&pool, neu("Beratung")).await.unwrap();
        let k = kunde(&pool, "ACME GmbH").await;
        kundenpreis_speichern(&pool, Kundenpreis {
            id: "".into(), artikel_id: a.id.clone(), kunde_id: k, preis_cent: 4000, gueltig_ab: None,
        }).await.unwrap();

        let err = delete(&pool, a.id, false).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn delete_loescht_artikel_und_kundenpreise_gemeinsam_bei_bestaetigung() {
        let (_dir, pool) = test_pool().await;
        let a = create(&pool, neu("Beratung")).await.unwrap();
        let k = kunde(&pool, "ACME GmbH").await;
        let kp = kundenpreis_speichern(&pool, Kundenpreis {
            id: "".into(), artikel_id: a.id.clone(), kunde_id: k, preis_cent: 4000, gueltig_ab: None,
        }).await.unwrap();

        delete(&pool, a.id.clone(), true).await.unwrap();

        let liste = list(&pool, None).await.unwrap();
        assert!(liste.is_empty());
        let roh: (Option<String>,) = sqlx::query_as("SELECT deleted_at FROM kundenpreis WHERE id = ?")
            .bind(&kp.id).fetch_one(&pool).await.unwrap();
        assert!(roh.0.is_some());
    }
}
