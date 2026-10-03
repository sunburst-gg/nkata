//! Agent local API on http://127.0.0.1:7420. Loopback only. Bearer token from a file the editors
//! read: <project>/.nkata-agent/token. Routes and types: shared/schemas/agent.schema.json.
//! axum: https://docs.rs/axum/latest/axum/

use std::path::{Path, PathBuf};
use std::sync::Arc;

use axum::extract::{Path as UrlPath, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;

use crate::client::{ServerClient, VersionCreate};
use crate::error::AgentError;
use crate::ids::new_id;
use crate::ignore::AGENT_DIR;
use crate::mirror::{MirrorJob, MirrorRunner};
use crate::protocol::{
    iso_now, AgentEvent, AgentMode, ErrorBody, ErrorDetail, LockReleaseReason, MeResponse,
    MirrorRetryResponse, MirrorStateResponse, MirrorStatus, PartCloseResponse, PartOpenResponse,
    PartSavedRequest, PartSavedResponse, PartsResponse, ProjectRef, UserRef,
};

pub const DEFAULT_PORT: u16 = 7420;
pub const TOKEN_FILE: &str = "token";
pub const SPOOL_DIR: &str = "spool";

pub struct ApiState {
    pub token: String,
    pub server: ServerClient,
    pub mirror: Arc<MirrorRunner>,
    pub events: broadcast::Sender<AgentEvent>,
    pub user: UserRef,
    pub project: ProjectRef,
    pub package_version: String,
    pub spool_dir: PathBuf,
    pub mode: AgentMode,
}

type Shared = Arc<ApiState>;

/// Token file path for a project folder.
pub fn token_path(folder: &Path) -> PathBuf {
    folder.join(AGENT_DIR).join(TOKEN_FILE)
}

pub fn spool_path(folder: &Path) -> PathBuf {
    folder.join(AGENT_DIR).join(SPOOL_DIR)
}

/// Reads the token or creates a new one. The file is owner-readable only.
pub fn load_or_create_token(path: &Path) -> Result<String, AgentError> {
    if let Ok(t) = std::fs::read_to_string(path) {
        let t = t.trim().to_string();
        if !t.is_empty() {
            return Ok(t);
        }
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| AgentError::io(parent, e))?;
    }
    let token = format!("{}{}", new_id(), new_id()).to_lowercase();
    std::fs::write(path, &token).map_err(|e| AgentError::io(path, e))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| AgentError::io(path, e))?;
    }
    Ok(token)
}

struct ApiError(StatusCode, &'static str, String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.0,
            Json(ErrorBody {
                v: 1,
                error: ErrorDetail {
                    code: self.1.to_string(),
                    message: self.2,
                },
            }),
        )
            .into_response()
    }
}

impl From<AgentError> for ApiError {
    fn from(e: AgentError) -> Self {
        match &e {
            AgentError::Server {
                status,
                code,
                message,
            } => {
                let st = StatusCode::from_u16(*status).unwrap_or(StatusCode::BAD_GATEWAY);
                let code: &'static str = match code.as_str() {
                    "not_found" => "not_found",
                    "forbidden" => "forbidden",
                    "gate_closed" => "gate_closed",
                    "lock_held" => "lock_held",
                    "unauthorized" => "unauthorized",
                    _ => "server",
                };
                ApiError(st, code, message.clone())
            }
            e if e.is_offline() => {
                ApiError(StatusCode::SERVICE_UNAVAILABLE, "offline", e.to_string())
            }
            _ => ApiError(StatusCode::INTERNAL_SERVER_ERROR, "internal", e.to_string()),
        }
    }
}

fn check_token(state: &ApiState, headers: &HeaderMap) -> Result<(), ApiError> {
    let header = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    match header.strip_prefix("Bearer ") {
        Some(t) if t == state.token => Ok(()),
        _ => Err(ApiError(
            StatusCode::UNAUTHORIZED,
            "unauthorized",
            "missing or wrong agent token".into(),
        )),
    }
}

pub fn router(state: Shared) -> Router {
    Router::new()
        .route("/me", get(me))
        .route("/parts", get(parts))
        .route("/parts/{id}/open", post(open_part))
        .route("/parts/{id}/close", post(close_part))
        .route("/parts/{id}/saved", post(saved))
        .route("/parts/{id}/mirror", get(mirror_state))
        .route("/parts/{id}/mirror/retry", post(mirror_retry))
        .route("/events", get(events))
        .with_state(state)
}

