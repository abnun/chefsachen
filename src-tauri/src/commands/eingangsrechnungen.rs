use crate::db::jetzt;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Eingangsrechnung {
    pub id: String,
    pub dateiname: String,
    pub format: String,
    pub rechnungssteller_name: String,
    pub rechnungsnummer: String,
    pub rechnungsdatum: String,
    pub betrag_cent: i64,
    pub waehrung: String,
    pub manuell_erfasst: bool,
    pub importiert_am: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct EingangsrechnungPosition {
    pub id: String,
    pub eingangsrechnung_id: String,
    pub bezeichnung: String,
    pub menge: i64,
    pub einzelpreis_cent: i64,
    pub positionssumme_cent: i64,
    pub reihenfolge: i64,
}

#[derive(Debug, Serialize)]
pub struct EingangsrechnungDetail {
    pub eingangsrechnung: Eingangsrechnung,
    pub positionen: Vec<EingangsrechnungPosition>,
}

const EINGANGSRECHNUNG_SPALTEN: &str = "id, dateiname, format, rechnungssteller_name, rechnungsnummer, rechnungsdatum, betrag_cent, waehrung, manuell_erfasst, importiert_am";

pub async fn list(pool: &SqlitePool) -> AppResult<Vec<Eingangsrechnung>> {
    let sql = format!("SELECT {EINGANGSRECHNUNG_SPALTEN} FROM eingangsrechnung ORDER BY rechnungsdatum DESC");
    Ok(sqlx::query_as(&sql).fetch_all(pool).await?)
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
    async fn list_liefert_leere_liste_ohne_eintraege() {
        let (_dir, pool) = test_pool().await;
        let liste = list(&pool).await.unwrap();
        assert!(liste.is_empty());
    }
}
