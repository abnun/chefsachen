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

#[derive(Debug, Serialize, Deserialize)]
pub struct EingangsrechnungPositionNeu {
    pub bezeichnung: String,
    pub menge: i64,
    pub einzelpreis_cent: i64,
    pub positionssumme_cent: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EingangsrechnungFelderNeu {
    pub rechnungssteller_name: String,
    pub rechnungsnummer: String,
    pub rechnungsdatum: String,
    pub betrag_cent: i64,
    pub waehrung: String,
    pub positionen: Vec<EingangsrechnungPositionNeu>,
}

#[derive(Debug, Serialize)]
pub struct EingangsrechnungVorschau {
    pub geparst: bool,
    pub felder: EingangsrechnungFelderNeu,
    pub ist_duplikat: bool,
}

const EINGANGSRECHNUNG_SPALTEN: &str = "id, dateiname, format, rechnungssteller_name, rechnungsnummer, rechnungsdatum, betrag_cent, waehrung, manuell_erfasst, importiert_am";

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
        }),
        Err(_) => (false, EingangsrechnungFelderNeu {
            rechnungssteller_name: String::new(), rechnungsnummer: String::new(),
            rechnungsdatum: String::new(), betrag_cent: 0, waehrung: "EUR".into(),
            positionen: vec![],
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
    };

    let mut tx = pool.begin().await?;
    sqlx::query("INSERT INTO eingangsrechnung (id, dateiname, format, rohdatei, rechnungssteller_name, rechnungsnummer, rechnungsdatum, betrag_cent, waehrung, manuell_erfasst, importiert_am, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(&eingangsrechnung.id).bind(&eingangsrechnung.dateiname).bind(&eingangsrechnung.format)
        .bind(&datei_bytes).bind(&eingangsrechnung.rechnungssteller_name).bind(&eingangsrechnung.rechnungsnummer)
        .bind(&eingangsrechnung.rechnungsdatum).bind(eingangsrechnung.betrag_cent).bind(&eingangsrechnung.waehrung)
        .bind(eingangsrechnung.manuell_erfasst).bind(&eingangsrechnung.importiert_am).bind(jetzt()).bind(jetzt())
        .execute(&mut *tx).await?;

    for (i, pos) in felder.positionen.iter().enumerate() {
        sqlx::query("INSERT INTO eingangsrechnungposition (id, eingangsrechnung_id, bezeichnung, menge, einzelpreis_cent, positionssumme_cent, reihenfolge, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
            .bind(Uuid::new_v4().to_string()).bind(&eingangsrechnung.id).bind(&pos.bezeichnung)
            .bind(pos.menge).bind(pos.einzelpreis_cent).bind(pos.positionssumme_cent).bind(i as i64)
            .bind(jetzt()).bind(jetzt())
            .execute(&mut *tx).await?;
    }
    tx.commit().await?;

    Ok(eingangsrechnung)
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
        };
        let gespeichert = speichern(&pool, xml.into_bytes(), "rechnung.xml".into(), felder).await.unwrap();
        assert_eq!(gespeichert.format, "xrechnung");
        assert!(!gespeichert.manuell_erfasst);

        let liste = list(&pool).await.unwrap();
        assert_eq!(liste.len(), 1);
    }

    #[tokio::test]
    async fn speichern_markiert_manuell_erfasst_bei_nicht_parsbarer_datei() {
        let (_dir, pool) = test_pool().await;
        let felder = EingangsrechnungFelderNeu {
            rechnungssteller_name: "Von Hand eingetragen".into(), rechnungsnummer: "X-1".into(),
            rechnungsdatum: "2026-07-11".into(), betrag_cent: 5000, waehrung: "EUR".into(), positionen: vec![],
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
        let felder = EingangsrechnungFelderNeu {
            rechnungssteller_name: "".into(), rechnungsnummer: "".into(),
            rechnungsdatum: "".into(), betrag_cent: 0, waehrung: "EUR".into(), positionen: vec![],
        };
        let gespeichert = speichern(&pool, minimales_pdf, "täuschung.xml".into(), felder).await.unwrap();
        assert_eq!(gespeichert.format, "zugferd");
    }
}