async fn me(State(s): State<Shared>, headers: HeaderMap) -> Result<Json<MeResponse>, ApiError> {
    check_token(&s, &headers)?;
    let online = s.server.me().await.is_ok();
    Ok(Json(MeResponse {
        v: 1,
        user: s.user.clone(),
        project: s.project.clone(),
        package_version: s.package_version.clone(),
        online,
        spool_dir: s.spool_dir.display().to_string(),
        mode: s.mode,
    }))
}

#[derive(Deserialize)]
struct PartsQuery {
    file: Option<String>,
}

async fn parts(
    State(s): State<Shared>,
    headers: HeaderMap,
    Query(q): Query<PartsQuery>,
) -> Result<Json<PartsResponse>, ApiError> {
    check_token(&s, &headers)?;
    let parts = s.server.parts(q.file.as_deref()).await?;
    Ok(Json(PartsResponse { v: 1, parts }))
}

async fn open_part(
    State(s): State<Shared>,
    headers: HeaderMap,
    UrlPath(id): UrlPath<String>,
) -> Result<Response, ApiError> {
    check_token(&s, &headers)?;
    let out = s.server.acquire_lock(&id).await?;
    if out.granted {
        let _ = s.events.send(AgentEvent::LockGranted {
            v: 1,
            project_id: s.project.id.clone(),
            actor_id: s.user.id.clone(),
            at: iso_now(),
            part_id: id.clone(),
            lock: out.lock.clone(),
        });
    }
    let status = if out.granted {
        StatusCode::OK
    } else {
        StatusCode::CONFLICT
    };
    Ok((
        status,
        Json(PartOpenResponse {
            v: 1,
            granted: out.granted,
            lock: out.lock,
        }),
    )
        .into_response())
}

async fn close_part(
    State(s): State<Shared>,
    headers: HeaderMap,
    UrlPath(id): UrlPath<String>,
) -> Result<Json<PartCloseResponse>, ApiError> {
    check_token(&s, &headers)?;
    let released = s.server.release_lock(&id).await?;
    if released {
        let _ = s.events.send(AgentEvent::LockReleased {
            v: 1,
            project_id: s.project.id.clone(),
            actor_id: s.user.id.clone(),
            at: iso_now(),
            part_id: id.clone(),
            reason: LockReleaseReason::Closed,
        });
    }
    Ok(Json(PartCloseResponse { v: 1, released }))
}

async fn saved(
    State(s): State<Shared>,
    headers: HeaderMap,
    UrlPath(id): UrlPath<String>,
    Json(body): Json<PartSavedRequest>,
) -> Result<(StatusCode, Json<PartSavedResponse>), ApiError> {
    check_token(&s, &headers)?;
    if s.mode == AgentMode::Stream {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "forbidden",
            "a viewer in stream mode cannot save a part".into(),
        ));
    }
    if body.changed && (body.spool_path.is_none() || body.manifest.is_none()) {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "bad_request",
            "a changed save needs spool_path and manifest".into(),
        ));
    }
    let part = s.server.part(&id).await?;
    let version_id = new_id();
    let mirror = if body.changed {
        MirrorStatus::Pending
    } else {
        MirrorStatus::Skipped
    };
    s.server
        .create_version(
            &id,
            &VersionCreate {
                id: &version_id,
                manifest: body.manifest.as_ref(),
                mirror_status: mirror,
                note: "",
            },
        )
        .await?;
    tracing::info!(
        project_id = s.project.id,
        part_id = id,
        version_id,
        changed = body.changed,
        source_file = body.source_file,
        "saved"
    );
    if body.changed {
        let (Some(spool), Some(manifest)) = (body.spool_path, body.manifest) else {
            unreachable!("checked above")
        };
        s.mirror
            .enqueue(MirrorJob {
                part_id: id.clone(),
                version_id: version_id.clone(),
                spool_path: PathBuf::from(spool),
                manifest,
                mapping: part.mapping,
                asset_name: part.asset_name,
                part_name: part.name,
            })
            .await;
    }
    Ok((
        StatusCode::CREATED,
        Json(PartSavedResponse {
            v: 1,
            version_id,
            mirror,
        }),
    ))
}

async fn mirror_state(
    State(s): State<Shared>,
    headers: HeaderMap,
    UrlPath(id): UrlPath<String>,
) -> Result<Json<MirrorStateResponse>, ApiError> {
    check_token(&s, &headers)?;
    Ok(Json(MirrorStateResponse {
        v: 1,
        mirror: s.mirror.state(&id).await,
    }))
}

