//! Minimal backend client used only for the one call that must never route through the app's
//! JS/React context: redeeming a portal-session's one-time credential token. Everything else
//! (client CRUD, portal accounts, session creation/event reporting) is a normal authenticated
//! REST call the React frontend makes directly with @tax-platform/api-client, exactly like the
//! web app (docs/architecture.md §3 — no business logic duplicated in the desktop shell).

use serde::Deserialize;
use zeroize::{Zeroize, ZeroizeOnDrop};

use crate::error::{AppError, AppResult};

#[derive(Debug, Deserialize, Zeroize, ZeroizeOnDrop)]
pub struct CredentialPlaintext {
    pub username: String,
    pub password: String,
}

#[derive(Deserialize)]
struct ApiErrorBody {
    error: ApiErrorDetail,
}

#[derive(Deserialize)]
struct ApiErrorDetail {
    code: String,
    message: String,
}

#[derive(Deserialize)]
struct ApiSuccess<T> {
    data: T,
}

pub struct BackendClient {
    http: reqwest::Client,
    base_url: String,
}

impl BackendClient {
    pub fn new(base_url: String) -> Self {
        Self {
            http: reqwest::Client::builder()
                .build()
                .expect("failed to construct HTTP client"),
            base_url,
        }
    }

    /// Exchanges a portal-session's single-use token for the transient plaintext credential.
    /// The token authenticates this call on its own (docs/security-design.md §6) — no bearer
    /// JWT is needed or sent here.
    pub async fn redeem_portal_session_credential(
        &self,
        session_id: &str,
        one_time_token: &str,
    ) -> AppResult<CredentialPlaintext> {
        let url = format!("{}/api/v1/portal-sessions/{session_id}/credential", self.base_url);
        let res = self
            .http
            .get(url)
            .header("X-Portal-Session-Token", one_time_token)
            .header("X-Client-Platform", "desktop")
            .send()
            .await?;

        if !res.status().is_success() {
            let body: ApiErrorBody = res
                .json()
                .await
                .unwrap_or(ApiErrorBody {
                    error: ApiErrorDetail {
                        code: "UNKNOWN_ERROR".into(),
                        message: "Failed to redeem portal session credential".into(),
                    },
                });
            return Err(AppError::Api {
                code: body.error.code,
                message: body.error.message,
            });
        }

        let parsed: ApiSuccess<CredentialPlaintext> = res.json().await?;
        Ok(parsed.data)
    }
}
