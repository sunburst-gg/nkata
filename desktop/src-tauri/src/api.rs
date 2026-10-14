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
    iso_now, AgentEvent, AgentMode, ChecksRequest, ChecksResponse, CommentCreateRequest,
    CommentCreateResponse, CommentsResponse, ErrorBody, ErrorDetail, ExportRequest, ExportResponse,
    LockReleaseReason, MeResponse, MirrorOnSaveRequest, MirrorPauseRequest, MirrorPauseResponse,
    MirrorRetryResponse, MirrorStateResponse, MirrorStatus, PartCloseResponse, PartOpenResponse,
    PartSavedRequest, PartSavedResponse, PartsResponse, PresenceRequest, PresenceResponse,
    ProjectRef, PublishRequest, PublishResponse, RenderRequest, RenderResponse, ReviewRequest,
    ReviewResponse, UserRef,
};

pub const DEFAULT_PORT: u16 = 7420;
pub const TOKEN_FILE: &str = "token";
pub const SPOOL_DIR: &str = "spool";

pub struct ApiState {
    pub token: String,
    pub server: ServerClient,
    pub mirror: Arc<MirrorRunner>,
    pub events: broadcast::Sender<serde_json::Value>,
    pub relay: Arc<crate::relay::Relay>,
    pub user: UserRef,
    pub project: ProjectRef,
    pub package_version: String,
    pub spool_dir: PathBuf,
    pub mode: AgentMode,
    /// UNREAL_ENABLED on the server. Off: no mirror job, no capture, no area export.
    pub unreal: bool,
}

type Shared = Arc<ApiState>;

/// Token file path for a project folder.
pub fn token_path(folder: &Path) -> PathBuf {
    folder.join(AGENT_DIR).join(TOKEN_FILE)
}

pub fn spool_path(folder: &Path) -> PathBuf {
    folder.join(AGENT_DIR).join(SPOOL_DIR)
}

/// Where the editors look for the running agent when no file is open: `~/.nkata/agent.json`.
/// The Blender panel reads it to list parts to start (blender-addon/nkata/mapping.py).
pub fn pointer_path() -> Option<PathBuf> {
    crate::tools::home_dir().map(|h| h.join(".nkata").join("agent.json"))
}

