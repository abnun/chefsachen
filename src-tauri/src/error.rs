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

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
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
