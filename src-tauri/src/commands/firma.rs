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
    /// Fax — rechtlich nicht vorgeschrieben, anders als die übrigen Kontaktfelder,
    /// manche Kunden verlangen sie trotzdem noch.
    pub fax: String,
    /// Name des Ansprechpartners (BT-41). Ohne die Gruppe SELLER CONTACT (BG-6)
    /// lehnt der amtliche Validator die Rechnung ab (BR-DE-2).
    pub kontakt_name: String,
    /// Jahr der Gründung, sofern bekannt. Entscheidet über die im laufenden Jahr
    /// maßgebliche Umsatzgrenze: Im Gründungsjahr gibt es kein Vorjahr, an dem
    /// die 25.000-€-Grenze ansetzen könnte — sie gilt dann sofort.
    pub gruendungsjahr: Option<i64>,
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
    // Eine falsche IBAN fällt sonst erst auf, wenn der Kunde nicht zahlen kann —
    // oder gar nicht: Der XRechnung-Validator lehnt das Dokument schon bei einer
    // syntaktisch falschen IBAN ab (BR-DE-19).
    crate::domain::bankverbindung::pruefe_iban(&firma.iban)?;
    crate::domain::bankverbindung::pruefe_bic(&firma.bic)?;
    pruefe_gruendungsjahr(firma.gruendungsjahr)?;
    Ok(())
}

/// Prüft das Gründungsjahr auf Plausibilität.
///
/// Das Feld ist freiwillig — wer es leer lässt, wird nicht aufgehalten. Steht
/// aber etwas darin, muss es ein Jahr sein, in dem ein Unternehmen gegründet
/// worden sein kann: nicht in der Zukunft, und nicht vor 1900.
///
/// Es hängt an der Kleinunternehmergrenze: Im Gründungsjahr gilt bereits das
/// laufende Jahr statt des Vorjahres. Ein unsinniger Wert verschöbe die
/// Beurteilung nach § 19 UStG, ohne dass jemand den Zusammenhang bemerkte.
fn pruefe_gruendungsjahr(jahr: Option<i64>) -> AppResult<()> {
    let Some(jahr) = jahr else { return Ok(()) };
    let heute: i64 = chrono::Local::now()
        .format("%Y")
        .to_string()
        .parse()
        .unwrap_or(1970);
    if !(1900..=heute).contains(&jahr) {
        return Err(AppError::Validation {
            feld: "gruendungsjahr".into(),
            meldung: format!("Das Gründungsjahr muss zwischen 1900 und {heute} liegen."),
        });
    }
    Ok(())
}

/// Prüft die Firmendaten, ohne sie zu speichern.
///
/// Der Einrichtungsassistent fragt damit nach dem ersten Schritt nach, statt
/// den Nutzer erst nach fünf Schritten mit einem Tippfehler in der IBAN
/// zurückzuschicken. Absichtlich dieselbe Funktion wie beim Speichern: Eine
/// zweite Regelmenge im Frontend liefe über kurz oder lang auseinander — und
/// die IBAN-Prüfsumme dort nachzubauen wäre ohnehin Unfug.
pub fn pruefen(firma: Firma) -> AppResult<()> {
    pruefe_firma(&firma)
}

