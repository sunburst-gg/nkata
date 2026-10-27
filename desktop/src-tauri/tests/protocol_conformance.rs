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
        kind: TemplateKind::Prop,
        objects: vec![ManifestObject {
            name: "Face".into(),
            triangles: 12,
            materials: vec!["M".into()],
            bounds_min: [0.0, 0.0, 0.0],
            bounds_max: [1.0, 1.0, 1.0],
            hash: "h".into(),
            origin: [0.0, 0.0, 0.0],
            scale: [1.0, 1.0, 1.0],
            uv_sets: vec!["UVMap".into()],
        }],
        bone_count: None,
        armature: None,
        mirror_target: Some("/Game/X".into()),
        textures: vec![],
        unit_scale: Some(1.0),
        asset_kind: Some(AssetKind::Object),
        checks: Some(vec![ManifestCheck {
            key: CheckKey::Tris,
            pass: true,
            sentence: "12 triangles, within budget.".into(),
            fix: "Decimate.".into(),
        }]),
        bones: Some(vec!["root".into()]),
        animations: Some(vec![ManifestAnimation {
            name: "Walk".into(),
            seconds: 1.25,
        }]),
        export: Some(ExportCheck {
            intact: true,
            losses: vec![],
            bones_changed: None,
        }),
    };
    let summary = PartSummary {
        id: id.into(),
        asset_id: id.into(),
        asset_name: "Ojukwu".into(),
        export_name: "SK_Ojukwu_face".into(),
        name: "face".into(),
        state: PartState::Draft,
        owner: Some(user.clone()),
        lock: Some(lock.clone()),
        gate: Gate { after: vec![] },
        mapping: PartMapping::BlendCollection {
            file: "Ojukwu/face.blend".into(),
            collection: "face".into(),
        },
        kind: TemplateKind::Character,
        checks: vec![CheckSpec {
            id: "triangle_budget".into(),
            severity: CheckSeverity::Block,
            params: serde_json::from_str(r#"{"max": 60000}"#).unwrap(),
        }],
        reference_files: vec!["Ojukwu/ref/concept.png".into()],
        waiting_on: vec![],
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
        on_save: true,
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
                mode: AgentMode::Stream,
                mirror_paused: false,
                unreal: false,
                budgets: Some(Budgets {
                    prop: 30_000,
                    vehicle: 60_000,
                    character: 80_000,
                    environment: 2_000_000,
                    max_texture: None
                })
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
                source_file: "f.blend".into(),
                opened_at: None
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

/// The fixture corpus manifests parse as the agent's ObjectManifest, so a save of a fixture
/// through the add-on and a save of a real asset take the same path.
#[test]
fn fixture_manifests_parse() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures");
    let mut seen = 0;
    for path in [
        "character/manifest.json",
        "props/kettle/manifest.json",
        "props/wooden_stool/manifest.json",
        "props/market_stall/manifest.json",
    ] {
        let text = std::fs::read_to_string(root.join(path)).expect("fixture present");
        let m: ObjectManifest = serde_json::from_str(&text).expect("manifest parses");
        assert!(!m.objects.is_empty(), "{path}");
        match m.kind {
            TemplateKind::Character => assert_eq!(m.bone_count, Some(20), "{path}"),
            TemplateKind::Prop => assert_eq!(m.bone_count, None, "{path}"),
            TemplateKind::LevelArea => panic!("no level area manifest: {path}"),
        }
        seen += 1;
    }
    assert_eq!(seen, 4);
}

/// A manifest crosses the agent on every save. A field the agent's types lack is dropped there
/// without a word: the v8 checks and the asset's kind never reached the server, and the export
/// the add-on read back would not have either (v8 step 17). Every field must survive the trip.
#[test]
fn a_full_manifest_crosses_the_agent_unchanged() {
    let full = json!({
        "v": 1, "kind": "character",
        "objects": [{"name": "Body", "triangles": 12, "materials": ["M_Skin"], "bounds_min": [0.0, 0.0, 0.0], "bounds_max": [1.0, 1.0, 1.0], "hash": "h", "origin": [0.0, 0.0, 0.0], "scale": [1.0, 1.0, 1.0], "uv_sets": ["UVMap"]}],
        "bone_count": 2, "armature": "Armature", "mirror_target": null,
        "textures": [{"name": "T_Face_D", "width": 2048, "height": 2048}],
        "unit_scale": 1.0,
        "asset_kind": "object",
        "checks": [{"key": "tris", "pass": true, "sentence": "12 triangles, within budget.", "fix": "Decimate."}],
        "bones": ["root", "hand_L"],
        "animations": [{"name": "Walk", "seconds": 1.25}],
        "export": {"intact": false, "losses": [{"kind": "animation", "names": ["Idle"], "sentence": "Animations not in the export: Idle."}], "bones_changed": ["hand_R"]}
    });
    let m: ObjectManifest = serde_json::from_value(full.clone()).expect("manifest parses");
    assert_eq!(serde_json::to_value(&m).unwrap(), full);
}
