use crate::db::jetzt;
use crate::error::{AppError, AppResult};

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

/// Vergibt die nächste Nummer einer Nummernart.
///
/// Nimmt eine **Verbindung** statt eines Pools entgegen, damit der Aufrufer sie
/// in seine eigene Transaktion einbinden kann. Vorher öffnete diese Funktion
/// eine eigene Transaktion und committete sofort; schlug der darauf folgende
/// Schritt fehl, war die Nummer verbraucht und der Nummernkreis hatte eine
/// Lücke. Die Spezifikation verlangt ausdrücklich „keine Duplikate **oder
/// Lücken** durch Abstürze".
///
/// Das Hochzählen geschieht in einem einzigen `UPDATE … RETURNING` statt in
/// Lesen-dann-Schreiben. Dadurch hängt die Korrektheit nicht mehr daran, dass
/// der Verbindungspool auf eine Verbindung beschränkt bleibt.
pub async fn naechste_nummer(
    conn: &mut sqlx::SqliteConnection,
    art: &str,
    belegdatum: Option<&str>,
) -> AppResult<String> {
    // Das Jahr richtet sich nach dem Beleg, nicht nach der Uhr: Eine am
    // 2. Januar für den Vorjahresumsatz gestellte Rechnung gehört in den
    // Nummernkreis des Belegjahres. Ohne Belegdatum (Kunden, Artikel) gilt das
    // heutige Datum in lokaler Zeit — UTC lieferte in deutscher Sommerzeit ab
    // 22 Uhr bereits den Folgetag.
    let aktuelles_jahr: i64 = belegdatum
        .and_then(|d| d.get(..4))
        .and_then(|j| j.parse().ok())
        .unwrap_or_else(|| chrono::Local::now().format("%Y").to_string().parse().unwrap_or(1970));

    let zeile: Option<(String, i64)> = sqlx::query_as(
        "UPDATE nummernkreis \
         SET zaehler = CASE WHEN jahres_reset != 0 AND jahr != ?1 THEN 1 ELSE zaehler + 1 END, \
             jahr = ?1, \
             updated_at = ?2 \
         WHERE art = ?3 AND deleted_at IS NULL \
         RETURNING format, zaehler",
    )
    .bind(aktuelles_jahr)
    .bind(jetzt())
    .bind(art)
    .fetch_optional(&mut *conn)
    .await?;

    let (format, zaehler) =
        zeile.ok_or_else(|| AppError::Technisch(format!("Nummernkreis '{art}' fehlt")))?;
    Ok(format_nummer(&format, aktuelles_jahr as i32, zaehler))
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
        let mut conn = pool.acquire().await.unwrap();
        let a = naechste_nummer(&mut conn, "kunde", None).await.unwrap();
        let b = naechste_nummer(&mut conn, "kunde", None).await.unwrap();
        assert_eq!(a, "KD-0001");
        assert_eq!(b, "KD-0002");
    }

    /// Eine zurückgerollte Transaktion darf keine Nummer verbrauchen — sonst
    /// entsteht bei jedem fehlgeschlagenen Vorgang eine Lücke.
    #[tokio::test]
    async fn abgebrochene_transaktion_verbraucht_keine_nummer() {
        let dir = tempfile::tempdir().unwrap();
        let pool = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();

        let mut tx = pool.begin().await.unwrap();
        let verworfen = naechste_nummer(&mut tx, "kunde", None).await.unwrap();
        assert_eq!(verworfen, "KD-0001");
        tx.rollback().await.unwrap();

        let mut conn = pool.acquire().await.unwrap();
        let danach = naechste_nummer(&mut conn, "kunde", None).await.unwrap();
        assert_eq!(danach, "KD-0001", "die verworfene Nummer muss wieder frei sein");
    }

    /// Das Jahr richtet sich nach dem Belegdatum, nicht nach der Uhr.
    #[tokio::test]
    async fn jahr_kommt_aus_dem_belegdatum() {
        let dir = tempfile::tempdir().unwrap();
        let pool = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        let mut conn = pool.acquire().await.unwrap();
        let nummer = naechste_nummer(&mut conn, "rechnung", Some("2019-12-31")).await.unwrap();
        assert_eq!(nummer, "RE-2019-0001");
    }

    #[tokio::test]
    async fn jahres_reset_setzt_zaehler_zurueck() {
        let dir = tempfile::tempdir().unwrap();
        let pool = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        sqlx::query("UPDATE nummernkreis SET jahr = jahr - 1, zaehler = 99 WHERE art = 'rechnung'")
            .execute(&pool).await.unwrap();
        let mut conn = pool.acquire().await.unwrap();
        let n = naechste_nummer(&mut conn, "rechnung", None).await.unwrap();
        let jahr = chrono::Local::now().format("%Y").to_string();
        assert_eq!(n, format!("RE-{jahr}-0001"));
    }
}
