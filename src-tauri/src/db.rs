use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use std::path::Path;

pub async fn init_db(path: &Path) -> Result<SqlitePool, sqlx::Error> {
    let opts = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .foreign_keys(true);
    // WICHTIG: max_connections(1) ist tragend! Die Nummernkreis-Vergabe (Task 3)
    // macht Read-then-Update in einer Transaktion; die Einzelverbindung
    // serialisiert alle Schreibzugriffe. Nicht erhöhen ohne die Vergabe auf
    // "UPDATE ... RETURNING" umzustellen.
    let pool = SqlitePoolOptions::new().max_connections(1).connect_with(opts).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
}

/// ISO-8601-UTC-Zeitstempel für created_at/updated_at.
/// Format identisch zu den Seeds in der Migration (strftime('%Y-%m-%dT%H:%M:%SZ')),
/// damit alle Zeitstempel einheitlich und lexikographisch sortierbar sind.
pub fn jetzt() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn init_db_legt_datei_an_und_migriert() {
        let dir = tempfile::tempdir().unwrap();
        let pool = init_db(&dir.path().join("test.db")).await.unwrap();
        let n: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM einheit")
            .fetch_one(&pool).await.unwrap();
        assert!(n.0 >= 5, "Seed-Einheiten fehlen");
    }
}
