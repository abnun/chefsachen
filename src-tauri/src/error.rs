use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{meldung}")]
    Validation { feld: String, meldung: String },
    #[error("Datensatz nicht gefunden")]
    NichtGefunden,
    #[error("{0}")]
    Technisch(String),
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        match e {
            sqlx::Error::RowNotFound => AppError::NichtGefunden,
            other => AppError::Technisch(other.to_string()),
        }
    }
}

/// Serialisiert wird ein Fehler genau dann, wenn er die Oberfläche erreicht —
/// der einzige Punkt, den jeder Fehler aus jedem Befehl durchläuft. Deshalb
/// steht die Protokollierung hier und nicht in fünfzig Befehlen einzeln.
///
/// Nur technische Fehler werden als Fehler verbucht. Eine fehlende
/// Pflichtangabe ist kein Programmfehler, sondern der übliche Ablauf beim
/// Ausfüllen eines Formulars; sie landet auf Debug-Ebene und im ausgelieferten
/// Programm damit gar nicht in der Datei.
impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        match self {
            AppError::Technisch(msg) => log::error!("Technischer Fehler: {msg}"),
            AppError::NichtGefunden => log::debug!("Datensatz nicht gefunden"),
            AppError::Validation { feld, .. } => log::debug!("Eingabe abgelehnt, Feld {feld}"),
        }
        let mut m = s.serialize_map(None)?;
        match self {
            AppError::Validation { feld, meldung } => {
                m.serialize_entry("typ", "validation")?;
                m.serialize_entry("feld", feld)?;
                m.serialize_entry("meldung", meldung)?;
            }
            AppError::NichtGefunden => {
                m.serialize_entry("typ", "nicht_gefunden")?;
                m.serialize_entry("meldung", "Datensatz nicht gefunden")?;
            }
            AppError::Technisch(msg) => {
                m.serialize_entry("typ", "technisch")?;
                m.serialize_entry("meldung", msg)?;
            }
        }
        m.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;
