//! HTTP client for the server REST API and the chunk store. The server never touches bytes:
//! chunks go to and from the store with the signed URLs it hands out.

use std::time::Duration;

use reqwest::{Client, StatusCode};
use serde::{de::DeserializeOwned, Deserialize, Serialize};

use crate::error::{AgentError, Result};
use crate::protocol::{LockInfo, MirrorStatus, ObjectManifest, PartSummary, UserRef};

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

#[derive(Debug, Clone, Deserialize)]
pub struct ServerMe {
    pub user: UserRef,
    pub email: String,
    pub studio_id: String,
    pub roles: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ServerProject {
    pub id: String,
    pub name: String,
    pub folder_name: String,
    pub package_version: String,
}

/// Lock call outcome. The server answers 200 when granted and 409 with the holder when held.
#[derive(Debug, Clone, Deserialize)]
pub struct LockOutcome {
    pub granted: bool,
    pub lock: LockInfo,
}

#[derive(Debug, Clone, Deserialize)]
pub struct VersionRow {
    pub id: String,
    pub part_id: String,
    pub mirror_status: String,
    pub mirror_ms: Option<u64>,
    pub published: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct VersionCreate<'a> {
    pub id: &'a str,
    pub manifest: Option<&'a ObjectManifest>,
    pub mirror_status: MirrorStatus,
    pub note: &'a str,
}

#[derive(Debug, Clone, Serialize)]
pub struct MirrorUpdate<'a> {
    pub mirror_status: MirrorStatus,
    pub mirror_ms: Option<u64>,
    pub message: &'a str,
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

    pub async fn me(&self) -> Result<ServerMe> {
        self.get("/auth/me").await
    }

    pub async fn project(&self) -> Result<ServerProject> {
        #[derive(Deserialize)]
        struct Wrap {
            project: ServerProject,
        }
        let w: Wrap = self.get(&format!("/projects/{}", self.project_id)).await?;
        Ok(w.project)
    }

    /// Parts mapped to a project file (blend_collection.file or file.path), or all parts when None.
    pub async fn parts(&self, file: Option<&str>) -> Result<Vec<PartSummary>> {
        #[derive(Deserialize)]
        struct Wrap {
            parts: Vec<PartSummary>,
        }
        let mut path = format!("/parts?project_id={}", self.project_id);
        if let Some(f) = file {
            path.push_str("&file=");
            path.push_str(&urlencode(f));
        }
        let w: Wrap = self.get(&path).await?;
        Ok(w.parts)
    }

    pub async fn part(&self, part_id: &str) -> Result<PartSummary> {
        #[derive(Deserialize)]
        struct Wrap {
            part: PartSummary,
        }
        let w: Wrap = self.get(&format!("/parts/{part_id}")).await?;
        Ok(w.part)
    }

    pub async fn acquire_lock(&self, part_id: &str) -> Result<LockOutcome> {
        let res = self
            .http
            .post(format!("{}/parts/{part_id}/lock", self.base))
            .bearer_auth(&self.token)
            .send()
            .await?;
        if res.status() == StatusCode::CONFLICT {
            // Held by someone else, or the gate is closed. Only the first carries a lock.
            let text = res.text().await?;
            if let Ok(out) = serde_json::from_str::<LockOutcome>(&text) {
                return Ok(out);
            }
            let (code, message) = match serde_json::from_str::<ErrorBody>(&text) {
                Ok(b) => (b.error.code, b.error.message),
                Err(_) => ("conflict".to_string(), text),
            };
            return Err(AgentError::Server {
                status: 409,
                code,
                message,
            });
        }
        Self::decode(res).await
    }

    pub async fn release_lock(&self, part_id: &str) -> Result<bool> {
        #[derive(Deserialize)]
        struct Wrap {
            released: bool,
        }
        let res = self
            .http
            .delete(format!("{}/parts/{part_id}/lock", self.base))
            .bearer_auth(&self.token)
            .send()
            .await?;
        let w: Wrap = Self::decode(res).await?;
        Ok(w.released)
    }

    pub async fn create_version(
        &self,
        part_id: &str,
        body: &VersionCreate<'_>,
    ) -> Result<VersionRow> {
        #[derive(Deserialize)]
        struct Wrap {
            version: VersionRow,
        }
        let w: Wrap = self
            .post(&format!("/parts/{part_id}/versions"), body)
            .await?;
        Ok(w.version)
    }

    pub async fn put_mirror(
        &self,
        part_id: &str,
        version_id: &str,
        body: &MirrorUpdate<'_>,
    ) -> Result<()> {
        let res = self
            .http
            .put(format!(
                "{}/parts/{part_id}/versions/{version_id}/mirror",
                self.base
            ))
            .bearer_auth(&self.token)
            .json(body)
            .send()
            .await?;
        let _: serde_json::Value = Self::decode(res).await?;
        Ok(())
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

fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
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