async fn mirror_retry(
    State(s): State<Shared>,
    headers: HeaderMap,
    UrlPath(id): UrlPath<String>,
) -> Result<Json<MirrorRetryResponse>, ApiError> {
    check_token(&s, &headers)?;
    let queued = s.mirror.retry(&id).await;
    Ok(Json(MirrorRetryResponse {
        v: 1,
        part_id: id,
        queued,
    }))
}

#[derive(Deserialize)]
struct EventsQuery {
    token: Option<String>,
}

/// SSE. Editors that cannot set headers on an EventSource pass ?token= instead.
async fn events(
    State(s): State<Shared>,
    headers: HeaderMap,
    Query(q): Query<EventsQuery>,
) -> Result<Sse<impl tokio_stream::Stream<Item = Result<Event, std::convert::Infallible>>>, ApiError>
{
    if check_token(&s, &headers).is_err() && q.token.as_deref() != Some(s.token.as_str()) {
        return Err(ApiError(
            StatusCode::UNAUTHORIZED,
            "unauthorized",
            "missing or wrong agent token".into(),
        ));
    }
    let stream = BroadcastStream::new(s.events.subscribe()).filter_map(|item| match item {
        Ok(ev) => serde_json::to_string(&ev)
            .ok()
            .map(|json| Ok(Event::default().event("nkata").data(json))),
        Err(_) => None,
    });
    Ok(Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(std::time::Duration::from_secs(15))
            .text("keep-alive"),
    ))
}

pub struct ServeOptions {
    /// The project folder, or the stream cache root in stream mode.
    pub folder: PathBuf,
    pub port: u16,
    pub ue5_url: String,
    pub scripts_dir: PathBuf,
    pub token_file: Option<PathBuf>,
    pub mode: AgentMode,
}

/// Builds the state, binds the port, and runs the API and the mirror runner until `stop`.
pub async fn serve(
    server: ServerClient,
    opts: ServeOptions,
    mut stop: tokio::sync::watch::Receiver<bool>,
) -> Result<std::net::SocketAddr, AgentError> {
    let (listener, state) = bind(server, opts).await?;
    let addr = listener
        .local_addr()
        .map_err(|e| AgentError::io("listener", e))?;
    // Stream mode has no spool and nothing to mirror.
    if state.mode == AgentMode::Sync {
        let mirror = Arc::clone(&state.mirror);
        tokio::spawn(mirror.run());
    }
    axum::serve(listener, router(state))
        .with_graceful_shutdown(async move {
            let _ = stop.wait_for(|v| *v).await;
        })
        .await
        .map_err(|e| AgentError::io("serve", e))?;
    Ok(addr)
}

/// Binds and builds the state without running. Tests drive the router with the listener.
pub async fn bind(
    server: ServerClient,
    opts: ServeOptions,
) -> Result<(tokio::net::TcpListener, Shared), AgentError> {
    let me = server.me().await?;
    let project = server.project().await?;
    let token_file = opts.token_file.unwrap_or_else(|| token_path(&opts.folder));
    let token = load_or_create_token(&token_file)?;
    let spool_dir = spool_path(&opts.folder);
    std::fs::create_dir_all(&spool_dir).map_err(|e| AgentError::io(&spool_dir, e))?;
    let (events, _) = broadcast::channel::<AgentEvent>(256);
    let ue5 = crate::ue5::Ue5Client::new(&opts.ue5_url)?;
    let mirror = MirrorRunner::new(
        ue5,
        server.clone(),
        events.clone(),
        opts.scripts_dir,
        me.user.id.clone(),
    );
    let state: Shared = Arc::new(ApiState {
        token,
        server,
        mirror,
        events,
        user: me.user,
        project: ProjectRef {
            id: project.id,
            name: project.name,
            folder_name: project.folder_name,
        },
        package_version: crate::PACKAGE_VERSION.to_string(),
        spool_dir,
        mode: opts.mode,
    });
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", opts.port))
        .await
        .map_err(|e| AgentError::io(format!("127.0.0.1:{}", opts.port), e))?;
    tracing::info!(project_id = state.project.id, addr = %listener.local_addr().map(|a| a.to_string()).unwrap_or_default(), token_file = %token_file.display(), "agent api listening");
    Ok((listener, state))
}
