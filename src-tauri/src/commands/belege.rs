use crate::db::jetzt;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Beleg {
    pub id: String,
    pub typ: String,
    pub nummer: Option<String>,
    pub status: String,
    pub kunde_id: String,
    pub datum: String,
    pub leistungsdatum: String,
    pub zahlungsziel_tage: i64,
    pub kopftext: String,
    pub fusstext: String,
    pub summe_cent: i64,
    pub ursprungsangebot_id: Option<String>,
    pub storno_von_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BelegNeu {
    pub typ: String,
    pub kunde_id: String,
    pub datum: String,
    pub leistungsdatum: String,
    pub zahlungsziel_tage: i64,
    pub kopftext: String,
    pub fusstext: String,
}

#[derive(Debug, Deserialize)]
pub struct BelegUpdate {
    pub id: String,
    pub kunde_id: String,
    pub datum: String,
    pub leistungsdatum: String,
    pub zahlungsziel_tage: i64,
    pub kopftext: String,
    pub fusstext: String,
}

#[derive(Debug, Serialize)]
pub struct BelegDetail {
    pub beleg: Beleg,
    pub positionen: Vec<Belegposition>,
    pub zahlungen: Vec<Zahlung>,
    pub bezahlt_cent: i64,
    pub offener_betrag_cent: i64,
}

const BELEG_SPALTEN: &str = "id, typ, nummer, status, kunde_id, datum, leistungsdatum, zahlungsziel_tage, kopftext, fusstext, summe_cent, ursprungsangebot_id, storno_von_id";

fn pruefe_beleg_neu(typ: &str, datum: &str, leistungsdatum: &str, zahlungsziel_tage: i64) -> AppResult<()> {
    if !["angebot", "rechnung"].contains(&typ) {
        return Err(AppError::Validation { feld: "typ".into(), meldung: "Ungültiger Belegtyp".into() });
    }
    if datum.trim().is_empty() {
        return Err(AppError::Validation { feld: "datum".into(), meldung: "Datum darf nicht leer sein".into() });
    }
    if leistungsdatum.trim().is_empty() {
        return Err(AppError::Validation { feld: "leistungsdatum".into(), meldung: "Leistungsdatum darf nicht leer sein".into() });
    }
    if zahlungsziel_tage < 0 {
        return Err(AppError::Validation { feld: "zahlungsziel_tage".into(), meldung: "Zahlungsziel darf nicht negativ sein".into() });
    }
    Ok(())
}

async fn lade_beleg(pool: &SqlitePool, id: &str) -> AppResult<Beleg> {
    let sql = format!("SELECT {BELEG_SPALTEN} FROM beleg WHERE id = ? AND deleted_at IS NULL");
    sqlx::query_as(&sql).bind(id).fetch_optional(pool).await?.ok_or(AppError::NichtGefunden)
}

fn pruefe_ist_entwurf(beleg: &Beleg) -> AppResult<()> {
    if beleg.status != "entwurf" {
        return Err(AppError::Validation {
            feld: "status".into(),
            meldung: "Nur Entwurfsbelege können bearbeitet werden".into(),
        });
    }
    Ok(())
}

pub async fn create(pool: &SqlitePool, d: BelegNeu) -> AppResult<Beleg> {
    pruefe_beleg_neu(&d.typ, &d.datum, &d.leistungsdatum, d.zahlungsziel_tage)?;
    let kunde_existiert: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM kunde WHERE id = ? AND deleted_at IS NULL")
        .bind(&d.kunde_id).fetch_one(pool).await?;
    if kunde_existiert.0 == 0 {
        return Err(AppError::Validation { feld: "kunde_id".into(), meldung: "Kunde existiert nicht".into() });
    }
    let beleg = Beleg {
        id: Uuid::new_v4().to_string(), typ: d.typ, nummer: None, status: "entwurf".into(),
        kunde_id: d.kunde_id, datum: d.datum, leistungsdatum: d.leistungsdatum,
        zahlungsziel_tage: d.zahlungsziel_tage, kopftext: d.kopftext, fusstext: d.fusstext,
        summe_cent: 0, ursprungsangebot_id: None, storno_von_id: None,
    };
    sqlx::query("INSERT INTO beleg (id, typ, nummer, status, kunde_id, datum, leistungsdatum, zahlungsziel_tage, kopftext, fusstext, summe_cent, ursprungsangebot_id, storno_von_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(&beleg.id).bind(&beleg.typ).bind(&beleg.nummer).bind(&beleg.status).bind(&beleg.kunde_id)
        .bind(&beleg.datum).bind(&beleg.leistungsdatum).bind(beleg.zahlungsziel_tage)
        .bind(&beleg.kopftext).bind(&beleg.fusstext).bind(beleg.summe_cent)
        .bind(&beleg.ursprungsangebot_id).bind(&beleg.storno_von_id).bind(jetzt()).bind(jetzt())
        .execute(pool).await?;
    Ok(beleg)
}

pub async fn list(pool: &SqlitePool, typ: Option<String>, status: Option<String>) -> AppResult<Vec<Beleg>> {
    let sql = format!(
        "SELECT {BELEG_SPALTEN} FROM beleg WHERE deleted_at IS NULL \
         AND (? IS NULL OR typ = ?) AND (? IS NULL OR status = ?) \
         ORDER BY datum DESC, created_at DESC"
    );
    Ok(sqlx::query_as(&sql)
        .bind(typ.clone()).bind(typ)
        .bind(status.clone()).bind(status)
        .fetch_all(pool).await?)
}

pub async fn get(pool: &SqlitePool, id: String) -> AppResult<BelegDetail> {
    let beleg = lade_beleg(pool, &id).await?;
    let positionen: Vec<Belegposition> = sqlx::query_as(
        "SELECT id, beleg_id, artikel_id, bezeichnung, einheit_kuerzel, einzelpreis_cent, menge, positionssumme_cent, reihenfolge \
         FROM belegposition WHERE beleg_id = ? AND deleted_at IS NULL ORDER BY reihenfolge")
        .bind(&id).fetch_all(pool).await?;
    let zahlungen: Vec<Zahlung> = sqlx::query_as(
        "SELECT id, rechnung_id, datum, betrag_cent, notiz FROM zahlung WHERE rechnung_id = ? AND deleted_at IS NULL ORDER BY datum")
        .bind(&id).fetch_all(pool).await?;
    let bezahlt_cent: i64 = zahlungen.iter().map(|z| z.betrag_cent).sum();
    let offener_betrag_cent = beleg.summe_cent - bezahlt_cent;
    Ok(BelegDetail { beleg, positionen, zahlungen, bezahlt_cent, offener_betrag_cent })
}

pub async fn update(pool: &SqlitePool, d: BelegUpdate) -> AppResult<Beleg> {
    let beleg = lade_beleg(pool, &d.id).await?;
    pruefe_ist_entwurf(&beleg)?;
    pruefe_beleg_neu(&beleg.typ, &d.datum, &d.leistungsdatum, d.zahlungsziel_tage)?;
    sqlx::query("UPDATE beleg SET kunde_id=?, datum=?, leistungsdatum=?, zahlungsziel_tage=?, kopftext=?, fusstext=?, updated_at=? WHERE id=?")
        .bind(&d.kunde_id).bind(&d.datum).bind(&d.leistungsdatum).bind(d.zahlungsziel_tage)
        .bind(&d.kopftext).bind(&d.fusstext).bind(jetzt()).bind(&d.id)
        .execute(pool).await?;
    lade_beleg(pool, &d.id).await
}

pub async fn delete(pool: &SqlitePool, id: String) -> AppResult<()> {
    let beleg = lade_beleg(pool, &id).await?;
    pruefe_ist_entwurf(&beleg)?;
    sqlx::query("UPDATE beleg SET deleted_at = ? WHERE id = ?").bind(jetzt()).bind(&id).execute(pool).await?;
    Ok(())
}

// Dünne Tauri-Wrapper
#[tauri::command]
pub async fn beleg_list(pool: tauri::State<'_, SqlitePool>, typ: Option<String>, status: Option<String>) -> AppResult<Vec<Beleg>> {
    list(&pool, typ, status).await
}
#[tauri::command]
pub async fn beleg_get(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<BelegDetail> {
    get(&pool, id).await
}
#[tauri::command]
pub async fn beleg_create(pool: tauri::State<'_, SqlitePool>, daten: BelegNeu) -> AppResult<Beleg> {
    create(&pool, daten).await
}
#[tauri::command]
pub async fn beleg_update(pool: tauri::State<'_, SqlitePool>, daten: BelegUpdate) -> AppResult<Beleg> {
    update(&pool, daten).await
}
#[tauri::command]
pub async fn beleg_delete(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<()> {
    delete(&pool, id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::kunden::{create as kunde_create, KundeNeu};

    async fn test_pool() -> (tempfile::TempDir, sqlx::SqlitePool) {
        let dir = tempfile::tempdir().unwrap();
        let p = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        (dir, p)
    }

    async fn kunde_anlegen(pool: &sqlx::SqlitePool) -> String {
        kunde_create(pool, KundeNeu {
            typ: "firma".into(), name: "ACME GmbH".into(), zahlungsziel_tage: 14,
            notizen: "".into(), ust_idnr: "".into(), email: "".into(),
            leitweg_id: "".into(), kaeuferreferenz: "".into(),
        }).await.unwrap().id
    }

    fn beleg_neu(typ: &str, kunde_id: &str) -> BelegNeu {
        BelegNeu { typ: typ.into(), kunde_id: kunde_id.into(), datum: "2026-07-10".into(),
            leistungsdatum: "2026-07-10".into(), zahlungsziel_tage: 14,
            kopftext: "".into(), fusstext: "".into() }
    }

    #[tokio::test]
    async fn create_erzeugt_entwurf_ohne_nummer() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        assert_eq!(beleg.status, "entwurf");
        assert_eq!(beleg.nummer, None);
        assert_eq!(beleg.summe_cent, 0);
    }

    #[tokio::test]
    async fn create_lehnt_unbekannten_kunden_ab() {
        let (_dir, pool) = test_pool().await;
        let err = create(&pool, beleg_neu("angebot", "unbekannt")).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn list_filtert_nach_typ_und_status() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        let angebote = list(&pool, Some("angebot".into()), None).await.unwrap();
        assert_eq!(angebote.len(), 1);
        assert_eq!(angebote[0].typ, "angebot");
        let entwuerfe = list(&pool, None, Some("entwurf".into())).await.unwrap();
        assert_eq!(entwuerfe.len(), 2);
    }

    #[tokio::test]
    async fn update_aendert_entwurf() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        let aktualisiert = update(&pool, BelegUpdate {
            id: beleg.id.clone(), kunde_id: kunde_id.clone(), datum: "2026-07-11".into(),
            leistungsdatum: "2026-07-11".into(), zahlungsziel_tage: 30,
            kopftext: "Hallo".into(), fusstext: "".into(),
        }).await.unwrap();
        assert_eq!(aktualisiert.datum, "2026-07-11");
        assert_eq!(aktualisiert.zahlungsziel_tage, 30);
    }

    #[tokio::test]
    async fn update_lehnt_nicht_entwurf_ab() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        sqlx::query("UPDATE beleg SET status = 'versendet' WHERE id = ?")
            .bind(&beleg.id).execute(&pool).await.unwrap();
        let err = update(&pool, BelegUpdate {
            id: beleg.id, kunde_id, datum: "2026-07-11".into(), leistungsdatum: "2026-07-11".into(),
            zahlungsziel_tage: 14, kopftext: "".into(), fusstext: "".into(),
        }).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn delete_entfernt_entwurf_aber_nicht_gestellten_beleg() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        delete(&pool, beleg.id.clone()).await.unwrap();
        assert!(matches!(get(&pool, beleg.id).await.unwrap_err(), AppError::NichtGefunden));

        let beleg2 = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        sqlx::query("UPDATE beleg SET status = 'versendet' WHERE id = ?")
            .bind(&beleg2.id).execute(&pool).await.unwrap();
        let err = delete(&pool, beleg2.id).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn get_liefert_leere_positionen_und_zahlungen_fuer_neuen_entwurf() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        let detail = get(&pool, beleg.id).await.unwrap();
        assert!(detail.positionen.is_empty());
        assert!(detail.zahlungen.is_empty());
        assert_eq!(detail.offener_betrag_cent, 0);
    }
}
