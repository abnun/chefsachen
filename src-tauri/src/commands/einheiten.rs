use crate::db::jetzt;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Einheit {
    pub id: String,
    pub name: String,
    pub kuerzel: String,
}

fn pruefe_name(name: &str) -> AppResult<()> {
    if name.trim().is_empty() {
        return Err(AppError::Validation {
            feld: "name".into(),
            meldung: "Name darf nicht leer sein".into(),
        });
    }
    Ok(())
}

pub async fn list(pool: &SqlitePool) -> AppResult<Vec<Einheit>> {
    Ok(sqlx::query_as("SELECT id, name, kuerzel FROM einheit WHERE deleted_at IS NULL ORDER BY name")
        .fetch_all(pool).await?)
}

pub async fn create(pool: &SqlitePool, name: String, kuerzel: String) -> AppResult<Einheit> {
    pruefe_name(&name)?;
    let e = Einheit { id: Uuid::new_v4().to_string(), name: name.trim().into(), kuerzel };
    sqlx::query("INSERT INTO einheit (id, name, kuerzel, created_at, updated_at) VALUES (?,?,?,?,?)")
        .bind(&e.id).bind(&e.name).bind(&e.kuerzel).bind(jetzt()).bind(jetzt())
        .execute(pool).await?;
    Ok(e)
}

pub async fn update(pool: &SqlitePool, id: String, name: String, kuerzel: String) -> AppResult<Einheit> {
    pruefe_name(&name)?;
    let r = sqlx::query("UPDATE einheit SET name = ?, kuerzel = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(name.trim()).bind(&kuerzel).bind(jetzt()).bind(&id)
        .execute(pool).await?;
    if r.rows_affected() == 0 { return Err(AppError::NichtGefunden); }
    Ok(Einheit { id, name: name.trim().into(), kuerzel })
}

pub async fn delete(pool: &SqlitePool, id: String) -> AppResult<()> {
    let in_verwendung: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM artikel WHERE einheit_id = ? AND deleted_at IS NULL")
        .bind(&id).fetch_one(pool).await?;
    if in_verwendung.0 > 0 {
        return Err(AppError::Validation {
            feld: "id".into(),
            meldung: "Einheit wird von Artikeln verwendet und kann nicht gelöscht werden".into(),
        });
    }
    let r = sqlx::query("UPDATE einheit SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(jetzt()).bind(&id).execute(pool).await?;
    if r.rows_affected() == 0 { return Err(AppError::NichtGefunden); }
    Ok(())
}

// Dünne Tauri-Wrapper
#[tauri::command]
pub async fn einheit_list(pool: tauri::State<'_, SqlitePool>) -> AppResult<Vec<Einheit>> {
    list(&pool).await
}
#[tauri::command]
pub async fn einheit_create(pool: tauri::State<'_, SqlitePool>, name: String, kuerzel: String) -> AppResult<Einheit> {
    create(&pool, name, kuerzel).await
}
#[tauri::command]
pub async fn einheit_update(pool: tauri::State<'_, SqlitePool>, id: String, name: String, kuerzel: String) -> AppResult<Einheit> {
    update(&pool, id, name, kuerzel).await
}
#[tauri::command]
pub async fn einheit_delete(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<()> {
    delete(&pool, id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Gibt (Guard, Pool) zurück — der Guard hält das Temp-Verzeichnis am Leben
    /// und räumt es am Testende auf. Dieses Muster in allen Command-Tests verwenden.
    async fn test_pool() -> (tempfile::TempDir, sqlx::SqlitePool) {
        let dir = tempfile::tempdir().unwrap();
        let p = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        (dir, p)
    }

    #[tokio::test]
    async fn create_list_update_delete() {
        let (_dir, pool) = test_pool().await;
        let e = create(&pool, "Minute".into(), "Min.".into()).await.unwrap();
        assert!(list(&pool).await.unwrap().iter().any(|x| x.id == e.id));
        let e2 = update(&pool, e.id.clone(), "Minuten".into(), "Min.".into()).await.unwrap();
        assert_eq!(e2.name, "Minuten");
        delete(&pool, e.id.clone()).await.unwrap();
        assert!(!list(&pool).await.unwrap().iter().any(|x| x.id == e.id));
    }

    #[tokio::test]
    async fn leerer_name_gibt_validierungsfehler() {
        let (_dir, pool) = test_pool().await;
        let err = create(&pool, "  ".into(), "x".into()).await.unwrap_err();
        assert!(matches!(err, crate::error::AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn verwendete_einheit_kann_nicht_geloescht_werden() {
        let (_dir, pool) = test_pool().await;
        let stunde = "e0000000-0000-0000-0000-000000000001"; // Seed-Einheit
        sqlx::query("INSERT INTO artikel (id, artikelnummer, bezeichnung, einheit_id, standardpreis_cent, created_at, updated_at) VALUES ('a1','ART-0001','Beratung',?,9500,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')")
            .bind(stunde).execute(&pool).await.unwrap();
        let err = delete(&pool, stunde.into()).await.unwrap_err();
        assert!(matches!(err, crate::error::AppError::Validation { .. }));
    }
}
