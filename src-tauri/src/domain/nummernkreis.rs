use crate::db::jetzt;
use crate::error::{AppError, AppResult};
use sqlx::SqlitePool;

/// Obergrenze für die Stellenzahl in `{lfd:n}`. Das Format ist vom Nutzer frei
/// konfigurierbar; ohne Grenze würde `{lfd:999999999}` gigabyteweise Nullen erzeugen.
pub const MAX_BREITE: usize = 20;

pub fn format_nummer(template: &str, jahr: i32, lfd: i64) -> String {
    let mut s = template.replace("{JJJJ}", &jahr.to_string());
    let mut suchen_ab = 0;
    while let Some(rel) = s[suchen_ab..].find("{lfd") {
        let start = suchen_ab + rel;
        // Ohne schließende Klammer ist der Platzhalter unvollständig. Er bleibt
        // unverändert stehen; die Suche läuft dahinter weiter, damit die
        // Schleife in jedem Fall terminiert.
        let Some(rel_ende) = s[start..].find('}') else {
            suchen_ab = start + 4;
            continue;
        };
        // '}' kann frühestens hinter "{lfd" stehen, daher gilt immer end >= start + 4.
        let end = start + rel_ende;
        let breite = s[start + 4..end]
            .trim_start_matches(':')
            .parse::<usize>()
            .unwrap_or(1)
            .min(MAX_BREITE);
        let ersetzung = format!("{lfd:0breite$}");
        s.replace_range(start..=end, &ersetzung);
        suchen_ab = start + ersetzung.len();
    }
    s
}

pub async fn naechste_nummer(pool: &SqlitePool, art: &str) -> AppResult<String> {
    let mut tx = pool.begin().await?;
    let row: (String, i64, i64, i64) = sqlx::query_as(
        "SELECT format, zaehler, jahres_reset, jahr FROM nummernkreis WHERE art = ? AND deleted_at IS NULL",
    )
    .bind(art)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::Technisch(format!("Nummernkreis '{art}' fehlt")))?;

    let aktuelles_jahr: i32 = chrono::Utc::now().format("%Y").to_string().parse().unwrap();
    let (format, mut zaehler, jahres_reset, jahr) = row;
    if jahres_reset != 0 && (jahr as i32) != aktuelles_jahr {
        zaehler = 0;
    }
    zaehler += 1;
    sqlx::query("UPDATE nummernkreis SET zaehler = ?, jahr = ?, updated_at = ? WHERE art = ?")
        .bind(zaehler).bind(aktuelles_jahr).bind(jetzt()).bind(art)
        .execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(format_nummer(&format, aktuelles_jahr, zaehler))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_ersetzt_jahr_und_laufende_nummer() {
        assert_eq!(format_nummer("RE-{JJJJ}-{lfd:4}", 2026, 7), "RE-2026-0007");
        assert_eq!(format_nummer("KD-{lfd:4}", 2026, 12), "KD-0012");
    }

    // Das Format ist vom Nutzer in den Einstellungen frei konfigurierbar. Ein
    // unvollständiger Platzhalter darf die Nummernvergabe niemals abstürzen
    // lassen — sonst ist die App nach einem Tippfehler unbenutzbar.
    #[test]
    fn unvollstaendiger_platzhalter_stuerzt_nicht_ab() {
        assert_eq!(format_nummer("RE-{lfd", 2026, 7), "RE-{lfd");
        assert_eq!(format_nummer("RE-{lfd:4}-{lfd", 2026, 7), "RE-0007-{lfd");
        assert_eq!(format_nummer("{lfd", 2026, 7), "{lfd");
    }

    #[test]
    fn uebergrosse_breite_wird_begrenzt() {
        // Ohne Begrenzung würde format! hier gigabyteweise Nullen erzeugen.
        assert_eq!(format_nummer("RE-{lfd:999999999}", 2026, 7).len(), 3 + MAX_BREITE);
    }

    #[test]
    fn mehrbyte_zeichen_im_format_stuerzen_nicht_ab() {
        assert_eq!(format_nummer("Rechnung-Ä-{lfd:3}", 2026, 7), "Rechnung-Ä-007");
        assert_eq!(format_nummer("Ä{lfd", 2026, 7), "Ä{lfd");
    }

    #[tokio::test]
    async fn naechste_nummer_zaehlt_hoch_und_ist_eindeutig() {
        let dir = tempfile::tempdir().unwrap();
        let pool = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        let a = naechste_nummer(&pool, "kunde").await.unwrap();
        let b = naechste_nummer(&pool, "kunde").await.unwrap();
        assert_eq!(a, "KD-0001");
        assert_eq!(b, "KD-0002");
    }

    #[tokio::test]
    async fn jahres_reset_setzt_zaehler_zurueck() {
        let dir = tempfile::tempdir().unwrap();
        let pool = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        sqlx::query("UPDATE nummernkreis SET jahr = jahr - 1, zaehler = 99 WHERE art = 'rechnung'")
            .execute(&pool).await.unwrap();
        let n = naechste_nummer(&pool, "rechnung").await.unwrap();
        let jahr = chrono::Utc::now().format("%Y").to_string();
        assert_eq!(n, format!("RE-{jahr}-0001"));
    }
}
