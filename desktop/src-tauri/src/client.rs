//! HTTP client for the server REST API and the chunk store. The server never touches bytes:
//! chunks go to and from the store with the signed URLs it hands out.

use std::time::Duration;

use reqwest::{Client, StatusCode};
use serde::{de::DeserializeOwned, Deserialize, Serialize};

use crate::error::{AgentError, Result};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChunkSpec {
    pub blake3: String,
    pub size: u32,
}

#[derive(Debug, Deserialize)]
pub struct UploadUrl {
    pub blake3: String,
    pub url: String,
}

#[derive(Debug, Deserialize)]
pub struct UploadUrlsResponse {
    pub missing: Vec<UploadUrl>,
}

#[derive(Debug, Deserialize)]
pub struct UploadedResponse {
    pub confirmed: Vec<String>,
    pub missing: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct DownloadUrl {
    pub blake3: String,
    pub size: u32,
    pub url: String,
}

#[derive(Debug, Deserialize)]
pub struct DownloadUrlsResponse {
    pub urls: Vec<DownloadUrl>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FileVersionBody {
    pub id: String,
    pub path: String,
    pub size: u64,
    pub blake3: String,
    pub chunk_hashes: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FileVersion {
    pub id: String,
    pub path: String,
    pub size: u64,
    pub blake3: String,
    pub chunk_hashes: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct FileVersionsPage {
    pub file_versions: Vec<FileVersion>,
    pub next: Option<String>,
    pub more: bool,
}

#[derive(Debug, Deserialize)]
struct ErrorBody {
    error: ErrorDetail,
}

#[derive(Debug, Deserialize)]
struct ErrorDetail {
    code: String,
    message: String,
}

#[derive(Debug, Deserialize)]
pub struct MeResponse {
    pub user: serde_json::Value,
    pub studio_id: String,
}

#[derive(Clone)]
pub struct ServerClient {
    http: Client,
    base: String,
    token: String,
    project_id: String,
}

impl ServerClient {
    pub fn new(base: &str, token: &str, project_id: &str) -> Result<Self> {
        let http = Client::builder()
            .timeout(Duration::from_secs(120))
            .connect_timeout(Duration::from_secs(10))
            .build()?;
        Ok(Self {
            http,
            base: base.trim_end_matches('/').to_string(),
            token: token.to_string(),
            project_id: project_id.to_string(),
        })
    }

    pub fn project_id(&self) -> &str {
        &self.project_id
    }

    async fn decode<T: DeserializeOwned>(res: reqwest::Response) -> Result<T> {
        let status = res.status();
        if status.is_success() {
            return Ok(res.json::<T>().await?);
        }
        let text = res.text().await.unwrap_or_default();
        let (code, message) = match serde_json::from_str::<ErrorBody>(&text) {
            Ok(b) => (b.error.code, b.error.message),
            Err(_) => ("http".to_string(), text),
        };
        Err(AgentError::Server {
            status: status.as_u16(),
            code,
            message,
        })
    }

    async fn post<B: Serialize, T: DeserializeOwned>(&self, path: &str, body: &B) -> Result<T> {
        let res = self
            .http
            .post(format!("{}{}", self.base, path))
            .bearer_auth(&self.token)
            .json(body)
            .send()
            .await?;
        Self::decode(res).await
    }

    async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        let res = self
            .http
            .get(format!("{}{}", self.base, path))
            .bearer_auth(&self.token)
            .send()
            .await?;
        Self::decode(res).await
    }

    pub async fn me(&self) -> Result<MeResponse> {
        self.get("/auth/me").await
    }

    pub async fn upload_urls(&self, chunks: &[ChunkSpec]) -> Result<UploadUrlsResponse> {
        self.post(
            "/files/upload-urls",
            &serde_json::json!({ "project_id": self.project_id, "chunks": chunks }),
        )
        .await
    }

    pub async fn uploaded(&self, chunks: &[ChunkSpec]) -> Result<UploadedResponse> {
        self.post(
            "/files/uploaded",
            &serde_json::json!({ "project_id": self.project_id, "chunks": chunks }),
        )
        .await
    }

    pub async fn download_urls(&self, hashes: &[String]) -> Result<DownloadUrlsResponse> {
        self.post(
            "/files/download-urls",
            &serde_json::json!({ "project_id": self.project_id, "hashes": hashes }),
        )
        .await
    }

    pub async fn post_file_version(&self, body: &FileVersionBody) -> Result<FileVersion> {
        #[derive(Deserialize)]
        struct Wrap {
            file_version: FileVersion,
        }
        let w: Wrap = self
            .post(
                &format!("/projects/{}/file-versions", self.project_id),
                body,
            )
            .await?;
        Ok(w.file_version)
    }

    pub async fn list_file_versions(
        &self,
        since: Option<&str>,
        limit: usize,
    ) -> Result<FileVersionsPage> {
        let mut path = format!("/projects/{}/file-versions?limit={limit}", self.project_id);
        if let Some(s) = since {
            path.push_str(&format!("&since={s}"));
        }
        self.get(&path).await
    }

    /// PUT chunk bytes to a signed URL.
    pub async fn put_chunk(&self, url: &str, bytes: Vec<u8>) -> Result<()> {
        let res = self
            .http
            .put(url)
            .header("content-length", bytes.len())
            .body(bytes)
            .send()
            .await?;
        if !res.status().is_success() {
            return Err(AgentError::Store {
                status: res.status().as_u16(),
                url: url.to_string(),
            });
        }
        Ok(())
    }

    /// GET chunk bytes from a signed URL. Verifies the hash before returning.
    pub async fn get_chunk(&self, url: &str, expected: &str) -> Result<Vec<u8>> {
        let res = self.http.get(url).send().await?;
        if res.status() != StatusCode::OK {
            return Err(AgentError::Store {
                status: res.status().as_u16(),
                url: url.to_string(),
            });
        }
        let bytes = res.bytes().await?.to_vec();
        let actual = crate::chunker::hash_bytes(&bytes);
        if actual != expected {
            return Err(AgentError::HashMismatch {
                path: url.to_string(),
                expected: expected.to_string(),
                actual,
            });
        }
        Ok(bytes)
    }
}

/// Dev-mode sign in: request a magic link and redeem it in one go. Returns the session token.
pub async fn dev_login(base: &str, email: &str) -> Result<String> {
    #[derive(Deserialize)]
    struct Link {
        link: Option<String>,
    }
    #[derive(Deserialize)]
    struct Session {
        token: String,
    }
    let http = Client::builder().timeout(Duration::from_secs(30)).build()?;
    let base = base.trim_end_matches('/');
    let res = http
        .post(format!("{base}/auth/magic-link"))
        .json(&serde_json::json!({ "email": email }))
        .send()
        .await?;
    let link: Link = ServerClient::decode(res).await?;
    let link = link.link.ok_or_else(|| {
        AgentError::Config("server is not in dev mode, no magic link returned".into())
    })?;
    let token = link
        .split("token=")
        .nth(1)
        .ok_or_else(|| AgentError::Config(format!("magic link has no token: {link}")))?;
    let res = http
        .post(format!("{base}/auth/callback"))
        .json(&serde_json::json!({ "token": token }))
        .send()
        .await?;
    let s: Session = ServerClient::decode(res).await?;
    Ok(s.token)
}
