use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("network error: {0}")]
    Network(#[from] reqwest::Error),
    #[error("api error [{code}]: {message}")]
    Api { code: String, message: String },
    #[error("secure storage error: {0}")]
    SecureStorage(String),
    #[error("automation error: {0}")]
    Automation(String),
}

/// Tauri serializes command Err values to the frontend as strings by default unless the error
/// implements Serialize — we implement it explicitly so the React side gets a stable
/// `{ code, message }` shape to match the same error contract as the REST API
/// (docs/api-design.md §10), rather than an opaque Rust Display string.
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let (code, message) = match self {
            AppError::Network(e) => ("NETWORK_ERROR".to_string(), e.to_string()),
            AppError::Api { code, message } => (code.clone(), message.clone()),
            AppError::SecureStorage(m) => ("SECURE_STORAGE_ERROR".to_string(), m.clone()),
            AppError::Automation(m) => ("AUTOMATION_ERROR".to_string(), m.clone()),
        };
        #[derive(Serialize)]
        struct ErrorPayload {
            code: String,
            message: String,
        }
        ErrorPayload { code, message }.serialize(serializer)
    }
}

pub type AppResult<T> = Result<T, AppError>;