/// Writes the pointer. A failure is logged, never fatal: the editors still work from an open file.
fn write_pointer(folder: &Path, port: u16, token_file: &Path, project_id: &str) {
    let Some(path) = pointer_path() else {
        return;
    };
    let body = serde_json::json!({
        "v": 1,
        "folder": folder,
        "port": port,
        "token_file": token_file,
        "project_id": project_id,
    });
    let written = path
        .parent()
        .map(std::fs::create_dir_all)
        .unwrap_or(Ok(()))
        .and_then(|_| std::fs::write(&path, format!("{body}\n")));
    if let Err(e) = written {
        tracing::warn!(path = %path.display(), error = %e, "agent pointer not written");
    }
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

/// Agent-originated events join the same stream the relay feeds.
fn emit(state: &ApiState, event: &AgentEvent) {
    if let Ok(v) = serde_json::to_value(event) {
        let _ = state.events.send(v);
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
        .route("/parts/{id}/mirror/on-save", post(mirror_on_save))
        .route("/mirror/pause", post(mirror_pause))
        .route("/parts/{id}/render", post(render))
        .route("/parts/{id}/export", post(export_file))
        .route("/parts/{id}/publish", post(publish))
        .route("/parts/{id}/checks", post(checks))
        .route("/parts/{id}/comments", get(comments).post(create_comment))
        .route("/parts/{id}/review", post(review))
        .route("/presence", post(presence))
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
        mirror_paused: s.mirror.is_paused(),
        unreal: s.unreal,
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
    if !out.granted {
        // Someone else has it: ask them. Their panel shows the name and a one-click release.
        if let Err(e) = s.server.request_lock(&id).await {
            tracing::warn!(part_id = id, error = %e, "lock request not sent");
        }
    }
    if out.granted {
        emit(
            &s,
            &AgentEvent::LockGranted {
                v: 1,
                project_id: s.project.id.clone(),
                actor_id: s.user.id.clone(),
                at: iso_now(),
                part_id: id.clone(),
                lock: out.lock.clone(),
            },
        );
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
        emit(
            &s,
            &AgentEvent::LockReleased {
                v: 1,
                project_id: s.project.id.clone(),
                actor_id: s.user.id.clone(),
                at: iso_now(),
                part_id: id.clone(),
                reason: LockReleaseReason::Closed,
            },
        );
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
    // A level area has no export: its actor files sync like any other file. With Unreal off
    // nothing mirrors: the save still versions and the GLB still reaches the app.
    let mirrors = body.changed && s.unreal && crate::mirror::script_for(part.kind).is_some();
    let mirror = if mirrors {
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
                opened_at: body.opened_at.as_deref(),
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
    // The export is the version's model in the app, so a viewer sees this save in 3D.
    // Off the save path: the editor gets its answer now, the upload runs on its own.
    if let (true, Some(spool)) = (body.changed, body.spool_path.as_deref()) {
        let server = s.server.clone();
        let (pid, vid, path, project_id) = (
            id.clone(),
            version_id.clone(),
            PathBuf::from(spool),
            s.project.id.clone(),
        );
        tokio::spawn(async move {
            match server.store_model(&pid, &vid, &path).await {
                Ok(()) => {
                    tracing::info!(project_id, part_id = pid, version_id = vid, "model stored")
                }
                Err(e) => {
                    tracing::warn!(project_id, part_id = pid, version_id = vid, error = %e, "model not stored")
                }
            }
        });
    }
    if mirrors {
        let (Some(spool), Some(manifest)) = (body.spool_path, body.manifest) else {
            unreachable!("checked above")
        };
        s.mirror
            .enqueue(MirrorJob {
                part_id: id.clone(),
                kind: part.kind,
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

async fn mirror_on_save(
    State(s): State<Shared>,
    headers: HeaderMap,
    UrlPath(id): UrlPath<String>,
    Json(body): Json<MirrorOnSaveRequest>,
) -> Result<Json<MirrorStateResponse>, ApiError> {
    check_token(&s, &headers)?;
    let mirror = s.mirror.set_on_save(&id, body.on_save).await;
    tracing::info!(
        project_id = s.project.id,
        part_id = id,
        on_save = body.on_save,
        "mirror on save"
    );
    Ok(Json(MirrorStateResponse { v: 1, mirror }))
}

async fn mirror_pause(
    State(s): State<Shared>,
    headers: HeaderMap,
    Json(body): Json<MirrorPauseRequest>,
) -> Result<Json<MirrorPauseResponse>, ApiError> {
    check_token(&s, &headers)?;
    s.mirror.set_paused(body.paused).await;
    tracing::info!(
        project_id = s.project.id,
        paused = body.paused,
        "mirror pause"
    );
    Ok(Json(MirrorPauseResponse {
        v: 1,
        paused: body.paused,
    }))
}

/// The FBX the add-on exported on Publish: stored on the current version for the engineer.
async fn export_file(
    State(s): State<Shared>,
    headers: HeaderMap,
    UrlPath(id): UrlPath<String>,
    Json(body): Json<ExportRequest>,
) -> Result<Json<ExportResponse>, ApiError> {
    check_token(&s, &headers)?;
    let version_id = s.server.current_version(&id).await?;
    let path = PathBuf::from(&body.path);
    if !path.is_file() {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "bad_request",
            format!("no file at {}", path.display()),
        ));
    }
    s.server.store_fbx(&id, &version_id, &path).await?;
    tracing::info!(
        project_id = s.project.id,
        part_id = id,
        version_id,
        "fbx stored"
    );
    Ok(Json(ExportResponse {
        v: 1,
        version_id,
        stored: true,
    }))
}

/// Blender's fallback render for the current version, when UE5 gave no capture on Mark Ready.
async fn render(
    State(s): State<Shared>,
    headers: HeaderMap,
    UrlPath(id): UrlPath<String>,
    Json(body): Json<RenderRequest>,
) -> Result<Json<RenderResponse>, ApiError> {
    check_token(&s, &headers)?;
    let version_id = s.server.current_version(&id).await?;
    let path = PathBuf::from(&body.path);
    if !path.is_file() {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "bad_request",
            format!("no file at {}", path.display()),
        ));
    }
    s.server.store_render(&id, &version_id, &path).await?;
    tracing::info!(
        project_id = s.project.id,
        part_id = id,
        version_id,
        source = "blender",
        "render stored"
    );
    Ok(Json(RenderResponse {
        v: 1,
        version_id,
        stored: true,
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

async fn publish(
    State(s): State<Shared>,
    headers: HeaderMap,
    UrlPath(id): UrlPath<String>,
    Json(body): Json<PublishRequest>,
) -> Result<Json<PublishResponse>, ApiError> {
    check_token(&s, &headers)?;
    let version_id = s.server.current_version(&id).await?;
    let mut out = s
        .server
        .publish(
            &id,
            &version_id,
            &body.check_results,
            body.ready,
            &body.note,
            body.note_engineering.as_deref().unwrap_or(""),
        )
        .await?;
    tracing::info!(
        project_id = s.project.id,
        part_id = id,
        version_id,
        published = out.published,
        blocked = out.blocked_by.len(),
        "publish"
    );
    // Mark Ready on a level area: the editor exports the tagged actors as the version's model.
    if out.published && body.ready && s.unreal {
        if let Ok(part) = s.server.part(&id).await {
            if let crate::protocol::PartMapping::UeArea { level, area } = &part.mapping {
                match s
                    .mirror
                    .export_area(&id, &version_id, level, area, &s.spool_dir)
                    .await
                {
                    Some(path) => match s.server.store_model(&id, &version_id, &path).await {
                        Ok(()) => tracing::info!(
                            project_id = s.project.id,
                            part_id = id,
                            version_id,
                            source = "ue5",
                            "model stored"
                        ),
                        Err(e) => {
                            tracing::warn!(project_id = s.project.id, part_id = id, error = %e, "model not stored")
                        }
                    },
                    None => {
                        tracing::info!(project_id = s.project.id, part_id = id, "no area export")
                    }
                }
            }
        }
    }
    // Mark Ready: the engine's viewport becomes the version's render. No capture, or no Unreal:
    // Blender's turn.
    if out.published && body.ready {
        let captured = match if s.unreal {
            s.mirror.capture(&id, &version_id, &s.spool_dir).await
        } else {
            None
        } {
            Some(path) => match s.server.store_render(&id, &version_id, &path).await {
                Ok(()) => {
                    tracing::info!(
                        project_id = s.project.id,
                        part_id = id,
                        version_id,
                        source = "ue5",
                        "render stored"
                    );
                    true
                }
                Err(e) => {
                    tracing::warn!(project_id = s.project.id, part_id = id, error = %e, "render not stored");
                    false
                }
            },
            None => false,
        };
        out.render_needed = !captured;
    }
    Ok(Json(out))
}

async fn checks(
    State(s): State<Shared>,
    headers: HeaderMap,
    UrlPath(id): UrlPath<String>,
    Json(body): Json<ChecksRequest>,
) -> Result<Json<ChecksResponse>, ApiError> {
    check_token(&s, &headers)?;
    let version_id = s.server.current_version(&id).await?;
    let recorded = s
        .server
        .record_checks(&id, &version_id, &body.results)
        .await?;
    Ok(Json(ChecksResponse {
        v: 1,
        version_id,
        recorded,
    }))
}

async fn comments(
    State(s): State<Shared>,
    headers: HeaderMap,
    UrlPath(id): UrlPath<String>,
) -> Result<Json<CommentsResponse>, ApiError> {
    check_token(&s, &headers)?;
    Ok(Json(CommentsResponse {
        v: 1,
        comments: s.server.comments(&id).await?,
    }))
}

async fn create_comment(
    State(s): State<Shared>,
    headers: HeaderMap,
    UrlPath(id): UrlPath<String>,
    Json(body): Json<CommentCreateRequest>,
) -> Result<(StatusCode, Json<CommentCreateResponse>), ApiError> {
    check_token(&s, &headers)?;
    let version_id = s.server.current_version(&id).await?;
    let comment = s.server.create_comment(&id, &version_id, &body).await?;
    Ok((
        StatusCode::CREATED,
        Json(CommentCreateResponse { v: 1, comment }),
    ))
}

async fn review(
    State(s): State<Shared>,
    headers: HeaderMap,
    UrlPath(id): UrlPath<String>,
    Json(body): Json<ReviewRequest>,
) -> Result<(StatusCode, Json<ReviewResponse>), ApiError> {
    check_token(&s, &headers)?;
    let version_id = s.server.current_version(&id).await?;
    let out = s.server.review(&id, &version_id, &body).await?;
    tracing::info!(project_id = s.project.id, part_id = id, decision = ?body.decision, "review");
    Ok((StatusCode::CREATED, Json(out)))
}

async fn presence(
    State(s): State<Shared>,
    headers: HeaderMap,
    Json(body): Json<PresenceRequest>,
) -> Result<Json<PresenceResponse>, ApiError> {
    check_token(&s, &headers)?;
    s.relay.set_presence(body.part_id.clone()).await;
    let online = s.server.presence(body.part_id.as_deref()).await?;
    Ok(Json(PresenceResponse { v: 1, online }))
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
        Ok(ev) => Some(Ok(Event::default().event("nkata").data(ev.to_string()))),
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
    stop: tokio::sync::watch::Receiver<bool>,
) -> Result<std::net::SocketAddr, AgentError> {
    let (tx, _rx) = tokio::sync::oneshot::channel();
    serve_with_addr(server, opts, stop, tx).await
}

/// Like `serve`, and sends the bound address as soon as the port is open, for a caller that
/// starts the API in the background and needs the port before the first request.
pub async fn serve_with_addr(
    server: ServerClient,
    opts: ServeOptions,
    mut stop: tokio::sync::watch::Receiver<bool>,
    ready: tokio::sync::oneshot::Sender<std::net::SocketAddr>,
) -> Result<std::net::SocketAddr, AgentError> {
    let (listener, state) = bind(server, opts).await?;
    let addr = listener
        .local_addr()
        .map_err(|e| AgentError::io("listener", e))?;
    let _ = ready.send(addr);
    // Stream mode has no spool and nothing to mirror. With Unreal off there is no editor to run.
    if state.mode == AgentMode::Sync && state.unreal {
        let mirror = Arc::clone(&state.mirror);
        tokio::spawn(mirror.run());
    }
    tokio::spawn(Arc::clone(&state.relay).run(stop.clone()));
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
    let (events, _) = broadcast::channel::<serde_json::Value>(256);
    let relay = crate::relay::Relay::new(server.clone(), events.clone(), me.user.id.clone());
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
        relay,
        user: me.user,
        project: ProjectRef {
            id: project.id,
            name: project.name,
            folder_name: project.folder_name,
        },
        package_version: crate::PACKAGE_VERSION.to_string(),
        spool_dir,
        mode: opts.mode,
        unreal: me.features.unreal,
    });
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", opts.port))
        .await
        .map_err(|e| AgentError::io(format!("127.0.0.1:{}", opts.port), e))?;
    if state.mode == AgentMode::Sync {
        let port = listener.local_addr().map(|a| a.port()).unwrap_or(opts.port);
        write_pointer(&opts.folder, port, &token_file, &state.project.id);
    }
    tracing::info!(project_id = state.project.id, addr = %listener.local_addr().map(|a| a.to_string()).unwrap_or_default(), token_file = %token_file.display(), "agent api listening");
    Ok((listener, state))
}
