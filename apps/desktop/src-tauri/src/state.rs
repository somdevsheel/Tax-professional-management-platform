use crate::api::BackendClient;

pub struct AppState {
    pub backend: BackendClient,
}

impl AppState {
    pub fn new(base_url: String) -> Self {
        Self {
            backend: BackendClient::new(base_url),
        }
    }
}
