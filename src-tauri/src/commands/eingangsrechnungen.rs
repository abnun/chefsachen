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
    pub kaeufer_name: String,
    pub kaeufer_strasse: String,
    pub kaeufer_plz: String,
    pub kaeufer_ort: String,
    pub kaeufer_land: String,
    pub verkaeufer_strasse: String,
    pub verkaeufer_plz: String,
    pub verkaeufer_ort: String,
    pub verkaeufer_land: String,
    pub verkaeufer_steuernummer: String,
    pub verkaeufer_email: String,
    pub zahlungsbedingungen: String,
    pub faelligkeitsdatum: String,
    pub iban: String,
    pub bic: String,
    pub bankname: String,
    pub bestellnummer: String,
    pub leitweg_id: String,
    pub lieferantennummer: String,
    pub leistungsdatum: String,
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

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct EingangsrechnungSteuerzeile {
    pub id: String,
    pub eingangsrechnung_id: String,
    pub nettobetrag_cent: i64,
    pub steuersatz_promille: i64,
    pub steuerbetrag_cent: i64,
    pub reihenfolge: i64,
}

#[derive(Debug, Serialize)]
pub struct EingangsrechnungDetail {
    pub eingangsrechnung: Eingangsrechnung,
    pub positionen: Vec<EingangsrechnungPosition>,
    pub steuerzeilen: Vec<EingangsrechnungSteuerzeile>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EingangsrechnungPositionNeu {
    pub bezeichnung: String,
    pub menge: i64,
    pub einzelpreis_cent: i64,
    pub positionssumme_cent: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EingangsrechnungSteuerzeileNeu {
    pub nettobetrag_cent: i64,
    pub steuersatz_promille: i64,
    pub steuerbetrag_cent: i64,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct EingangsrechnungFelderNeu {
    pub rechnungssteller_name: String,
    pub rechnungsnummer: String,
    pub rechnungsdatum: String,
    pub betrag_cent: i64,
    pub waehrung: String,
    pub positionen: Vec<EingangsrechnungPositionNeu>,
    pub kaeufer_name: String,
    pub kaeufer_strasse: String,
    pub kaeufer_plz: String,
    pub kaeufer_ort: String,
    pub kaeufer_land: String,
    pub verkaeufer_strasse: String,
    pub verkaeufer_plz: String,
    pub verkaeufer_ort: String,
    pub verkaeufer_land: String,
    pub verkaeufer_steuernummer: String,
    pub verkaeufer_email: String,
    pub zahlungsbedingungen: String,
    pub faelligkeitsdatum: String,
    pub iban: String,
    pub bic: String,
    pub bankname: String,
    pub bestellnummer: String,
    pub leitweg_id: String,
    pub lieferantennummer: String,
    pub leistungsdatum: String,
    pub steuerzeilen: Vec<EingangsrechnungSteuerzeileNeu>,
}

#[derive(Debug, Serialize)]
pub struct EingangsrechnungVorschau {
    pub geparst: bool,
    pub felder: EingangsrechnungFelderNeu,
    pub ist_duplikat: bool,
}

#[derive(Debug, Deserialize)]
pub struct EingangsrechnungUpdate {
    pub id: String,
    pub rechnungssteller_name: String,
    pub rechnungsnummer: String,
    pub rechnungsdatum: String,
    pub betrag_cent: i64,
    pub waehrung: String,
}

#[derive(Debug, Serialize)]
pub struct EingangsrechnungOriginal {
    pub dateiname: String,
    pub bytes: Vec<u8>,
}

const EINGANGSRECHNUNG_SPALTEN: &str = "id, dateiname, format, rechnungssteller_name, rechnungsnummer, rechnungsdatum, betrag_cent, waehrung, manuell_erfasst, importiert_am, kaeufer_name, kaeufer_strasse, kaeufer_plz, kaeufer_ort, kaeufer_land, verkaeufer_strasse, verkaeufer_plz, verkaeufer_ort, verkaeufer_land, verkaeufer_steuernummer, verkaeufer_email, zahlungsbedingungen, faelligkeitsdatum, iban, bic, bankname, bestellnummer, leitweg_id, lieferantennummer, leistungsdatum";

pub async fn list(pool: &SqlitePool) -> AppResult<Vec<Eingangsrechnung>> {
    let sql = format!("SELECT {EINGANGSRECHNUNG_SPALTEN} FROM eingangsrechnung ORDER BY rechnungsdatum DESC");
    Ok(sqlx::query_as(&sql).fetch_all(pool).await?)
}

pub async fn import_vorschau(pool: &SqlitePool, datei_bytes: Vec<u8>) -> AppResult<EingangsrechnungVorschau> {
    let (_format, geparst) = crate::dokument::eingangsrechnung_parse::verarbeite_datei(&datei_bytes);
    let (geparst_ok, felder) = match geparst {
        Ok(g) => (true, EingangsrechnungFelderNeu {
            rechnungssteller_name: g.rechnungssteller_name,
            rechnungsnummer: g.rechnungsnummer,
            rechnungsdatum: g.rechnungsdatum,
            betrag_cent: g.betrag_cent,
            waehrung: g.waehrung,
            positionen: g.positionen.into_iter().map(|p| EingangsrechnungPositionNeu {
                bezeichnung: p.bezeichnung, menge: p.menge,
                einzelpreis_cent: p.einzelpreis_cent, positionssumme_cent: p.positionssumme_cent,
            }).collect(),
            kaeufer_name: g.kaeufer_name, kaeufer_strasse: g.kaeufer_strasse, kaeufer_plz: g.kaeufer_plz,
            kaeufer_ort: g.kaeufer_ort, kaeufer_land: g.kaeufer_land,
            verkaeufer_strasse: g.verkaeufer_strasse, verkaeufer_plz: g.verkaeufer_plz,
            verkaeufer_ort: g.verkaeufer_ort, verkaeufer_land: g.verkaeufer_land,
            verkaeufer_steuernummer: g.verkaeufer_steuernummer, verkaeufer_email: g.verkaeufer_email,
            zahlungsbedingungen: g.zahlungsbedingungen, faelligkeitsdatum: g.faelligkeitsdatum,
            iban: g.iban, bic: g.bic, bankname: g.bankname,
            bestellnummer: g.bestellnummer, leitweg_id: g.leitweg_id,
            lieferantennummer: g.lieferantennummer, leistungsdatum: g.leistungsdatum,
            steuerzeilen: g.steuerzeilen.into_iter().map(|s| EingangsrechnungSteuerzeileNeu {
                nettobetrag_cent: s.nettobetrag_cent, steuersatz_promille: s.steuersatz_promille,
                steuerbetrag_cent: s.steuerbetrag_cent,
            }).collect(),
        }),
        Err(_) => (false, EingangsrechnungFelderNeu {
            waehrung: "EUR".into(),
            ..Default::default()
        }),
    };

    let ist_duplikat = if !felder.rechnungssteller_name.is_empty() && !felder.rechnungsnummer.is_empty() {
        let anzahl: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM eingangsrechnung WHERE rechnungssteller_name = ? AND rechnungsnummer = ?")
            .bind(&felder.rechnungssteller_name).bind(&felder.rechnungsnummer)
            .fetch_one(pool).await?;
        anzahl.0 > 0
    } else {
        false
    };

    Ok(EingangsrechnungVorschau { geparst: geparst_ok, felder, ist_duplikat })
}

pub async fn speichern(
    pool: &SqlitePool,
    datei_bytes: Vec<u8>,
    dateiname: String,
    felder: EingangsrechnungFelderNeu,
) -> AppResult<Eingangsrechnung> {
    // format und manuell_erfasst werden IMMER serverseitig aus den tatsächlichen
    // Bytes neu abgeleitet — ein vom Frontend übergebener Wert wäre kein
    // Vertrauensanker (Defense in Depth, analog hat_offene_entwuerfe/kunde_delete).
    let format = crate::dokument::eingangsrechnung_parse::erkenne_format(&datei_bytes).to_string();
    let (_, geparst) = crate::dokument::eingangsrechnung_parse::verarbeite_datei(&datei_bytes);
    let manuell_erfasst = geparst.is_err();

    let eingangsrechnung = Eingangsrechnung {
        id: Uuid::new_v4().to_string(), dateiname, format,
        rechnungssteller_name: felder.rechnungssteller_name, rechnungsnummer: felder.rechnungsnummer,
        rechnungsdatum: felder.rechnungsdatum, betrag_cent: felder.betrag_cent, waehrung: felder.waehrung,
        manuell_erfasst, importiert_am: jetzt(),
        kaeufer_name: felder.kaeufer_name, kaeufer_strasse: felder.kaeufer_strasse,
        kaeufer_plz: felder.kaeufer_plz, kaeufer_ort: felder.kaeufer_ort, kaeufer_land: felder.kaeufer_land,
        verkaeufer_strasse: felder.verkaeufer_strasse, verkaeufer_plz: felder.verkaeufer_plz,
        verkaeufer_ort: felder.verkaeufer_ort, verkaeufer_land: felder.verkaeufer_land,
        verkaeufer_steuernummer: felder.verkaeufer_steuernummer, verkaeufer_email: felder.verkaeufer_email,
        zahlungsbedingungen: felder.zahlungsbedingungen, faelligkeitsdatum: felder.faelligkeitsdatum,
        iban: felder.iban, bic: felder.bic, bankname: felder.bankname,
        bestellnummer: felder.bestellnummer, leitweg_id: felder.leitweg_id,
        lieferantennummer: felder.lieferantennummer, leistungsdatum: felder.leistungsdatum,
    };

    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO eingangsrechnung (id, dateiname, format, rohdatei, rechnungssteller_name, rechnungsnummer, rechnungsdatum, betrag_cent, waehrung, manuell_erfasst, importiert_am, kaeufer_name, kaeufer_strasse, kaeufer_plz, kaeufer_ort, kaeufer_land, verkaeufer_strasse, verkaeufer_plz, verkaeufer_ort, verkaeufer_land, verkaeufer_steuernummer, verkaeufer_email, zahlungsbedingungen, faelligkeitsdatum, iban, bic, bankname, bestellnummer, leitweg_id, lieferantennummer, leistungsdatum, created_at, updated_at) \
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(&eingangsrechnung.id).bind(&eingangsrechnung.dateiname).bind(&eingangsrechnung.format)
        .bind(&datei_bytes).bind(&eingangsrechnung.rechnungssteller_name).bind(&eingangsrechnung.rechnungsnummer)
        .bind(&eingangsrechnung.rechnungsdatum).bind(eingangsrechnung.betrag_cent).bind(&eingangsrechnung.waehrung)
        .bind(eingangsrechnung.manuell_erfasst).bind(&eingangsrechnung.importiert_am)
        .bind(&eingangsrechnung.kaeufer_name).bind(&eingangsrechnung.kaeufer_strasse)
        .bind(&eingangsrechnung.kaeufer_plz).bind(&eingangsrechnung.kaeufer_ort).bind(&eingangsrechnung.kaeufer_land)
        .bind(&eingangsrechnung.verkaeufer_strasse).bind(&eingangsrechnung.verkaeufer_plz)
        .bind(&eingangsrechnung.verkaeufer_ort).bind(&eingangsrechnung.verkaeufer_land)
        .bind(&eingangsrechnung.verkaeufer_steuernummer).bind(&eingangsrechnung.verkaeufer_email)
        .bind(&eingangsrechnung.zahlungsbedingungen).bind(&eingangsrechnung.faelligkeitsdatum)
        .bind(&eingangsrechnung.iban).bind(&eingangsrechnung.bic).bind(&eingangsrechnung.bankname)
        .bind(&eingangsrechnung.bestellnummer).bind(&eingangsrechnung.leitweg_id)
        .bind(&eingangsrechnung.lieferantennummer).bind(&eingangsrechnung.leistungsdatum)
        .bind(jetzt()).bind(jetzt())
        .execute(&mut *tx).await?;

    for (i, pos) in felder.positionen.iter().enumerate() {
        sqlx::query("INSERT INTO eingangsrechnungposition (id, eingangsrechnung_id, bezeichnung, menge, einzelpreis_cent, positionssumme_cent, reihenfolge, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
            .bind(Uuid::new_v4().to_string()).bind(&eingangsrechnung.id).bind(&pos.bezeichnung)
            .bind(pos.menge).bind(pos.einzelpreis_cent).bind(pos.positionssumme_cent).bind(i as i64)
            .bind(jetzt()).bind(jetzt())
            .execute(&mut *tx).await?;
    }
    for (i, s) in felder.steuerzeilen.iter().enumerate() {
        sqlx::query("INSERT INTO eingangsrechnungsteuer (id, eingangsrechnung_id, nettobetrag_cent, steuersatz_promille, steuerbetrag_cent, reihenfolge, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)")
            .bind(Uuid::new_v4().to_string()).bind(&eingangsrechnung.id)
            .bind(s.nettobetrag_cent).bind(s.steuersatz_promille).bind(s.steuerbetrag_cent).bind(i as i64)
            .bind(jetzt()).bind(jetzt())
            .execute(&mut *tx).await?;
    }
    tx.commit().await?;

    Ok(eingangsrechnung)
}

pub async fn get(pool: &SqlitePool, id: String) -> AppResult<EingangsrechnungDetail> {
    let sql = format!("SELECT {EINGANGSRECHNUNG_SPALTEN} FROM eingangsrechnung WHERE id = ?");
    let eingangsrechnung: Eingangsrechnung = sqlx::query_as(&sql).bind(&id).fetch_optional(pool).await?.ok_or(AppError::NichtGefunden)?;
    let positionen: Vec<EingangsrechnungPosition> = sqlx::query_as(
        "SELECT id, eingangsrechnung_id, bezeichnung, menge, einzelpreis_cent, positionssumme_cent, reihenfolge \
         FROM eingangsrechnungposition WHERE eingangsrechnung_id = ? ORDER BY reihenfolge")
        .bind(&id).fetch_all(pool).await?;
    let steuerzeilen: Vec<EingangsrechnungSteuerzeile> = sqlx::query_as(
        "SELECT id, eingangsrechnung_id, nettobetrag_cent, steuersatz_promille, steuerbetrag_cent, reihenfolge \
         FROM eingangsrechnungsteuer WHERE eingangsrechnung_id = ? ORDER BY reihenfolge")
        .bind(&id).fetch_all(pool).await?;
    Ok(EingangsrechnungDetail { eingangsrechnung, positionen, steuerzeilen })
}

pub async fn update(pool: &SqlitePool, d: EingangsrechnungUpdate) -> AppResult<Eingangsrechnung> {
    let r = sqlx::query("UPDATE eingangsrechnung SET rechnungssteller_name=?, rechnungsnummer=?, rechnungsdatum=?, betrag_cent=?, waehrung=?, updated_at=? WHERE id=?")
        .bind(&d.rechnungssteller_name).bind(&d.rechnungsnummer).bind(&d.rechnungsdatum)
        .bind(d.betrag_cent).bind(&d.waehrung).bind(jetzt()).bind(&d.id)
        .execute(pool).await?;
    if r.rows_affected() == 0 { return Err(AppError::NichtGefunden); }
    let sql = format!("SELECT {EINGANGSRECHNUNG_SPALTEN} FROM eingangsrechnung WHERE id = ?");
    sqlx::query_as(&sql).bind(&d.id).fetch_optional(pool).await?.ok_or(AppError::NichtGefunden)
}

pub async fn original_exportieren(pool: &SqlitePool, id: String) -> AppResult<EingangsrechnungOriginal> {
    let row: Option<(String, Vec<u8>)> = sqlx::query_as("SELECT dateiname, rohdatei FROM eingangsrechnung WHERE id = ?")
        .bind(&id).fetch_optional(pool).await?;
    let (dateiname, bytes) = row.ok_or(AppError::NichtGefunden)?;
    Ok(EingangsrechnungOriginal { dateiname, bytes })
}

// Dünne Tauri-Wrapper
#[tauri::command]
pub async fn eingangsrechnung_import_vorschau(pool: tauri::State<'_, SqlitePool>, datei_bytes: Vec<u8>) -> AppResult<EingangsrechnungVorschau> {
    import_vorschau(&pool, datei_bytes).await
}
#[tauri::command]
pub async fn eingangsrechnung_speichern(pool: tauri::State<'_, SqlitePool>, datei_bytes: Vec<u8>, dateiname: String, felder: EingangsrechnungFelderNeu) -> AppResult<Eingangsrechnung> {
    speichern(&pool, datei_bytes, dateiname, felder).await
}
#[tauri::command]
pub async fn eingangsrechnung_list(pool: tauri::State<'_, SqlitePool>) -> AppResult<Vec<Eingangsrechnung>> {
    list(&pool).await
}
#[tauri::command]
pub async fn eingangsrechnung_get(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<EingangsrechnungDetail> {
    get(&pool, id).await
}
#[tauri::command]
pub async fn eingangsrechnung_update(pool: tauri::State<'_, SqlitePool>, daten: EingangsrechnungUpdate) -> AppResult<Eingangsrechnung> {
    update(&pool, daten).await
}
#[tauri::command]
pub async fn eingangsrechnung_original_exportieren(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<EingangsrechnungOriginal> {
    original_exportieren(&pool, id).await
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

    #[tokio::test]
    async fn import_vorschau_erkennt_und_parst_xrechnung() {
        let (_dir, pool) = test_pool().await;
        let kontext = crate::dokument::xrechnung::tests::test_kontext(None, 9500);
        let xml = crate::dokument::xrechnung::xml_erzeugen(&kontext).unwrap();
        let vorschau = import_vorschau(&pool, xml.into_bytes()).await.unwrap();
        assert!(vorschau.geparst);
        assert_eq!(vorschau.felder.rechnungsnummer, "RE-2026-0001");
        assert!(!vorschau.ist_duplikat);
        assert_eq!(vorschau.felder.kaeufer_name, "ACME GmbH");
        assert_eq!(vorschau.felder.verkaeufer_steuernummer, "DE123456789");
        assert_eq!(vorschau.felder.iban, "DE00 1234 5678");
    }

    #[tokio::test]
    async fn import_vorschau_liefert_leere_felder_bei_unlesbarer_datei() {
        let (_dir, pool) = test_pool().await;
        let vorschau = import_vorschau(&pool, b"kein gueltiges XML".to_vec()).await.unwrap();
        assert!(!vorschau.geparst);
        assert_eq!(vorschau.felder.rechnungsnummer, "");
    }

    #[tokio::test]
    async fn import_vorschau_erkennt_duplikat() {
        let (_dir, pool) = test_pool().await;
        sqlx::query("INSERT INTO eingangsrechnung (id, dateiname, format, rohdatei, rechnungssteller_name, rechnungsnummer, rechnungsdatum, betrag_cent, waehrung, manuell_erfasst, importiert_am, created_at, updated_at) VALUES ('x','a.xml','xrechnung',x'00','Meine Firma','RE-2026-0001','2026-07-11',9500,'EUR',0,'t','t','t')")
            .execute(&pool).await.unwrap();

        let kontext = crate::dokument::xrechnung::tests::test_kontext(None, 9500);
        let xml = crate::dokument::xrechnung::xml_erzeugen(&kontext).unwrap();
        let vorschau = import_vorschau(&pool, xml.into_bytes()).await.unwrap();
        assert!(vorschau.ist_duplikat);
    }

    #[tokio::test]
    async fn speichern_persistiert_rohdatei_und_felder() {
        let (_dir, pool) = test_pool().await;
        let kontext = crate::dokument::xrechnung::tests::test_kontext(None, 9500);
        let xml = crate::dokument::xrechnung::xml_erzeugen(&kontext).unwrap();
        let felder = EingangsrechnungFelderNeu {
            rechnungssteller_name: "Meine Firma".into(), rechnungsnummer: "RE-2026-0001".into(),
            rechnungsdatum: "2026-07-11".into(), betrag_cent: 9500, waehrung: "EUR".into(),
            positionen: vec![EingangsrechnungPositionNeu {
                bezeichnung: "Beratung".into(), menge: 1000, einzelpreis_cent: 9500, positionssumme_cent: 9500,
            }],
            ..Default::default()
        };
        let gespeichert = speichern(&pool, xml.into_bytes(), "rechnung.xml".into(), felder).await.unwrap();
        assert_eq!(gespeichert.format, "xrechnung");
        assert!(!gespeichert.manuell_erfasst);

        let liste = list(&pool).await.unwrap();
        assert_eq!(liste.len(), 1);
    }

    fn felder_mit_zusatzdaten() -> EingangsrechnungFelderNeu {
        EingangsrechnungFelderNeu {
            rechnungssteller_name: "Gemischt GmbH".into(), rechnungsnummer: "RE-2026-9000".into(),
            rechnungsdatum: "2026-07-01".into(), betrag_cent: 22600, waehrung: "EUR".into(),
            positionen: vec![],
            kaeufer_name: "Käufer GmbH".into(), kaeufer_strasse: "Käuferweg 2".into(),
            kaeufer_plz: "10115".into(), kaeufer_ort: "Berlin".into(), kaeufer_land: "DE".into(),
            verkaeufer_strasse: "Verkäuferweg 1".into(), verkaeufer_plz: "50667".into(),
            verkaeufer_ort: "Köln".into(), verkaeufer_land: "DE".into(),
            verkaeufer_steuernummer: "DE999888777".into(), verkaeufer_email: "info@lieferant-beispiel.de".into(),
            zahlungsbedingungen: "Zahlbar innerhalb von 14 Tagen".into(), faelligkeitsdatum: "2026-07-15".into(),
            iban: "DE11 2222 3333".into(), bic: "TESTDE81XXX".into(), bankname: "Testbank AG".into(),
            bestellnummer: "BEST-1".into(), leitweg_id: "991-1".into(),
            lieferantennummer: "LFT-777".into(), leistungsdatum: "2026-06-28".into(),
            steuerzeilen: vec![
                EingangsrechnungSteuerzeileNeu { nettobetrag_cent: 10000, steuersatz_promille: 190, steuerbetrag_cent: 1900 },
                EingangsrechnungSteuerzeileNeu { nettobetrag_cent: 10000, steuersatz_promille: 70, steuerbetrag_cent: 700 },
            ],
        }
    }

    #[tokio::test]
    async fn speichern_persistiert_zusatzfelder_und_steuerzeilen_in_einer_transaktion() {
        let (_dir, pool) = test_pool().await;
        let gespeichert = speichern(&pool, b"kein gueltiges XML".to_vec(), "gemischt.xml".into(), felder_mit_zusatzdaten()).await.unwrap();
        assert_eq!(gespeichert.kaeufer_name, "Käufer GmbH");
        assert_eq!(gespeichert.verkaeufer_steuernummer, "DE999888777");
        assert_eq!(gespeichert.iban, "DE11 2222 3333");

        let detail = get(&pool, gespeichert.id).await.unwrap();
        // Vollständiger DB-Rundlauf (Insert -> Read-back via get()) für alle neuen
        // Skalarfelder, nicht nur die drei oben am direkt zurückgegebenen Struct.
        assert_eq!(detail.eingangsrechnung.kaeufer_name, "Käufer GmbH");
        assert_eq!(detail.eingangsrechnung.kaeufer_strasse, "Käuferweg 2");
        assert_eq!(detail.eingangsrechnung.kaeufer_plz, "10115");
        assert_eq!(detail.eingangsrechnung.kaeufer_ort, "Berlin");
        assert_eq!(detail.eingangsrechnung.kaeufer_land, "DE");
        assert_eq!(detail.eingangsrechnung.verkaeufer_strasse, "Verkäuferweg 1");
        assert_eq!(detail.eingangsrechnung.verkaeufer_plz, "50667");
        assert_eq!(detail.eingangsrechnung.verkaeufer_ort, "Köln");
        assert_eq!(detail.eingangsrechnung.verkaeufer_land, "DE");
        assert_eq!(detail.eingangsrechnung.verkaeufer_steuernummer, "DE999888777");
        assert_eq!(detail.eingangsrechnung.verkaeufer_email, "info@lieferant-beispiel.de");
        assert_eq!(detail.eingangsrechnung.zahlungsbedingungen, "Zahlbar innerhalb von 14 Tagen");
        assert_eq!(detail.eingangsrechnung.faelligkeitsdatum, "2026-07-15");
        assert_eq!(detail.eingangsrechnung.iban, "DE11 2222 3333");
        assert_eq!(detail.eingangsrechnung.bic, "TESTDE81XXX");
        assert_eq!(detail.eingangsrechnung.bankname, "Testbank AG");
        assert_eq!(detail.eingangsrechnung.bestellnummer, "BEST-1");
        assert_eq!(detail.eingangsrechnung.leitweg_id, "991-1");
        assert_eq!(detail.eingangsrechnung.lieferantennummer, "LFT-777");
        assert_eq!(detail.eingangsrechnung.leistungsdatum, "2026-06-28");
        assert_eq!(detail.steuerzeilen.len(), 2);
        assert_eq!(detail.steuerzeilen[0].steuersatz_promille, 190);
        assert_eq!(detail.steuerzeilen[0].nettobetrag_cent, 10000);
        assert_eq!(detail.steuerzeilen[1].steuersatz_promille, 70);
    }

    #[tokio::test]
    async fn speichern_markiert_manuell_erfasst_bei_nicht_parsbarer_datei() {
        let (_dir, pool) = test_pool().await;
        let felder = EingangsrechnungFelderNeu {
            rechnungssteller_name: "Von Hand eingetragen".into(), rechnungsnummer: "X-1".into(),
            rechnungsdatum: "2026-07-11".into(), betrag_cent: 5000, waehrung: "EUR".into(),
            ..Default::default()
        };
        let gespeichert = speichern(&pool, b"kein gueltiges XML".to_vec(), "unbekannt.xml".into(), felder).await.unwrap();
        assert!(gespeichert.manuell_erfasst);
        assert_eq!(gespeichert.rechnungssteller_name, "Von Hand eingetragen");
    }

    #[tokio::test]
    async fn speichern_leitet_format_serverseitig_ab_unabhaengig_vom_dateinamen() {
        // Kein `format`-Parameter im Command — auch bei einer .xml-benannten Datei
        // mit PDF-Inhalt wird das tatsächliche Format aus den Bytes bestimmt.
        let (_dir, pool) = test_pool().await;
        let minimales_pdf = crate::dokument::pdf::rendern(&crate::dokument::pdf::tests::test_kontext(), None).unwrap();
        let felder = EingangsrechnungFelderNeu { waehrung: "EUR".into(), ..Default::default() };
        let gespeichert = speichern(&pool, minimales_pdf, "täuschung.xml".into(), felder).await.unwrap();
        assert_eq!(gespeichert.format, "zugferd");
    }

    async fn beispiel_speichern(pool: &sqlx::SqlitePool) -> Eingangsrechnung {
        let kontext = crate::dokument::xrechnung::tests::test_kontext(None, 9500);
        let xml = crate::dokument::xrechnung::xml_erzeugen(&kontext).unwrap();
        let felder = EingangsrechnungFelderNeu {
            rechnungssteller_name: "Meine Firma".into(), rechnungsnummer: "RE-2026-0001".into(),
            rechnungsdatum: "2026-07-11".into(), betrag_cent: 9500, waehrung: "EUR".into(),
            positionen: vec![EingangsrechnungPositionNeu {
                bezeichnung: "Beratung".into(), menge: 1000, einzelpreis_cent: 9500, positionssumme_cent: 9500,
            }],
            ..Default::default()
        };
        speichern(pool, xml.into_bytes(), "rechnung.xml".into(), felder).await.unwrap()
    }

    #[tokio::test]
    async fn get_liefert_detail_mit_positionen() {
        let (_dir, pool) = test_pool().await;
        let gespeichert = beispiel_speichern(&pool).await;
        let detail = get(&pool, gespeichert.id).await.unwrap();
        assert_eq!(detail.positionen.len(), 1);
        assert_eq!(detail.positionen[0].bezeichnung, "Beratung");
    }

    #[tokio::test]
    async fn get_liefert_nicht_gefunden_bei_unbekannter_id() {
        let (_dir, pool) = test_pool().await;
        let err = get(&pool, "unbekannt".into()).await.unwrap_err();
        assert!(matches!(err, AppError::NichtGefunden));
    }

    #[tokio::test]
    async fn update_korrigiert_kernfelder_aber_nicht_neue_spalten() {
        let (_dir, pool) = test_pool().await;
        let mut felder = felder_mit_zusatzdaten();
        felder.rechnungsnummer = "RE-2026-0001".into();
        felder.rechnungsdatum = "2026-07-11".into();
        felder.betrag_cent = 9500;
        felder.rechnungssteller_name = "Meine Firma".into();
        let gespeichert = speichern(&pool, b"kein gueltiges XML".to_vec(), "gemischt.xml".into(), felder).await.unwrap();

        let aktualisiert = update(&pool, EingangsrechnungUpdate {
            id: gespeichert.id.clone(), rechnungssteller_name: "Korrigierte Firma".into(),
            rechnungsnummer: "RE-2026-0001".into(), rechnungsdatum: "2026-07-11".into(),
            betrag_cent: 9500, waehrung: "EUR".into(),
        }).await.unwrap();

        assert_eq!(aktualisiert.rechnungssteller_name, "Korrigierte Firma");
        // "kein gueltiges XML" lässt sich nicht parsen, daher war der Datensatz von
        // Anfang an manuell_erfasst = true; update() rührt diese Spalte nicht an,
        // der Wert bleibt also unverändert true.
        assert!(aktualisiert.manuell_erfasst);
        // Die neuen Spalten bleiben unverändert, da eingangsrechnung_update sie nicht anfasst.
        assert_eq!(aktualisiert.kaeufer_name, "Käufer GmbH");
        assert_eq!(aktualisiert.verkaeufer_steuernummer, "DE999888777");
    }

    #[tokio::test]
    async fn original_exportieren_liefert_unveraenderte_rohdatei() {
        let (_dir, pool) = test_pool().await;
        let kontext = crate::dokument::xrechnung::tests::test_kontext(None, 9500);
        let xml = crate::dokument::xrechnung::xml_erzeugen(&kontext).unwrap();
        let felder = EingangsrechnungFelderNeu {
            rechnungssteller_name: "Meine Firma".into(), rechnungsnummer: "RE-2026-0001".into(),
            rechnungsdatum: "2026-07-11".into(), betrag_cent: 9500, waehrung: "EUR".into(),
            ..Default::default()
        };
        let gespeichert = speichern(&pool, xml.clone().into_bytes(), "rechnung.xml".into(), felder).await.unwrap();
        let original = original_exportieren(&pool, gespeichert.id).await.unwrap();
        assert_eq!(original.dateiname, "rechnung.xml");
        assert_eq!(String::from_utf8(original.bytes).unwrap(), xml);
    }
}
