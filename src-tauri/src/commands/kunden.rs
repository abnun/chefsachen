use crate::db::jetzt;
use crate::domain::nummernkreis::naechste_nummer;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Kunde {
    pub id: String, pub typ: String, pub name: String, pub kundennummer: String,
    pub zahlungsziel_tage: i64, pub notizen: String, pub ust_idnr: String,
    pub email: String, pub leitweg_id: String, pub kaeuferreferenz: String,
    pub hat_adresse: bool,
    /// `true`, solange mindestens ein Angebot oder eine Rechnung im Status
    /// "entwurf" diesen Kunden referenziert. Wird von `delete()` genutzt, um
    /// das Löschen serverseitig abzulehnen — siehe Task 2.
    pub hat_offene_entwuerfe: bool,
}

#[derive(Debug, Deserialize)]
pub struct KundeNeu {
    pub typ: String, pub name: String, pub zahlungsziel_tage: i64, pub notizen: String,
    pub ust_idnr: String, pub email: String, pub leitweg_id: String, pub kaeuferreferenz: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Adresse {
    pub id: String, pub kunde_id: String, pub typ: String, pub strasse: String,
    pub plz: String, pub ort: String, pub land: String, pub ist_standard: bool,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Ansprechpartner {
    pub id: String, pub kunde_id: String, pub name: String, pub rolle: String,
    pub email: String, pub telefon: String, pub ist_standard: bool,
}

#[derive(Debug, Serialize)]
pub struct KundeDetail {
    pub kunde: Kunde,
    pub adressen: Vec<Adresse>,
    pub ansprechpartner: Vec<Ansprechpartner>,
}

fn pruefe_kunde(name: &str, typ: &str) -> AppResult<()> {
    if name.trim().is_empty() {
        return Err(AppError::Validation { feld: "name".into(), meldung: "Name darf nicht leer sein".into() });
    }
    if !["firma", "privat"].contains(&typ) {
        return Err(AppError::Validation { feld: "typ".into(), meldung: "Ungültiger Kundentyp".into() });
    }
    Ok(())
}

pub async fn create(pool: &SqlitePool, d: KundeNeu) -> AppResult<Kunde> {
    pruefe_kunde(&d.name, &d.typ)?;
    let kundennummer = naechste_nummer(pool, "kunde").await?;
    let k = Kunde { id: Uuid::new_v4().to_string(), typ: d.typ, name: d.name.trim().into(),
        kundennummer, zahlungsziel_tage: d.zahlungsziel_tage, notizen: d.notizen,
        ust_idnr: d.ust_idnr, email: d.email, leitweg_id: d.leitweg_id,
        kaeuferreferenz: d.kaeuferreferenz, hat_adresse: false, hat_offene_entwuerfe: false };
    sqlx::query("INSERT INTO kunde (id, typ, name, kundennummer, zahlungsziel_tage, notizen, ust_idnr, email, leitweg_id, kaeuferreferenz, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(&k.id).bind(&k.typ).bind(&k.name).bind(&k.kundennummer)
        .bind(k.zahlungsziel_tage).bind(&k.notizen).bind(&k.ust_idnr).bind(&k.email)
        .bind(&k.leitweg_id).bind(&k.kaeuferreferenz).bind(jetzt()).bind(jetzt())
        .execute(pool).await?;
    Ok(k)
}

pub async fn list(pool: &SqlitePool, suche: Option<String>) -> AppResult<Vec<Kunde>> {
    let muster = format!("%{}%", suche.unwrap_or_default().to_lowercase());
    Ok(sqlx::query_as(
        "SELECT k.id, k.typ, k.name, k.kundennummer, k.zahlungsziel_tage, k.notizen, k.ust_idnr, \
                k.email, k.leitweg_id, k.kaeuferreferenz, \
                EXISTS(SELECT 1 FROM adresse a WHERE a.kunde_id = k.id AND a.deleted_at IS NULL) AS hat_adresse, \
                EXISTS(SELECT 1 FROM beleg b WHERE b.kunde_id = k.id AND b.status = 'entwurf' AND b.deleted_at IS NULL) AS hat_offene_entwuerfe \
         FROM kunde k WHERE k.deleted_at IS NULL AND (lower(k.name) LIKE ? OR lower(k.kundennummer) LIKE ?) ORDER BY k.name")
        .bind(&muster).bind(&muster).fetch_all(pool).await?)
}

pub async fn get(pool: &SqlitePool, id: String) -> AppResult<KundeDetail> {
    let kunde: Kunde = sqlx::query_as(
        "SELECT k.id, k.typ, k.name, k.kundennummer, k.zahlungsziel_tage, k.notizen, k.ust_idnr, \
                k.email, k.leitweg_id, k.kaeuferreferenz, \
                EXISTS(SELECT 1 FROM adresse a WHERE a.kunde_id = k.id AND a.deleted_at IS NULL) AS hat_adresse, \
                EXISTS(SELECT 1 FROM beleg b WHERE b.kunde_id = k.id AND b.status = 'entwurf' AND b.deleted_at IS NULL) AS hat_offene_entwuerfe \
         FROM kunde k WHERE k.id = ? AND k.deleted_at IS NULL")
        .bind(&id).fetch_optional(pool).await?.ok_or(AppError::NichtGefunden)?;
    let adressen = sqlx::query_as(
        "SELECT id, kunde_id, typ, strasse, plz, ort, land, ist_standard FROM adresse WHERE kunde_id = ? AND deleted_at IS NULL")
        .bind(&id).fetch_all(pool).await?;
    let ansprechpartner = sqlx::query_as(
        "SELECT id, kunde_id, name, rolle, email, telefon, ist_standard FROM ansprechpartner WHERE kunde_id = ? AND deleted_at IS NULL")
        .bind(&id).fetch_all(pool).await?;
    Ok(KundeDetail { kunde, adressen, ansprechpartner })
}

pub async fn update(pool: &SqlitePool, kunde: Kunde) -> AppResult<Kunde> {
    pruefe_kunde(&kunde.name, &kunde.typ)?;
    // WICHTIG: kundennummer wird hier bewusst NICHT geschrieben — die vergebene
    // Nummer ist nach der Vergabe unveränderlich, auch wenn `kunde.kundennummer`
    // aus dem Frontend einen (ggf. veralteten) Wert enthält.
    let r = sqlx::query(
        "UPDATE kunde SET typ=?, name=?, zahlungsziel_tage=?, notizen=?, ust_idnr=?, email=?, leitweg_id=?, kaeuferreferenz=?, updated_at=? WHERE id=? AND deleted_at IS NULL")
        .bind(&kunde.typ).bind(kunde.name.trim()).bind(kunde.zahlungsziel_tage)
        .bind(&kunde.notizen).bind(&kunde.ust_idnr).bind(&kunde.email)
        .bind(&kunde.leitweg_id).bind(&kunde.kaeuferreferenz).bind(jetzt())
        .bind(&kunde.id).execute(pool).await?;
    if r.rows_affected() == 0 { return Err(AppError::NichtGefunden); }
    Ok(kunde)
}

pub async fn delete(pool: &SqlitePool, id: String) -> AppResult<()> {
    let r = sqlx::query("UPDATE kunde SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(jetzt()).bind(&id).execute(pool).await?;
    if r.rows_affected() == 0 { return Err(AppError::NichtGefunden); }
    Ok(())
}

pub async fn adresse_speichern(pool: &SqlitePool, mut a: Adresse) -> AppResult<Adresse> {
    let mut tx = pool.begin().await?;
    if a.ist_standard {
        sqlx::query("UPDATE adresse SET ist_standard = 0, updated_at = ? WHERE kunde_id = ? AND typ = ? AND deleted_at IS NULL")
            .bind(jetzt()).bind(&a.kunde_id).bind(&a.typ).execute(&mut *tx).await?;
    }
    if a.id.is_empty() {
        a.id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO adresse (id, kunde_id, typ, strasse, plz, ort, land, ist_standard, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
            .bind(&a.id).bind(&a.kunde_id).bind(&a.typ).bind(&a.strasse).bind(&a.plz)
            .bind(&a.ort).bind(&a.land).bind(a.ist_standard).bind(jetzt()).bind(jetzt())
            .execute(&mut *tx).await?;
    } else {
        sqlx::query("UPDATE adresse SET typ=?, strasse=?, plz=?, ort=?, land=?, ist_standard=?, updated_at=? WHERE id=? AND deleted_at IS NULL")
            .bind(&a.typ).bind(&a.strasse).bind(&a.plz).bind(&a.ort).bind(&a.land)
            .bind(a.ist_standard).bind(jetzt()).bind(&a.id).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(a)
}

pub async fn adresse_entfernen(pool: &SqlitePool, id: String) -> AppResult<()> {
    let r = sqlx::query("UPDATE adresse SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(jetzt()).bind(&id).execute(pool).await?;
    if r.rows_affected() == 0 { return Err(AppError::NichtGefunden); }
    Ok(())
}

pub async fn ansprechpartner_speichern(pool: &SqlitePool, mut ap: Ansprechpartner) -> AppResult<Ansprechpartner> {
    let mut tx = pool.begin().await?;
    if ap.ist_standard {
        // Kein `typ` bei Ansprechpartner: Reset gilt für ALLE Geschwister-Zeilen
        // desselben kunde_id, nicht nach Typ gescopet wie bei Adresse.
        sqlx::query("UPDATE ansprechpartner SET ist_standard = 0, updated_at = ? WHERE kunde_id = ? AND deleted_at IS NULL")
            .bind(jetzt()).bind(&ap.kunde_id).execute(&mut *tx).await?;
    }
    if ap.id.is_empty() {
        ap.id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO ansprechpartner (id, kunde_id, name, rolle, email, telefon, ist_standard, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
            .bind(&ap.id).bind(&ap.kunde_id).bind(&ap.name).bind(&ap.rolle)
            .bind(&ap.email).bind(&ap.telefon).bind(ap.ist_standard).bind(jetzt()).bind(jetzt())
            .execute(&mut *tx).await?;
    } else {
        sqlx::query("UPDATE ansprechpartner SET name=?, rolle=?, email=?, telefon=?, ist_standard=?, updated_at=? WHERE id=? AND deleted_at IS NULL")
            .bind(&ap.name).bind(&ap.rolle).bind(&ap.email).bind(&ap.telefon)
            .bind(ap.ist_standard).bind(jetzt()).bind(&ap.id).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(ap)
}

pub async fn ansprechpartner_entfernen(pool: &SqlitePool, id: String) -> AppResult<()> {
    let r = sqlx::query("UPDATE ansprechpartner SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(jetzt()).bind(&id).execute(pool).await?;
    if r.rows_affected() == 0 { return Err(AppError::NichtGefunden); }
    Ok(())
}

// Dünne Tauri-Wrapper
#[tauri::command]
pub async fn kunde_list(pool: tauri::State<'_, SqlitePool>, suche: Option<String>) -> AppResult<Vec<Kunde>> {
    list(&pool, suche).await
}
#[tauri::command]
pub async fn kunde_get(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<KundeDetail> {
    get(&pool, id).await
}
#[tauri::command]
pub async fn kunde_create(pool: tauri::State<'_, SqlitePool>, daten: KundeNeu) -> AppResult<Kunde> {
    create(&pool, daten).await
}
#[tauri::command]
pub async fn kunde_update(pool: tauri::State<'_, SqlitePool>, kunde: Kunde) -> AppResult<Kunde> {
    update(&pool, kunde).await
}
#[tauri::command]
pub async fn kunde_delete(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<()> {
    delete(&pool, id).await
}
#[tauri::command]
pub async fn adresse_save(pool: tauri::State<'_, SqlitePool>, adresse: Adresse) -> AppResult<Adresse> {
    adresse_speichern(&pool, adresse).await
}
#[tauri::command]
pub async fn adresse_delete(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<()> {
    adresse_entfernen(&pool, id).await
}
#[tauri::command]
pub async fn ansprechpartner_save(pool: tauri::State<'_, SqlitePool>, ap: Ansprechpartner) -> AppResult<Ansprechpartner> {
    ansprechpartner_speichern(&pool, ap).await
}
#[tauri::command]
pub async fn ansprechpartner_delete(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<()> {
    ansprechpartner_entfernen(&pool, id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn test_pool() -> (tempfile::TempDir, sqlx::SqlitePool) {
        let dir = tempfile::tempdir().unwrap();
        let p = crate::db::init_db(&dir.path().join("t.db")).await.unwrap();
        (dir, p)
    }

    fn neu(name: &str) -> KundeNeu {
        KundeNeu { typ: "firma".into(), name: name.into(), zahlungsziel_tage: 14,
            notizen: "".into(), ust_idnr: "".into(), email: "".into(),
            leitweg_id: "".into(), kaeuferreferenz: "".into() }
    }

    #[tokio::test]
    async fn create_vergibt_kundennummer() {
        let (_dir, pool) = test_pool().await;
        let k1 = create(&pool, neu("ACME GmbH")).await.unwrap();
        let k2 = create(&pool, neu("Beta AG")).await.unwrap();
        assert_eq!(k1.kundennummer, "KD-0001");
        assert_eq!(k2.kundennummer, "KD-0002");
    }

    #[tokio::test]
    async fn suche_filtert_nach_name() {
        let (_dir, pool) = test_pool().await;
        create(&pool, neu("ACME GmbH")).await.unwrap();
        create(&pool, neu("Beta AG")).await.unwrap();
        let treffer = list(&pool, Some("acme".into())).await.unwrap();
        assert_eq!(treffer.len(), 1);
        assert_eq!(treffer[0].name, "ACME GmbH");
    }

    #[tokio::test]
    async fn standard_adresse_ist_exklusiv_je_typ() {
        let (_dir, pool) = test_pool().await;
        let k = create(&pool, neu("ACME GmbH")).await.unwrap();
        let a1 = adresse_speichern(&pool, Adresse { id: "".into(), kunde_id: k.id.clone(),
            typ: "rechnung".into(), strasse: "Weg 1".into(), plz: "10115".into(),
            ort: "Berlin".into(), land: "DE".into(), ist_standard: true }).await.unwrap();
        let _a2 = adresse_speichern(&pool, Adresse { id: "".into(), kunde_id: k.id.clone(),
            typ: "rechnung".into(), strasse: "Weg 2".into(), plz: "10115".into(),
            ort: "Berlin".into(), land: "DE".into(), ist_standard: true }).await.unwrap();
        let detail = get(&pool, k.id.clone()).await.unwrap();
        let standards: Vec<_> = detail.adressen.iter()
            .filter(|a| a.typ == "rechnung" && a.ist_standard).collect();
        assert_eq!(standards.len(), 1);
        assert_ne!(standards[0].id, a1.id);
    }

    #[tokio::test]
    async fn list_liefert_hat_adresse_korrekt() {
        let (_dir, pool) = test_pool().await;
        let mit_adresse = create(&pool, neu("Mit Adresse GmbH")).await.unwrap();
        let ohne_adresse = create(&pool, neu("Ohne Adresse GmbH")).await.unwrap();
        adresse_speichern(&pool, Adresse {
            id: "".into(), kunde_id: mit_adresse.id.clone(), typ: "rechnung".into(),
            strasse: "Weg 1".into(), plz: "10115".into(), ort: "Berlin".into(),
            land: "DE".into(), ist_standard: true,
        }).await.unwrap();

        let liste = list(&pool, None).await.unwrap();
        let treffer_mit = liste.iter().find(|k| k.id == mit_adresse.id).unwrap();
        let treffer_ohne = liste.iter().find(|k| k.id == ohne_adresse.id).unwrap();
        assert!(treffer_mit.hat_adresse);
        assert!(!treffer_ohne.hat_adresse);
    }

    #[tokio::test]
    async fn list_liefert_hat_offene_entwuerfe_korrekt() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = create(&pool, neu("ACME GmbH")).await.unwrap().id;

        let liste = list(&pool, None).await.unwrap();
        assert!(!liste.iter().find(|k| k.id == kunde_id).unwrap().hat_offene_entwuerfe);

        crate::commands::belege::create(&pool, crate::commands::belege::BelegNeu {
            typ: "angebot".into(), kunde_id: kunde_id.clone(), datum: "2026-07-10".into(),
            leistungsdatum: "2026-07-10".into(), zahlungsziel_tage: 14,
            kopftext: "".into(), fusstext: "".into(),
        }).await.unwrap();

        let liste = list(&pool, None).await.unwrap();
        assert!(liste.iter().find(|k| k.id == kunde_id).unwrap().hat_offene_entwuerfe);
    }
}