pub async fn get(pool: &SqlitePool) -> AppResult<Firma> {
    Ok(sqlx::query_as(
        "SELECT id, name, strasse, plz, ort, land, steuernummer, ust_idnr, iban, bic, email, telefon, fax, kontakt_name, gruendungsjahr, kleinunternehmer, eingerichtet \
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
        "UPDATE firma SET name=?, strasse=?, plz=?, ort=?, land=?, steuernummer=?, ust_idnr=?, iban=?, bic=?, email=?, telefon=?, fax=?, kontakt_name=?, gruendungsjahr=?, kleinunternehmer=?, eingerichtet=1, updated_at=? \
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
    .bind(firma.fax.trim())
    .bind(firma.kontakt_name.trim())
    .bind(firma.gruendungsjahr)
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
pub fn firma_pruefen(firma: Firma) -> AppResult<()> {
    pruefen(firma)
}

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

    /// Eine gültige Firma als Ausgangspunkt.
    async fn gueltige_firma(pool: &sqlx::SqlitePool) -> Firma {
        let mut f = get(pool).await.unwrap();
        f.name = "Testfirma".into();
        f.steuernummer = "12/345/67890".into();
        f
    }

    #[tokio::test]
    async fn gruendungsjahr_darf_nicht_negativ_sein() {
        // Das Eingabefeld ließ -1 zu, und niemand widersprach.
        let (_dir, pool) = test_pool().await;
        let mut f = gueltige_firma(&pool).await;
        f.gruendungsjahr = Some(-1);
        let fehler = save(&pool, f).await;
        assert!(matches!(fehler, Err(AppError::Validation { .. })), "{fehler:?}");
    }

    #[tokio::test]
    async fn gruendungsjahr_darf_nicht_in_der_zukunft_liegen() {
        // Gegründet werden kann nur, was es schon gibt. Ein künftiges Jahr
        // verschöbe zudem die Umsatzgrenze nach § 19 UStG ins Unbestimmte.
        let (_dir, pool) = test_pool().await;
        let mut f = gueltige_firma(&pool).await;
        let naechstes_jahr: i64 = chrono::Local::now().format("%Y").to_string().parse::<i64>().unwrap() + 1;
        f.gruendungsjahr = Some(naechstes_jahr);
        let fehler = save(&pool, f).await;
        assert!(matches!(fehler, Err(AppError::Validation { .. })), "{fehler:?}");
    }

    #[tokio::test]
    async fn ein_plausibles_gruendungsjahr_wird_angenommen() {
        let (_dir, pool) = test_pool().await;
        let mut f = gueltige_firma(&pool).await;
        f.gruendungsjahr = Some(2024);
        assert!(save(&pool, f).await.is_ok());
    }

    #[tokio::test]
    async fn ohne_gruendungsjahr_bleibt_es_zulaessig() {
        // Das Feld ist freiwillig; wer es leer lässt, soll nicht aufgehalten werden.
        let (_dir, pool) = test_pool().await;
        let mut f = gueltige_firma(&pool).await;
        f.gruendungsjahr = None;
        assert!(save(&pool, f).await.is_ok());
    }

    #[tokio::test]
    async fn pruefen_meldet_denselben_fehler_wie_speichern_ohne_zu_schreiben() {
        // Der Einrichtungsassistent fragt damit nach jedem Schritt nach, statt
        // erst am Ende. Würde die Prüfung eigene Regeln mitbringen, liefen sie
        // über kurz oder lang auseinander.
        let (_dir, pool) = test_pool().await;
        let mut f = gueltige_firma(&pool).await;
        f.iban = "DE99999999999999999999".into();

        let beim_pruefen = pruefen(f.clone()).unwrap_err();
        let beim_speichern = save(&pool, f).await.unwrap_err();
        assert_eq!(format!("{beim_pruefen:?}"), format!("{beim_speichern:?}"));

        // Und es wurde nichts geschrieben.
        assert!(!get(&pool).await.unwrap().eingerichtet);
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

    /// Fax ist rein optional — anders als Steuernummer/USt-IdNr oder die
    /// XRechnung-Pflichtfelder E-Mail/Telefon gibt es dafür keine Prüfung,
    /// nur das Speichern und Wiederauslesen muss stimmen.
    #[tokio::test]
    async fn fax_wird_gespeichert_und_wieder_ausgelesen() {
        let (_dir, pool) = test_pool().await;
        let mut f = gueltige_firma(&pool).await;
        f.fax = "030 123456-9".into();
        save(&pool, f).await.unwrap();
        assert_eq!(get(&pool).await.unwrap().fax, "030 123456-9");
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
