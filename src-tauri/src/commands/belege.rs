use crate::db::jetzt;
use crate::domain::beleg::{belegsumme_cent, positionssumme_cent};
use crate::domain::nummernkreis::naechste_nummer;
use crate::domain::preisfindung::effektiver_preis;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Beleg {
    pub id: String,
    pub typ: String,
    pub nummer: Option<String>,
    pub status: String,
    pub kunde_id: String,
    pub datum: String,
    pub leistungsdatum: String,
    pub zahlungsziel_tage: i64,
    pub kopftext: String,
    pub fusstext: String,
    pub summe_cent: i64,
    pub ursprungsangebot_id: Option<String>,
    pub storno_von_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BelegNeu {
    pub typ: String,
    pub kunde_id: String,
    pub datum: String,
    pub leistungsdatum: String,
    pub zahlungsziel_tage: i64,
    pub kopftext: String,
    pub fusstext: String,
}

#[derive(Debug, Deserialize)]
pub struct BelegUpdate {
    pub id: String,
    pub kunde_id: String,
    pub datum: String,
    pub leistungsdatum: String,
    pub zahlungsziel_tage: i64,
    pub kopftext: String,
    pub fusstext: String,
}

#[derive(Debug, Serialize)]
pub struct BelegDetail {
    pub beleg: Beleg,
    pub positionen: Vec<Belegposition>,
    pub zahlungen: Vec<Zahlung>,
    pub bezahlt_cent: i64,
    pub offener_betrag_cent: i64,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Belegposition {
    pub id: String,
    pub beleg_id: String,
    pub artikel_id: Option<String>,
    pub bezeichnung: String,
    pub einheit_kuerzel: String,
    pub einzelpreis_cent: i64,
    pub menge: i64,
    pub positionssumme_cent: i64,
    pub reihenfolge: i64,
}

#[derive(Debug, Deserialize)]
pub struct BelegpositionNeu {
    pub id: String,
    pub beleg_id: String,
    pub artikel_id: Option<String>,
    pub bezeichnung: String,
    pub einheit_kuerzel: String,
    pub einzelpreis_cent: Option<i64>,
    pub menge: i64,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Zahlung {
    pub id: String,
    pub rechnung_id: String,
    pub datum: String,
    pub betrag_cent: i64,
    pub notiz: String,
}

const BELEG_SPALTEN: &str = "id, typ, nummer, status, kunde_id, datum, leistungsdatum, zahlungsziel_tage, kopftext, fusstext, summe_cent, ursprungsangebot_id, storno_von_id";

fn pruefe_beleg_neu(typ: &str, datum: &str, leistungsdatum: &str, zahlungsziel_tage: i64) -> AppResult<()> {
    if !["angebot", "rechnung"].contains(&typ) {
        return Err(AppError::Validation { feld: "typ".into(), meldung: "Ungültiger Belegtyp".into() });
    }
    if datum.trim().is_empty() {
        return Err(AppError::Validation { feld: "datum".into(), meldung: "Datum darf nicht leer sein".into() });
    }
    if leistungsdatum.trim().is_empty() {
        return Err(AppError::Validation { feld: "leistungsdatum".into(), meldung: "Leistungsdatum darf nicht leer sein".into() });
    }
    if zahlungsziel_tage < 0 {
        return Err(AppError::Validation { feld: "zahlungsziel_tage".into(), meldung: "Zahlungsziel darf nicht negativ sein".into() });
    }
    Ok(())
}

async fn lade_beleg(pool: &SqlitePool, id: &str) -> AppResult<Beleg> {
    let sql = format!("SELECT {BELEG_SPALTEN} FROM beleg WHERE id = ? AND deleted_at IS NULL");
    sqlx::query_as(&sql).bind(id).fetch_optional(pool).await?.ok_or(AppError::NichtGefunden)
}

fn pruefe_ist_entwurf(beleg: &Beleg) -> AppResult<()> {
    if beleg.status != "entwurf" {
        return Err(AppError::Validation {
            feld: "status".into(),
            meldung: "Nur Entwurfsbelege können bearbeitet werden".into(),
        });
    }
    Ok(())
}

pub async fn create(pool: &SqlitePool, d: BelegNeu) -> AppResult<Beleg> {
    pruefe_beleg_neu(&d.typ, &d.datum, &d.leistungsdatum, d.zahlungsziel_tage)?;
    let kunde_existiert: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM kunde WHERE id = ? AND deleted_at IS NULL")
        .bind(&d.kunde_id).fetch_one(pool).await?;
    if kunde_existiert.0 == 0 {
        return Err(AppError::Validation { feld: "kunde_id".into(), meldung: "Kunde existiert nicht".into() });
    }
    let beleg = Beleg {
        id: Uuid::new_v4().to_string(), typ: d.typ, nummer: None, status: "entwurf".into(),
        kunde_id: d.kunde_id, datum: d.datum, leistungsdatum: d.leistungsdatum,
        zahlungsziel_tage: d.zahlungsziel_tage, kopftext: d.kopftext, fusstext: d.fusstext,
        summe_cent: 0, ursprungsangebot_id: None, storno_von_id: None,
    };
    sqlx::query("INSERT INTO beleg (id, typ, nummer, status, kunde_id, datum, leistungsdatum, zahlungsziel_tage, kopftext, fusstext, summe_cent, ursprungsangebot_id, storno_von_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(&beleg.id).bind(&beleg.typ).bind(&beleg.nummer).bind(&beleg.status).bind(&beleg.kunde_id)
        .bind(&beleg.datum).bind(&beleg.leistungsdatum).bind(beleg.zahlungsziel_tage)
        .bind(&beleg.kopftext).bind(&beleg.fusstext).bind(beleg.summe_cent)
        .bind(&beleg.ursprungsangebot_id).bind(&beleg.storno_von_id).bind(jetzt()).bind(jetzt())
        .execute(pool).await?;
    Ok(beleg)
}

pub async fn list(pool: &SqlitePool, typ: Option<String>, status: Option<String>) -> AppResult<Vec<Beleg>> {
    let sql = format!(
        "SELECT {BELEG_SPALTEN} FROM beleg WHERE deleted_at IS NULL \
         AND (? IS NULL OR typ = ?) AND (? IS NULL OR status = ?) \
         ORDER BY datum DESC, created_at DESC"
    );
    Ok(sqlx::query_as(&sql)
        .bind(typ.clone()).bind(typ)
        .bind(status.clone()).bind(status)
        .fetch_all(pool).await?)
}

pub async fn get(pool: &SqlitePool, id: String) -> AppResult<BelegDetail> {
    let beleg = lade_beleg(pool, &id).await?;
    let positionen: Vec<Belegposition> = sqlx::query_as(
        "SELECT id, beleg_id, artikel_id, bezeichnung, einheit_kuerzel, einzelpreis_cent, menge, positionssumme_cent, reihenfolge \
         FROM belegposition WHERE beleg_id = ? AND deleted_at IS NULL ORDER BY reihenfolge")
        .bind(&id).fetch_all(pool).await?;
    let zahlungen: Vec<Zahlung> = sqlx::query_as(
        "SELECT id, rechnung_id, datum, betrag_cent, notiz FROM zahlung WHERE rechnung_id = ? AND deleted_at IS NULL ORDER BY datum")
        .bind(&id).fetch_all(pool).await?;
    let bezahlt_cent: i64 = zahlungen.iter().map(|z| z.betrag_cent).sum();
    let offener_betrag_cent = beleg.summe_cent - bezahlt_cent;
    Ok(BelegDetail { beleg, positionen, zahlungen, bezahlt_cent, offener_betrag_cent })
}

pub async fn update(pool: &SqlitePool, d: BelegUpdate) -> AppResult<Beleg> {
    let beleg = lade_beleg(pool, &d.id).await?;
    pruefe_ist_entwurf(&beleg)?;
    pruefe_beleg_neu(&beleg.typ, &d.datum, &d.leistungsdatum, d.zahlungsziel_tage)?;
    sqlx::query("UPDATE beleg SET kunde_id=?, datum=?, leistungsdatum=?, zahlungsziel_tage=?, kopftext=?, fusstext=?, updated_at=? WHERE id=?")
        .bind(&d.kunde_id).bind(&d.datum).bind(&d.leistungsdatum).bind(d.zahlungsziel_tage)
        .bind(&d.kopftext).bind(&d.fusstext).bind(jetzt()).bind(&d.id)
        .execute(pool).await?;
    lade_beleg(pool, &d.id).await
}

pub async fn delete(pool: &SqlitePool, id: String) -> AppResult<()> {
    let beleg = lade_beleg(pool, &id).await?;
    pruefe_ist_entwurf(&beleg)?;
    sqlx::query("UPDATE beleg SET deleted_at = ? WHERE id = ?").bind(jetzt()).bind(&id).execute(pool).await?;
    Ok(())
}

async fn naechste_reihenfolge(conn: &mut sqlx::SqliteConnection, beleg_id: &str) -> AppResult<i64> {
    let max: (Option<i64>,) = sqlx::query_as(
        "SELECT MAX(reihenfolge) FROM belegposition WHERE beleg_id = ? AND deleted_at IS NULL")
        .bind(beleg_id).fetch_one(&mut *conn).await?;
    Ok(max.0.unwrap_or(-1) + 1)
}

async fn beleg_summe_neu_berechnen(conn: &mut sqlx::SqliteConnection, beleg_id: &str) -> AppResult<()> {
    let summen: Vec<(i64,)> = sqlx::query_as(
        "SELECT positionssumme_cent FROM belegposition WHERE beleg_id = ? AND deleted_at IS NULL")
        .bind(beleg_id).fetch_all(&mut *conn).await?;
    let summe = belegsumme_cent(&summen.iter().map(|s| s.0).collect::<Vec<_>>());
    sqlx::query("UPDATE beleg SET summe_cent = ?, updated_at = ? WHERE id = ?")
        .bind(summe).bind(jetzt()).bind(beleg_id).execute(&mut *conn).await?;
    Ok(())
}

pub async fn position_speichern(pool: &SqlitePool, d: BelegpositionNeu) -> AppResult<Belegposition> {
    let beleg = lade_beleg(pool, &d.beleg_id).await?;
    pruefe_ist_entwurf(&beleg)?;
    if d.menge <= 0 {
        return Err(AppError::Validation { feld: "menge".into(), meldung: "Menge muss größer als 0 sein".into() });
    }

    let (bezeichnung, einheit_kuerzel, einzelpreis_cent) = if let Some(artikel_id) = &d.artikel_id {
        let artikel: (String, String) = sqlx::query_as(
            "SELECT a.bezeichnung, e.kuerzel FROM artikel a JOIN einheit e ON e.id = a.einheit_id \
             WHERE a.id = ? AND a.deleted_at IS NULL")
            .bind(artikel_id).fetch_optional(pool).await?
            .ok_or_else(|| AppError::Validation { feld: "artikel_id".into(), meldung: "Artikel existiert nicht".into() })?;
        let preis = match d.einzelpreis_cent {
            Some(p) => p,
            None => effektiver_preis(pool, artikel_id, &beleg.kunde_id, &beleg.datum).await?,
        };
        (artikel.0, artikel.1, preis)
    } else {
        let preis = d.einzelpreis_cent.ok_or_else(|| AppError::Validation {
            feld: "einzelpreis_cent".into(),
            meldung: "Einzelpreis ist bei Freitextpositionen erforderlich".into(),
        })?;
        if d.bezeichnung.trim().is_empty() {
            return Err(AppError::Validation { feld: "bezeichnung".into(), meldung: "Bezeichnung darf nicht leer sein".into() });
        }
        (d.bezeichnung.trim().to_string(), d.einheit_kuerzel.clone(), preis)
    };

    let summe = positionssumme_cent(d.menge, einzelpreis_cent)?;

    let mut tx = pool.begin().await?;

    let position = if d.id.is_empty() {
        let reihenfolge = naechste_reihenfolge(&mut tx, &d.beleg_id).await?;
        let pos = Belegposition {
            id: Uuid::new_v4().to_string(), beleg_id: d.beleg_id.clone(), artikel_id: d.artikel_id.clone(),
            bezeichnung, einheit_kuerzel, einzelpreis_cent, menge: d.menge,
            positionssumme_cent: summe, reihenfolge,
        };
        sqlx::query("INSERT INTO belegposition (id, beleg_id, artikel_id, bezeichnung, einheit_kuerzel, einzelpreis_cent, menge, positionssumme_cent, reihenfolge, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
            .bind(&pos.id).bind(&pos.beleg_id).bind(&pos.artikel_id).bind(&pos.bezeichnung)
            .bind(&pos.einheit_kuerzel).bind(pos.einzelpreis_cent).bind(pos.menge)
            .bind(pos.positionssumme_cent).bind(pos.reihenfolge).bind(jetzt()).bind(jetzt())
            .execute(&mut *tx).await?;
        pos
    } else {
        let bestehende: (i64,) = sqlx::query_as("SELECT reihenfolge FROM belegposition WHERE id = ? AND deleted_at IS NULL")
            .bind(&d.id).fetch_optional(&mut *tx).await?.ok_or(AppError::NichtGefunden)?;
        sqlx::query("UPDATE belegposition SET artikel_id=?, bezeichnung=?, einheit_kuerzel=?, einzelpreis_cent=?, menge=?, positionssumme_cent=?, updated_at=? WHERE id=?")
            .bind(&d.artikel_id).bind(&bezeichnung).bind(&einheit_kuerzel).bind(einzelpreis_cent)
            .bind(d.menge).bind(summe).bind(jetzt()).bind(&d.id)
            .execute(&mut *tx).await?;
        Belegposition {
            id: d.id.clone(), beleg_id: d.beleg_id.clone(), artikel_id: d.artikel_id.clone(),
            bezeichnung, einheit_kuerzel, einzelpreis_cent, menge: d.menge,
            positionssumme_cent: summe, reihenfolge: bestehende.0,
        }
    };

    beleg_summe_neu_berechnen(&mut tx, &d.beleg_id).await?;
    tx.commit().await?;
    Ok(position)
}

pub async fn position_loeschen(pool: &SqlitePool, id: String) -> AppResult<()> {
    let row: (String,) = sqlx::query_as("SELECT beleg_id FROM belegposition WHERE id = ? AND deleted_at IS NULL")
        .bind(&id).fetch_optional(pool).await?.ok_or(AppError::NichtGefunden)?;
    let beleg = lade_beleg(pool, &row.0).await?;
    pruefe_ist_entwurf(&beleg)?;
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE belegposition SET deleted_at = ? WHERE id = ?").bind(jetzt()).bind(&id).execute(&mut *tx).await?;
    beleg_summe_neu_berechnen(&mut tx, &row.0).await?;
    tx.commit().await?;
    Ok(())
}

fn kunde_snapshot_json(
    kunde: &crate::commands::kunden::Kunde,
    adresse: Option<&crate::commands::kunden::Adresse>,
    firma: &crate::commands::firma::Firma,
) -> String {
    serde_json::json!({
        "kunde": { "name": kunde.name, "kundennummer": kunde.kundennummer, "ust_idnr": kunde.ust_idnr },
        "adresse": adresse.map(|a| serde_json::json!({
            "strasse": a.strasse, "plz": a.plz, "ort": a.ort, "land": a.land,
        })),
        "firma": { "name": firma.name, "strasse": firma.strasse, "plz": firma.plz, "ort": firma.ort,
            "steuernummer": firma.steuernummer, "ust_idnr": firma.ust_idnr, "iban": firma.iban, "bic": firma.bic },
    }).to_string()
}

pub async fn stellen(pool: &SqlitePool, id: String) -> AppResult<Beleg> {
    let beleg = lade_beleg(pool, &id).await?;
    pruefe_ist_entwurf(&beleg)?;
    let anzahl_positionen: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM belegposition WHERE beleg_id = ? AND deleted_at IS NULL")
        .bind(&id).fetch_one(pool).await?;
    if anzahl_positionen.0 == 0 {
        return Err(AppError::Validation { feld: "positionen".into(), meldung: "Beleg benötigt mindestens eine Position".into() });
    }

    let kunde = crate::commands::kunden::get(pool, beleg.kunde_id.clone()).await?;
    let standardadresse = kunde.adressen.iter().find(|a| a.typ == "rechnung" && a.ist_standard);
    let firma = crate::commands::firma::get(pool).await?;
    let snapshot = kunde_snapshot_json(&kunde.kunde, standardadresse, &firma);

    let nummer = naechste_nummer(pool, &beleg.typ).await?;
    let neuer_status = if beleg.typ == "angebot" { "versendet" } else { "gestellt" };
    let ergebnis = sqlx::query(
        "UPDATE beleg SET nummer=?, status=?, kunde_snapshot=?, updated_at=? WHERE id=? AND status = 'entwurf'")
        .bind(&nummer).bind(neuer_status).bind(&snapshot).bind(jetzt()).bind(&id)
        .execute(pool).await?;
    if ergebnis.rows_affected() == 0 {
        return Err(AppError::Validation {
            feld: "status".into(),
            meldung: "Beleg wurde zwischenzeitlich bereits gestellt".into(),
        });
    }
    lade_beleg(pool, &id).await
}

const ANGEBOT_ABSCHLUSS_STATUS: [&str; 3] = ["angenommen", "abgelehnt", "abgelaufen"];

pub async fn setze_angebot_status(pool: &SqlitePool, id: String, status: String) -> AppResult<Beleg> {
    let beleg = lade_beleg(pool, &id).await?;
    if beleg.typ != "angebot" {
        return Err(AppError::Validation { feld: "typ".into(), meldung: "Nur Angebote haben diesen Status".into() });
    }
    if beleg.status != "versendet" {
        return Err(AppError::Validation { feld: "status".into(), meldung: "Nur versendete Angebote können einen Abschlussstatus erhalten".into() });
    }
    if !ANGEBOT_ABSCHLUSS_STATUS.contains(&status.as_str()) {
        return Err(AppError::Validation { feld: "status".into(), meldung: "Ungültiger Angebotsstatus".into() });
    }
    sqlx::query("UPDATE beleg SET status=?, updated_at=? WHERE id=?")
        .bind(&status).bind(jetzt()).bind(&id).execute(pool).await?;
    lade_beleg(pool, &id).await
}

pub async fn angebot_ueberfuehren(pool: &SqlitePool, angebot_id: String) -> AppResult<Beleg> {
    let angebot = lade_beleg(pool, &angebot_id).await?;
    if angebot.typ != "angebot" {
        return Err(AppError::Validation { feld: "typ".into(), meldung: "Nur Angebote können in Rechnungen überführt werden".into() });
    }
    if !["versendet", "angenommen"].contains(&angebot.status.as_str()) {
        return Err(AppError::Validation { feld: "status".into(), meldung: "Nur versendete oder angenommene Angebote können überführt werden".into() });
    }

    let heute = jetzt()[..10].to_string();
    let rechnung = Beleg {
        id: Uuid::new_v4().to_string(), typ: "rechnung".into(), nummer: None, status: "entwurf".into(),
        kunde_id: angebot.kunde_id.clone(), datum: heute, leistungsdatum: angebot.leistungsdatum.clone(),
        zahlungsziel_tage: angebot.zahlungsziel_tage, kopftext: angebot.kopftext.clone(), fusstext: angebot.fusstext.clone(),
        summe_cent: angebot.summe_cent, ursprungsangebot_id: Some(angebot.id.clone()), storno_von_id: None,
    };

    // Transaktion: das Beleg-INSERT und die Positions-INSERTs müssen atomar sein,
    // sonst könnte bei einem Abbruch mittendrin eine Rechnung mit nur einem Teil
    // der Positionen des Angebots entstehen, deren summe_cent nicht mehr zu ihren
    // tatsächlichen Positionen passt (gleiche Risikoklasse wie bei position_speichern/
    // position_loeschen in Task 3). Hier keine verschachtelten &SqlitePool-Aufrufe
    // nötig, daher keine Deadlock-Gefahr unter max_connections(1).
    let mut tx = pool.begin().await?;

    sqlx::query("INSERT INTO beleg (id, typ, nummer, status, kunde_id, datum, leistungsdatum, zahlungsziel_tage, kopftext, fusstext, summe_cent, ursprungsangebot_id, storno_von_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(&rechnung.id).bind(&rechnung.typ).bind(&rechnung.nummer).bind(&rechnung.status).bind(&rechnung.kunde_id)
        .bind(&rechnung.datum).bind(&rechnung.leistungsdatum).bind(rechnung.zahlungsziel_tage)
        .bind(&rechnung.kopftext).bind(&rechnung.fusstext).bind(rechnung.summe_cent)
        .bind(&rechnung.ursprungsangebot_id).bind(&rechnung.storno_von_id).bind(jetzt()).bind(jetzt())
        .execute(&mut *tx).await?;

    let positionen: Vec<Belegposition> = sqlx::query_as(
        "SELECT id, beleg_id, artikel_id, bezeichnung, einheit_kuerzel, einzelpreis_cent, menge, positionssumme_cent, reihenfolge \
         FROM belegposition WHERE beleg_id = ? AND deleted_at IS NULL ORDER BY reihenfolge")
        .bind(&angebot_id).fetch_all(&mut *tx).await?;
    for pos in positionen {
        sqlx::query("INSERT INTO belegposition (id, beleg_id, artikel_id, bezeichnung, einheit_kuerzel, einzelpreis_cent, menge, positionssumme_cent, reihenfolge, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
            .bind(Uuid::new_v4().to_string()).bind(&rechnung.id).bind(&pos.artikel_id).bind(&pos.bezeichnung)
            .bind(&pos.einheit_kuerzel).bind(pos.einzelpreis_cent).bind(pos.menge)
            .bind(pos.positionssumme_cent).bind(pos.reihenfolge).bind(jetzt()).bind(jetzt())
            .execute(&mut *tx).await?;
    }

    tx.commit().await?;
    Ok(rechnung)
}

pub async fn storniere_rechnung(pool: &SqlitePool, id: String) -> AppResult<Beleg> {
    let rechnung = lade_beleg(pool, &id).await?;
    if rechnung.typ != "rechnung" {
        return Err(AppError::Validation { feld: "typ".into(), meldung: "Nur Rechnungen können storniert werden".into() });
    }
    if rechnung.status != "gestellt" {
        return Err(AppError::Validation { feld: "status".into(), meldung: "Nur gestellte Rechnungen können storniert werden".into() });
    }

    let heute = jetzt()[..10].to_string();
    // naechste_nummer nimmt &SqlitePool entgegen und öffnet intern eine eigene
    // Transaktion. Unter max_connections(1) würde ein Aufruf von innerhalb einer
    // bereits offenen Transaktion auf dieser Connection deadlocken (siehe Task 3).
    // Deshalb wird die Nummer hier VOR dem Öffnen der eigenen Transaktion vergeben,
    // genau wie lade_beleg() in angebot_ueberfuehren() vor deren Transaktion steht.
    let nummer = naechste_nummer(pool, "rechnung").await?;
    let snapshot: (String,) = sqlx::query_as("SELECT kunde_snapshot FROM beleg WHERE id = ?")
        .bind(&rechnung.id).fetch_one(pool).await?;
    let storno = Beleg {
        id: Uuid::new_v4().to_string(), typ: "rechnung".into(), nummer: Some(nummer), status: "gestellt".into(),
        kunde_id: rechnung.kunde_id.clone(), datum: heute, leistungsdatum: rechnung.leistungsdatum.clone(),
        zahlungsziel_tage: rechnung.zahlungsziel_tage, kopftext: rechnung.kopftext.clone(),
        fusstext: format!("Stornierung zu Rechnung {}", rechnung.nummer.clone().unwrap_or_default()),
        summe_cent: -rechnung.summe_cent, ursprungsangebot_id: None, storno_von_id: Some(rechnung.id.clone()),
    };

    // Transaktion: das Storno-Beleg-INSERT, die negierten Positions-INSERTs und das
    // abschließende UPDATE, das den Ursprungsbeleg als "storniert" markiert, müssen
    // atomar sein. Ein Abbruch mittendrin (z.B. nach dem Anlegen des Storno-Belegs,
    // aber vor dem UPDATE des Ursprungs) würde zwei "lebendig" aussehende Rechnungen
    // für denselben Vorgang hinterlassen — gleiche Risikoklasse wie bei
    // position_speichern/position_loeschen (Task 3) und angebot_ueberfuehren (Task 5).
    // Alle Aufrufe innerhalb dieser Transaktion nehmen &mut SqliteConnection statt
    // &SqlitePool entgegen, es gibt also keine verschachtelten Pool-Aufrufe und damit
    // keine Deadlock-Gefahr unter max_connections(1).
    let mut tx = pool.begin().await?;

    sqlx::query("INSERT INTO beleg (id, typ, nummer, status, kunde_id, datum, leistungsdatum, zahlungsziel_tage, kopftext, fusstext, summe_cent, ursprungsangebot_id, storno_von_id, kunde_snapshot, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(&storno.id).bind(&storno.typ).bind(&storno.nummer).bind(&storno.status).bind(&storno.kunde_id)
        .bind(&storno.datum).bind(&storno.leistungsdatum).bind(storno.zahlungsziel_tage)
        .bind(&storno.kopftext).bind(&storno.fusstext).bind(storno.summe_cent)
        .bind(&storno.ursprungsangebot_id).bind(&storno.storno_von_id).bind(&snapshot.0).bind(jetzt()).bind(jetzt())
        .execute(&mut *tx).await?;

    let positionen: Vec<Belegposition> = sqlx::query_as(
        "SELECT id, beleg_id, artikel_id, bezeichnung, einheit_kuerzel, einzelpreis_cent, menge, positionssumme_cent, reihenfolge \
         FROM belegposition WHERE beleg_id = ? AND deleted_at IS NULL ORDER BY reihenfolge")
        .bind(&id).fetch_all(&mut *tx).await?;
    for pos in positionen {
        sqlx::query("INSERT INTO belegposition (id, beleg_id, artikel_id, bezeichnung, einheit_kuerzel, einzelpreis_cent, menge, positionssumme_cent, reihenfolge, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
            .bind(Uuid::new_v4().to_string()).bind(&storno.id).bind(&pos.artikel_id).bind(&pos.bezeichnung)
            .bind(&pos.einheit_kuerzel).bind(-pos.einzelpreis_cent).bind(pos.menge)
            .bind(-pos.positionssumme_cent).bind(pos.reihenfolge).bind(jetzt()).bind(jetzt())
            .execute(&mut *tx).await?;
    }

    sqlx::query("UPDATE beleg SET status = 'storniert', updated_at = ? WHERE id = ?")
        .bind(jetzt()).bind(&id).execute(&mut *tx).await?;

    tx.commit().await?;

    Ok(storno)
}

// Dünner Tauri-Wrapper (ergänzt die aus Task 2/3/4/5)
#[tauri::command]
pub async fn rechnung_stornieren(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<Beleg> {
    storniere_rechnung(&pool, id).await
}

#[derive(Debug, Deserialize)]
pub struct ZahlungNeu {
    pub rechnung_id: String,
    pub datum: String,
    pub betrag_cent: i64,
    pub notiz: String,
}

#[derive(Debug, Serialize)]
pub struct OffenerPosten {
    pub beleg: Beleg,
    pub offener_betrag_cent: i64,
}

pub async fn erfasse_zahlung(pool: &SqlitePool, d: ZahlungNeu) -> AppResult<Zahlung> {
    let rechnung = lade_beleg(pool, &d.rechnung_id).await?;
    if rechnung.typ != "rechnung" {
        return Err(AppError::Validation { feld: "rechnung_id".into(), meldung: "Zahlungen sind nur zu Rechnungen möglich".into() });
    }
    if !["gestellt", "storniert"].contains(&rechnung.status.as_str()) {
        return Err(AppError::Validation { feld: "rechnung_id".into(), meldung: "Zahlungen sind nur zu gestellten oder stornierten Rechnungen möglich".into() });
    }
    if d.datum.trim().is_empty() {
        return Err(AppError::Validation { feld: "datum".into(), meldung: "Datum darf nicht leer sein".into() });
    }
    if d.betrag_cent == 0 {
        return Err(AppError::Validation { feld: "betrag_cent".into(), meldung: "Betrag darf nicht 0 sein".into() });
    }
    let zahlung = Zahlung {
        id: Uuid::new_v4().to_string(), rechnung_id: d.rechnung_id, datum: d.datum,
        betrag_cent: d.betrag_cent, notiz: d.notiz,
    };
    sqlx::query("INSERT INTO zahlung (id, rechnung_id, datum, betrag_cent, notiz, created_at, updated_at) VALUES (?,?,?,?,?,?,?)")
        .bind(&zahlung.id).bind(&zahlung.rechnung_id).bind(&zahlung.datum).bind(zahlung.betrag_cent)
        .bind(&zahlung.notiz).bind(jetzt()).bind(jetzt())
        .execute(pool).await?;
    Ok(zahlung)
}

pub async fn zahlung_loeschen(pool: &SqlitePool, id: String) -> AppResult<()> {
    let r = sqlx::query("UPDATE zahlung SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(jetzt()).bind(&id).execute(pool).await?;
    if r.rows_affected() == 0 { return Err(AppError::NichtGefunden); }
    Ok(())
}

pub async fn offene_posten(pool: &SqlitePool) -> AppResult<Vec<OffenerPosten>> {
    let sql = format!("SELECT {BELEG_SPALTEN} FROM beleg WHERE deleted_at IS NULL AND typ = 'rechnung' AND status = 'gestellt' ORDER BY datum");
    let rechnungen: Vec<Beleg> = sqlx::query_as(&sql).fetch_all(pool).await?;
    let mut ergebnis = Vec::new();
    for rechnung in rechnungen {
        let bezahlt: (Option<i64>,) = sqlx::query_as(
            "SELECT SUM(betrag_cent) FROM zahlung WHERE rechnung_id = ? AND deleted_at IS NULL")
            .bind(&rechnung.id).fetch_one(pool).await?;
        let offener_betrag_cent = rechnung.summe_cent - bezahlt.0.unwrap_or(0);
        if offener_betrag_cent != 0 {
            ergebnis.push(OffenerPosten { beleg: rechnung, offener_betrag_cent });
        }
    }
    Ok(ergebnis)
}

// Dünne Tauri-Wrapper (ergänzen die aus Task 2/3/4/5/6)
#[tauri::command]
pub async fn zahlung_erfassen(pool: tauri::State<'_, SqlitePool>, daten: ZahlungNeu) -> AppResult<Zahlung> {
    erfasse_zahlung(&pool, daten).await
}
#[tauri::command]
pub async fn zahlung_delete(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<()> {
    zahlung_loeschen(&pool, id).await
}
#[tauri::command]
pub async fn offene_posten_list(pool: tauri::State<'_, SqlitePool>) -> AppResult<Vec<OffenerPosten>> {
    offene_posten(&pool).await
}

// Dünne Tauri-Wrapper
#[tauri::command]
pub async fn beleg_list(pool: tauri::State<'_, SqlitePool>, typ: Option<String>, status: Option<String>) -> AppResult<Vec<Beleg>> {
    list(&pool, typ, status).await
}
#[tauri::command]
pub async fn beleg_get(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<BelegDetail> {
    get(&pool, id).await
}
#[tauri::command]
pub async fn beleg_create(pool: tauri::State<'_, SqlitePool>, daten: BelegNeu) -> AppResult<Beleg> {
    create(&pool, daten).await
}
#[tauri::command]
pub async fn beleg_update(pool: tauri::State<'_, SqlitePool>, daten: BelegUpdate) -> AppResult<Beleg> {
    update(&pool, daten).await
}
#[tauri::command]
pub async fn beleg_delete(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<()> {
    delete(&pool, id).await
}
#[tauri::command]
pub async fn belegposition_save(pool: tauri::State<'_, SqlitePool>, position: BelegpositionNeu) -> AppResult<Belegposition> {
    position_speichern(&pool, position).await
}
#[tauri::command]
pub async fn belegposition_delete(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<()> {
    position_loeschen(&pool, id).await
}
#[tauri::command]
pub async fn beleg_stellen(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<Beleg> {
    stellen(&pool, id).await
}
#[tauri::command]
pub async fn angebot_status_setzen(pool: tauri::State<'_, SqlitePool>, id: String, status: String) -> AppResult<Beleg> {
    setze_angebot_status(&pool, id, status).await
}
#[tauri::command]
pub async fn angebot_in_rechnung_ueberfuehren(pool: tauri::State<'_, SqlitePool>, angebot_id: String) -> AppResult<Beleg> {
    angebot_ueberfuehren(&pool, angebot_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::kunden::{create as kunde_create, KundeNeu};

    async fn test_pool() -> (tempfile::TempDir, sqlx::SqlitePool) {
        let dir = tempfile::tempdir().unwrap();
        let p = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        (dir, p)
    }

    async fn kunde_anlegen(pool: &sqlx::SqlitePool) -> String {
        kunde_create(pool, KundeNeu {
            typ: "firma".into(), name: "ACME GmbH".into(), zahlungsziel_tage: 14,
            notizen: "".into(), ust_idnr: "".into(), email: "".into(),
            leitweg_id: "".into(), kaeuferreferenz: "".into(),
        }).await.unwrap().id
    }

    fn beleg_neu(typ: &str, kunde_id: &str) -> BelegNeu {
        BelegNeu { typ: typ.into(), kunde_id: kunde_id.into(), datum: "2026-07-10".into(),
            leistungsdatum: "2026-07-10".into(), zahlungsziel_tage: 14,
            kopftext: "".into(), fusstext: "".into() }
    }

    #[tokio::test]
    async fn create_erzeugt_entwurf_ohne_nummer() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        assert_eq!(beleg.status, "entwurf");
        assert_eq!(beleg.nummer, None);
        assert_eq!(beleg.summe_cent, 0);
    }

    #[tokio::test]
    async fn create_lehnt_unbekannten_kunden_ab() {
        let (_dir, pool) = test_pool().await;
        let err = create(&pool, beleg_neu("angebot", "unbekannt")).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn list_filtert_nach_typ_und_status() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        let angebote = list(&pool, Some("angebot".into()), None).await.unwrap();
        assert_eq!(angebote.len(), 1);
        assert_eq!(angebote[0].typ, "angebot");
        let entwuerfe = list(&pool, None, Some("entwurf".into())).await.unwrap();
        assert_eq!(entwuerfe.len(), 2);
    }

    #[tokio::test]
    async fn update_aendert_entwurf() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        let aktualisiert = update(&pool, BelegUpdate {
            id: beleg.id.clone(), kunde_id: kunde_id.clone(), datum: "2026-07-11".into(),
            leistungsdatum: "2026-07-11".into(), zahlungsziel_tage: 30,
            kopftext: "Hallo".into(), fusstext: "".into(),
        }).await.unwrap();
        assert_eq!(aktualisiert.datum, "2026-07-11");
        assert_eq!(aktualisiert.zahlungsziel_tage, 30);
    }

    #[tokio::test]
    async fn update_lehnt_nicht_entwurf_ab() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        sqlx::query("UPDATE beleg SET status = 'versendet' WHERE id = ?")
            .bind(&beleg.id).execute(&pool).await.unwrap();
        let err = update(&pool, BelegUpdate {
            id: beleg.id, kunde_id, datum: "2026-07-11".into(), leistungsdatum: "2026-07-11".into(),
            zahlungsziel_tage: 14, kopftext: "".into(), fusstext: "".into(),
        }).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn delete_entfernt_entwurf_aber_nicht_gestellten_beleg() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        delete(&pool, beleg.id.clone()).await.unwrap();
        assert!(matches!(get(&pool, beleg.id).await.unwrap_err(), AppError::NichtGefunden));

        let beleg2 = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        sqlx::query("UPDATE beleg SET status = 'versendet' WHERE id = ?")
            .bind(&beleg2.id).execute(&pool).await.unwrap();
        let err = delete(&pool, beleg2.id).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn get_liefert_leere_positionen_und_zahlungen_fuer_neuen_entwurf() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        let detail = get(&pool, beleg.id).await.unwrap();
        assert!(detail.positionen.is_empty());
        assert!(detail.zahlungen.is_empty());
        assert_eq!(detail.offener_betrag_cent, 0);
    }

    async fn artikel_anlegen(pool: &sqlx::SqlitePool, standardpreis_cent: i64) -> String {
        crate::commands::artikel::create(pool, crate::commands::artikel::ArtikelNeu {
            bezeichnung: "Beratung".into(), beschreibung: "".into(),
            einheit_id: "e0000000-0000-0000-0000-000000000001".into(),
            standardpreis_cent,
        }).await.unwrap().id
    }

    #[tokio::test]
    async fn position_mit_artikel_ermittelt_preis_automatisch() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 9500).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        let pos = position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 2000,
        }).await.unwrap();
        assert_eq!(pos.einzelpreis_cent, 9500);
        assert_eq!(pos.bezeichnung, "Beratung");
        assert_eq!(pos.positionssumme_cent, 19000);
        let beleg_neu = get(&pool, beleg.id).await.unwrap().beleg;
        assert_eq!(beleg_neu.summe_cent, 19000);
    }

    #[tokio::test]
    async fn freitextposition_ohne_preis_wird_abgelehnt() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        let err = position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id, artikel_id: None,
            bezeichnung: "Sonderleistung".into(), einheit_kuerzel: "Std.".into(),
            einzelpreis_cent: None, menge: 1000,
        }).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn freitextposition_mit_preis_wird_uebernommen() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        let pos = position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id, artikel_id: None,
            bezeichnung: "Sonderleistung".into(), einheit_kuerzel: "Std.".into(),
            einzelpreis_cent: Some(12000), menge: 1000,
        }).await.unwrap();
        assert_eq!(pos.bezeichnung, "Sonderleistung");
        assert_eq!(pos.positionssumme_cent, 12000);
    }

    #[tokio::test]
    async fn loeschen_berechnet_belegsumme_neu() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        let pos1 = position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id.clone()),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        position_loeschen(&pool, pos1.id).await.unwrap();
        let beleg_neu = get(&pool, beleg.id).await.unwrap().beleg;
        assert_eq!(beleg_neu.summe_cent, 5000);
    }

    #[tokio::test]
    async fn position_an_gestelltem_beleg_wird_abgelehnt() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        sqlx::query("UPDATE beleg SET status = 'versendet' WHERE id = ?")
            .bind(&beleg.id).execute(&pool).await.unwrap();
        let err = position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id, artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn position_loeschen_an_gestelltem_beleg_wird_abgelehnt() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        let pos = position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        sqlx::query("UPDATE beleg SET status = 'versendet' WHERE id = ?")
            .bind(&beleg.id).execute(&pool).await.unwrap();
        let err = position_loeschen(&pool, pos.id).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn stellen_vergibt_nummer_und_friert_beleg_ein() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        let gestellt = stellen(&pool, beleg.id).await.unwrap();
        assert_eq!(gestellt.status, "versendet");
        let jahr = chrono::Utc::now().format("%Y").to_string();
        assert_eq!(gestellt.nummer, Some(format!("AN-{jahr}-0001")));
        let err = update(&pool, BelegUpdate {
            id: gestellt.id.clone(), kunde_id, datum: gestellt.datum.clone(),
            leistungsdatum: gestellt.leistungsdatum.clone(), zahlungsziel_tage: 14,
            kopftext: "".into(), fusstext: "".into(),
        }).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }), "gestellter Beleg darf nicht mehr editierbar sein");
    }

    #[tokio::test]
    async fn stellen_lehnt_konkurrierende_doppel_vergabe_ab() {
        // Regression: zwei parallele stellen()-Aufrufe für denselben Entwurf dürfen
        // sich nicht gegenseitig stillschweigend überschreiben. Dank max_connections(1)
        // interleaven die beiden Tasks real an den .await-Punkten (jeder DB-Zugriff
        // gibt die einzige Connection wieder frei), sodass hier ein echtes Rennen
        // zwischen den beiden lade_beleg/naechste_nummer/UPDATE-Sequenzen entsteht.
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();

        let pool_a = pool.clone();
        let pool_b = pool.clone();
        let id_a = beleg.id.clone();
        let id_b = beleg.id.clone();
        let task_a = tokio::spawn(async move { stellen(&pool_a, id_a).await });
        let task_b = tokio::spawn(async move { stellen(&pool_b, id_b).await });
        let (ergebnis_a, ergebnis_b) = tokio::join!(task_a, task_b);
        let ergebnis_a = ergebnis_a.unwrap();
        let ergebnis_b = ergebnis_b.unwrap();

        let erfolge = [&ergebnis_a, &ergebnis_b].iter().filter(|r| r.is_ok()).count();
        let fehler = [&ergebnis_a, &ergebnis_b].iter().filter(|r| r.is_err()).count();
        assert_eq!(erfolge, 1, "genau einer der beiden konkurrierenden Aufrufe darf gewinnen");
        assert_eq!(fehler, 1, "der Verlierer muss einen Fehler statt eines stillen Überschreibens erhalten");
        let verlierer = if ergebnis_a.is_err() { ergebnis_a } else { ergebnis_b };
        assert!(matches!(verlierer, Err(AppError::Validation { .. })));

        let final_beleg = get(&pool, beleg.id.clone()).await.unwrap();
        assert_eq!(final_beleg.beleg.status, "gestellt");
        assert!(final_beleg.beleg.nummer.is_some());
    }

    #[tokio::test]
    async fn stellen_ohne_position_wird_abgelehnt() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        let err = stellen(&pool, beleg.id).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn rechnung_stellen_setzt_status_gestellt() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        let gestellt = stellen(&pool, beleg.id).await.unwrap();
        assert_eq!(gestellt.status, "gestellt");
    }

    #[tokio::test]
    async fn angebot_status_setzen_erlaubt_nur_nach_versendet() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        let err = setze_angebot_status(&pool, beleg.id, "angenommen".into()).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn angebot_status_setzen_akzeptiert_gueltigen_status() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        let gestellt = stellen(&pool, beleg.id).await.unwrap();
        let aktualisiert = setze_angebot_status(&pool, gestellt.id, "angenommen".into()).await.unwrap();
        assert_eq!(aktualisiert.status, "angenommen");
    }

    #[tokio::test]
    async fn angebot_status_setzen_lehnt_unbekannten_status_ab() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        let gestellt = stellen(&pool, beleg.id).await.unwrap();
        let err = setze_angebot_status(&pool, gestellt.id, "storniert".into()).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn angebot_ueberfuehrung_kopiert_positionen_und_summe() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let angebot = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: angebot.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 2000,
        }).await.unwrap();
        let gestellt = stellen(&pool, angebot.id).await.unwrap();

        let rechnung = angebot_ueberfuehren(&pool, gestellt.id.clone()).await.unwrap();
        assert_eq!(rechnung.typ, "rechnung");
        assert_eq!(rechnung.status, "entwurf");
        assert_eq!(rechnung.summe_cent, 10000);
        assert_eq!(rechnung.ursprungsangebot_id, Some(gestellt.id));

        let detail = get(&pool, rechnung.id).await.unwrap();
        assert_eq!(detail.positionen.len(), 1);
        assert_eq!(detail.positionen[0].positionssumme_cent, 10000);
    }

    #[tokio::test]
    async fn ueberfuehrung_lehnt_entwurfs_angebot_ab() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let angebot = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        let err = angebot_ueberfuehren(&pool, angebot.id).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn ueberfuehrung_lehnt_rechnung_als_quelle_ab() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let rechnung = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        let err = angebot_ueberfuehren(&pool, rechnung.id).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn storno_erzeugt_gegenbeleg_und_markiert_ursprung() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let rechnung = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: rechnung.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        let gestellt = stellen(&pool, rechnung.id).await.unwrap();

        let storno = storniere_rechnung(&pool, gestellt.id.clone()).await.unwrap();
        assert_eq!(storno.summe_cent, -5000);
        assert_eq!(storno.storno_von_id, Some(gestellt.id.clone()));
        assert_ne!(storno.nummer, gestellt.nummer);

        let ursprung = get(&pool, gestellt.id).await.unwrap().beleg;
        assert_eq!(ursprung.status, "storniert");

        let storno_detail = get(&pool, storno.id).await.unwrap();
        assert_eq!(storno_detail.positionen[0].positionssumme_cent, -5000);
    }

    #[tokio::test]
    async fn storno_lehnt_entwurf_ab() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let rechnung = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        let err = storniere_rechnung(&pool, rechnung.id.clone()).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn storno_lehnt_doppelstorno_ab() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let rechnung = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: rechnung.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        let gestellt = stellen(&pool, rechnung.id).await.unwrap();

        storniere_rechnung(&pool, gestellt.id.clone()).await.unwrap();
        let err = storniere_rechnung(&pool, gestellt.id.clone()).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn storno_lehnt_angebot_ab() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let angebot = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        let err = storniere_rechnung(&pool, angebot.id).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn zahlung_erfassen_und_offener_betrag_sinkt() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 10000).await;
        let rechnung = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: rechnung.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        let gestellt = stellen(&pool, rechnung.id).await.unwrap();

        erfasse_zahlung(&pool, ZahlungNeu {
            rechnung_id: gestellt.id.clone(), datum: "2026-07-10".into(), betrag_cent: 6000, notiz: "Anzahlung".into(),
        }).await.unwrap();
        let detail = get(&pool, gestellt.id.clone()).await.unwrap();
        assert_eq!(detail.bezahlt_cent, 6000);
        assert_eq!(detail.offener_betrag_cent, 4000);

        erfasse_zahlung(&pool, ZahlungNeu {
            rechnung_id: gestellt.id.clone(), datum: "2026-07-15".into(), betrag_cent: 4000, notiz: "".into(),
        }).await.unwrap();
        let detail2 = get(&pool, gestellt.id).await.unwrap();
        assert_eq!(detail2.offener_betrag_cent, 0);
    }

    #[tokio::test]
    async fn zahlung_lehnt_entwurfsrechnung_ab() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let rechnung = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        let err = erfasse_zahlung(&pool, ZahlungNeu {
            rechnung_id: rechnung.id, datum: "2026-07-10".into(), betrag_cent: 100, notiz: "".into(),
        }).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn erstattung_als_negative_zahlung_erhoeht_offenen_betrag() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 10000).await;
        let rechnung = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: rechnung.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        let gestellt = stellen(&pool, rechnung.id).await.unwrap();
        erfasse_zahlung(&pool, ZahlungNeu {
            rechnung_id: gestellt.id.clone(), datum: "2026-07-10".into(), betrag_cent: 10000, notiz: "".into(),
        }).await.unwrap();
        storniere_rechnung(&pool, gestellt.id.clone()).await.unwrap();
        erfasse_zahlung(&pool, ZahlungNeu {
            rechnung_id: gestellt.id.clone(), datum: "2026-07-20".into(), betrag_cent: -10000, notiz: "Rückzahlung nach Storno".into(),
        }).await.unwrap();
        let detail = get(&pool, gestellt.id).await.unwrap();
        assert_eq!(detail.bezahlt_cent, 0);
    }

    #[tokio::test]
    async fn offene_posten_listet_nur_unvollstaendig_bezahlte_rechnungen() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 10000).await;

        let bezahlt_beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: bezahlt_beleg.id.clone(), artikel_id: Some(artikel_id.clone()),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        let bezahlt_gestellt = stellen(&pool, bezahlt_beleg.id).await.unwrap();
        erfasse_zahlung(&pool, ZahlungNeu {
            rechnung_id: bezahlt_gestellt.id.clone(), datum: "2026-07-10".into(), betrag_cent: 10000, notiz: "".into(),
        }).await.unwrap();

        let offen_beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: offen_beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000,
        }).await.unwrap();
        let offen_gestellt = stellen(&pool, offen_beleg.id).await.unwrap();

        let posten = offene_posten(&pool).await.unwrap();
        assert_eq!(posten.len(), 1);
        assert_eq!(posten[0].beleg.id, offen_gestellt.id);
        assert_eq!(posten[0].offener_betrag_cent, 10000);
    }
}
