use crate::db::jetzt;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Nummernkreis {
    pub art: String,
    pub format: String,
    pub zaehler: i64,
    pub jahres_reset: bool,
}

pub async fn get(pool: &SqlitePool, key: String) -> AppResult<Option<String>> {
    let row: Option<(String,)> = sqlx::query_as("SELECT value FROM einstellung WHERE key = ?")
        .bind(&key)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|r| r.0))
}

pub async fn set(pool: &SqlitePool, key: String, value: String) -> AppResult<()> {
    sqlx::query(
        "INSERT INTO einstellung (key, value, created_at, updated_at) VALUES (?, ?, ?, ?) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(&key)
    .bind(&value)
    .bind(jetzt())
    .bind(jetzt())
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list(pool: &SqlitePool) -> AppResult<Vec<(String, String)>> {
    let rows: Vec<(String, String)> = sqlx::query_as("SELECT key, value FROM einstellung ORDER BY key")
        .fetch_all(pool)
        .await?;
    Ok(rows)
}

pub async fn nummernkreis_list_intern(pool: &SqlitePool) -> AppResult<Vec<Nummernkreis>> {
    Ok(sqlx::query_as(
        "SELECT art, format, zaehler, jahres_reset FROM nummernkreis WHERE deleted_at IS NULL ORDER BY art",
    )
    .fetch_all(pool)
    .await?)
}

pub async fn nummernkreis_update_intern(
    pool: &SqlitePool,
    art: String,
    format: String,
    jahres_reset: bool,
) -> AppResult<()> {
    if !format.contains("{lfd") {
        return Err(AppError::Validation {
            feld: "format".into(),
            meldung: "Format muss einen {lfd:n}-Platzhalter enthalten".into(),
        });
    }
    // WICHTIG: zaehler und jahr werden hier bewusst NICHT angefasst — die werden
    // ausschließlich von domain::nummernkreis::naechste_nummer verändert.
    let r = sqlx::query(
        "UPDATE nummernkreis SET format = ?, jahres_reset = ?, updated_at = ? WHERE art = ? AND deleted_at IS NULL",
    )
    .bind(&format)
    .bind(jahres_reset)
    .bind(jetzt())
    .bind(&art)
    .execute(pool)
    .await?;
    if r.rows_affected() == 0 {
        return Err(AppError::NichtGefunden);
    }
    Ok(())
}

// Dünne Tauri-Wrapper
#[tauri::command]
pub async fn einstellung_get(pool: tauri::State<'_, SqlitePool>, key: String) -> AppResult<Option<String>> {
    get(&pool, key).await
}
#[tauri::command]
pub async fn einstellung_set(pool: tauri::State<'_, SqlitePool>, key: String, value: String) -> AppResult<()> {
    set(&pool, key, value).await
}
#[tauri::command]
pub async fn einstellung_list(pool: tauri::State<'_, SqlitePool>) -> AppResult<Vec<(String, String)>> {
    list(&pool).await
}
#[tauri::command]
pub async fn nummernkreis_list(pool: tauri::State<'_, SqlitePool>) -> AppResult<Vec<Nummernkreis>> {
    nummernkreis_list_intern(&pool).await
}
#[tauri::command]
pub async fn nummernkreis_update(
    pool: tauri::State<'_, SqlitePool>,
    art: String,
    format: String,
    jahres_reset: bool,
) -> AppResult<()> {
    nummernkreis_update_intern(&pool, art, format, jahres_reset).await
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn test_pool() -> (tempfile::TempDir, sqlx::SqlitePool) {
        let dir = tempfile::tempdir().unwrap();
        let p = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        (dir, p)
    }

    #[tokio::test]
    async fn set_get_roundtrip_und_ueberschreiben() {
        let (_dir, pool) = test_pool().await;
        set(&pool, "meine.einstellung".into(), "wert1".into()).await.unwrap();
        assert_eq!(get(&pool, "meine.einstellung".into()).await.unwrap(), Some("wert1".into()));
        // zweiter set-Aufruf muss den Wert überschreiben (Upsert), nicht fehlschlagen
        set(&pool, "meine.einstellung".into(), "wert2".into()).await.unwrap();
        assert_eq!(get(&pool, "meine.einstellung".into()).await.unwrap(), Some("wert2".into()));
    }

    #[tokio::test]
    async fn get_unbekannter_key_gibt_none() {
        let (_dir, pool) = test_pool().await;
        assert_eq!(get(&pool, "nicht.vorhanden".into()).await.unwrap(), None);
    }

    #[tokio::test]
    async fn nummernkreis_update_lehnt_format_ohne_platzhalter_ab() {
        let (_dir, pool) = test_pool().await;
        let err = nummernkreis_update_intern(&pool, "kunde".into(), "KD-ohne-platzhalter".into(), false)
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::Validation { feld, .. } if feld == "format"));
    }

    #[tokio::test]
    async fn nummernkreis_update_laesst_zaehler_unangetastet() {
        let (_dir, pool) = test_pool().await;
        // Zähler auf einen bekannten Wert hochzählen
        let n1 = crate::domain::nummernkreis::naechste_nummer(&pool, "kunde").await.unwrap();
        assert_eq!(n1, "KD-0001");
        // Format/jahres_reset ändern
        nummernkreis_update_intern(&pool, "kunde".into(), "K-{lfd:5}".into(), true).await.unwrap();
        // Zähler muss unverändert bleiben
        let liste = nummernkreis_list_intern(&pool).await.unwrap();
        let kunde = liste.iter().find(|n| n.art == "kunde").unwrap();
        assert_eq!(kunde.zaehler, 1);
        assert_eq!(kunde.format, "K-{lfd:5}");
        assert!(kunde.jahres_reset);
    }

    #[tokio::test]
    async fn nummernkreis_update_unbekannte_art_gibt_nicht_gefunden() {
        let (_dir, pool) = test_pool().await;
        let err = nummernkreis_update_intern(&pool, "unbekannt".into(), "X-{lfd:3}".into(), false)
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::NichtGefunden));
    }

    #[tokio::test]
    async fn nummernkreis_list_enthaelt_alle_vier_seeds() {
        let (_dir, pool) = test_pool().await;
        let liste = nummernkreis_list_intern(&pool).await.unwrap();
        assert_eq!(liste.len(), 4);
    }
}
