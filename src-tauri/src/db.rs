use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePool, SqlitePoolOptions};
use std::path::Path;
use std::time::Duration;

pub async fn init_db(path: &Path) -> Result<SqlitePool, sqlx::Error> {
    let opts = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .foreign_keys(true)
        // WAL erlaubt Lesen während eines Schreibvorgangs und verkürzt die
        // Zeitfenster, in denen die Datei gesperrt ist.
        .journal_mode(SqliteJournalMode::Wal)
        // Ohne busy_timeout scheitert ein Zugriff sofort mit SQLITE_BUSY, sobald
        // eine zweite Programminstanz schreibt — der Nutzer sähe eine rohe
        // englische SQLite-Meldung. Mit Wartezeit löst sich das von selbst.
        .busy_timeout(Duration::from_secs(5));
    // Die Nummernvergabe läuft seit P4.1/P4.2 als einzelnes
    // "UPDATE … RETURNING" innerhalb der Transaktion des Aufrufers und ist damit
    // von sich aus atomar. Die Beschränkung auf eine Verbindung ist deshalb
    // keine Voraussetzung für die Korrektheit mehr, bleibt aber als bewusste
    // Vereinfachung: Bei einem Einzelplatzprogramm bringt Nebenläufigkeit auf
    // derselben SQLite-Datei keinen Gewinn, erhöht aber die Zahl der Zustände.
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

    /// Ohne WAL und Wartezeit scheitert ein Zugriff sofort mit SQLITE_BUSY,
    /// sobald eine zweite Programminstanz schreibt.
    #[tokio::test]
    async fn init_db_setzt_wal_und_wartezeit() {
        let dir = tempfile::tempdir().unwrap();
        let pool = init_db(&dir.path().join("test.db")).await.unwrap();
        let modus: (String,) = sqlx::query_as("PRAGMA journal_mode")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(modus.0.to_lowercase(), "wal");
        let wartezeit: (i64,) = sqlx::query_as("PRAGMA busy_timeout")
            .fetch_one(&pool).await.unwrap();
        assert!(wartezeit.0 >= 1000, "Wartezeit zu kurz: {} ms", wartezeit.0);
    }

    /// Zwei gleichzeitige Verbindungen auf dieselbe Datei — der Fall, der beim
    /// versehentlichen Doppelstart der App eintritt.
    #[tokio::test]
    async fn zweite_verbindung_kann_schreiben() {
        let dir = tempfile::tempdir().unwrap();
        let pfad = dir.path().join("test.db");
        let erste = init_db(&pfad).await.unwrap();
        let zweite = init_db(&pfad).await.unwrap();

        sqlx::query("INSERT INTO einstellung (key, value, created_at, updated_at) VALUES (?,?,?,?)")
            .bind("a").bind("1").bind(jetzt()).bind(jetzt())
            .execute(&erste).await.unwrap();
        sqlx::query("INSERT INTO einstellung (key, value, created_at, updated_at) VALUES (?,?,?,?)")
            .bind("b").bind("2").bind(jetzt()).bind(jetzt())
            .execute(&zweite).await.unwrap();

        let anzahl: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM einstellung WHERE key IN ('a','b')")
            .fetch_one(&erste).await.unwrap();
        assert_eq!(anzahl.0, 2);
    }

    #[tokio::test]
    async fn init_db_legt_datei_an_und_migriert() {
        let dir = tempfile::tempdir().unwrap();
        let pool = init_db(&dir.path().join("test.db")).await.unwrap();
        let n: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM einheit")
            .fetch_one(&pool).await.unwrap();
        assert!(n.0 >= 5, "Seed-Einheiten fehlen");
    }
}
