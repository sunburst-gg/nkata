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
    pub name: String,
    pub state: PartState,
    pub owner: Option<UserRef>,
    pub lock: Option<LockInfo>,
    pub gate: Gate,
    pub mapping: PartMapping,
    pub kind: TemplateKind,
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
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ObjectManifest {
    pub v: u8,
    pub kind: TemplateKind,
    pub objects: Vec<ManifestObject>,
    pub bone_count: Option<u64>,
    pub armature: Option<String>,
    pub mirror_target: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PartSavedRequest {
    pub v: u8,
    pub changed: bool,
    pub spool_path: Option<String>,
    pub manifest: Option<ObjectManifest>,
    pub source_file: String,
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
