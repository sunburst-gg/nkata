//! Agent local API types. These mirror shared/schemas/agent.schema.json field for field.
//! There is no Rust generator yet; tests/protocol_conformance.rs validates every type here
//! against the generated Python validators so drift fails the build. See docs/decisions.md.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UserRef {
    pub id: String,
    pub name: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LockInfo {
    pub holder: UserRef,
    pub granted_at: String,
    pub heartbeat_at: String,
    pub expires_at: String,
    pub stale: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum PartMapping {
    #[serde(rename = "blend_collection")]
    BlendCollection { file: String, collection: String },
    #[serde(rename = "ue_actor")]
    UeActor { level: String, actor: String },
    #[serde(rename = "ue_area")]
    UeArea { level: String, area: String },
    #[serde(rename = "ue_asset")]
    UeAsset { path: String },
    #[serde(rename = "file")]
    File { path: String },
}

/// The template kind. Picks the import script and the panel layout.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TemplateKind {
    Character,
    Prop,
    LevelArea,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CheckSeverity {
    Block,
    Warn,
    /// Shown quietly, never holds Publish (v8 step 21).
    Note,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Gate {
    pub after: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PartState {
    Locked,
    Draft,
    Ready,
    Approved,
}

/// pin: a note at a point. take_a_look: asks the art director to look, no state change.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum CommentKind {
    #[default]
    Pin,
    TakeALook,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MirrorStatus {
    Pending,
    Syncing,
    Synced,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PartSummary {
    pub id: String,
    pub asset_id: String,
    pub asset_name: String,
    /// The file name the engine expects, from the template. Empty on an older server.
    #[serde(default)]
    pub export_name: String,
    pub name: String,
    pub state: PartState,
    pub owner: Option<UserRef>,
    pub lock: Option<LockInfo>,
    pub gate: Gate,
    pub mapping: PartMapping,
    pub kind: TemplateKind,
    pub checks: Vec<CheckSpec>,
    pub reference_files: Vec<String>,
    pub waiting_on: Vec<String>,
    /// Failing checks a lead accepted, with the reason (v8 step 21). Empty on an older server.
    #[serde(default)]
    pub exceptions: Vec<CheckException>,
}

/// A lead accepted a failing check on one part, with a reason. Shared common CheckException.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CheckException {
    pub check_id: String,
    pub reason: String,
    pub by: UserRef,
    pub at: String,
}

/// One check a template runs on a part: the contract id, its severity, and the params.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CheckSpec {
    pub id: String,
    pub severity: CheckSeverity,
    pub params: serde_json::Map<String, serde_json::Value>,
}

/// Triangle budgets per kind and the texture limit (shared common Budgets, v8 Decisions 12).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Budgets {
    pub prop: u64,
    pub vehicle: u64,
    pub character: u64,
    pub environment: u64,
    pub max_texture: Option<u64>,
    /// v8 step 18: meshes above this many triangles import as Nanite. None means 500,000.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub nanite_triangle_threshold: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProjectRef {
    pub id: String,
    pub name: String,
    pub folder_name: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentMode {
    Sync,
    Stream,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MeResponse {
    pub v: u8,
    pub user: UserRef,
    pub project: ProjectRef,
    pub package_version: String,
    pub online: bool,
    pub spool_dir: String,
    pub mode: AgentMode,
    /// True while every mirror waits. Saves still version.
    pub mirror_paused: bool,
    /// False while Unreal is Coming soon: no mirror, no capture, the panel hides the mirror line.
    pub unreal: bool,
    /// The project's budgets, for the add-on's checks. None on an older server.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub budgets: Option<Budgets>,
}

/// POST /assets from Blender: a saved .blend that maps to no asset yet becomes one (v8 step 12).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AssetCreateRequest {
    pub v: u8,
    pub name: String,
    /// The .blend, project relative with forward slashes.
    pub file: String,
    /// "object" or "environment".
    pub kind: String,
    pub group: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AssetCreateResponse {
    pub v: u8,
    pub part: PartSummary,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PartsResponse {
    pub v: u8,
    pub parts: Vec<PartSummary>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PartOpenResponse {
    pub v: u8,
    pub granted: bool,
    pub lock: LockInfo,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PartCloseResponse {
    pub v: u8,
    pub released: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ManifestObject {
    pub name: String,
    pub triangles: u64,
    pub materials: Vec<String>,
    pub bounds_min: [f64; 3],
    pub bounds_max: [f64; 3],
    pub hash: String,
    pub origin: [f64; 3],
    pub scale: [f64; 3],
    /// UV map names on the mesh. The publish card lists them. Absent on older manifests.
    #[serde(default)]
    pub uv_sets: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ManifestTexture {
    pub name: String,
    pub width: u64,
    pub height: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ObjectManifest {
    pub v: u8,
    pub kind: TemplateKind,
    pub objects: Vec<ManifestObject>,
    pub bone_count: Option<u64>,
    pub armature: Option<String>,
    pub mirror_target: Option<String>,
    /// The images the part's materials use. Absent on older manifests.
    #[serde(default)]
    pub textures: Vec<ManifestTexture>,
    /// The scene's unit scale at export. Absent on older manifests.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unit_scale: Option<f64>,
    /// v8: object or environment, as the add-on decided or the artist picked.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asset_kind: Option<AssetKind>,
    /// v8: the four checks as the add-on ran them, with the sentence and the fix.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub checks: Option<Vec<ManifestCheck>>,
    /// v8 step 17: the rig's bone names in order.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bones: Option<Vec<String>>,
    /// v8 step 17: the animations in the export, with their length.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub animations: Option<Vec<ManifestAnimation>>,
    /// v8 step 17: the export read back and set beside the scene.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub export: Option<ExportCheck>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssetKind {
    Object,
    Environment,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CheckKey {
    Textures,
    Scale,
    Uv,
    Tris,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ManifestCheck {
    pub key: CheckKey,
    pub pass: bool,
    pub sentence: String,
    pub fix: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ManifestAnimation {
    pub name: String,
    pub seconds: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportLossKind {
    Texture,
    TextureFile,
    Material,
    Bone,
    Animation,
    Mesh,
    Light,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExportLoss {
    pub kind: ExportLossKind,
    pub names: Vec<String>,
    pub sentence: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExportCheck {
    pub intact: bool,
    pub losses: Vec<ExportLoss>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bones_changed: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PartSavedRequest {
    pub v: u8,
    pub changed: bool,
    pub spool_path: Option<String>,
    pub manifest: Option<ObjectManifest>,
    pub source_file: String,
    /// v8 step 18: an environment's USD export, for the Unreal mirror.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usd_path: Option<String>,
    /// When the editor opened the file, for the version's opened_at. Optional on the wire:
    /// absent when unknown, so the Python side round-trips it unchanged.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opened_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PartSavedResponse {
    pub v: u8,
    pub version_id: String,
    pub mirror: MirrorStatus,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MirrorState {
    pub part_id: String,
    pub status: MirrorStatus,
    pub version_id: Option<String>,
    pub at: Option<String>,
    pub mirror_ms: Option<u64>,
    pub message: String,
    pub failures: u32,
    pub halted: bool,
    /// False: this part's saves version but do not mirror until turned on again.
    pub on_save: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MirrorStateResponse {
    pub v: u8,
    pub mirror: MirrorState,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MirrorRetryResponse {
    pub v: u8,
    pub part_id: String,
    pub queued: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ErrorDetail {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ErrorBody {
    pub v: u8,
    pub error: ErrorDetail,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LockReleaseReason {
    Closed,
    Published,
    Expired,
    Broken,
    HandedOff,
    Approved,
}

/// Events the agent pushes to editors over SSE. The subset of ServerEvent the panels show.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum AgentEvent {
    #[serde(rename = "mirror.result")]
    MirrorResult {
        v: u8,
        project_id: String,
        actor_id: String,
        at: String,
        part_id: String,
        version_id: String,
        status: MirrorStatus,
        mirror_ms: Option<u64>,
        message: String,
    },
    #[serde(rename = "lock.granted")]
    LockGranted {
        v: u8,
        project_id: String,
        actor_id: String,
        at: String,
        part_id: String,
        lock: LockInfo,
    },
    #[serde(rename = "lock.released")]
    LockReleased {
        v: u8,
        project_id: String,
        actor_id: String,
        at: String,
        part_id: String,
        reason: LockReleaseReason,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CheckResult {
    pub check_id: String,
    pub severity: CheckSeverity,
    pub passed: bool,
    pub auto_fixed: bool,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PublishRequest {
    pub v: u8,
    pub check_results: Vec<CheckResult>,
    pub ready: bool,
    /// The publish note: what you did, what they get. One line, required.
    pub note: String,
    /// Details for engineers. Optional.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note_engineering: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PublishResponse {
    pub v: u8,
    pub published: bool,
    pub version_id: String,
    pub state: PartState,
    pub blocked_by: Vec<CheckResult>,
    /// True after Mark Ready when UE5 gave no viewport capture: Blender renders and posts it.
    /// The server never sets it, so it defaults when read from there.
    #[serde(default)]
    pub render_needed: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChecksRequest {
    pub v: u8,
    pub results: Vec<CheckResult>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChecksResponse {
    pub v: u8,
    pub version_id: String,
    pub recorded: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommentPin {
    pub id: String,
    pub part_id: String,
    pub version_id: String,
    pub author: UserRef,
    pub point: [f64; 3],
    pub normal: [f64; 3],
    pub body: String,
    pub kind: CommentKind,
    pub resolved_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommentsResponse {
    pub v: u8,
    pub comments: Vec<CommentPin>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommentCreateRequest {
    pub v: u8,
    pub point: [f64; 3],
    pub normal: [f64; 3],
    pub body: String,
    #[serde(default)]
    pub kind: CommentKind,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MirrorOnSaveRequest {
    pub v: u8,
    pub on_save: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MirrorPauseRequest {
    pub v: u8,
    pub paused: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MirrorPauseResponse {
    pub v: u8,
    pub paused: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RenderRequest {
    pub v: u8,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RenderResponse {
    pub v: u8,
    pub version_id: String,
    pub stored: bool,
}

/// POST /parts/:id/export. An FBX on disk the agent stores as the current version's export.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExportRequest {
    pub v: u8,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExportResponse {
    pub v: u8,
    pub version_id: String,
    pub stored: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommentCreateResponse {
    pub v: u8,
    pub comment: CommentPin,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewDecision {
    Approve,
    SendBack,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReviewRequest {
    pub v: u8,
    pub score: u8,
    pub decision: ReviewDecision,
    pub note: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReviewResponse {
    pub v: u8,
    pub review_id: String,
    pub state: PartState,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PresenceEntry {
    pub user: UserRef,
    pub part_id: Option<String>,
    pub since: String,
    pub last_seen: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PresenceRequest {
    pub v: u8,
    pub part_id: Option<String>,
    /// v8: the open .blend, project relative. Optional; the strip reads the part.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PresenceResponse {
    pub v: u8,
    pub online: Vec<PresenceEntry>,
}

/// ISO 8601 UTC with milliseconds, the wire form for every timestamp.
pub fn iso_now() -> String {
    iso_from_unix_ms(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0),
    )
}

/// Days since 1970-01-01 to a civil date. Howard Hinnant's algorithm:
/// https://howardhinnant.github.io/date_algorithms.html#civil_from_days
pub fn iso_from_unix_ms(ms: i64) -> String {
    let days = ms.div_euclid(86_400_000);
    let rem = ms.rem_euclid(86_400_000);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    let (h, mi, s, milli) = (
        rem / 3_600_000,
        rem / 60_000 % 60,
        rem / 1000 % 60,
        rem % 1000,
    );
    format!("{y:04}-{m:02}-{d:02}T{h:02}:{mi:02}:{s:02}.{milli:03}Z")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso_matches_known_instants() {
        assert_eq!(iso_from_unix_ms(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(
            iso_from_unix_ms(1_790_856_000_123),
            "2026-10-01T12:00:00.123Z"
        );
        assert_eq!(
            iso_from_unix_ms(951_782_400_000),
            "2000-02-29T00:00:00.000Z"
        );
    }

    #[test]
    fn mapping_round_trips_with_a_kind_tag() {
        let m: PartMapping =
            serde_json::from_str(r#"{"kind":"ue_asset","path":"/Game/X"}"#).unwrap();
        assert_eq!(
            m,
            PartMapping::UeAsset {
                path: "/Game/X".into()
            }
        );
        assert_eq!(
            serde_json::to_string(&m).unwrap(),
            r#"{"kind":"ue_asset","path":"/Game/X"}"#
        );
        let area: PartMapping =
            serde_json::from_str(r#"{"kind":"ue_area","level":"Enugu Market","area":"square"}"#)
                .unwrap();
        assert_eq!(
            area,
            PartMapping::UeArea {
                level: "Enugu Market".into(),
                area: "square".into()
            }
        );
    }
}
