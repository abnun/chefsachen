use crate::db::jetzt;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Firma {
    pub id: String,
    pub name: String,
    pub strasse: String,
    pub plz: String,
    pub ort: String,
    pub land: String,
    pub steuernummer: String,
    pub ust_idnr: String,
    pub iban: String,
    pub bic: String,
    /// Elektronische Adresse des Rechnungsstellers (BT-34) und zugleich
    /// E-Mail des Ansprechpartners (BT-43). Für eine gültige XRechnung Pflicht.
    pub email: String,
    /// Telefon des Ansprechpartners (BT-42).
    pub telefon: String,
    /// Name des Ansprechpartners (BT-41). Ohne die Gruppe SELLER CONTACT (BG-6)
    /// lehnt der amtliche Validator die Rechnung ab (BR-DE-2).
    pub kontakt_name: String,
    pub kleinunternehmer: bool,
    pub eingerichtet: bool,
}

fn pruefe_firma(firma: &Firma) -> AppResult<()> {
    if firma.name.trim().is_empty() {
        return Err(AppError::Validation {
            feld: "name".into(),
            meldung: "Name darf nicht leer sein".into(),
        });
    }
    if firma.steuernummer.trim().is_empty() && firma.ust_idnr.trim().is_empty() {
        return Err(AppError::Validation {
            feld: "steuernummer".into(),
            meldung: "Steuernummer oder USt-IdNr. ist erforderlich".into(),
        });
    }
    Ok(())
}

pub async fn get(pool: &SqlitePool) -> AppResult<Firma> {
    Ok(sqlx::query_as(
        "SELECT id, name, strasse, plz, ort, land, steuernummer, ust_idnr, iban, bic, email, telefon, kontakt_name, kleinunternehmer, eingerichtet \
         FROM firma WHERE deleted_at IS NULL LIMIT 1",
    )
    .fetch_one(pool)
    .await?)
}

pub async fn save(pool: &SqlitePool, mut firma: Firma) -> AppResult<Firma> {
    pruefe_firma(&firma)?;
    // eingerichtet wird beim Speichern immer auf true gesetzt: das markiert den
    // Ersteinrichtungs-Assistenten als abgeschlossen.
    firma.eingerichtet = true;
    let r = sqlx::query(
        "UPDATE firma SET name=?, strasse=?, plz=?, ort=?, land=?, steuernummer=?, ust_idnr=?, iban=?, bic=?, email=?, telefon=?, kontakt_name=?, kleinunternehmer=?, eingerichtet=1, updated_at=? \
         WHERE deleted_at IS NULL",
    )
    .bind(firma.name.trim())
    .bind(&firma.strasse)
    .bind(&firma.plz)
    .bind(&firma.ort)
    .bind(&firma.land)
    .bind(firma.steuernummer.trim())
    .bind(firma.ust_idnr.trim())
    .bind(&firma.iban)
    .bind(&firma.bic)
    .bind(firma.email.trim())
    .bind(firma.telefon.trim())
    .bind(firma.kontakt_name.trim())
    .bind(firma.kleinunternehmer)
    .bind(jetzt())
    .execute(pool)
    .await?;
    if r.rows_affected() == 0 {
        return Err(AppError::NichtGefunden);
    }
    firma.name = firma.name.trim().into();
    firma.steuernummer = firma.steuernummer.trim().into();
    firma.ust_idnr = firma.ust_idnr.trim().into();
    Ok(firma)
}

pub async fn logo_set(pool: &SqlitePool, bytes: Vec<u8>) -> AppResult<()> {
    sqlx::query("UPDATE firma SET logo = ?, updated_at = ? WHERE deleted_at IS NULL")
        .bind(bytes)
        .bind(jetzt())
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn logo_get(pool: &SqlitePool) -> AppResult<Option<Vec<u8>>> {
    let row: (Option<Vec<u8>>,) = sqlx::query_as("SELECT logo FROM firma WHERE deleted_at IS NULL LIMIT 1")
        .fetch_one(pool)
        .await?;
    Ok(row.0)
}

// Dünne Tauri-Wrapper
#[tauri::command]
pub async fn firma_get(pool: tauri::State<'_, SqlitePool>) -> AppResult<Firma> {
    get(&pool).await
}
#[tauri::command]
pub async fn firma_save(pool: tauri::State<'_, SqlitePool>, firma: Firma) -> AppResult<Firma> {
    save(&pool, firma).await
}
#[tauri::command]
pub async fn firma_logo_set(pool: tauri::State<'_, SqlitePool>, bytes: Vec<u8>) -> AppResult<()> {
    logo_set(&pool, bytes).await
}
#[tauri::command]
pub async fn firma_logo_get(pool: tauri::State<'_, SqlitePool>) -> AppResult<Option<Vec<u8>>> {
    logo_get(&pool).await
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
    async fn firma_save_erfordert_steuernummer_oder_ustid() {
        let (_dir, pool) = test_pool().await;
        let mut f = get(&pool).await.unwrap();
        f.name = "Test GmbH".into();
        // beides leer -> Validierungsfehler
        let err = save(&pool, f.clone()).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
        f.steuernummer = "12/345/67890".into();
        let gespeichert = save(&pool, f).await.unwrap();
        assert!(gespeichert.eingerichtet);
    }

    #[tokio::test]
    async fn save_akzeptiert_nur_ustidnr() {
        let (_dir, pool) = test_pool().await;
        let mut f = get(&pool).await.unwrap();
        f.name = "Test GmbH".into();
        f.ust_idnr = "DE123456789".into();
        let gespeichert = save(&pool, f).await.unwrap();
        assert!(gespeichert.eingerichtet);
        assert_eq!(gespeichert.ust_idnr, "DE123456789");
    }

    #[tokio::test]
    async fn save_lehnt_leeren_namen_ab() {
        let (_dir, pool) = test_pool().await;
        let mut f = get(&pool).await.unwrap();
        f.name = "  ".into();
        f.steuernummer = "12/345/67890".into();
        let err = save(&pool, f).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { feld, .. } if feld == "name"));
    }

    #[tokio::test]
    async fn logo_set_und_get_roundtrip() {
        let (_dir, pool) = test_pool().await;
        assert_eq!(logo_get(&pool).await.unwrap(), None);
        let bytes = vec![1u8, 2, 3, 4, 5];
        logo_set(&pool, bytes.clone()).await.unwrap();
        assert_eq!(logo_get(&pool).await.unwrap(), Some(bytes));
    }
}
