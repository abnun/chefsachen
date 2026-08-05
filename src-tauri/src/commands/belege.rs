use crate::db::{heute, jetzt};
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
    /// Ende eines Leistungszeitraums. § 14 Abs. 4 Nr. 6 UStG verlangt den
    /// Zeitpunkt der Leistung „oder den Zeitraum" — bei Dauerleistungen und
    /// Monatsabrechnungen wäre ein Einzeldatum sachlich falsch.
    #[sqlx(default)]
    #[serde(default)]
    pub leistungsdatum_bis: Option<String>,
    /// Bis wann ein Angebot gültig ist. Nur für Angebote gedacht — bei
    /// Rechnungen bleibt das Feld leer. Wird beim Anlegen aus der Einstellung
    /// `vorlage.angebot_gueltigkeit_tage` errechnet und lässt sich danach frei
    /// bearbeiten; siehe `angebot_gueltigkeit_tage()`.
    #[sqlx(default)]
    #[serde(default)]
    pub gueltig_bis: Option<String>,
    pub zahlungsziel_tage: i64,
    pub kopftext: String,
    pub fusstext: String,
    pub summe_cent: i64,
    pub ursprungsangebot_id: Option<String>,
    pub storno_von_id: Option<String>,
    /// Rohe Snapshot-Spalte — nie ans Frontend senden, nur zur Ableitung von
    /// `kunde_snapshot_name` innerhalb dieser Datei verwendet.
    #[serde(skip_serializing, default)]
    pub kunde_snapshot: String,
    /// Gewählte abweichende Rechnungsadresse; leer heißt Standardadresse.
    #[sqlx(default)]
    #[serde(default)]
    pub adresse_id: Option<String>,
    /// Gewählter Ansprechpartner beim Kunden.
    #[sqlx(default)]
    #[serde(default)]
    pub ansprechpartner_id: Option<String>,
    /// Aus `kunde_snapshot` abgeleitet: `None` bei Entwürfen (noch kein
    /// Snapshot geschrieben), sonst der zum Zeitpunkt des Stellens
    /// eingefrorene Kundenname. Wird von `mit_snapshot_name()` befüllt,
    /// NICHT direkt aus der DB-Spalte gemappt (siehe Task 2).
    #[sqlx(default)]
    #[serde(default)]
    pub kunde_snapshot_name: Option<String>,
    /// Summe der erfassten Zahlungen. Wird von `list` mitgeladen und von
    /// `mit_zahlungsstand` in `zahlungsstand` übersetzt; bei Angeboten ohne
    /// Bedeutung.
    #[sqlx(default)]
    #[serde(default)]
    pub bezahlt_cent: i64,
    /// Aus Summe und Zahlungen abgeleitet — nicht gespeichert, damit Status und
    /// Zahlungen nicht auseinanderlaufen können. `skip` statt `default`, weil es
    /// keine Datenbankspalte gibt, aus der sich der Wert lesen ließe.
    #[sqlx(skip)]
    #[serde(default)]
    pub zahlungsstand: Option<crate::domain::beleg::Zahlungsstand>,
    /// Belegdatum plus Zahlungsziel. Im Datenmodell steht nur die Frist in Tagen;
    /// für Listen und Mahnungen ist das Datum die brauchbarere Angabe.
    #[sqlx(skip)]
    #[serde(default)]
    pub faellig_am: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BelegNeu {
    pub typ: String,
    pub kunde_id: String,
    pub datum: String,
    /// Leistungsdatum, bei einem Zeitraum dessen Beginn.
    pub leistungsdatum: String,
    /// Ende eines Leistungszeitraums; `None` bedeutet Einzeldatum.
    #[serde(default)]
    pub leistungsdatum_bis: Option<String>,
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
    #[serde(default)]
    pub leistungsdatum_bis: Option<String>,
    /// Nur bei Angeboten gepflegt; siehe `Beleg::gueltig_bis`.
    #[serde(default)]
    pub gueltig_bis: Option<String>,
    pub zahlungsziel_tage: i64,
    pub kopftext: String,
    pub fusstext: String,
    /// Abweichende Rechnungsadresse. Leer heißt: die Standardadresse des Kunden.
    #[serde(default)]
    pub adresse_id: Option<String>,
    /// Ansprechpartner beim Kunden. Leer heißt: keiner auf dem Beleg.
    #[serde(default)]
    pub ansprechpartner_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BelegDetail {
    pub beleg: Beleg,
    pub positionen: Vec<Belegposition>,
    pub zahlungen: Vec<Zahlung>,
    pub bezahlt_cent: i64,
    pub offener_betrag_cent: i64,
    /// Netto/USt je Steuersatz, aus den Bruttobeträgen herausgerechnet.
    /// Leer bei Kleinunternehmer-Belegen — dort gibt es nichts auszuweisen.
    pub steuerzeilen: Vec<crate::domain::steuer::SteuerZeile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Belegposition {
    pub id: String,
    pub beleg_id: String,
    pub artikel_id: Option<String>,
    pub bezeichnung: String,
    pub einheit_kuerzel: String,
    /// Bruttopreis — die USt wird bei Regelbesteuerung herausgerechnet.
    pub einzelpreis_cent: i64,
    pub menge: i64,
    pub positionssumme_cent: i64,
    /// Beim Speichern vom Artikel eingefroren (wie Bezeichnung und Preis) —
    /// ein späterer Satzwechsel am Artikel ändert keinen bestehenden Beleg.
    pub ust_satz_prozent: i64,
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
    /// Nur bei Freitextpositionen ausgewertet; Artikelpositionen erben den
    /// Satz vom Artikel. `None` heißt 19 % (Regelsatz).
    #[serde(default)]
    pub ust_satz_prozent: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Zahlung {
    pub id: String,
    pub rechnung_id: String,
    pub datum: String,
    pub betrag_cent: i64,
    pub notiz: String,
}

pub(crate) const BELEG_SPALTEN: &str = "id, typ, nummer, status, kunde_id, datum, leistungsdatum, leistungsdatum_bis, gueltig_bis, zahlungsziel_tage, kopftext, fusstext, summe_cent, ursprungsangebot_id, storno_von_id, kunde_snapshot, adresse_id, ansprechpartner_id";

/// Spalten einer Belegposition — an einer Stelle statt viermal wortgleich:
/// Beim Feld `ust_satz_prozent` fiel auf, dass jede neue Spalte sonst an vier
/// SELECT-Stellen einzeln nachgezogen werden muss und das Vergessen einer
/// davon erst zur Laufzeit auffällt.
pub(crate) const BELEGPOSITION_SPALTEN: &str = "id, beleg_id, artikel_id, bezeichnung, einheit_kuerzel, einzelpreis_cent, menge, positionssumme_cent, ust_satz_prozent, reihenfolge";

#[allow(clippy::too_many_arguments)]
fn pruefe_beleg_neu(
    typ: &str,
    datum: &str,
    leistungsdatum: &str,
    leistungsdatum_bis: Option<&str>,
    zahlungsziel_tage: i64,
    gueltig_bis: Option<&str>,
) -> AppResult<()> {
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
    // Ein Zeitraum, dessen Ende vor dem Beginn liegt, ist keine gültige Angabe.
    // Der Vergleich läuft über die ISO-Schreibweise, die sich lexikografisch
    // ordnen lässt.
    if let Some(bis) = leistungsdatum_bis.map(str::trim).filter(|b| !b.is_empty()) {
        if bis < leistungsdatum.trim() {
            return Err(AppError::Validation {
                feld: "leistungsdatum_bis".into(),
                meldung: "Das Ende des Leistungszeitraums darf nicht vor dem Beginn liegen".into(),
            });
        }
    }
    // Ein Angebot, das schon am Tag der Erstellung abgelaufen wäre, ist keine
    // sinnvolle Angabe — derselbe lexikografische Vergleich wie oben.
    if let Some(bis) = gueltig_bis.map(str::trim).filter(|b| !b.is_empty()) {
        if bis < datum.trim() {
            return Err(AppError::Validation {
                feld: "gueltig_bis".into(),
                meldung: "Das Gültigkeitsdatum darf nicht vor dem Belegdatum liegen".into(),
            });
        }
    }
    Ok(())
}

/// Tage, die ein neu angelegtes Angebot standardmäßig gültig ist.
///
/// Aus den Einstellungen; fällt auf 30 zurück, wenn nichts hinterlegt oder der
/// Wert unbrauchbar ist — eine kaputte Einstellung darf das Anlegen eines
/// Angebots nicht verhindern.
async fn angebot_gueltigkeit_tage(pool: &SqlitePool) -> AppResult<i64> {
    let wert = crate::commands::einstellungen::get(pool, "vorlage.angebot_gueltigkeit_tage".into()).await?;
    Ok(wert
        .and_then(|w| w.trim().parse::<i64>().ok())
        .filter(|&t| t >= 0)
        .unwrap_or(30))
}

async fn lade_beleg(pool: &SqlitePool, id: &str) -> AppResult<Beleg> {
    let sql = format!("SELECT {BELEG_SPALTEN} FROM beleg WHERE id = ? AND deleted_at IS NULL");
    let beleg: Beleg = sqlx::query_as(&sql).bind(id).fetch_optional(pool).await?.ok_or(AppError::NichtGefunden)?;
    Ok(mit_snapshot_name(beleg))
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
    pruefe_beleg_neu(&d.typ, &d.datum, &d.leistungsdatum, d.leistungsdatum_bis.as_deref(), d.zahlungsziel_tage, None)?;
    let kunde_existiert: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM kunde WHERE id = ? AND deleted_at IS NULL")
        .bind(&d.kunde_id).fetch_one(pool).await?;
    if kunde_existiert.0 == 0 {
        return Err(AppError::Validation { feld: "kunde_id".into(), meldung: "Kunde existiert nicht".into() });
    }
    // Nur ein Angebot bekommt eine Gültigkeit — bei einer Rechnung wäre ein
    // Ablaufdatum bedeutungslos. Ohne diesen Vorschlag versprach nur der
    // Fußtext eine Frist ("Dieses Angebot ist 30 Tage gültig"), ohne dass ein
    // Datum dazu existierte.
    let gueltig_bis = if d.typ == "angebot" {
        let tage = angebot_gueltigkeit_tage(pool).await?;
        chrono::NaiveDate::parse_from_str(&d.datum, "%Y-%m-%d")
            .ok()
            .and_then(|dt| dt.checked_add_signed(chrono::Duration::days(tage)))
            .map(|dt| dt.format("%Y-%m-%d").to_string())
    } else {
        None
    };
    let beleg = Beleg {
        id: Uuid::new_v4().to_string(), typ: d.typ, nummer: None, status: "entwurf".into(),
        kunde_id: d.kunde_id, datum: d.datum, leistungsdatum: d.leistungsdatum, leistungsdatum_bis: None,
        gueltig_bis, zahlungsziel_tage: d.zahlungsziel_tage, kopftext: d.kopftext, fusstext: d.fusstext,
        summe_cent: 0, ursprungsangebot_id: None, storno_von_id: None,
        kunde_snapshot: String::new(), kunde_snapshot_name: None,
        adresse_id: None, ansprechpartner_id: None,
        bezahlt_cent: 0, zahlungsstand: None, faellig_am: None,
    };
    sqlx::query("INSERT INTO beleg (id, typ, nummer, status, kunde_id, datum, leistungsdatum, leistungsdatum_bis, gueltig_bis, zahlungsziel_tage, kopftext, fusstext, summe_cent, ursprungsangebot_id, storno_von_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(&beleg.id).bind(&beleg.typ).bind(&beleg.nummer).bind(&beleg.status).bind(&beleg.kunde_id)
        .bind(&beleg.datum).bind(&beleg.leistungsdatum).bind(&beleg.leistungsdatum_bis).bind(&beleg.gueltig_bis)
        .bind(beleg.zahlungsziel_tage)
        .bind(&beleg.kopftext).bind(&beleg.fusstext).bind(beleg.summe_cent)
        .bind(&beleg.ursprungsangebot_id).bind(&beleg.storno_von_id).bind(jetzt()).bind(jetzt())
        .execute(pool).await?;
    Ok(beleg)
}

/// Listet Belege, wahlweise gefiltert nach Art, Status und Suchbegriff.
///
/// Gesucht wird in der Belegnummer und im Kundennamen. Der Name steht in einer
/// anderen Tabelle und ist bei gestellten Belegen zusätzlich eingefroren —
/// beides lässt sich in der Oberfläche nicht nachbilden, ohne alle Belege und
/// alle Kunden zu laden. Deshalb hier.
pub async fn list(
    pool: &SqlitePool,
    typ: Option<String>,
    status: Option<String>,
    suche: Option<String>,
) -> AppResult<Vec<Beleg>> {
    // Die Zahlungssumme kommt als Unterabfrage mit, damit die Liste den
    // Zahlungsstand ohne eine Abfrage je Zeile anzeigen kann.
    let spalten: String = BELEG_SPALTEN
        .split(", ")
        .map(|s| format!("b.{s}"))
        .collect::<Vec<_>>()
        .join(", ");
    // Ein leerer Suchbegriff ist keine Suche — sonst fände „" nichts.
    let muster = suche
        .filter(|s| !s.trim().is_empty())
        .map(|s| format!("%{}%", s.trim().to_lowercase()));

    // COALESCE auf den eingefrorenen Namen: Bei gestellten Belegen zählt er,
    // denn er steht auf dem Beleg. Vorher gibt es ihn nicht, dann der aktuelle.
    let sql = format!(
        "SELECT {spalten}, \
           COALESCE((SELECT SUM(z.betrag_cent) FROM zahlung z \
                     WHERE z.rechnung_id = b.id AND z.deleted_at IS NULL), 0) AS bezahlt_cent \
         FROM beleg b LEFT JOIN kunde k ON k.id = b.kunde_id \
         WHERE b.deleted_at IS NULL \
         AND (? IS NULL OR b.typ = ?) AND (? IS NULL OR b.status = ?) \
         AND (? IS NULL OR lower(COALESCE(b.nummer, '')) LIKE ? \
              OR lower(COALESCE(json_extract(NULLIF(b.kunde_snapshot, ''), '$.kunde.name'), k.name, '')) LIKE ?) \
         ORDER BY b.datum DESC, b.created_at DESC"
    );
    let belege: Vec<Beleg> = sqlx::query_as(&sql)
        .bind(typ.clone()).bind(typ)
        .bind(status.clone()).bind(status)
        .bind(muster.clone()).bind(muster.clone()).bind(muster)
        .fetch_all(pool).await?;
    Ok(belege.into_iter().map(mit_snapshot_name).map(mit_zahlungsstand).collect())
}

pub async fn get(pool: &SqlitePool, id: String) -> AppResult<BelegDetail> {
    let beleg = lade_beleg(pool, &id).await?;
    let positionen: Vec<Belegposition> = sqlx::query_as(
        &format!("SELECT {BELEGPOSITION_SPALTEN} FROM belegposition WHERE beleg_id = ? AND deleted_at IS NULL ORDER BY reihenfolge"))
        .bind(&id).fetch_all(pool).await?;
    let zahlungen: Vec<Zahlung> = sqlx::query_as(
        "SELECT id, rechnung_id, datum, betrag_cent, notiz FROM zahlung WHERE rechnung_id = ? AND deleted_at IS NULL ORDER BY datum")
        .bind(&id).fetch_all(pool).await?;
    let bezahlt_cent: i64 = zahlungen.iter().map(|z| z.betrag_cent).sum();
    let offener_betrag_cent = beleg.summe_cent - bezahlt_cent;

    // Steuermodus wie beim Dokumenten-Export (kontext.rs): Bei gestellten
    // Belegen entscheidet das eingefrorene Kleinunternehmer-Flag im Snapshot,
    // bei Entwürfen die aktuelle Firmeneinstellung. Fehlt das Flag in einem
    // gestellten Beleg, stammt er aus der Zeit vor seiner Einführung — damals
    // gab es nur Kleinunternehmer-Belege; der Live-Wert würde solche Altbelege
    // nach dem Wechsel zur Regelbesteuerung rückwirkend umdeuten.
    let kleinunternehmer = if beleg.status == "entwurf" {
        crate::commands::firma::get(pool).await?.kleinunternehmer
    } else {
        serde_json::from_str::<serde_json::Value>(&beleg.kunde_snapshot)
            .ok()
            .and_then(|s| s["firma"]["kleinunternehmer"].as_bool())
            .unwrap_or(true)
    };
    let steuerzeilen = if kleinunternehmer {
        Vec::new()
    } else {
        let gruppen: Vec<(i64, i64)> = positionen
            .iter()
            .map(|p| (p.ust_satz_prozent, p.positionssumme_cent))
            .collect();
        crate::domain::steuer::aufschluesselung(&gruppen)
    };

    Ok(BelegDetail { beleg, positionen, zahlungen, bezahlt_cent, offener_betrag_cent, steuerzeilen })
}

pub async fn update(pool: &SqlitePool, d: BelegUpdate) -> AppResult<Beleg> {
    let beleg = lade_beleg(pool, &d.id).await?;
    pruefe_ist_entwurf(&beleg)?;
    pruefe_beleg_neu(
        &beleg.typ, &d.datum, &d.leistungsdatum, d.leistungsdatum_bis.as_deref(),
        d.zahlungsziel_tage, d.gueltig_bis.as_deref(),
    )?;
    pruefe_gehoert_zum_kunden(pool, "adresse", d.adresse_id.as_deref(), &d.kunde_id).await?;
    pruefe_gehoert_zum_kunden(pool, "ansprechpartner", d.ansprechpartner_id.as_deref(), &d.kunde_id).await?;
    // Leere Strings heißen „nicht gesetzt" und werden als NULL gespeichert.
    // Ein gespeichertes "" verhielte sich sonst anders als NULL: Die Übersicht
    // wertet Angebote per String-Vergleich (`gueltig_bis >= heute`) als offen —
    // "" wäre immer „abgelaufen", obwohl der Nutzer „unbefristet" meinte. Das
    // Frontend normalisiert zwar selbst, aber der Vertrag gehört dem Backend.
    let gueltig_bis = d.gueltig_bis.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let leistungsdatum_bis = d.leistungsdatum_bis.as_deref().map(str::trim).filter(|s| !s.is_empty());
    sqlx::query("UPDATE beleg SET kunde_id=?, datum=?, leistungsdatum=?, leistungsdatum_bis=?, gueltig_bis=?, zahlungsziel_tage=?, kopftext=?, fusstext=?, adresse_id=?, ansprechpartner_id=?, updated_at=? WHERE id=?")
        .bind(&d.kunde_id).bind(&d.datum).bind(&d.leistungsdatum).bind(leistungsdatum_bis).bind(gueltig_bis)
        .bind(d.zahlungsziel_tage)
        .bind(&d.kopftext).bind(&d.fusstext).bind(&d.adresse_id).bind(&d.ansprechpartner_id)
        .bind(jetzt()).bind(&d.id)
        .execute(pool).await?;
    lade_beleg(pool, &d.id).await
}

/// Legt eine Kopie eines Belegs als neuen Entwurf an.
///
/// Wer jeden Monat eine fast gleiche Rechnung stellt, tippte sie bisher jedes
/// Mal neu. Die Kopie übernimmt Kunde, Rechnungsadresse, Ansprechpartner,
/// Zahlungsziel, Kopf- und Fußtext sowie alle Positionen; Datum und
/// Leistungsdatum werden auf heute gesetzt — eine Kopie ist ein neuer Vorgang,
/// kein rückdatiertes Duplikat. Aus demselben Grund wird ein
/// `leistungsdatum_bis` bewusst nicht kopiert: Der Zeitraum des Originals ist
/// zum neuen Leistungsdatum von heute falsch (und läge er davor, sogar
/// ungültig). Eine Gültigkeit bei einem Angebot bekommt die Kopie frisch aus
/// der Einstellung, wie jeder neu angelegte Beleg (siehe `create`), nicht die
/// des Originals.
///
/// Quelle darf jeden Status haben — gerade ein festgeschriebener Beleg lässt
/// sich sonst gar nicht mehr als Vorlage nutzen, weil er selbst unveränderbar
/// ist. Einzige Ausnahme: ein Stornobeleg. Er ist eine Gutschrift mit
/// negativen Positionen, und ein Entwurf mit negativen Preisen ist nirgendwo
/// sonst zulässig — als Vorlage dient die stornierte Rechnung selbst.
pub async fn duplizieren(pool: &SqlitePool, id: String) -> AppResult<Beleg> {
    let quelle = lade_beleg(pool, &id).await?;
    if quelle.storno_von_id.is_some() {
        return Err(AppError::Validation {
            feld: "storno_von_id".into(),
            meldung: "Ein Stornobeleg lässt sich nicht duplizieren — nutze die stornierte Rechnung als Vorlage".into(),
        });
    }
    // Der Kunde des Originals kann inzwischen gelöscht sein: Das Löschen ist
    // nur bei offenen *Entwürfen* gesperrt, nicht bei gestellten Belegen. Ein
    // Entwurf mit gelöschtem Kunden ließe sich weder stellen (nichtssagendes
    // „nicht gefunden") noch im Kunden-Dropdown sinnvoll anzeigen — besser
    // hier eine klare Meldung, wie sie auch `create` gäbe.
    let kunde_existiert: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM kunde WHERE id = ? AND deleted_at IS NULL")
        .bind(&quelle.kunde_id).fetch_one(pool).await?;
    if kunde_existiert.0 == 0 {
        return Err(AppError::Validation {
            feld: "kunde_id".into(),
            meldung: "Der Kunde dieses Belegs wurde gelöscht — lege die Kopie über einen neuen Beleg an".into(),
        });
    }
    let positionen: Vec<Belegposition> = sqlx::query_as(
        &format!("SELECT {BELEGPOSITION_SPALTEN} FROM belegposition WHERE beleg_id = ? AND deleted_at IS NULL ORDER BY reihenfolge"))
        .bind(&id).fetch_all(pool).await?;

    // Adresse und Ansprechpartner nur übernehmen, wenn es sie noch gibt —
    // eine seit dem Original gelöschte Auswahl fällt still auf den Standard
    // zurück, statt das Duplizieren scheitern zu lassen. Nur der
    // Validierungsfall fällt zurück; ein technischer Fehler (Datenbank)
    // bricht ab, sonst verlöre ausgerechnet er die abweichende Adresse still.
    let adresse_id = match pruefe_gehoert_zum_kunden(pool, "adresse", quelle.adresse_id.as_deref(), &quelle.kunde_id).await {
        Ok(()) => quelle.adresse_id.clone(),
        Err(AppError::Validation { .. }) => None,
        Err(anderer) => return Err(anderer),
    };
    let ansprechpartner_id = match pruefe_gehoert_zum_kunden(pool, "ansprechpartner", quelle.ansprechpartner_id.as_deref(), &quelle.kunde_id).await {
        Ok(()) => quelle.ansprechpartner_id.clone(),
        Err(AppError::Validation { .. }) => None,
        Err(anderer) => return Err(anderer),
    };

    let heute = heute();
    let gueltig_bis = if quelle.typ == "angebot" {
        let tage = angebot_gueltigkeit_tage(pool).await?;
        chrono::NaiveDate::parse_from_str(&heute, "%Y-%m-%d")
            .ok()
            .and_then(|dt| dt.checked_add_signed(chrono::Duration::days(tage)))
            .map(|dt| dt.format("%Y-%m-%d").to_string())
    } else {
        None
    };

    // Eine Transaktion um Beleg und Positionen: Scheitert unterwegs etwas,
    // bleibt kein verwaister Entwurf mit halber Positionsliste und falscher
    // Summe zurück — dieselbe Risikoklasse wie bei angebot_ueberfuehren und
    // storniere_rechnung.
    let kopie_id = Uuid::new_v4().to_string();
    let summe = belegsumme_cent(&positionen.iter().map(|p| p.positionssumme_cent).collect::<Vec<_>>());
    let mut tx = pool.begin().await?;
    sqlx::query("INSERT INTO beleg (id, typ, nummer, status, kunde_id, datum, leistungsdatum, leistungsdatum_bis, gueltig_bis, zahlungsziel_tage, kopftext, fusstext, summe_cent, ursprungsangebot_id, storno_von_id, adresse_id, ansprechpartner_id, created_at, updated_at) VALUES (?,?,NULL,'entwurf',?,?,?,NULL,?,?,?,?,?,NULL,NULL,?,?,?,?)")
        .bind(&kopie_id).bind(&quelle.typ).bind(&quelle.kunde_id)
        .bind(&heute).bind(&heute).bind(&gueltig_bis).bind(quelle.zahlungsziel_tage)
        .bind(&quelle.kopftext).bind(&quelle.fusstext).bind(summe)
        .bind(&adresse_id).bind(&ansprechpartner_id)
        .bind(jetzt()).bind(jetzt())
        .execute(&mut *tx).await?;

    for pos in positionen {
        // Nicht mit dem Artikel verknüpft: Wäre sie es, würde eine spätere
        // Bearbeitung Bezeichnung, Einheit und ohne Preisvorgabe auch den
        // Preis aus dem *aktuellen* Artikelstand neu ableiten. Eine Kopie
        // soll aber genau abbilden, was der Ursprungsbeleg auswies —
        // unabhängig davon, ob sich der Artikel seither geändert hat.
        sqlx::query("INSERT INTO belegposition (id, beleg_id, artikel_id, bezeichnung, einheit_kuerzel, einzelpreis_cent, menge, positionssumme_cent, ust_satz_prozent, reihenfolge, created_at, updated_at) VALUES (?,?,NULL,?,?,?,?,?,?,?,?,?)")
            .bind(Uuid::new_v4().to_string()).bind(&kopie_id)
            .bind(&pos.bezeichnung).bind(&pos.einheit_kuerzel)
            .bind(pos.einzelpreis_cent).bind(pos.menge)
            .bind(pos.positionssumme_cent).bind(pos.ust_satz_prozent).bind(pos.reihenfolge)
            .bind(jetzt()).bind(jetzt())
            .execute(&mut *tx).await?;
    }
    tx.commit().await?;

    lade_beleg(pool, &kopie_id).await
}

/// Stellt sicher, dass eine gewählte Adresse oder ein Ansprechpartner zum
/// Kunden des Belegs gehört.
///
/// Ohne diese Prüfung ließe sich die Anschrift eines fremden Kunden auf die
/// Rechnung setzen — ein Fehler, den niemand bemerkt, bis die Post
/// zurückkommt.
async fn pruefe_gehoert_zum_kunden(
    pool: &SqlitePool,
    tabelle: &str,
    id: Option<&str>,
    kunde_id: &str,
) -> AppResult<()> {
    let Some(id) = id.filter(|s| !s.is_empty()) else { return Ok(()) };
    // Der Tabellenname stammt aus dem Aufruf, nicht aus einer Eingabe.
    let sql = format!("SELECT kunde_id FROM {tabelle} WHERE id = ? AND deleted_at IS NULL");
    let zeile: Option<(String,)> = sqlx::query_as(&sql).bind(id).fetch_optional(pool).await?;
    match zeile {
        Some((gehoert_zu,)) if gehoert_zu == kunde_id => Ok(()),
        _ => Err(AppError::Validation {
            feld: format!("{tabelle}_id"),
            meldung: "Auswahl gehört nicht zu diesem Kunden".into(),
        }),
    }
}

pub async fn delete(pool: &SqlitePool, id: String) -> AppResult<()> {
    let beleg = lade_beleg(pool, &id).await?;
    pruefe_ist_entwurf(&beleg)?;
    // Positionen mit soft-löschen. Blieben sie zurück, hinge an einem gelöschten
    // Beleg weiterhin sichtbarer Inhalt — dieselbe Klasse von Karteileichen, die
    // Migration 0005 für Kundenpreise nachträglich aufräumen musste.
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE belegposition SET deleted_at = ? WHERE beleg_id = ? AND deleted_at IS NULL")
        .bind(jetzt()).bind(&id).execute(&mut *tx).await?;
    sqlx::query("UPDATE beleg SET deleted_at = ? WHERE id = ?")
        .bind(jetzt()).bind(&id).execute(&mut *tx).await?;
    tx.commit().await?;
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

    let (bezeichnung, einheit_kuerzel, einzelpreis_cent, ust_satz_prozent) = if let Some(artikel_id) = &d.artikel_id {
        // Der Steuersatz wird wie Bezeichnung und Preis vom Artikel übernommen
        // und eingefroren: Ein späterer Satzwechsel am Artikel darf einen
        // bereits erfassten Beleg nicht verändern.
        let artikel: (String, String, i64) = sqlx::query_as(
            "SELECT a.bezeichnung, e.kuerzel, a.ust_satz_prozent FROM artikel a JOIN einheit e ON e.id = a.einheit_id \
             WHERE a.id = ? AND a.deleted_at IS NULL")
            .bind(artikel_id).fetch_optional(pool).await?
            .ok_or_else(|| AppError::Validation { feld: "artikel_id".into(), meldung: "Artikel existiert nicht".into() })?;
        let preis = match d.einzelpreis_cent {
            Some(p) => p,
            None => effektiver_preis(pool, artikel_id, &beleg.kunde_id, &beleg.datum).await?,
        };
        (artikel.0, artikel.1, preis, artikel.2)
    } else {
        let preis = d.einzelpreis_cent.ok_or_else(|| AppError::Validation {
            feld: "einzelpreis_cent".into(),
            meldung: "Einzelpreis ist bei Freitextpositionen erforderlich".into(),
        })?;
        if d.bezeichnung.trim().is_empty() {
            return Err(AppError::Validation { feld: "bezeichnung".into(), meldung: "Bezeichnung darf nicht leer sein".into() });
        }
        let satz = d.ust_satz_prozent.unwrap_or(19);
        crate::commands::artikel::pruefe_ust_satz(satz)?;
        (d.bezeichnung.trim().to_string(), d.einheit_kuerzel.clone(), preis, satz)
    };

    let summe = positionssumme_cent(d.menge, einzelpreis_cent)?;

    let mut tx = pool.begin().await?;

    let position = if d.id.is_empty() {
        let reihenfolge = naechste_reihenfolge(&mut tx, &d.beleg_id).await?;
        let pos = Belegposition {
            id: Uuid::new_v4().to_string(), beleg_id: d.beleg_id.clone(), artikel_id: d.artikel_id.clone(),
            bezeichnung, einheit_kuerzel, einzelpreis_cent, menge: d.menge,
            positionssumme_cent: summe, ust_satz_prozent, reihenfolge,
        };
        sqlx::query("INSERT INTO belegposition (id, beleg_id, artikel_id, bezeichnung, einheit_kuerzel, einzelpreis_cent, menge, positionssumme_cent, ust_satz_prozent, reihenfolge, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
            .bind(&pos.id).bind(&pos.beleg_id).bind(&pos.artikel_id).bind(&pos.bezeichnung)
            .bind(&pos.einheit_kuerzel).bind(pos.einzelpreis_cent).bind(pos.menge)
            .bind(pos.positionssumme_cent).bind(pos.ust_satz_prozent).bind(pos.reihenfolge).bind(jetzt()).bind(jetzt())
            .execute(&mut *tx).await?;
        pos
    } else {
        // Die Position muss zum übergebenen Beleg gehören. Ohne diese Bedingung
        // ließe sich über eine fremde Positions-Id die Position eines *anderen*
        // Belegs ändern — geprüft würde oben nur, dass der übergebene Beleg ein
        // Entwurf ist, und die Summe unten würde für den falschen Beleg neu
        // berechnet. Der andere Beleg hätte danach eine geänderte Position bei
        // unveränderter Summe.
        let bestehende: (i64,) = sqlx::query_as("SELECT reihenfolge FROM belegposition WHERE id = ? AND beleg_id = ? AND deleted_at IS NULL")
            .bind(&d.id).bind(&d.beleg_id).fetch_optional(&mut *tx).await?.ok_or(AppError::NichtGefunden)?;
        sqlx::query("UPDATE belegposition SET artikel_id=?, bezeichnung=?, einheit_kuerzel=?, einzelpreis_cent=?, menge=?, positionssumme_cent=?, ust_satz_prozent=?, updated_at=? WHERE id=?")
            .bind(&d.artikel_id).bind(&bezeichnung).bind(&einheit_kuerzel).bind(einzelpreis_cent)
            .bind(d.menge).bind(summe).bind(ust_satz_prozent).bind(jetzt()).bind(&d.id)
            .execute(&mut *tx).await?;
        Belegposition {
            id: d.id.clone(), beleg_id: d.beleg_id.clone(), artikel_id: d.artikel_id.clone(),
            bezeichnung, einheit_kuerzel, einzelpreis_cent, menge: d.menge,
            positionssumme_cent: summe, ust_satz_prozent, reihenfolge: bestehende.0,
        }
    };

    beleg_summe_neu_berechnen(&mut tx, &d.beleg_id).await?;
    tx.commit().await?;
    Ok(position)
}

/// Verschiebt eine Position um einen Platz nach oben oder unten.
///
/// Die Reihenfolge steht so auf dem Beleg. Wer eine Position nachträglich
/// braucht, musste sie bisher ans Ende hängen — oder alles darunter löschen
/// und neu anlegen.
///
/// Getauscht wird mit dem Nachbarn, statt alle Ränge neu zu vergeben: Das ist
/// eine Änderung an zwei Zeilen und kommt ohne Annahme darüber aus, ob die
/// Ränge lückenlos sind.
pub async fn position_verschieben(pool: &SqlitePool, id: String, richtung: String) -> AppResult<()> {
    let zeile: (String, i64) = sqlx::query_as(
        "SELECT beleg_id, reihenfolge FROM belegposition WHERE id = ? AND deleted_at IS NULL")
        .bind(&id).fetch_optional(pool).await?.ok_or(AppError::NichtGefunden)?;
    let (beleg_id, rang) = zeile;
    let beleg = lade_beleg(pool, &beleg_id).await?;
    pruefe_ist_entwurf(&beleg)?;

    let hoch = match richtung.as_str() {
        "hoch" => true,
        "runter" => false,
        _ => return Err(AppError::Validation {
            feld: "richtung".into(),
            meldung: "Richtung muss \"hoch\" oder \"runter\" sein".into(),
        }),
    };

    let sql = if hoch {
        "SELECT id, reihenfolge FROM belegposition WHERE beleg_id = ? AND deleted_at IS NULL \
         AND reihenfolge < ? ORDER BY reihenfolge DESC LIMIT 1"
    } else {
        "SELECT id, reihenfolge FROM belegposition WHERE beleg_id = ? AND deleted_at IS NULL \
         AND reihenfolge > ? ORDER BY reihenfolge ASC LIMIT 1"
    };
    let nachbar: Option<(String, i64)> = sqlx::query_as(sql)
        .bind(&beleg_id).bind(rang).fetch_optional(pool).await?;

    // Am Rand gibt es keinen Nachbarn. Das ist kein Fehler: Der Knopf ist in
    // der Oberfläche abgeblendet, und eine Meldung hätte hier keinen Anlass.
    let Some((nachbar_id, nachbar_rang)) = nachbar else {
        return Ok(());
    };

    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE belegposition SET reihenfolge = ?, updated_at = ? WHERE id = ?")
        .bind(nachbar_rang).bind(jetzt()).bind(&id).execute(&mut *tx).await?;
    sqlx::query("UPDATE belegposition SET reihenfolge = ?, updated_at = ? WHERE id = ?")
        .bind(rang).bind(jetzt()).bind(&nachbar_id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
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
    ansprechpartner: Option<&crate::commands::kunden::Ansprechpartner>,
    firma: &crate::commands::firma::Firma,
) -> String {
    serde_json::json!({
        "kunde": {
            "name": kunde.name, "kundennummer": kunde.kundennummer, "ust_idnr": kunde.ust_idnr,
            "email": kunde.email, "leitweg_id": kunde.leitweg_id, "kaeuferreferenz": kunde.kaeuferreferenz,
        },
        "adresse": adresse.map(|a| serde_json::json!({
            "strasse": a.strasse, "plz": a.plz, "ort": a.ort, "land": a.land,
        })),
        // Mit eingefroren: Ändert sich die Besetzung beim Kunden, darf das den
        // bereits gestellten Beleg nicht rückwirkend ändern (GoBD).
        "ansprechpartner": ansprechpartner.map(|a| serde_json::json!({
            "name": a.name, "rolle": a.rolle, "email": a.email, "telefon": a.telefon,
        })),
        "firma": {
            "name": firma.name, "strasse": firma.strasse, "plz": firma.plz, "ort": firma.ort, "land": firma.land,
            "steuernummer": firma.steuernummer, "ust_idnr": firma.ust_idnr, "iban": firma.iban, "bic": firma.bic,
            "email": firma.email, "telefon": firma.telefon, "fax": firma.fax, "kontakt_name": firma.kontakt_name,
            "kleinunternehmer": firma.kleinunternehmer,
        },
    }).to_string()
}

/// Extrahiert den Kundennamen aus einer rohen `kunde_snapshot`-Spalte.
/// Leerer String (Entwurf, noch kein Snapshot) oder nicht parsbares JSON
/// liefern `None` statt eines Fehlers — die Anzeige fällt dann auf die
/// Live-Suche in der aktuellen Kundenliste zurück (siehe Frontend-Tasks).
pub(crate) fn kunde_snapshot_name(roh: &str) -> Option<String> {
    if roh.is_empty() {
        return None;
    }
    let wert: serde_json::Value = serde_json::from_str(roh).ok()?;
    wert.get("kunde")?.get("name")?.as_str().map(String::from)
}

/// Befüllt `kunde_snapshot_name` aus der geladenen `kunde_snapshot`-Spalte.
/// Wird nach jedem `query_as::<_, Beleg>`-Aufruf angewendet, der über
/// `BELEG_SPALTEN` selektiert (die Spalte landet dank `#[sqlx(default)]`
/// sonst ungenutzt im Struct).
pub(crate) fn mit_snapshot_name(mut beleg: Beleg) -> Beleg {
    beleg.kunde_snapshot_name = kunde_snapshot_name(&beleg.kunde_snapshot);
    beleg
}

/// Ergänzt die abgeleiteten Felder Zahlungsstand und Fälligkeit.
///
/// Nur für Rechnungen: Ein Angebot kennt weder Zahlungen noch eine Fälligkeit,
/// dort blieben die Felder sonst mit sinnlosen Werten belegt.
fn mit_zahlungsstand(mut beleg: Beleg) -> Beleg {
    if beleg.typ == "rechnung" && beleg.status != "entwurf" {
        beleg.zahlungsstand = Some(crate::domain::beleg::zahlungsstand(
            beleg.summe_cent,
            beleg.bezahlt_cent,
        ));
        // Ein Stornobeleg ist eine Gutschrift, keine Forderung — ein Zahlungsziel
        // hat er nicht. Ein Fälligkeitsdatum wäre dort schlicht erfunden.
        if beleg.storno_von_id.is_none() {
            beleg.faellig_am = chrono::NaiveDate::parse_from_str(&beleg.datum, "%Y-%m-%d")
                .ok()
                .and_then(|d| d.checked_add_signed(chrono::Duration::days(beleg.zahlungsziel_tage)))
                .map(|d| d.to_string());
        }
    }
    beleg
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
    // Die am Beleg gewählte Adresse geht vor; ohne Wahl bleibt es beim Standard.
    let standardadresse = beleg
        .adresse_id
        .as_deref()
        .filter(|id| !id.is_empty())
        .and_then(|id| kunde.adressen.iter().find(|a| a.id == id))
        .or_else(|| kunde.adressen.iter().find(|a| a.typ == "rechnung" && a.ist_standard));
    let ansprechpartner = beleg
        .ansprechpartner_id
        .as_deref()
        .filter(|id| !id.is_empty())
        .and_then(|id| kunde.ansprechpartner.iter().find(|a| a.id == id));

    // § 14 Abs. 4 Nr. 1 UStG verlangt die vollständige Anschrift des
    // Leistungsempfängers. Ohne sie würde hier "adresse": null eingefroren; der
    // Beleg wäre unveränderbar gestellt und trüge dauerhaft einen leeren
    // Empfängerblock — heilbar nur noch per Storno. Angebote sind ausgenommen,
    // sie unterliegen § 14 nicht und gehen oft an noch unvollständig erfasste
    // Interessenten.
    if beleg.typ == "rechnung" && standardadresse.is_none() {
        return Err(AppError::Validation {
            feld: "adresse".into(),
            meldung: format!(
                "Für „{}\" ist keine Rechnungsadresse als Standard hinterlegt. \
                 Eine Rechnung muss die vollständige Anschrift des Empfängers enthalten (§ 14 UStG).",
                kunde.kunde.name
            ),
        });
    }

    let firma = crate::commands::firma::get(pool).await?;
    let snapshot = kunde_snapshot_json(&kunde.kunde, standardadresse, ansprechpartner, &firma);

    // Nummernvergabe und Beleg-UPDATE in einer Transaktion: Schlägt das UPDATE
    // fehl — etwa weil der Beleg zwischenzeitlich gestellt wurde —, wird auch
    // die Nummer zurückgerollt. Vorher war sie verbraucht und der Nummernkreis
    // hatte eine Lücke.
    let mut tx = pool.begin().await?;
    let nummer = naechste_nummer(&mut tx, &beleg.typ, Some(&beleg.datum)).await?;
    // Ein Angebot ist mit dem Festschreiben nicht verschickt — das tut der
    // Nutzer selbst. Eine Rechnung ist damit dagegen tatsächlich gestellt.
    let neuer_status = if beleg.typ == "angebot" { "festgeschrieben" } else { "gestellt" };
    let ergebnis = sqlx::query(
        "UPDATE beleg SET nummer=?, status=?, kunde_snapshot=?, updated_at=? WHERE id=? AND status = 'entwurf'")
        .bind(&nummer).bind(neuer_status).bind(&snapshot).bind(jetzt()).bind(&id)
        .execute(&mut *tx).await?;
    if ergebnis.rows_affected() == 0 {
        return Err(AppError::Validation {
            feld: "status".into(),
            meldung: "Beleg wurde zwischenzeitlich bereits gestellt".into(),
        });
    }
    tx.commit().await?;
    lade_beleg(pool, &id).await
}

const ANGEBOT_ABSCHLUSS_STATUS: [&str; 3] = ["angenommen", "abgelehnt", "abgelaufen"];

pub async fn setze_angebot_status(pool: &SqlitePool, id: String, status: String) -> AppResult<Beleg> {
    let beleg = lade_beleg(pool, &id).await?;
    if beleg.typ != "angebot" {
        return Err(AppError::Validation { feld: "typ".into(), meldung: "Nur Angebote haben diesen Status".into() });
    }
    if beleg.status != "festgeschrieben" {
        return Err(AppError::Validation { feld: "status".into(), meldung: "Nur festgeschriebene Angebote können einen Abschlussstatus erhalten".into() });
    }
    if !ANGEBOT_ABSCHLUSS_STATUS.contains(&status.as_str()) {
        return Err(AppError::Validation { feld: "status".into(), meldung: "Ungültiger Angebotsstatus".into() });
    }
    sqlx::query("UPDATE beleg SET status=?, updated_at=? WHERE id=?")
        .bind(&status).bind(jetzt()).bind(&id).execute(pool).await?;
    lade_beleg(pool, &id).await
}

/// Liest einen Textbaustein aus den Einstellungen.
///
/// Fehlt er, bleibt das Feld leer statt eines erfundenen Platzhaltertexts —
/// ein leeres Feld sieht man und füllt es, einen falschen Text übersieht man.
pub(crate) async fn baustein(pool: &SqlitePool, schluessel: &str) -> AppResult<String> {
    Ok(crate::commands::einstellungen::get(pool, schluessel.to_string())
        .await?
        .unwrap_or_default())
}

pub async fn angebot_ueberfuehren(pool: &SqlitePool, angebot_id: String) -> AppResult<Beleg> {
    let angebot = lade_beleg(pool, &angebot_id).await?;
    if angebot.typ != "angebot" {
        return Err(AppError::Validation { feld: "typ".into(), meldung: "Nur Angebote können in Rechnungen überführt werden".into() });
    }
    if !["festgeschrieben", "angenommen"].contains(&angebot.status.as_str()) {
        return Err(AppError::Validation { feld: "status".into(), meldung: "Nur festgeschriebene oder angenommene Angebote können überführt werden".into() });
    }

    let heute = heute();
    let rechnung = Beleg {
        id: Uuid::new_v4().to_string(), typ: "rechnung".into(), nummer: None, status: "entwurf".into(),
        kunde_id: angebot.kunde_id.clone(), datum: heute, leistungsdatum: angebot.leistungsdatum.clone(), leistungsdatum_bis: None,
        // Eine Gültigkeit ist eine Angebotssache; für die Rechnung bedeutungslos.
        gueltig_bis: None,
        zahlungsziel_tage: angebot.zahlungsziel_tage,
        // Nicht die Texte des Angebots übernehmen: Dort steht „anbei erhalten
        // Sie das gewünschte Angebot" und „dieses Angebot ist 30 Tage gültig".
        // In einer Rechnung ist das falsch, und niemand rechnet damit, dass es
        // dort landet. Die Rechnung bekommt deshalb ihre eigenen Bausteine.
        kopftext: baustein(pool, "text.rechnung.kopf").await?,
        fusstext: baustein(pool, "text.rechnung.fuss").await?,
        summe_cent: angebot.summe_cent, ursprungsangebot_id: Some(angebot.id.clone()), storno_von_id: None,
        kunde_snapshot: String::new(), kunde_snapshot_name: None,
        // Wer die Anschrift schon am Angebot gewählt hat, meint sie auch für
        // die Rechnung.
        adresse_id: angebot.adresse_id.clone(), ansprechpartner_id: angebot.ansprechpartner_id.clone(),
        bezahlt_cent: 0, zahlungsstand: None, faellig_am: None,
    };

    // Transaktion: das Beleg-INSERT und die Positions-INSERTs müssen atomar sein,
    // sonst könnte bei einem Abbruch mittendrin eine Rechnung mit nur einem Teil
    // der Positionen des Angebots entstehen, deren summe_cent nicht mehr zu ihren
    // tatsächlichen Positionen passt (gleiche Risikoklasse wie bei position_speichern/
    // position_loeschen in Task 3). Hier keine verschachtelten &SqlitePool-Aufrufe
    // nötig, daher keine Deadlock-Gefahr unter max_connections(1).
    let mut tx = pool.begin().await?;

    // Race-Guard: verhindert, dass dasselbe Angebot mehrfach (konkurrierend oder
    // sequentiell durch erneutes Klicken) in eine Rechnung überführt wird. Muss die
    // erste Aktion innerhalb der Transaktion sein: unter max_connections(1) muss ein
    // zweiter, konkurrierender Aufruf auf den Commit dieser Transaktion warten und
    // sieht danach garantiert die hier eingefügte Rechnung.
    let bereits_ueberfuehrt: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM beleg WHERE ursprungsangebot_id = ? AND deleted_at IS NULL")
        .bind(&angebot_id).fetch_one(&mut *tx).await?;
    if bereits_ueberfuehrt.0 > 0 {
        return Err(AppError::Validation {
            feld: "ursprungsangebot_id".into(),
            meldung: "Angebot wurde bereits in eine Rechnung überführt".into(),
        });
    }

    sqlx::query("INSERT INTO beleg (id, typ, nummer, status, kunde_id, datum, leistungsdatum, leistungsdatum_bis, zahlungsziel_tage, kopftext, fusstext, summe_cent, ursprungsangebot_id, storno_von_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(&rechnung.id).bind(&rechnung.typ).bind(&rechnung.nummer).bind(&rechnung.status).bind(&rechnung.kunde_id)
        .bind(&rechnung.datum).bind(&rechnung.leistungsdatum).bind(&rechnung.leistungsdatum_bis).bind(rechnung.zahlungsziel_tage)
        .bind(&rechnung.kopftext).bind(&rechnung.fusstext).bind(rechnung.summe_cent)
        .bind(&rechnung.ursprungsangebot_id).bind(&rechnung.storno_von_id).bind(jetzt()).bind(jetzt())
        .execute(&mut *tx).await?;

    let positionen: Vec<Belegposition> = sqlx::query_as(
        &format!("SELECT {BELEGPOSITION_SPALTEN} FROM belegposition WHERE beleg_id = ? AND deleted_at IS NULL ORDER BY reihenfolge"))
        .bind(&angebot_id).fetch_all(&mut *tx).await?;
    for pos in positionen {
        sqlx::query("INSERT INTO belegposition (id, beleg_id, artikel_id, bezeichnung, einheit_kuerzel, einzelpreis_cent, menge, positionssumme_cent, ust_satz_prozent, reihenfolge, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
            .bind(Uuid::new_v4().to_string()).bind(&rechnung.id).bind(&pos.artikel_id).bind(&pos.bezeichnung)
            .bind(&pos.einheit_kuerzel).bind(pos.einzelpreis_cent).bind(pos.menge)
            .bind(pos.positionssumme_cent).bind(pos.ust_satz_prozent).bind(pos.reihenfolge).bind(jetzt()).bind(jetzt())
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
    // Ein Stornobeleg ist selbst eine gestellte Rechnung und käme sonst durch die
    // Prüfungen oben. Jeder Durchlauf erzeugte einen weiteren Gegenbeleg und
    // verbrauchte eine Rechnungsnummer — eine Kaskade ohne fachlichen Sinn.
    if rechnung.storno_von_id.is_some() {
        return Err(AppError::Validation {
            feld: "storno_von_id".into(),
            meldung: "Ein Stornobeleg kann nicht selbst storniert werden".into(),
        });
    }

    let heute = heute();
    let snapshot: (String,) = sqlx::query_as("SELECT kunde_snapshot FROM beleg WHERE id = ?")
        .bind(&rechnung.id).fetch_one(pool).await?;
    let mut tx = pool.begin().await?;
    // Nummer innerhalb der Transaktion: Bricht das Storno ab, wird auch sie
    // zurückgerollt statt verbraucht.
    let nummer = naechste_nummer(&mut tx, "rechnung", Some(&heute)).await?;
    let storno = Beleg {
        id: Uuid::new_v4().to_string(), typ: "rechnung".into(), nummer: Some(nummer), status: "gestellt".into(),
        kunde_id: rechnung.kunde_id.clone(), datum: heute, leistungsdatum: rechnung.leistungsdatum.clone(), leistungsdatum_bis: None,
        gueltig_bis: None,
        zahlungsziel_tage: rechnung.zahlungsziel_tage, kopftext: rechnung.kopftext.clone(),
        fusstext: format!("Stornierung zu Rechnung {}", rechnung.nummer.clone().unwrap_or_default()),
        summe_cent: -rechnung.summe_cent, ursprungsangebot_id: None, storno_von_id: Some(rechnung.id.clone()),
        kunde_snapshot: snapshot.0.clone(), kunde_snapshot_name: kunde_snapshot_name(&snapshot.0),
        adresse_id: rechnung.adresse_id.clone(), ansprechpartner_id: rechnung.ansprechpartner_id.clone(),
        bezahlt_cent: 0, zahlungsstand: None, faellig_am: None,
    };

    // Transaktion: das Storno-Beleg-INSERT, die negierten Positions-INSERTs und das
    // abschließende UPDATE, das den Ursprungsbeleg als "storniert" markiert, müssen
    // atomar sein. Ein Abbruch mittendrin (z.B. nach dem Anlegen des Storno-Belegs,
    // aber vor dem UPDATE des Ursprungs) würde zwei "lebendig" aussehende Rechnungen
    // für denselben Vorgang hinterlassen — gleiche Risikoklasse wie bei
    // position_speichern/position_loeschen (Task 3) und angebot_ueberfuehren (Task 5).
    // Alle Aufrufe innerhalb dieser Transaktion nehmen &mut SqliteConnection statt
    // &SqlitePool entgegen, es gibt also keine verschachtelten Pool-Aufrufe.

    sqlx::query("INSERT INTO beleg (id, typ, nummer, status, kunde_id, datum, leistungsdatum, leistungsdatum_bis, zahlungsziel_tage, kopftext, fusstext, summe_cent, ursprungsangebot_id, storno_von_id, kunde_snapshot, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(&storno.id).bind(&storno.typ).bind(&storno.nummer).bind(&storno.status).bind(&storno.kunde_id)
        .bind(&storno.datum).bind(&storno.leistungsdatum).bind(&storno.leistungsdatum_bis).bind(storno.zahlungsziel_tage)
        .bind(&storno.kopftext).bind(&storno.fusstext).bind(storno.summe_cent)
        .bind(&storno.ursprungsangebot_id).bind(&storno.storno_von_id).bind(&snapshot.0).bind(jetzt()).bind(jetzt())
        .execute(&mut *tx).await?;

    let positionen: Vec<Belegposition> = sqlx::query_as(
        &format!("SELECT {BELEGPOSITION_SPALTEN} FROM belegposition WHERE beleg_id = ? AND deleted_at IS NULL ORDER BY reihenfolge"))
        .bind(&id).fetch_all(&mut *tx).await?;
    for pos in positionen {
        // Der Steuersatz bleibt unnegiert: negativ ist der Betrag, nicht der Satz.
        sqlx::query("INSERT INTO belegposition (id, beleg_id, artikel_id, bezeichnung, einheit_kuerzel, einzelpreis_cent, menge, positionssumme_cent, ust_satz_prozent, reihenfolge, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
            .bind(Uuid::new_v4().to_string()).bind(&storno.id).bind(&pos.artikel_id).bind(&pos.bezeichnung)
            .bind(&pos.einheit_kuerzel).bind(-pos.einzelpreis_cent).bind(pos.menge)
            .bind(-pos.positionssumme_cent).bind(pos.ust_satz_prozent).bind(pos.reihenfolge).bind(jetzt()).bind(jetzt())
            .execute(&mut *tx).await?;
    }

    let ergebnis = sqlx::query(
        "UPDATE beleg SET status = 'storniert', updated_at = ? WHERE id = ? AND status = 'gestellt'")
        .bind(jetzt()).bind(&id).execute(&mut *tx).await?;
    if ergebnis.rows_affected() == 0 {
        // Verlorenes Rennen: zwischen der initialen Prüfung oben und diesem UPDATE
        // hat ein konkurrierender storniere_rechnung()-Aufruf die Rechnung bereits
        // storniert. Der bereits in dieser (noch offenen) Transaktion eingefügte
        // Storno-Beleg samt Positionen wird durch das Err hier verworfen, da
        // Transaction::drop bei Rust automatisch zurückrollt (siehe angebot_ueberfuehren).
        return Err(AppError::Validation {
            feld: "status".into(),
            meldung: "Rechnung wurde zwischenzeitlich bereits storniert".into(),
        });
    }

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
    let rechnungen: Vec<Beleg> = rechnungen.into_iter().map(mit_snapshot_name).collect();
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
pub async fn beleg_list(pool: tauri::State<'_, SqlitePool>, typ: Option<String>, status: Option<String>,
    suche: Option<String>) -> AppResult<Vec<Beleg>> {
    list(&pool, typ, status, suche).await
}
#[tauri::command]
pub async fn belegposition_verschieben(
    pool: tauri::State<'_, SqlitePool>,
    id: String,
    richtung: String,
) -> AppResult<()> {
    position_verschieben(&pool, id, richtung).await
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
pub async fn beleg_duplizieren(pool: tauri::State<'_, SqlitePool>, id: String) -> AppResult<Beleg> {
    duplizieren(&pool, id).await
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

    /// Eine überführte Rechnung darf nicht die Texte des Angebots erben.
    ///
    /// Vorher wurden Kopf- und Fußtext wörtlich mitkopiert. In der Rechnung
    /// stand dann „anbei erhalten Sie das gewünschte Angebot" und „dieses
    /// Angebot ist 30 Tage gültig" — und niemand rechnet damit, dass der Text
    /// aus dem Angebot dort landet, also fiel es erst beim Kunden auf.
    #[tokio::test]
    async fn ueberfuehrung_nimmt_die_texte_der_rechnung() {
        let (_d, pool) = test_pool().await;
        let kunde = kunde_anlegen(&pool).await;
        let angebot = create(&pool, beleg_neu("angebot", &kunde)).await.unwrap();
        let artikel = artikel_anlegen(&pool, 5000).await;
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: angebot.id.clone(), artikel_id: Some(artikel),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();
        update(&pool, BelegUpdate {
            id: angebot.id.clone(), kunde_id: kunde.clone(),
            datum: angebot.datum.clone(), leistungsdatum: angebot.leistungsdatum.clone(),
            leistungsdatum_bis: None, gueltig_bis: None, zahlungsziel_tage: 14,
            kopftext: "Gern unterbreiten wir Ihnen folgendes Angebot.".into(),
            fusstext: "Dieses Angebot ist 30 Tage gültig.".into(),
            adresse_id: None, ansprechpartner_id: None,
        }).await.unwrap();
        stellen(&pool, angebot.id.clone()).await.unwrap();

        let rechnung = angebot_ueberfuehren(&pool, angebot.id.clone()).await.unwrap();

        let erwartet_kopf = crate::commands::einstellungen::get(&pool, "text.rechnung.kopf".into())
            .await.unwrap().unwrap();
        let erwartet_fuss = crate::commands::einstellungen::get(&pool, "text.rechnung.fuss".into())
            .await.unwrap().unwrap();
        assert_eq!(rechnung.kopftext, erwartet_kopf);
        assert_eq!(rechnung.fusstext, erwartet_fuss);
        assert!(!rechnung.fusstext.contains("Angebot"), "Angebotstext in der Rechnung: {}", rechnung.fusstext);
    }

    /// Eine Gültigkeit ist eine Angebotssache. Die überführte Rechnung darf
    /// keine erben — ein Ablaufdatum auf einer Rechnung wäre bedeutungslos.
    #[tokio::test]
    async fn ueberfuehrung_gibt_der_rechnung_keine_gueltigkeit() {
        let (_d, pool) = test_pool().await;
        let kunde = kunde_anlegen(&pool).await;
        let angebot = create(&pool, beleg_neu("angebot", &kunde)).await.unwrap();
        assert!(angebot.gueltig_bis.is_some(), "Angebot sollte eine Vorgabe-Gültigkeit haben");
        let artikel = artikel_anlegen(&pool, 5000).await;
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: angebot.id.clone(), artikel_id: Some(artikel),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();
        stellen(&pool, angebot.id.clone()).await.unwrap();

        let rechnung = angebot_ueberfuehren(&pool, angebot.id.clone()).await.unwrap();
        assert_eq!(rechnung.gueltig_bis, None);
    }

    /// Die Umstellung bestehender Angebote von „versendet" auf
    /// „festgeschrieben".
    ///
    /// Alle übrigen Tests laufen auf einer frischen Datenbank und legen ihre
    /// Belege mit dem neuen Wert an — sie sagen deshalb nichts darüber, was mit
    /// den Belegen geschieht, die schon da sind. Genau das ist der Teil, der
    /// nur ein einziges Mal läuft und den niemand wiederholen kann.
    ///
    /// Der Text kommt aus der Migrationsdatei selbst; eine abgeschriebene
    /// Fassung im Test bewiese nur, dass die Abschrift funktioniert.
    #[tokio::test]
    async fn migration_stellt_versendete_angebote_um() {
        let (_d, pool) = test_pool().await;
        let kunde = kunde_anlegen(&pool).await;

        // Zwei Belege im Zustand vor der Umstellung.
        for (id, typ, status, nummer) in [
            ("alt-angebot", "angebot", "versendet", "AN-2026-0001"),
            ("alt-rechnung", "rechnung", "gestellt", "RE-2026-0001"),
        ] {
            sqlx::query(
                "INSERT INTO beleg (id, typ, nummer, status, kunde_id, datum, leistungsdatum, \
                 zahlungsziel_tage, kopftext, fusstext, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, ?, '2026-01-01', '2026-01-01', 14, '', '', '', '')",
            )
            .bind(id).bind(typ).bind(nummer).bind(status).bind(&kunde)
            .execute(&pool).await.unwrap();
        }

        // Am Stück ausführen, so wie sqlx es beim Start tut. An Semikolons zu
        // trennen ginge schief, sobald eines in einem Kommentar steht.
        let migration = include_str!("../../migrations/0014_angebot_festgeschrieben.sql");
        sqlx::raw_sql(migration).execute(&pool).await.unwrap();

        let status = |id: &'static str| {
            let pool = pool.clone();
            async move {
                sqlx::query_scalar::<_, String>("SELECT status FROM beleg WHERE id = ?")
                    .bind(id).fetch_one(&pool).await.unwrap()
            }
        };
        assert_eq!(status("alt-angebot").await, "festgeschrieben");
        // Bei einer Rechnung trifft „gestellt" zu — sie darf nicht mitwandern.
        assert_eq!(status("alt-rechnung").await, "gestellt");
    }

    /// Legt einen Kunden samt Standard-Rechnungsadresse an — der Normalfall für
    /// jemanden, dem man Rechnungen stellt. Ohne Adresse lehnt `stellen` eine
    /// Rechnung seit P2.4 ab (§ 14 Abs. 4 Nr. 1 UStG); wer diesen Fall testen
    /// will, nimmt `kunde_ohne_adresse_anlegen`.
    async fn kunde_anlegen(pool: &sqlx::SqlitePool) -> String {
        let id = kunde_ohne_adresse_anlegen(pool).await;
        rechnungsadresse_anlegen(pool, &id).await;
        id
    }

    async fn kunde_ohne_adresse_anlegen(pool: &sqlx::SqlitePool) -> String {
        kunde_create(pool, KundeNeu {
            typ: "firma".into(), name: "ACME GmbH".into(), zahlungsziel_tage: 14,
            notizen: "".into(), ust_idnr: "".into(), email: "".into(),
            leitweg_id: "".into(), kaeuferreferenz: "".into(),
        }).await.unwrap().id
    }

    /// Legt eine Standard-Rechnungsadresse an. Ohne sie lässt sich seit P2.4
    /// keine Rechnung mehr stellen (§ 14 Abs. 4 Nr. 1 UStG).
    async fn rechnungsadresse_anlegen(pool: &sqlx::SqlitePool, kunde_id: &str) {
        crate::commands::kunden::adresse_speichern(pool, crate::commands::kunden::Adresse {
            id: "".into(), kunde_id: kunde_id.into(), typ: "rechnung".into(),
            strasse: "Kundenweg 5".into(), plz: "10117".into(), ort: "Berlin".into(),
            land: "DE".into(), ist_standard: true,
        }).await.unwrap();
    }

    fn beleg_neu(typ: &str, kunde_id: &str) -> BelegNeu {
        BelegNeu { typ: typ.into(), kunde_id: kunde_id.into(), datum: "2026-07-10".into(),
            leistungsdatum: "2026-07-10".into(), leistungsdatum_bis: None, zahlungsziel_tage: 14,
            kopftext: "".into(), fusstext: "".into() }
    }

    /// Der Fußtext versprach „Dieses Angebot ist 30 Tage gültig", aber es gab
    /// kein Datum dazu. Die Migration seedet die Vorgabe mit genau diesen 30
    /// Tagen — dieser Test prüft, dass sie auch ankommt, statt nur, dass
    /// irgendein Datum entsteht.
    #[tokio::test]
    async fn angebot_bekommt_beim_anlegen_eine_gueltigkeit_aus_der_vorgabe() {
        let (_dir, pool) = test_pool().await;
        let kunde = kunde_anlegen(&pool).await;
        let angebot = create(&pool, beleg_neu("angebot", &kunde)).await.unwrap();
        assert_eq!(angebot.gueltig_bis.as_deref(), Some("2026-08-09"), "10.07. + 30 Tage");
    }

    /// Eine Gültigkeit ist eine Angebotssache; bei einer Rechnung wäre ein
    /// Ablaufdatum bedeutungslos.
    #[tokio::test]
    async fn rechnung_bekommt_keine_gueltigkeit() {
        let (_dir, pool) = test_pool().await;
        let kunde = kunde_anlegen(&pool).await;
        let rechnung = create(&pool, beleg_neu("rechnung", &kunde)).await.unwrap();
        assert_eq!(rechnung.gueltig_bis, None);
    }

    #[tokio::test]
    async fn eine_eigene_gueltigkeitsvorgabe_wird_verwendet() {
        let (_dir, pool) = test_pool().await;
        crate::commands::einstellungen::set(
            &pool, "vorlage.angebot_gueltigkeit_tage".into(), "10".into(),
        ).await.unwrap();
        let kunde = kunde_anlegen(&pool).await;
        let angebot = create(&pool, beleg_neu("angebot", &kunde)).await.unwrap();
        assert_eq!(angebot.gueltig_bis.as_deref(), Some("2026-07-20"), "10.07. + 10 Tage");
    }

    /// Eine kaputte Einstellung darf das Anlegen eines Angebots nicht
    /// verhindern — Rückfall auf 30 Tage.
    #[tokio::test]
    async fn eine_unbrauchbare_gueltigkeitsvorgabe_faellt_auf_30_tage_zurueck() {
        let (_dir, pool) = test_pool().await;
        crate::commands::einstellungen::set(
            &pool, "vorlage.angebot_gueltigkeit_tage".into(), "unbrauchbar".into(),
        ).await.unwrap();
        let kunde = kunde_anlegen(&pool).await;
        let angebot = create(&pool, beleg_neu("angebot", &kunde)).await.unwrap();
        assert_eq!(angebot.gueltig_bis.as_deref(), Some("2026-08-09"), "10.07. + 30 Tage (Vorgabe)");
    }

    #[tokio::test]
    async fn gueltig_bis_laesst_sich_ueber_update_setzen_und_wieder_loeschen() {
        let (_dir, pool) = test_pool().await;
        let kunde = kunde_anlegen(&pool).await;
        let angebot = create(&pool, beleg_neu("angebot", &kunde)).await.unwrap();

        let mut felder = beleg_update_aus(&angebot);
        felder.gueltig_bis = Some("2026-12-31".into());
        let aktualisiert = update(&pool, felder).await.unwrap();
        assert_eq!(aktualisiert.gueltig_bis.as_deref(), Some("2026-12-31"));

        let mut zurueckgesetzt = beleg_update_aus(&aktualisiert);
        zurueckgesetzt.gueltig_bis = None;
        let geloescht = update(&pool, zurueckgesetzt).await.unwrap();
        assert_eq!(geloescht.gueltig_bis, None);
    }

    #[tokio::test]
    async fn gueltig_bis_darf_nicht_vor_dem_belegdatum_liegen() {
        let (_dir, pool) = test_pool().await;
        let kunde = kunde_anlegen(&pool).await;
        let angebot = create(&pool, beleg_neu("angebot", &kunde)).await.unwrap();

        let mut felder = beleg_update_aus(&angebot);
        felder.gueltig_bis = Some("2026-01-01".into());
        let fehler = update(&pool, felder).await.unwrap_err();
        match fehler {
            AppError::Validation { feld, .. } => assert_eq!(feld, "gueltig_bis"),
            anderer => panic!("unerwarteter Fehler: {anderer:?}"),
        }
    }

    /// Baut ein `BelegUpdate`, das den geladenen Beleg unverändert
    /// zurückschreibt — als Ausgangspunkt für Tests, die nur ein Feld ändern.
    fn beleg_update_aus(b: &Beleg) -> BelegUpdate {
        BelegUpdate {
            id: b.id.clone(), kunde_id: b.kunde_id.clone(), datum: b.datum.clone(),
            leistungsdatum: b.leistungsdatum.clone(), leistungsdatum_bis: b.leistungsdatum_bis.clone(),
            gueltig_bis: b.gueltig_bis.clone(), zahlungsziel_tage: b.zahlungsziel_tage,
            kopftext: b.kopftext.clone(), fusstext: b.fusstext.clone(),
            adresse_id: b.adresse_id.clone(), ansprechpartner_id: b.ansprechpartner_id.clone(),
        }
    }

    /// Belegnummern müssen datenbankseitig eindeutig sein — auch über soft-gelöschte
    /// Zeilen hinweg, damit eine Nummer nie ein zweites Mal vergeben wird (GoBD).
    /// Der Export legt Dateien als `<Nummer>.pdf` ohne Typ ab, deshalb gilt die
    /// Eindeutigkeit global und nicht je Belegart.
    #[tokio::test]
    async fn belegnummer_ist_eindeutig() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;

        let a = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        let b = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        sqlx::query("UPDATE beleg SET nummer = 'RE-2026-0001' WHERE id = ?")
            .bind(&a.id).execute(&pool).await.unwrap();

        let fehler = sqlx::query("UPDATE beleg SET nummer = 'RE-2026-0001' WHERE id = ?")
            .bind(&b.id).execute(&pool).await;
        assert!(fehler.is_err(), "doppelte Belegnummer haette abgelehnt werden muessen");

        // Auch nach dem Soft-Delete bleibt die Nummer belegt.
        sqlx::query("UPDATE beleg SET deleted_at = ? WHERE id = ?")
            .bind(jetzt()).bind(&a.id).execute(&pool).await.unwrap();
        let fehler = sqlx::query("UPDATE beleg SET nummer = 'RE-2026-0001' WHERE id = ?")
            .bind(&b.id).execute(&pool).await;
        assert!(fehler.is_err(), "Nummer eines geloeschten Belegs darf nicht neu vergeben werden");

        // Ein Angebot darf die Nummer einer Rechnung ebenfalls nicht belegen.
        let c = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        let fehler = sqlx::query("UPDATE beleg SET nummer = 'RE-2026-0001' WHERE id = ?")
            .bind(&c.id).execute(&pool).await;
        assert!(fehler.is_err(), "Belegnummern muessen typuebergreifend eindeutig sein");
    }

    /// Entwürfe haben noch keine Nummer (NULL). SQLite behandelt NULLs in einem
    /// Unique-Index als verschieden — beliebig viele Entwürfe müssen koexistieren.
    #[tokio::test]
    async fn mehrere_entwuerfe_ohne_nummer_sind_erlaubt() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        for _ in 0..3 {
            let b = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
            assert_eq!(b.nummer, None);
        }
        let anzahl: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM beleg WHERE nummer IS NULL")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(anzahl.0, 3);
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

    /// Legt drei Positionen an und liefert deren Ids in Reihenfolge.
    async fn drei_positionen(pool: &sqlx::SqlitePool, beleg_id: &str) -> Vec<String> {
        let mut ids = Vec::new();
        for i in 0..3 {
            let p = position_speichern(pool, BelegpositionNeu {
                id: "".into(), beleg_id: beleg_id.into(), artikel_id: None,
                bezeichnung: format!("Position {i}"), einheit_kuerzel: "Std".into(),
                einzelpreis_cent: Some(1000), menge: 1000, ust_satz_prozent: None,
            }).await.unwrap();
            ids.push(p.id);
        }
        ids
    }

    async fn bezeichnungen(pool: &sqlx::SqlitePool, beleg_id: &str) -> Vec<String> {
        get(pool, beleg_id.into()).await.unwrap().positionen
            .into_iter().map(|p| p.bezeichnung).collect()
    }

    /// Legt eine zweite, abweichende Rechnungsadresse an.
    async fn zweite_adresse_anlegen(pool: &sqlx::SqlitePool, kunde_id: &str) -> String {
        crate::commands::kunden::adresse_speichern(pool, crate::commands::kunden::Adresse {
            id: "".into(), kunde_id: kunde_id.into(), typ: "rechnung".into(),
            strasse: "Zweigstelle 7".into(), plz: "20095".into(), ort: "Hamburg".into(),
            land: "DE".into(), ist_standard: false,
        }).await.unwrap().id
    }

    #[tokio::test]
    async fn stellen_nimmt_die_gewaehlte_adresse_statt_der_standardadresse() {
        // Wer mehrere Standorte beliefert, konnte eine abweichende Anschrift
        // bisher nur erzwingen, indem er den Standard beim Kunden umstellte.
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let adresse_id = zweite_adresse_anlegen(&pool, &kunde_id).await;
        let beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        drei_positionen(&pool, &beleg.id).await;

        update(&pool, BelegUpdate {
            id: beleg.id.clone(), kunde_id: kunde_id.clone(), datum: beleg.datum.clone(),
            leistungsdatum: beleg.leistungsdatum.clone(), leistungsdatum_bis: None,
            gueltig_bis: None,
            zahlungsziel_tage: 14, kopftext: "".into(), fusstext: "".into(),
            adresse_id: Some(adresse_id.clone()), ansprechpartner_id: None,
        }).await.unwrap();

        let gestellt = stellen(&pool, beleg.id.clone()).await.unwrap();
        let snapshot: serde_json::Value = serde_json::from_str(&gestellt.kunde_snapshot).unwrap();
        assert_eq!(snapshot["adresse"]["ort"], "Hamburg");
    }

    #[tokio::test]
    async fn stellen_faellt_ohne_wahl_auf_die_standardadresse_zurueck() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        zweite_adresse_anlegen(&pool, &kunde_id).await;
        let beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        drei_positionen(&pool, &beleg.id).await;

        let gestellt = stellen(&pool, beleg.id.clone()).await.unwrap();
        let snapshot: serde_json::Value = serde_json::from_str(&gestellt.kunde_snapshot).unwrap();
        assert_eq!(snapshot["adresse"]["ort"], "Berlin", "ohne Wahl gilt die Standardadresse");
    }

    #[tokio::test]
    async fn stellen_friert_den_ansprechpartner_mit_ein() {
        // Der Name steht später auf dem Beleg. Ändert sich die Besetzung beim
        // Kunden, darf das den bereits gestellten Beleg nicht rückwirkend
        // ändern (GoBD).
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let ap = crate::commands::kunden::ansprechpartner_speichern(&pool,
            crate::commands::kunden::Ansprechpartner {
                id: "".into(), kunde_id: kunde_id.clone(), name: "Erika Musterfrau".into(),
                rolle: "Einkauf".into(), email: "".into(), telefon: "".into(), ist_standard: false,
            }).await.unwrap();
        let beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        drei_positionen(&pool, &beleg.id).await;

        update(&pool, BelegUpdate {
            id: beleg.id.clone(), kunde_id: kunde_id.clone(), datum: beleg.datum.clone(),
            leistungsdatum: beleg.leistungsdatum.clone(), leistungsdatum_bis: None,
            gueltig_bis: None,
            zahlungsziel_tage: 14, kopftext: "".into(), fusstext: "".into(),
            adresse_id: None, ansprechpartner_id: Some(ap.id.clone()),
        }).await.unwrap();

        let gestellt = stellen(&pool, beleg.id.clone()).await.unwrap();
        let snapshot: serde_json::Value = serde_json::from_str(&gestellt.kunde_snapshot).unwrap();
        assert_eq!(snapshot["ansprechpartner"]["name"], "Erika Musterfrau");
    }

    #[tokio::test]
    async fn adresse_eines_fremden_kunden_wird_abgelehnt() {
        // Sonst stünde am Ende die Anschrift eines anderen Kunden auf der
        // Rechnung — ein Fehler, den niemand bemerkt, bis sie zurückkommt.
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let fremder = kunde_anlegen(&pool).await;
        let fremde_adresse = zweite_adresse_anlegen(&pool, &fremder).await;
        let beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();

        let fehler = update(&pool, BelegUpdate {
            id: beleg.id.clone(), kunde_id: kunde_id.clone(), datum: beleg.datum.clone(),
            leistungsdatum: beleg.leistungsdatum.clone(), leistungsdatum_bis: None,
            gueltig_bis: None,
            zahlungsziel_tage: 14, kopftext: "".into(), fusstext: "".into(),
            adresse_id: Some(fremde_adresse), ansprechpartner_id: None,
        }).await;
        assert!(matches!(fehler, Err(AppError::Validation { .. })), "{fehler:?}");
    }

    #[tokio::test]
    async fn position_verschieben_tauscht_mit_dem_nachbarn() {
        // Die Reihenfolge steht so auf der Rechnung. Wer eine Position
        // nachträglich einfügt, musste sie bisher löschen und alles neu
        // anlegen, um sie an die richtige Stelle zu bekommen.
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        let ids = drei_positionen(&pool, &beleg.id).await;

        position_verschieben(&pool, ids[2].clone(), "hoch".into()).await.unwrap();
        assert_eq!(bezeichnungen(&pool, &beleg.id).await,
                   vec!["Position 0", "Position 2", "Position 1"]);

        position_verschieben(&pool, ids[0].clone(), "runter".into()).await.unwrap();
        assert_eq!(bezeichnungen(&pool, &beleg.id).await,
                   vec!["Position 2", "Position 0", "Position 1"]);
    }

    #[tokio::test]
    async fn position_verschieben_an_den_raendern_tut_nichts() {
        // Kein Fehler: Der Knopf ist in der Oberfläche ohnehin abgeblendet,
        // und ein Fehlschlag wäre hier eine Meldung ohne Anlass.
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        let ids = drei_positionen(&pool, &beleg.id).await;

        position_verschieben(&pool, ids[0].clone(), "hoch".into()).await.unwrap();
        position_verschieben(&pool, ids[2].clone(), "runter".into()).await.unwrap();
        assert_eq!(bezeichnungen(&pool, &beleg.id).await,
                   vec!["Position 0", "Position 1", "Position 2"]);
    }

    #[tokio::test]
    async fn position_verschieben_nur_im_entwurf() {
        // Ein gestellter Beleg ist unveränderlich (GoBD) — das gilt auch für
        // die Reihenfolge seiner Positionen.
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        let ids = drei_positionen(&pool, &beleg.id).await;
        stellen(&pool, beleg.id.clone()).await.unwrap();

        let fehler = position_verschieben(&pool, ids[0].clone(), "runter".into()).await;
        assert!(matches!(fehler, Err(AppError::Validation { .. })), "{fehler:?}");
    }

    #[tokio::test]
    async fn list_findet_nach_belegnummer_und_kundenname() {
        let (_dir, pool) = test_pool().await;
        let acme = kunde_anlegen(&pool).await;
        let baecker = kunde_create(&pool, KundeNeu {
            typ: "firma".into(), name: "Bäckerei Schmitt".into(), zahlungsziel_tage: 14,
            notizen: "".into(), ust_idnr: "".into(), email: "".into(),
            leitweg_id: "".into(), kaeuferreferenz: "".into(),
        }).await.unwrap().id;
        rechnungsadresse_anlegen(&pool, &baecker).await;

        let a = create(&pool, beleg_neu("rechnung", &acme)).await.unwrap();
        let b = create(&pool, beleg_neu("rechnung", &baecker)).await.unwrap();

        // Nach dem Kundennamen — die Oberfläche zeigt ihn, also muss man danach
        // suchen können. Er steht in einer anderen Tabelle, deshalb gehört die
        // Suche ins Backend und nicht in die Liste im Speicher.
        let treffer = list(&pool, None, None, Some("bäckerei".into())).await.unwrap();
        assert_eq!(treffer.len(), 1, "erwartet nur die Rechnung an die Bäckerei");
        assert_eq!(treffer[0].id, b.id);

        // Groß- und Kleinschreibung darf keine Rolle spielen.
        assert_eq!(list(&pool, None, None, Some("ACME".into())).await.unwrap().len(), 1);
        assert_eq!(list(&pool, None, None, Some("acme".into())).await.unwrap().len(), 1);

        // Nach der Nummer. Entwürfe haben noch keine, deshalb erst stellen.
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: a.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();
        let gestellt = stellen(&pool, a.id.clone()).await.unwrap();
        let nummer = gestellt.nummer.clone().unwrap();
        let treffer = list(&pool, None, None, Some(nummer.clone())).await.unwrap();
        assert_eq!(treffer.len(), 1);
        assert_eq!(treffer[0].nummer.as_deref(), Some(nummer.as_str()));
    }

    #[tokio::test]
    async fn list_sucht_im_festgeschriebenen_kundennamen() {
        // Nach dem Stellen zählt der eingefrorene Name, nicht der aktuelle.
        // Wer die Rechnung sucht, hat den Namen vor Augen, der auf ihr steht.
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;

        // Ein zweiter Beleg für einen anderen Kunden, sonst bestünde der Test
        // auch ohne jede Filterung.
        let anderer = kunde_create(&pool, KundeNeu {
            typ: "firma".into(), name: "Zweiter Kunde".into(), zahlungsziel_tage: 14,
            notizen: "".into(), ust_idnr: "".into(), email: "".into(),
            leitweg_id: "".into(), kaeuferreferenz: "".into(),
        }).await.unwrap().id;
        rechnungsadresse_anlegen(&pool, &anderer).await;
        create(&pool, beleg_neu("rechnung", &anderer)).await.unwrap();

        let beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();
        stellen(&pool, beleg.id.clone()).await.unwrap();

        let mut kunde = crate::commands::kunden::get(&pool, kunde_id.clone()).await.unwrap().kunde;
        kunde.name = "Neuer Name AG".into();
        crate::commands::kunden::update(&pool, kunde).await.unwrap();

        assert_eq!(list(&pool, None, None, Some("ACME".into())).await.unwrap().len(), 1,
                   "der festgeschriebene Name muss weiter auffindbar sein");
    }

    #[tokio::test]
    async fn list_ohne_suche_liefert_alles() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        assert_eq!(list(&pool, None, None, None).await.unwrap().len(), 2);
        assert_eq!(list(&pool, None, None, Some("".into())).await.unwrap().len(), 2);
    }

    #[tokio::test]
    async fn list_filtert_nach_typ_und_status() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        let angebote = list(&pool, Some("angebot".into()), None, None).await.unwrap();
        assert_eq!(angebote.len(), 1);
        assert_eq!(angebote[0].typ, "angebot");
        let entwuerfe = list(&pool, None, Some("entwurf".into()), None).await.unwrap();
        assert_eq!(entwuerfe.len(), 2);
    }

    #[tokio::test]
    async fn update_aendert_entwurf() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        let aktualisiert = update(&pool, BelegUpdate {
            id: beleg.id.clone(), kunde_id: kunde_id.clone(), datum: "2026-07-11".into(),
            leistungsdatum: "2026-07-11".into(), leistungsdatum_bis: None, gueltig_bis: None,
            zahlungsziel_tage: 30,
            kopftext: "Hallo".into(), fusstext: "".into(),
            adresse_id: None, ansprechpartner_id: None,
        }).await.unwrap();
        assert_eq!(aktualisiert.datum, "2026-07-11");
        assert_eq!(aktualisiert.zahlungsziel_tage, 30);
    }

    #[tokio::test]
    async fn update_lehnt_nicht_entwurf_ab() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        sqlx::query("UPDATE beleg SET status = 'festgeschrieben' WHERE id = ?")
            .bind(&beleg.id).execute(&pool).await.unwrap();
        let err = update(&pool, BelegUpdate {
            id: beleg.id, kunde_id, datum: "2026-07-11".into(), leistungsdatum: "2026-07-11".into(), leistungsdatum_bis: None,
            gueltig_bis: None,
            zahlungsziel_tage: 14, kopftext: "".into(), fusstext: "".into(),
            adresse_id: None, ansprechpartner_id: None,
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
        sqlx::query("UPDATE beleg SET status = 'festgeschrieben' WHERE id = ?")
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
            standardpreis_cent, ust_satz_prozent: 19,
        }).await.unwrap().id
    }

    /// Wer jeden Monat eine fast gleiche Rechnung stellt, tippte sie bisher
    /// jedes Mal neu.
    #[tokio::test]
    async fn duplizieren_uebernimmt_kunde_texte_und_positionen() {
        let (_d, pool) = test_pool().await;
        let kunde = kunde_anlegen(&pool).await;
        let artikel = artikel_anlegen(&pool, 9550).await;
        let original = create(&pool, BelegNeu {
            typ: "rechnung".into(), kunde_id: kunde.clone(), datum: "2026-01-10".into(),
            leistungsdatum: "2026-01-10".into(), leistungsdatum_bis: None, zahlungsziel_tage: 21,
            kopftext: "Wie besprochen:".into(), fusstext: "Danke für den Auftrag.".into(),
        }).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: original.id.clone(), artikel_id: Some(artikel),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 2000, ust_satz_prozent: None,
        }).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: original.id.clone(), artikel_id: None,
            bezeichnung: "Sonderposten".into(), einheit_kuerzel: "Stk".into(),
            einzelpreis_cent: Some(500), menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();
        stellen(&pool, original.id.clone()).await.unwrap();

        let kopie = duplizieren(&pool, original.id.clone()).await.unwrap();

        assert_eq!(kopie.status, "entwurf");
        assert_eq!(kopie.typ, "rechnung");
        assert_eq!(kopie.kunde_id, kunde);
        assert_eq!(kopie.zahlungsziel_tage, 21);
        assert_eq!(kopie.kopftext, "Wie besprochen:");
        assert_eq!(kopie.fusstext, "Danke für den Auftrag.");
        assert_eq!(kopie.summe_cent, 19100 + 500, "2 × 95,50 € + 5,00 €");

        let detail = get(&pool, kopie.id.clone()).await.unwrap();
        assert_eq!(detail.positionen.len(), 2);
        assert_eq!(detail.positionen[0].bezeichnung, "Beratung");
        assert_eq!(detail.positionen[0].einzelpreis_cent, 9550);
        assert_eq!(detail.positionen[1].bezeichnung, "Sonderposten");
        assert_eq!(detail.positionen[1].einzelpreis_cent, 500);
    }

    /// Eine Kopie ist ein neuer Vorgang, kein rückdatiertes Duplikat — Datum
    /// und Leistungsdatum zeigen auf heute, nicht auf das Original.
    #[tokio::test]
    async fn duplizieren_setzt_datum_und_leistungsdatum_auf_heute() {
        let (_d, pool) = test_pool().await;
        let kunde = kunde_anlegen(&pool).await;
        let original = create(&pool, beleg_neu("rechnung", &kunde)).await.unwrap();
        assert_eq!(original.datum, "2026-07-10");

        let kopie = duplizieren(&pool, original.id).await.unwrap();
        let heute = heute();
        assert_eq!(kopie.datum, heute);
        assert_eq!(kopie.leistungsdatum, kopie.datum);
    }

    /// Eine Gültigkeit bekommt die Kopie frisch aus der Einstellung, wie jeder
    /// neu angelegte Beleg — nicht die des Originals, das könnte längst
    /// verstrichen sein.
    #[tokio::test]
    async fn duplizieren_gibt_einem_angebot_eine_frische_gueltigkeit() {
        let (_d, pool) = test_pool().await;
        let kunde = kunde_anlegen(&pool).await;
        // Ein altes Angebot, dessen eigene Gültigkeit längst verstrichen ist —
        // gültig gegenüber seinem eigenen (ebenfalls alten) Belegdatum, aber
        // in der Vergangenheit verglichen mit heute.
        let mut alt = beleg_neu("angebot", &kunde);
        alt.datum = "2020-01-01".into();
        alt.leistungsdatum = "2020-01-01".into();
        let original = create(&pool, alt).await.unwrap();
        let mut felder = beleg_update_aus(&original);
        felder.gueltig_bis = Some("2020-01-31".into());
        update(&pool, felder).await.unwrap();

        let kopie = duplizieren(&pool, original.id).await.unwrap();
        let heute = heute();
        assert!(
            kopie.gueltig_bis.as_deref().is_some_and(|g| g > heute.as_str()),
            "Kopie sollte eine zukünftige Gültigkeit haben, war: {:?}",
            kopie.gueltig_bis,
        );
    }

    /// Gerade ein festgeschriebener Beleg lässt sich sonst nicht mehr als
    /// Vorlage nutzen, weil er selbst unveränderbar ist.
    #[tokio::test]
    async fn ein_festgeschriebener_beleg_laesst_sich_duplizieren() {
        let (_d, pool) = test_pool().await;
        let kunde = kunde_anlegen(&pool).await;
        let original = create(&pool, beleg_neu("rechnung", &kunde)).await.unwrap();
        let artikel = artikel_anlegen(&pool, 1000).await;
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: original.id.clone(), artikel_id: Some(artikel),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();
        let gestellt = stellen(&pool, original.id).await.unwrap();

        let kopie = duplizieren(&pool, gestellt.id.clone()).await.unwrap();
        assert_eq!(kopie.status, "entwurf");
        assert_ne!(kopie.id, gestellt.id);
    }

    /// Ein Stornobeleg ist eine Gutschrift mit negativen Positionen — als
    /// Kopiervorlage taugt er nicht, wohl aber die stornierte Rechnung selbst.
    /// Vorher scheiterte das Duplizieren mitten in der Positionsschleife an
    /// der Preis-Validierung und hinterließ einen leeren Entwurf.
    #[tokio::test]
    async fn ein_stornobeleg_laesst_sich_nicht_duplizieren_das_original_schon() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();
        let gestellt = stellen(&pool, beleg.id).await.unwrap();
        let storno = storniere_rechnung(&pool, gestellt.id.clone()).await.unwrap();

        let err = duplizieren(&pool, storno.id.clone()).await.unwrap_err();
        match err {
            AppError::Validation { feld, .. } => assert_eq!(feld, "storno_von_id"),
            anderer => panic!("unerwarteter Fehler: {anderer:?}"),
        }
        // Kein verwaister Entwurf entstanden: Es gibt genau Original und Storno.
        let anzahl: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM beleg WHERE deleted_at IS NULL")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(anzahl.0, 2);

        // Die stornierte Rechnung selbst bleibt als Vorlage nutzbar.
        let kopie = duplizieren(&pool, gestellt.id).await.unwrap();
        assert_eq!(kopie.status, "entwurf");
        assert_eq!(kopie.summe_cent, 5000);
    }

    /// Das Löschen eines Kunden ist nur bei offenen Entwürfen gesperrt — ein
    /// Kunde mit ausschließlich gestellten Belegen ist löschbar. Ein Duplikat
    /// eines solchen Belegs wäre ein Entwurf mit gelöschtem Kunden: nicht
    /// stellbar und im Kunden-Dropdown unsichtbar. Besser eine klare Meldung.
    #[tokio::test]
    async fn ein_beleg_eines_geloeschten_kunden_laesst_sich_nicht_duplizieren() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();
        let gestellt = stellen(&pool, beleg.id).await.unwrap();
        crate::commands::kunden::delete(&pool, kunde_id, false).await.unwrap();

        let fehler = duplizieren(&pool, gestellt.id).await.unwrap_err();
        match fehler {
            AppError::Validation { feld, .. } => assert_eq!(feld, "kunde_id"),
            anderer => panic!("unerwarteter Fehler: {anderer:?}"),
        }
    }

    /// Ein leerer String heißt „nicht gesetzt" und muss als NULL landen.
    ///
    /// Die Übersicht wertet Angebote per String-Vergleich (`gueltig_bis >=
    /// heute`) als offen — ein gespeichertes "" wäre immer „abgelaufen",
    /// obwohl der Nutzer „unbefristet" meinte.
    #[tokio::test]
    async fn update_normalisiert_leere_datumsfelder_zu_null() {
        let (_dir, pool) = test_pool().await;
        let kunde = kunde_anlegen(&pool).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde)).await.unwrap();
        let mut felder = beleg_update_aus(&beleg);
        felder.gueltig_bis = Some("".into());
        felder.leistungsdatum_bis = Some("  ".into());

        let gespeichert = update(&pool, felder).await.unwrap();
        assert_eq!(gespeichert.gueltig_bis, None);
        assert_eq!(gespeichert.leistungsdatum_bis, None);
    }

    /// Die monatliche Rechnung an den Kunden mit abweichender Rechnungsadresse:
    /// Ohne Übernahme fiele die Kopie still auf die Standardadresse zurück und
    /// würde so festgeschrieben.
    #[tokio::test]
    async fn duplizieren_uebernimmt_adresse_und_ansprechpartner() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let adresse_id = zweite_adresse_anlegen(&pool, &kunde_id).await;
        let ansprechpartner_id = crate::commands::kunden::ansprechpartner_speichern(
            &pool,
            crate::commands::kunden::Ansprechpartner {
                id: "".into(), kunde_id: kunde_id.clone(), name: "Erika Beispiel".into(),
                rolle: "".into(), email: "".into(), telefon: "".into(), ist_standard: false,
            },
        ).await.unwrap().id;
        let original = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        let mut felder = beleg_update_aus(&original);
        felder.adresse_id = Some(adresse_id.clone());
        felder.ansprechpartner_id = Some(ansprechpartner_id.clone());
        update(&pool, felder).await.unwrap();

        let kopie = duplizieren(&pool, original.id).await.unwrap();
        assert_eq!(kopie.adresse_id.as_deref(), Some(adresse_id.as_str()));
        assert_eq!(kopie.ansprechpartner_id.as_deref(), Some(ansprechpartner_id.as_str()));
    }

    #[tokio::test]
    async fn position_mit_artikel_ermittelt_preis_automatisch() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 9500).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        let pos = position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 2000, ust_satz_prozent: None,
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
            einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
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
            einzelpreis_cent: Some(12000), menge: 1000, ust_satz_prozent: None,
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
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
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
        sqlx::query("UPDATE beleg SET status = 'festgeschrieben' WHERE id = ?")
            .bind(&beleg.id).execute(&pool).await.unwrap();
        let err = position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id, artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    /// Eine Position lässt sich nur über ihren eigenen Beleg ändern.
    ///
    /// Ohne die beleg_id-Bedingung im UPDATE ließe sich mit der Positions-Id
    /// von Beleg A und der Beleg-Id von Entwurf B die Position von A ändern —
    /// A bekäme eine geänderte Position bei unveränderter Summe. Das Frontend
    /// lieferte genau diese Konstellation, wenn nach „Als Kopie anlegen" noch
    /// eine Position des Originals im Bearbeiten-Modus stand.
    #[tokio::test]
    async fn position_eines_anderen_belegs_laesst_sich_nicht_aendern() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let beleg_a = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        let beleg_b = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        let pos_von_a = position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg_a.id.clone(), artikel_id: None,
            bezeichnung: "Beratung".into(), einheit_kuerzel: "Std".into(),
            einzelpreis_cent: Some(9500), menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();

        let err = position_speichern(&pool, BelegpositionNeu {
            id: pos_von_a.id.clone(), beleg_id: beleg_b.id.clone(), artikel_id: None,
            bezeichnung: "Manipuliert".into(), einheit_kuerzel: "Std".into(),
            einzelpreis_cent: Some(1), menge: 1000, ust_satz_prozent: None,
        }).await.unwrap_err();
        assert!(matches!(err, AppError::NichtGefunden));

        // Beleg A ist unangetastet: Position und Summe unverändert.
        let detail_a = get(&pool, beleg_a.id).await.unwrap();
        assert_eq!(detail_a.positionen[0].bezeichnung, "Beratung");
        assert_eq!(detail_a.beleg.summe_cent, 9500);
    }

    #[tokio::test]
    async fn position_loeschen_an_gestelltem_beleg_wird_abgelehnt() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let beleg = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        let pos = position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();
        sqlx::query("UPDATE beleg SET status = 'festgeschrieben' WHERE id = ?")
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
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();
        let gestellt = stellen(&pool, beleg.id).await.unwrap();
        assert_eq!(gestellt.status, "festgeschrieben");
        let jahr = chrono::Utc::now().format("%Y").to_string();
        assert_eq!(gestellt.nummer, Some(format!("AN-{jahr}-0001")));
        let err = update(&pool, BelegUpdate {
            id: gestellt.id.clone(), kunde_id, datum: gestellt.datum.clone(),
            leistungsdatum: gestellt.leistungsdatum.clone(), leistungsdatum_bis: None, gueltig_bis: None,
            zahlungsziel_tage: 14,
            kopftext: "".into(), fusstext: "".into(),
            adresse_id: None, ansprechpartner_id: None,
        }).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }), "gestellter Beleg darf nicht mehr editierbar sein");
    }

    #[tokio::test]
    async fn stellen_friert_erweiterten_kundensnapshot_ein() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = crate::commands::kunden::create(&pool, crate::commands::kunden::KundeNeu {
            typ: "firma".into(), name: "ACME GmbH".into(), zahlungsziel_tage: 14,
            notizen: "".into(), ust_idnr: "".into(), email: "acme@example.com".into(),
            leitweg_id: "991-12345-67".into(), kaeuferreferenz: "PO-42".into(),
        }).await.unwrap().id;
        rechnungsadresse_anlegen(&pool, &kunde_id).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();
        let gestellt = stellen(&pool, beleg.id).await.unwrap();

        let snapshot_roh: (String,) = sqlx::query_as("SELECT kunde_snapshot FROM beleg WHERE id = ?")
            .bind(&gestellt.id).fetch_one(&pool).await.unwrap();
        let snapshot: serde_json::Value = serde_json::from_str(&snapshot_roh.0).unwrap();
        assert_eq!(snapshot["kunde"]["email"], "acme@example.com");
        assert_eq!(snapshot["kunde"]["leitweg_id"], "991-12345-67");
        assert_eq!(snapshot["kunde"]["kaeuferreferenz"], "PO-42");
        assert_eq!(snapshot["firma"]["kleinunternehmer"], true);
    }

    #[tokio::test]
    async fn altbeleg_ohne_snapshot_flag_bleibt_nach_moduswechsel_kleinunternehmer() {
        // Belege aus der Zeit, bevor das Kleinunternehmer-Flag in den Snapshot
        // eingefroren wurde: Fällt get() dort auf die Live-Einstellung zurück,
        // bekäme jeder solche Altbeleg nach dem Wechsel zur Regelbesteuerung
        // rückwirkend Steuerzeilen — der festgeschriebene Beleg wäre nicht
        // mehr reproduzierbar (GoBD).
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 9500).await;
        let beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();
        let gestellt = stellen(&pool, beleg.id).await.unwrap();

        // Alten Snapshot-Stand nachbilden: firma-Objekt ohne das Flag.
        let mut snapshot: serde_json::Value = serde_json::from_str(&gestellt.kunde_snapshot).unwrap();
        snapshot["firma"].as_object_mut().unwrap().remove("kleinunternehmer");
        sqlx::query("UPDATE beleg SET kunde_snapshot = ? WHERE id = ?")
            .bind(snapshot.to_string()).bind(&gestellt.id)
            .execute(&pool).await.unwrap();
        // Moduswechsel: Die Firma ist ab jetzt regelbesteuert.
        sqlx::query("UPDATE firma SET kleinunternehmer = 0").execute(&pool).await.unwrap();

        let detail = get(&pool, gestellt.id).await.unwrap();
        assert!(detail.steuerzeilen.is_empty(), "Altbeleg wurde rückwirkend regelbesteuert");
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
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
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
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();
        let gestellt = stellen(&pool, beleg.id).await.unwrap();
        assert_eq!(gestellt.status, "gestellt");
    }

    #[tokio::test]
    async fn angebot_status_setzen_erlaubt_nur_nach_festschreiben() {
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
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
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
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
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
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 2000, ust_satz_prozent: None,
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
    async fn ueberfuehrung_lehnt_konkurrierende_doppelte_konvertierung_ab() {
        // Regression: zwei parallele angebot_ueberfuehren()-Aufrufe für dasselbe
        // Angebot dürfen nicht beide eine Rechnung erzeugen. Unter max_connections(1)
        // serialisiert der Pool die beiden Transaktionskörper vollständig (der zweite
        // Aufruf wartet beim pool.begin() bzw. beim ersten Zugriff auf die Connection,
        // bis der erste committed oder zurückrollt), sodass der Race-Guard-Read der
        // zweiten Transaktion garantiert die bereits committete Rechnung der ersten sieht.
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let angebot = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: angebot.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();
        let gestellt = stellen(&pool, angebot.id).await.unwrap();

        let pool_a = pool.clone();
        let pool_b = pool.clone();
        let id_a = gestellt.id.clone();
        let id_b = gestellt.id.clone();
        let task_a = tokio::spawn(async move { angebot_ueberfuehren(&pool_a, id_a).await });
        let task_b = tokio::spawn(async move { angebot_ueberfuehren(&pool_b, id_b).await });
        let (ergebnis_a, ergebnis_b) = tokio::join!(task_a, task_b);
        let ergebnis_a = ergebnis_a.unwrap();
        let ergebnis_b = ergebnis_b.unwrap();

        let erfolge = [&ergebnis_a, &ergebnis_b].iter().filter(|r| r.is_ok()).count();
        let fehler = [&ergebnis_a, &ergebnis_b].iter().filter(|r| r.is_err()).count();
        assert_eq!(erfolge, 1, "genau einer der beiden konkurrierenden Aufrufe darf gewinnen");
        assert_eq!(fehler, 1, "der Verlierer muss einen Fehler statt einer doppelten Rechnung erhalten");
        let verlierer = if ergebnis_a.is_err() { ergebnis_a } else { ergebnis_b };
        assert!(matches!(verlierer, Err(AppError::Validation { .. })));

        let anzahl_rechnungen: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM beleg WHERE ursprungsangebot_id = ? AND deleted_at IS NULL")
            .bind(&gestellt.id).fetch_one(&pool).await.unwrap();
        assert_eq!(anzahl_rechnungen.0, 1, "es darf nur genau eine Rechnung aus dem Angebot entstehen");
    }

    #[tokio::test]
    async fn storno_erzeugt_gegenbeleg_und_markiert_ursprung() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let rechnung = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: rechnung.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
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

    /// Ein gelöschter Entwurf darf keine sichtbaren Positionen zurücklassen.
    #[tokio::test]
    async fn beleg_loeschen_entfernt_auch_die_positionen() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5_000).await;
        let beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();

        delete(&pool, beleg.id.clone()).await.unwrap();

        let uebrig: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM belegposition WHERE beleg_id = ? AND deleted_at IS NULL")
            .bind(&beleg.id).fetch_one(&pool).await.unwrap();
        assert_eq!(uebrig.0, 0, "Positionen blieben als Karteileichen zurück");
    }

    /// Eine vertippte Zahlung muss sich zurücknehmen lassen — sonst bleibt nur
    /// eine gegenläufige Erstattung, die den Zahlungsverlauf verfälscht.
    #[tokio::test]
    async fn zahlung_loeschen_stellt_den_offenen_betrag_wieder_her() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 10_000).await;
        let rechnung = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: rechnung.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();
        let gestellt = stellen(&pool, rechnung.id).await.unwrap();
        let zahlung = erfasse_zahlung(&pool, ZahlungNeu {
            rechnung_id: gestellt.id.clone(), datum: "2026-07-20".into(),
            betrag_cent: 10_000, notiz: "vertippt".into(),
        }).await.unwrap();
        assert_eq!(get(&pool, gestellt.id.clone()).await.unwrap().offener_betrag_cent, 0);

        zahlung_loeschen(&pool, zahlung.id).await.unwrap();

        let detail = get(&pool, gestellt.id).await.unwrap();
        assert_eq!(detail.offener_betrag_cent, 10_000);
        assert!(detail.zahlungen.is_empty(), "gelöschte Zahlung darf nicht mehr erscheinen");
    }

    /// Die Liste muss den Zahlungsstand ohne eine Abfrage je Zeile liefern —
    /// und er muss aus den Zahlungen abgeleitet sein, nicht gespeichert, damit
    /// er nicht mit ihnen auseinanderlaufen kann.
    #[tokio::test]
    async fn liste_leitet_zahlungsstand_und_faelligkeit_ab() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 10_000).await;
        let rechnung = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: rechnung.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();
        let gestellt = stellen(&pool, rechnung.id).await.unwrap();

        let offen = &list(&pool, Some("rechnung".into()), None, None).await.unwrap()[0];
        assert_eq!(offen.zahlungsstand, Some(crate::domain::beleg::Zahlungsstand::Offen));
        // Belegdatum 2026-07-10 plus 14 Tage Zahlungsziel.
        assert_eq!(offen.faellig_am.as_deref(), Some("2026-07-24"));

        erfasse_zahlung(&pool, ZahlungNeu {
            rechnung_id: gestellt.id.clone(), datum: "2026-07-20".into(),
            betrag_cent: 4_000, notiz: "".into(),
        }).await.unwrap();
        let teil = &list(&pool, Some("rechnung".into()), None, None).await.unwrap()[0];
        assert_eq!(teil.zahlungsstand, Some(crate::domain::beleg::Zahlungsstand::Teilbezahlt));
        assert_eq!(teil.bezahlt_cent, 4_000);

        erfasse_zahlung(&pool, ZahlungNeu {
            rechnung_id: gestellt.id, datum: "2026-07-22".into(),
            betrag_cent: 6_000, notiz: "".into(),
        }).await.unwrap();
        let bezahlt = &list(&pool, Some("rechnung".into()), None, None).await.unwrap()[0];
        assert_eq!(bezahlt.zahlungsstand, Some(crate::domain::beleg::Zahlungsstand::Bezahlt));
    }

    /// Ein Entwurf hat weder Zahlungen noch eine Fälligkeit — dort wären die
    /// Felder mit Werten belegt, die nichts bedeuten.
    #[tokio::test]
    async fn entwuerfe_und_angebote_tragen_keinen_zahlungsstand() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();

        for beleg in list(&pool, None, None, None).await.unwrap() {
            assert_eq!(beleg.zahlungsstand, None, "Beleg {} sollte keinen Stand tragen", beleg.typ);
            assert_eq!(beleg.faellig_am, None);
        }
    }

    /// § 14 Abs. 4 Nr. 1 UStG verlangt die vollständige Anschrift des
    /// Leistungsempfängers. Fehlt sie beim Stellen, wird `"adresse": null`
    /// eingefroren — der Beleg ist dann unveränderbar gestellt und trägt
    /// dauerhaft einen leeren Empfängerblock. Das lässt sich nur noch per
    /// Storno heilen, deshalb muss es vorher auffallen.
    #[tokio::test]
    async fn rechnung_stellen_ohne_rechnungsadresse_wird_abgelehnt() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_ohne_adresse_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let rechnung = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: rechnung.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();

        let err = stellen(&pool, rechnung.id.clone()).await.unwrap_err();
        assert!(
            matches!(&err, AppError::Validation { feld, .. } if feld == "adresse"),
            "erwartet wurde ein Validierungsfehler zu adresse, war: {err:?}"
        );

        // Der Beleg muss ein änderbarer Entwurf ohne Nummer geblieben sein.
        let unveraendert = get(&pool, rechnung.id).await.unwrap().beleg;
        assert_eq!(unveraendert.status, "entwurf");
        assert_eq!(unveraendert.nummer, None);
    }

    #[tokio::test]
    async fn rechnung_stellen_mit_rechnungsadresse_gelingt() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let rechnung = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: rechnung.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();

        let gestellt = stellen(&pool, rechnung.id).await.unwrap();
        assert_eq!(gestellt.status, "gestellt");
        assert!(gestellt.kunde_snapshot.contains("Kundenweg 5"));
    }

    /// Angebote unterliegen nicht § 14 UStG. Sie ohne Adresse zu blockieren
    /// wäre Reibung ohne rechtlichen Grund — ein Angebot geht oft an einen
    /// Interessenten, dessen Anschrift noch gar nicht erfasst ist.
    #[tokio::test]
    async fn angebot_stellen_ohne_adresse_bleibt_moeglich() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_ohne_adresse_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let angebot = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: angebot.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();

        let gestellt = stellen(&pool, angebot.id).await.unwrap();
        assert_eq!(gestellt.status, "festgeschrieben");
    }

    /// Der Stornobeleg ist selbst eine gestellte Rechnung und käme sonst durch
    /// die Typ- und Statusprüfung. Ohne Guard entstünde bei jedem Klick ein
    /// weiterer Gegenbeleg samt verbrauchter Rechnungsnummer.
    #[tokio::test]
    async fn storno_eines_stornobelegs_wird_abgelehnt() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let rechnung = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: rechnung.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();
        let gestellt = stellen(&pool, rechnung.id).await.unwrap();
        let storno = storniere_rechnung(&pool, gestellt.id).await.unwrap();

        let err = storniere_rechnung(&pool, storno.id).await.unwrap_err();
        assert!(
            matches!(&err, AppError::Validation { feld, .. } if feld == "storno_von_id"),
            "erwartet wurde ein Validierungsfehler zu storno_von_id, war: {err:?}"
        );
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
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();
        let gestellt = stellen(&pool, rechnung.id).await.unwrap();

        storniere_rechnung(&pool, gestellt.id.clone()).await.unwrap();
        let err = storniere_rechnung(&pool, gestellt.id.clone()).await.unwrap_err();
        assert!(matches!(err, AppError::Validation { .. }));
    }

    #[tokio::test]
    async fn storno_lehnt_konkurrierende_doppel_stornierung_ab() {
        // Regression: zwei parallele storniere_rechnung()-Aufrufe für dieselbe
        // gestellte Rechnung dürfen nicht beide einen Storno-Beleg erzeugen und
        // den Ursprung stornieren. Dank max_connections(1) interleaven die beiden
        // Tasks real an den .await-Punkten, sodass ein echtes Rennen zwischen den
        // beiden lade_beleg/naechste_nummer/INSERT/UPDATE-Sequenzen entsteht.
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let rechnung = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: rechnung.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();
        let gestellt = stellen(&pool, rechnung.id).await.unwrap();

        let pool_a = pool.clone();
        let pool_b = pool.clone();
        let id_a = gestellt.id.clone();
        let id_b = gestellt.id.clone();
        let task_a = tokio::spawn(async move { storniere_rechnung(&pool_a, id_a).await });
        let task_b = tokio::spawn(async move { storniere_rechnung(&pool_b, id_b).await });
        let (ergebnis_a, ergebnis_b) = tokio::join!(task_a, task_b);
        let ergebnis_a = ergebnis_a.unwrap();
        let ergebnis_b = ergebnis_b.unwrap();

        let erfolge = [&ergebnis_a, &ergebnis_b].iter().filter(|r| r.is_ok()).count();
        let fehler = [&ergebnis_a, &ergebnis_b].iter().filter(|r| r.is_err()).count();
        assert_eq!(erfolge, 1, "genau einer der beiden konkurrierenden Aufrufe darf gewinnen");
        assert_eq!(fehler, 1, "der Verlierer muss einen Fehler statt eines doppelten Storno-Belegs erhalten");
        let verlierer = if ergebnis_a.is_err() { ergebnis_a } else { ergebnis_b };
        assert!(matches!(verlierer, Err(AppError::Validation { .. })));

        let anzahl_stornos: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM beleg WHERE storno_von_id = ? AND deleted_at IS NULL")
            .bind(&gestellt.id).fetch_one(&pool).await.unwrap();
        assert_eq!(anzahl_stornos.0, 1, "es darf nur genau ein Storno-Beleg entstehen");

        let ursprung = get(&pool, gestellt.id).await.unwrap().beleg;
        assert_eq!(ursprung.status, "storniert");
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
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
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
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
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
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();
        let bezahlt_gestellt = stellen(&pool, bezahlt_beleg.id).await.unwrap();
        erfasse_zahlung(&pool, ZahlungNeu {
            rechnung_id: bezahlt_gestellt.id.clone(), datum: "2026-07-10".into(), betrag_cent: 10000, notiz: "".into(),
        }).await.unwrap();

        let offen_beleg = create(&pool, beleg_neu("rechnung", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: offen_beleg.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();
        let offen_gestellt = stellen(&pool, offen_beleg.id).await.unwrap();

        let posten = offene_posten(&pool).await.unwrap();
        assert_eq!(posten.len(), 1);
        assert_eq!(posten[0].beleg.id, offen_gestellt.id);
        assert_eq!(posten[0].offener_betrag_cent, 10000);
    }

    #[test]
    fn kunde_snapshot_name_liefert_none_bei_leerem_snapshot() {
        assert_eq!(kunde_snapshot_name(""), None);
    }

    #[test]
    fn kunde_snapshot_name_liefert_none_bei_kaputtem_json() {
        assert_eq!(kunde_snapshot_name("kein json"), None);
    }

    #[test]
    fn kunde_snapshot_name_extrahiert_namen_aus_gueltigem_snapshot() {
        let roh = r#"{"kunde":{"name":"ACME GmbH","kundennummer":"KD-0001"},"adresse":null,"firma":{}}"#;
        assert_eq!(kunde_snapshot_name(roh), Some("ACME GmbH".to_string()));
    }

    #[tokio::test]
    async fn list_liefert_kunde_snapshot_name_erst_nach_dem_stellen() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let entwurf = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: entwurf.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();

        // WICHTIG: stellen() ändert dieselbe Zeile per UPDATE, erzeugt keine neue —
        // entwurf.id und die spätere gestellt.id sind identisch. Deshalb braucht es
        // ZWEI getrennte list()-Aufrufe (vor und nach dem Stellen), nicht einen
        // einzigen Aufruf danach mit zwei "unterschiedlichen" find()-Treffern, die in
        // Wahrheit dieselbe (dann schon gestellte) Zeile wären.
        let vor_stellen = list(&pool, None, None, None).await.unwrap();
        let entwurf_geladen = vor_stellen.iter().find(|b| b.id == entwurf.id).unwrap();
        assert_eq!(entwurf_geladen.kunde_snapshot_name, None);

        let gestellt = stellen(&pool, entwurf.id.clone()).await.unwrap();

        let nach_stellen = list(&pool, None, None, None).await.unwrap();
        let gestellt_geladen = nach_stellen.iter().find(|b| b.id == gestellt.id).unwrap();
        assert_eq!(gestellt_geladen.kunde_snapshot_name, Some("ACME GmbH".to_string()));
    }

    #[tokio::test]
    async fn get_liefert_kunde_snapshot_name() {
        let (_dir, pool) = test_pool().await;
        let kunde_id = kunde_anlegen(&pool).await;
        let artikel_id = artikel_anlegen(&pool, 5000).await;
        let entwurf = create(&pool, beleg_neu("angebot", &kunde_id)).await.unwrap();
        position_speichern(&pool, BelegpositionNeu {
            id: "".into(), beleg_id: entwurf.id.clone(), artikel_id: Some(artikel_id),
            bezeichnung: "".into(), einheit_kuerzel: "".into(), einzelpreis_cent: None, menge: 1000, ust_satz_prozent: None,
        }).await.unwrap();
        let gestellt = stellen(&pool, entwurf.id).await.unwrap();

        let geladen = get(&pool, gestellt.id).await.unwrap();
        assert_eq!(geladen.beleg.kunde_snapshot_name, Some("ACME GmbH".to_string()));
    }
}
