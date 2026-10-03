//! The Rust protocol types are hand-written mirrors of shared/schemas/agent.schema.json.
//! This test serializes a sample of each and validates it with the generated Python validators,
//! so a drift between the two fails the build. Needs python3 on PATH.

use std::io::Write;
use std::process::{Command, Stdio};

use nkata_agent::protocol::*;
use serde_json::{json, Value};

fn samples() -> Vec<(&'static str, Value)> {
    let id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    let at = iso_from_unix_ms(1_790_856_000_123);
    let user = UserRef {
        id: id.into(),
        name: "Ada".into(),
        avatar_url: None,
    };
    let lock = LockInfo {
        holder: user.clone(),
        granted_at: at.clone(),
        heartbeat_at: at.clone(),
        expires_at: at.clone(),
        stale: false,
    };
    let manifest = ObjectManifest {
        v: 1,
        objects: vec![ManifestObject {
            name: "Face".into(),
            triangles: 12,
            materials: vec!["M".into()],
            bounds_min: [0.0, 0.0, 0.0],
            bounds_max: [1.0, 1.0, 1.0],
            hash: "h".into(),
        }],
        armature: None,
        mirror_target: Some("/Game/X".into()),
    };
    let summary = PartSummary {
        id: id.into(),
        asset_id: id.into(),
        asset_name: "Ojukwu".into(),
        name: "face".into(),
        state: PartState::Draft,
        owner: Some(user.clone()),
        lock: Some(lock.clone()),
        gate: Gate { after: vec![] },
        mapping: PartMapping::BlendCollection {
            file: "Ojukwu/face.blend".into(),
            collection: "face".into(),
        },
    };
    let state = MirrorState {
        part_id: id.into(),
        status: MirrorStatus::Synced,
        version_id: Some(id.into()),
        at: Some(at.clone()),
        mirror_ms: Some(10),
        message: String::new(),
        failures: 0,
        halted: false,
    };
    vec![
        (
            "MeResponse",
            json!(MeResponse {
                v: 1,
                user: user.clone(),
                project: ProjectRef {
                    id: id.into(),
                    name: "P".into(),
                    folder_name: "p".into()
                },
                package_version: "0.1.0".into(),
                online: true,
                spool_dir: "/x".into(),
                mode: AgentMode::Stream
            }),
        ),
        (
            "PartsResponse",
            json!(PartsResponse {
                v: 1,
                parts: vec![summary]
            }),
        ),
        (
            "PartOpenResponse",
            json!(PartOpenResponse {
                v: 1,
                granted: true,
                lock: lock.clone()
            }),
        ),
        (
            "PartCloseResponse",
            json!(PartCloseResponse {
                v: 1,
                released: true
            }),
        ),
        (
            "PartSavedRequest",
            json!(PartSavedRequest {
                v: 1,
                changed: true,
                spool_path: Some("/s.glb".into()),
                manifest: Some(manifest),
                source_file: "f.blend".into()
            }),
        ),
        (
            "PartSavedResponse",
            json!(PartSavedResponse {
                v: 1,
                version_id: id.into(),
                mirror: MirrorStatus::Pending
            }),
        ),
        (
            "MirrorStateResponse",
            json!(MirrorStateResponse {
                v: 1,
                mirror: state
            }),
        ),
        (
            "MirrorRetryResponse",
            json!(MirrorRetryResponse {
                v: 1,
                part_id: id.into(),
                queued: true
            }),
        ),
        (
            "ErrorBody",
            json!(ErrorBody {
                v: 1,
                error: ErrorDetail {
                    code: "not_found".into(),
                    message: "no".into()
                }
            }),
        ),
        (
            "AgentEvent",
            json!(AgentEvent::MirrorResult {
                v: 1,
                project_id: id.into(),
                actor_id: id.into(),
                at: at.clone(),
                part_id: id.into(),
                version_id: id.into(),
                status: MirrorStatus::Failed,
                mirror_ms: Some(5),
                message: "x".into()
            }),
        ),
        (
            "AgentEvent",
            json!(AgentEvent::LockGranted {
                v: 1,
                project_id: id.into(),
                actor_id: id.into(),
                at: at.clone(),
                part_id: id.into(),
                lock
            }),
        ),
        (
            "AgentEvent",
            json!(AgentEvent::LockReleased {
                v: 1,
                project_id: id.into(),
                actor_id: id.into(),
                at,
                part_id: id.into(),
                reason: LockReleaseReason::Closed
            }),
        ),
    ]
}

#[test]
fn rust_types_validate_against_the_shared_python_validators() {
    let shared = std::fs::canonicalize(env!("CARGO_MANIFEST_DIR"))
        .unwrap()
        .join("../../shared");
    let items: Vec<Value> = samples()
        .into_iter()
        .map(|(t, v)| json!({"type": t, "value": v}))
        .collect();
    let mut child = Command::new("python3")
        .arg("test/roundtrip.py")
        .current_dir(&shared)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("python3 runs");
    child
        .stdin
        .take()
        .unwrap()
        .write_all(serde_json::to_string(&items).unwrap().as_bytes())
        .unwrap();
    let out = child.wait_with_output().unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    let results: Vec<Value> = serde_json::from_slice(&out.stdout).unwrap();
    for (item, result) in items.iter().zip(results.iter()) {
        assert_eq!(
            result["ok"], true,
            "{} rejected: {}",
            item["type"], result["error"]
        );
        assert_eq!(
            result["value"], item["value"],
            "{} changed in Python",
            item["type"]
        );
    }
}
