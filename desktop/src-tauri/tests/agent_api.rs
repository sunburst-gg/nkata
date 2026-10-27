//! Agent local API and mirror runner against the live test server and a fake Remote Control
//! server. Needs NKATA_TEST_SERVER_URL (make test sets it); skipped otherwise.

use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use axum::routing::put;
use axum::{Json, Router};
use futures_util::StreamExt;
use nkata_agent::api::{bind, router, ServeOptions};
use nkata_agent::client::{dev_login, ServerClient};
use nkata_agent::protocol::AgentMode;
use serde_json::{json, Value};
use tokio::sync::Mutex;

const ARTIST: &str = "artist@sunburst.gg";
const DIRECTOR: &str = "director@sunburst.gg";
const ENV_ARTIST: &str = "env@sunburst.gg";

/// What the fake editor answers next. Each call pops the front; empty means success.
#[derive(Clone)]
struct FakeUe5 {
    script: Arc<Mutex<Vec<Value>>>,
    calls: Arc<AtomicUsize>,
    last_command: Arc<Mutex<String>>,
}

async fn fake_rc_call(
    axum::extract::State(s): axum::extract::State<FakeUe5>,
    Json(body): Json<Value>,
) -> Json<Value> {
    s.calls.fetch_add(1, Ordering::SeqCst);
    let command = body["parameters"]["PythonCommand"]
        .as_str()
        .unwrap_or("")
        .to_string();
    *s.last_command.lock().await = command.clone();
    let next = s.script.lock().await.pop();
    let result = next.unwrap_or_else(|| json!({"ok": true, "message": "", "asset_path": "/Game/Nkata/Ojukwu/face", "first_import": false}));
    Json(json!({
        "ReturnValue": true,
        "CommandResult": "",
        "LogOutput": [
            {"Type": "Info", "Output": "LogPython: importing"},
            {"Type": "Info", "Output": format!("NKATA_RESULT {}", result)}
        ]
    }))
}

async fn start_fake_ue5(fake: FakeUe5) -> String {
    let app = Router::new()
        .route("/remote/object/call", put(fake_rc_call))
        .with_state(fake);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    format!("http://{addr}")
}

struct Harness {
    base: String,
    token: String,
    http: reqwest::Client,
    folder: PathBuf,
    fake: FakeUe5,
    project_id: String,
}

impl Harness {
    async fn get(&self, path: &str) -> (u16, Value) {
        let r = self
            .http
            .get(format!("{}{path}", self.base))
            .bearer_auth(&self.token)
            .send()
            .await
            .unwrap();
        (r.status().as_u16(), r.json().await.unwrap_or(Value::Null))
    }
    async fn post(&self, path: &str, body: Option<Value>) -> (u16, Value) {
        let mut req = self
            .http
            .post(format!("{}{path}", self.base))
            .bearer_auth(&self.token);
        if let Some(b) = body {
            req = req.json(&b);
        }
        let r = req.send().await.unwrap();
        (r.status().as_u16(), r.json().await.unwrap_or(Value::Null))
    }
}

async fn start(server_url: &str, fake: FakeUe5) -> Harness {
    start_as(server_url, fake, ARTIST).await
}

/// The agent signed in as one seed user. Parts are owned per user, so a prop needs the
/// environment artist.
async fn start_as(server_url: &str, fake: FakeUe5, email: &str) -> Harness {
    let token = dev_login(server_url, email).await.unwrap();
    let projects: Value = reqwest::Client::new()
        .get(format!("{server_url}/projects"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let project_id = projects["projects"][0]["id"].as_str().unwrap().to_string();
    let server = ServerClient::new(server_url, &token, &project_id).unwrap();
    let folder = std::env::temp_dir().join(format!("nkata-api-{}", ulid::Ulid::new()));
    std::fs::create_dir_all(&folder).unwrap();
    let scripts_dir = std::fs::canonicalize(env!("CARGO_MANIFEST_DIR"))
        .unwrap()
        .join("../../ue5-plugin/scripts");
    let ue5_url = start_fake_ue5(fake.clone()).await;
    let (listener, state) = bind(
        server,
        ServeOptions {
            folder: folder.clone(),
            port: 0,
            ue5_url,
            scripts_dir,
            token_file: None,
            mode: AgentMode::Sync,
        },
    )
    .await
    .unwrap();
    let addr = listener.local_addr().unwrap();
    let mirror = Arc::clone(&state.mirror);
    tokio::spawn(mirror.run());
    let (_stop_tx, stop_rx) = tokio::sync::watch::channel(false);
    tokio::spawn(Arc::clone(&state.relay).run(stop_rx));
    std::mem::forget(_stop_tx);
    tokio::spawn(async move { axum::serve(listener, router(state)).await.unwrap() });
    let agent_token = std::fs::read_to_string(folder.join(".nkata-agent/token")).unwrap();
    Harness {
        base: format!("http://{addr}"),
        token: agent_token,
        http: reqwest::Client::new(),
        folder,
        fake,
        project_id,
    }
}

fn spool_export(h: &Harness, part_id: &str) -> String {
    let dir = h.folder.join(".nkata-agent/spool").join(part_id);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join(format!("{}.glb", ulid::Ulid::new()));
    std::fs::write(&path, b"glTF").unwrap();
    path.display().to_string()
}

fn manifest() -> Value {
    json!({"v": 1, "kind": "character", "objects": [{"name": "Face", "triangles": 1200, "materials": ["M_Skin"], "bounds_min": [0, 0, 0], "bounds_max": [1, 1, 2], "hash": "abc", "origin": [0, 0, 0], "scale": [1, 1, 1]}], "bone_count": 42, "armature": "Armature", "mirror_target": null})
}

async fn wait_for_mirror(h: &Harness, part_id: &str, want: &str) -> Value {
    for _ in 0..200 {
        let (_, body) = h.get(&format!("/parts/{part_id}/mirror")).await;
        if body["mirror"]["status"] == want {
            return body["mirror"].clone();
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!("mirror never reached {want}");
}

#[tokio::test]
async fn local_api_serves_me_parts_locks_saves_and_mirrors() {
    let Ok(server_url) = std::env::var("NKATA_TEST_SERVER_URL") else {
        eprintln!("agent_api: NKATA_TEST_SERVER_URL not set, skipped (make test sets it)");
        return;
    };
    let fake = FakeUe5 {
        script: Arc::new(Mutex::new(vec![])),
        calls: Arc::new(AtomicUsize::new(0)),
        last_command: Arc::new(Mutex::new(String::new())),
    };
    let h = start(&server_url, fake).await;

    // Token required.
    let r = h.http.get(format!("{}/me", h.base)).send().await.unwrap();
    assert_eq!(r.status().as_u16(), 401);

    let (st, me) = h.get("/me").await;
    assert_eq!(st, 200);
    assert_eq!(me["user"]["name"], "Ada Obi");
    assert_eq!(me["project"]["folder_name"], "rising-sun");
    assert_eq!(me["online"], true);
    assert!(me["spool_dir"]
        .as_str()
        .unwrap()
        .ends_with(".nkata-agent/spool"));

    let (_, parts) = h.get("/parts?file=Ojukwu%2Fface.blend").await;
    assert_eq!(
        parts["parts"]
            .as_array()
            .unwrap_or_else(|| panic!("{parts}"))
            .len(),
        1
    );
    let face = parts["parts"][0]["id"].as_str().unwrap().to_string();
    assert_eq!(parts["parts"][0]["mapping"]["kind"], "blend_collection");
    assert_eq!(parts["parts"][0]["kind"], "character");

    // SSE subscriber sees lock and mirror events.
    let events_url = format!("{}/events?token={}", h.base, h.token);
    let resp = reqwest::Client::new()
        .get(&events_url)
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 200);
    let seen: Arc<Mutex<Vec<Value>>> = Arc::new(Mutex::new(vec![]));
    let seen2 = Arc::clone(&seen);
    tokio::spawn(async move {
        let mut stream = resp.bytes_stream();
        let mut buf = String::new();
        while let Some(Ok(chunk)) = stream.next().await {
            buf.push_str(&String::from_utf8_lossy(&chunk));
            while let Some(pos) = buf.find("\n\n") {
                let frame = buf[..pos].to_string();
                buf = buf[pos + 2..].to_string();
                for line in frame.lines() {
                    if let Some(data) = line.strip_prefix("data:") {
                        if let Ok(v) = serde_json::from_str::<Value>(data.trim()) {
                            seen2.lock().await.push(v);
                        }
                    }
                }
            }
        }
    });
    tokio::time::sleep(Duration::from_millis(100)).await;

    // Open grants, a second open by someone else reports the holder, close releases.
    let (st, open) = h.post(&format!("/parts/{face}/open"), None).await;
    assert_eq!(st, 200, "{open}");
    assert_eq!(open["granted"], true);
    let director = dev_login(&server_url, DIRECTOR).await.unwrap();
    let held: Value = reqwest::Client::new()
        .post(format!("{server_url}/parts/{face}/lock"))
        .bearer_auth(&director)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(held["granted"], false);
    let (st, close) = h.post(&format!("/parts/{face}/close"), None).await;
    assert_eq!(st, 200);
    assert_eq!(close["released"], true);

    // Save with nothing changed: a version, no mirror.
    let (st, saved) = h.post(&format!("/parts/{face}/saved"), Some(json!({"v": 1, "changed": false, "spool_path": null, "manifest": null, "source_file": "Ojukwu/face.blend"}))).await;
    assert_eq!(st, 201, "{saved}");
    assert_eq!(saved["mirror"], "skipped");
    assert_eq!(h.fake.calls.load(Ordering::SeqCst), 0);

    // Save with a change: version, mirror runs, result on SSE and on the server.
    let spool = spool_export(&h, &face);
    let (st, saved) = h.post(&format!("/parts/{face}/saved"), Some(json!({"v": 1, "changed": true, "spool_path": spool, "manifest": manifest(), "source_file": "Ojukwu/face.blend"}))).await;
    assert_eq!(st, 201, "{saved}");
    assert_eq!(saved["mirror"], "pending");
    let version_id = saved["version_id"].as_str().unwrap().to_string();
    let mirror = wait_for_mirror(&h, &face, "synced").await;
    assert_eq!(mirror["version_id"], version_id);
    assert_eq!(mirror["failures"], 0);
    assert_eq!(h.fake.calls.load(Ordering::SeqCst), 1);
    let command = h.fake.last_command.lock().await.clone();
    assert!(command.contains("import_character.py"), "{command}");
    let args_path = command.split('"').nth(3).unwrap().to_string();
    let args: Value = serde_json::from_str(&std::fs::read_to_string(&args_path).unwrap()).unwrap();
    assert_eq!(args["destination_path"], "/Game/Nkata/Ojukwu/face");
    assert_eq!(args["asset_name"], "face");
    assert_eq!(args["kind"], "character");
    assert_eq!(args["bone_count"], 42);
    // v8 step 17: what the export held, for the script to check after the import.
    assert_eq!(
        args["expect"],
        json!({"materials": ["M_Skin"], "bones": [], "animations": []})
    );

    let versions: Value = reqwest::Client::new()
        .get(format!("{server_url}/parts/{face}/versions"))
        .bearer_auth(&director)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let v = versions["versions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|v| v["id"] == version_id)
        .unwrap();
    assert_eq!(v["mirror_status"], "synced");
    assert!(v["mirror_ms"].as_u64().is_some());

    tokio::time::sleep(Duration::from_millis(200)).await;
    let kinds: Vec<String> = seen
        .lock()
        .await
        .iter()
        .map(|e| e["kind"].as_str().unwrap().to_string())
        .collect();
    assert_eq!(
        kinds,
        vec!["lock.granted", "lock.released", "mirror.result"]
    );
    let last = seen.lock().await.last().cloned().unwrap();
    assert_eq!(last["status"], "synced");
    assert_eq!(last["project_id"], h.project_id);

    // Three failures halt the part. Retry runs it again.
    for _ in 0..3 {
        h.fake
            .script
            .lock()
            .await
            .push(json!({"ok": false, "message": "RuntimeError: no skeleton"}));
    }
    let spool = spool_export(&h, &face);
    h.post(&format!("/parts/{face}/saved"), Some(json!({"v": 1, "changed": true, "spool_path": spool, "manifest": manifest(), "source_file": "Ojukwu/face.blend"}))).await;
    let failed = wait_for_mirror(&h, &face, "failed").await;
    assert_eq!(failed["message"], "RuntimeError: no skeleton");
    assert_eq!(failed["failures"], 1);
    assert_eq!(failed["halted"], false);
    for i in 2..=3 {
        let spool = spool_export(&h, &face);
        h.post(&format!("/parts/{face}/saved"), Some(json!({"v": 1, "changed": true, "spool_path": spool, "manifest": manifest(), "source_file": "Ojukwu/face.blend"}))).await;
        for _ in 0..200 {
            let (_, body) = h.get(&format!("/parts/{face}/mirror")).await;
            if body["mirror"]["failures"] == i {
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    }
    let halted = wait_for_mirror(&h, &face, "failed").await;
    assert_eq!(halted["failures"], 3);
    assert_eq!(halted["halted"], true);
    let calls_before = h.fake.calls.load(Ordering::SeqCst);
    let spool = spool_export(&h, &face);
    h.post(&format!("/parts/{face}/saved"), Some(json!({"v": 1, "changed": true, "spool_path": spool, "manifest": manifest(), "source_file": "Ojukwu/face.blend"}))).await;
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert_eq!(
        h.fake.calls.load(Ordering::SeqCst),
        calls_before,
        "halted part must not call UE5"
    );
    let (_, retry) = h.post(&format!("/parts/{face}/mirror/retry"), None).await;
    assert_eq!(retry["queued"], true);
    let ok = wait_for_mirror(&h, &face, "synced").await;
    assert_eq!(ok["halted"], false);
    assert_eq!(ok["failures"], 0);

    std::fs::remove_dir_all(&h.folder).unwrap();
}

/// Subscribes to an agent's SSE stream and collects every event.
async fn subscribe(h: &Harness) -> Arc<Mutex<Vec<Value>>> {
    let resp = reqwest::Client::new()
        .get(format!("{}/events?token={}", h.base, h.token))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status().as_u16(), 200);
    let seen: Arc<Mutex<Vec<Value>>> = Arc::new(Mutex::new(vec![]));
    let seen2 = Arc::clone(&seen);
    tokio::spawn(async move {
        let mut stream = resp.bytes_stream();
        let mut buf = String::new();
        while let Some(Ok(chunk)) = stream.next().await {
            buf.push_str(&String::from_utf8_lossy(&chunk));
            while let Some(pos) = buf.find("\n\n") {
                let frame = buf[..pos].to_string();
                buf = buf[pos + 2..].to_string();
                for line in frame.lines() {
                    if let Some(data) = line.strip_prefix("data:") {
                        if let Ok(v) = serde_json::from_str::<Value>(data.trim()) {
                            seen2.lock().await.push(v);
                        }
                    }
                }
            }
        }
    });
    tokio::time::sleep(Duration::from_millis(100)).await;
    seen
}

async fn wait_for_kind(seen: &Arc<Mutex<Vec<Value>>>, kind: &str) -> Value {
    wait_for_event(seen, |e| e["kind"] == kind).await
}

async fn wait_for_event(seen: &Arc<Mutex<Vec<Value>>>, pick: impl Fn(&Value) -> bool) -> Value {
    for _ in 0..100 {
        if let Some(v) = seen.lock().await.iter().find(|e| pick(e)) {
            return v.clone();
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!("no matching event arrived: {:?}", seen.lock().await);
}

/// Publish, checks, comments, review, and presence through the agent, with the director's
/// decision reaching the artist's panel through the relay.
#[tokio::test]
async fn editors_publish_comment_review_and_hear_each_other() {
    let Ok(server_url) = std::env::var("NKATA_TEST_SERVER_URL") else {
        eprintln!("agent_api: NKATA_TEST_SERVER_URL not set, skipped (make test sets it)");
        return;
    };
    let fake = || FakeUe5 {
        script: Arc::new(Mutex::new(vec![])),
        calls: Arc::new(AtomicUsize::new(0)),
        last_command: Arc::new(Mutex::new(String::new())),
    };
    let artist = start_as(&server_url, fake(), ENV_ARTIST).await;
    let director = start_as(&server_url, fake(), DIRECTOR).await;
    let (_, parts) = artist.get("/parts?file=Market%20stall%2Fmodel.blend").await;
    let model = parts["parts"][0]["id"].as_str().unwrap().to_string();
    // The template lists the four blocking checks first; texture names lead (step 7, slice 2).
    assert_eq!(parts["parts"][0]["checks"][0]["id"], "texture_names");
    assert_eq!(parts["parts"][0]["waiting_on"], json!([]));

    let artist_seen = subscribe(&artist).await;
    let director_seen = subscribe(&director).await;

    // Nothing to publish before a save.
    let (st, body) = artist
        .post(
            &format!("/parts/{model}/publish"),
            Some(json!({"v": 1, "check_results": [], "ready": false, "note": "Stall base done"})),
        )
        .await;
    assert_eq!(st, 409, "{body}");

    // A save with no change still records a version.
    let (st, saved) = artist.post(&format!("/parts/{model}/saved"), Some(json!({"v": 1, "changed": false, "spool_path": null, "manifest": null, "source_file": "Market stall/model.blend"}))).await;
    assert_eq!(st, 201, "{saved}");

    // Live checks are recorded on the current version.
    let failing = json!({"check_id": "triangle_budget", "severity": "block", "passed": false, "auto_fixed": false, "message": "18,000 of 15,000"});
    let (st, rec) = artist
        .post(
            &format!("/parts/{model}/checks"),
            Some(json!({"v": 1, "results": [failing]})),
        )
        .await;
    assert_eq!(st, 200, "{rec}");
    assert_eq!(rec["recorded"], 1);

    // A blocking failure stops Publish; a clean run publishes and marks Ready.
    let (st, blocked) = artist
        .post(
            &format!("/parts/{model}/publish"),
            Some(json!({"v": 1, "check_results": [failing], "ready": true, "note": "Stall base done"})),
        )
        .await;
    assert_eq!(st, 200, "{blocked}");
    assert_eq!(blocked["published"], false);
    assert_eq!(blocked["blocked_by"][0]["check_id"], "triangle_budget");
    let passing = json!({"check_id": "triangle_budget", "severity": "block", "passed": true, "auto_fixed": false, "message": ""});
    let (_, published) = artist
        .post(
            &format!("/parts/{model}/publish"),
            Some(
                json!({"v": 1, "check_results": [passing], "ready": true, "note": "Roof reworked"}),
            ),
        )
        .await;
    assert_eq!(published["published"], true);
    assert_eq!(published["state"], "ready");

    // The director pins a comment; the artist's panel hears it through the relay.
    let (st, pinned) = director.post(&format!("/parts/{model}/comments"), Some(json!({"v": 1, "point": [0.1, 0.2, 0.3], "normal": [0, 0, 1], "body": "Roof too thin."}))).await;
    assert_eq!(st, 201, "{pinned}");
    let heard = wait_for_kind(&artist_seen, "comment.created").await;
    assert_eq!(heard["comment"]["body"], "Roof too thin.");
    let (_, listed) = artist.get(&format!("/parts/{model}/comments")).await;
    assert_eq!(listed["comments"].as_array().unwrap().len(), 1);
    // The artist marks the pin done from the panel; the director hears it, the artist's own
    // echo is dropped. The director reopens it (v8 step 14).
    let cid = pinned["comment"]["id"].as_str().unwrap().to_string();
    let (st, done) = artist
        .post(
            &format!("/parts/{model}/comments/{cid}/resolve"),
            Some(json!({})),
        )
        .await;
    assert_eq!(st, 200, "{done}");
    assert!(done["comment"]["resolved_at"].is_string(), "{done}");
    let heard = wait_for_kind(&director_seen, "comment.resolved").await;
    assert_eq!(heard["comment"]["id"], cid);
    let (st, back) = director
        .post(
            &format!("/parts/{model}/comments/{cid}/reopen"),
            Some(json!({})),
        )
        .await;
    assert_eq!(st, 200, "{back}");
    assert!(back["comment"]["resolved_at"].is_null(), "{back}");
    // The director's own stream does not echo it: the POST already answered.
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert!(!director_seen
        .lock()
        .await
        .iter()
        .any(|e| e["kind"] == "comment.created"));

    // Presence: the artist is in the part; the director sees it.
    let (st, online) = artist
        .post("/presence", Some(json!({"v": 1, "part_id": model})))
        .await;
    assert_eq!(st, 200, "{online}");
    assert!(online["online"]
        .as_array()
        .unwrap()
        .iter()
        .any(|e| e["part_id"] == model));
    let presence = wait_for_kind(&director_seen, "presence.changed").await;
    assert!(presence["online"]
        .as_array()
        .unwrap()
        .iter()
        .any(|e| e["user"]["name"] == "Chidi Eze"));

    // The artist cannot review; the director approves and the artist hears the decision.
    let (st, _) = artist
        .post(
            &format!("/parts/{model}/review"),
            Some(json!({"v": 1, "score": 5, "decision": "approve", "note": ""})),
        )
        .await;
    assert_eq!(st, 403);
    let (st, reviewed) = director
        .post(
            &format!("/parts/{model}/review"),
            Some(json!({"v": 1, "score": 4, "decision": "approve", "note": "Good."})),
        )
        .await;
    assert_eq!(st, 201, "{reviewed}");
    assert_eq!(reviewed["state"], "approved");
    let decided = wait_for_kind(&artist_seen, "review.decided").await;
    assert_eq!(decided["decision"], "approve");
    let state = wait_for_event(&artist_seen, |e| {
        e["kind"] == "part.state" && e["to"] == "approved"
    })
    .await;
    assert_eq!(state["from"], "ready");
    let (_, after) = artist.get("/parts?file=Market%20stall%2Fmodel.blend").await;
    assert_eq!(after["parts"][0]["state"], "approved");
}

/// Step 3 gate, the lock half: two artists on one asset, no overwrite. The second to open a held
/// part sees the holder and cannot write; the holder hears the request; a release lets the
/// second in. docs/product.md, R4.
#[tokio::test]
async fn two_artists_on_one_part_never_overwrite() {
    let Ok(server_url) = std::env::var("NKATA_TEST_SERVER_URL") else {
        eprintln!("agent_api: NKATA_TEST_SERVER_URL not set, skipped (make test sets it)");
        return;
    };
    let fake = || FakeUe5 {
        script: Arc::new(Mutex::new(vec![])),
        calls: Arc::new(AtomicUsize::new(0)),
        last_command: Arc::new(Mutex::new(String::new())),
    };
    // Both are artists. The director holds the artist role too and owns nothing on Ojukwu.
    let ada = start_as(&server_url, fake(), ARTIST).await;
    let second = start_as(&server_url, fake(), DIRECTOR).await;
    let (_, parts) = ada.get("/parts?file=Ojukwu%2Fhair.blend").await;
    let hair = parts["parts"][0]["id"].as_str().unwrap().to_string();
    let ada_seen = subscribe(&ada).await;
    let second_seen = subscribe(&second).await;

    // Ada opens and holds the part.
    let (st, open) = ada.post(&format!("/parts/{hair}/open"), None).await;
    assert_eq!(st, 200, "{open}");
    assert_eq!(open["lock"]["holder"]["name"], "Ada Obi");

    // The second artist sees the holder, cannot write, and the holder hears the request.
    let (st, held) = second.post(&format!("/parts/{hair}/open"), None).await;
    assert_eq!(st, 409, "{held}");
    assert_eq!(held["granted"], false);
    assert_eq!(held["lock"]["holder"]["name"], "Ada Obi");
    let asked = wait_for_kind(&ada_seen, "lock.requested").await;
    assert_eq!(asked["requester"]["name"], "Ngozi Okafor");
    let (st, body) = second
        .post(
            &format!("/parts/{hair}/saved"),
            Some(json!({"v": 1, "changed": false, "spool_path": null, "manifest": null, "source_file": "Ojukwu/hair.blend"})),
        )
        .await;
    assert_eq!(st, 409, "a save while someone else holds the part: {body}");
    assert_eq!(body["error"]["code"], "lock_held");

    // Ada closes. The second artist hears the release and gets in.
    let (st, closed) = ada.post(&format!("/parts/{hair}/close"), None).await;
    assert_eq!(st, 200, "{closed}");
    assert_eq!(closed["released"], true);
    let released = wait_for_event(&second_seen, |e| {
        e["kind"] == "lock.released" && e["part_id"] == hair
    })
    .await;
    assert_eq!(released["reason"], "closed");
    let (st, open2) = second.post(&format!("/parts/{hair}/open"), None).await;
    assert_eq!(st, 200, "{open2}");
    assert_eq!(open2["lock"]["holder"]["name"], "Ngozi Okafor");
    let (_, now) = ada.get("/parts?file=Ojukwu%2Fhair.blend").await;
    assert_eq!(now["parts"][0]["lock"]["holder"]["name"], "Ngozi Okafor");
    second.post(&format!("/parts/{hair}/close"), None).await;
}

#[tokio::test]
async fn a_prop_save_runs_the_static_import_and_stores_where_it_is_placed() {
    let Ok(server_url) = std::env::var("NKATA_TEST_SERVER_URL") else {
        eprintln!("agent_api: NKATA_TEST_SERVER_URL not set, skipped (make test sets it)");
        return;
    };
    let fake = FakeUe5 {
        script: Arc::new(Mutex::new(vec![])),
        calls: Arc::new(AtomicUsize::new(0)),
        last_command: Arc::new(Mutex::new(String::new())),
    };
    let h = start_as(&server_url, fake, ENV_ARTIST).await;
    let (_, parts) = h.get("/parts?file=Kettle%2Fmodel.blend").await;
    let model = parts["parts"][0]["id"].as_str().unwrap().to_string();
    assert_eq!(parts["parts"][0]["kind"], "prop");

    // The fake pops from the end: the import answers first, then the scan.
    h.fake.script.lock().await.push(json!({"ok": true, "levels": [{"level": "/Game/Levels/L_EnuguMarket", "actors": 2}, {"level": "/Game/Levels/L_Compound", "actors": 1}], "referencers": 3}));
    h.fake.script.lock().await.push(json!({"ok": true, "message": "", "asset_path": "/Game/Nkata/Kettle/model", "first_import": false, "referencers": 3}));
    let spool = spool_export(&h, &model);
    let prop_manifest = json!({"v": 1, "kind": "prop", "objects": [{"name": "SM_Kettle", "triangles": 900, "materials": ["MI_Kettle"], "bounds_min": [-0.2, -0.2, 0], "bounds_max": [0.2, 0.2, 0.3], "hash": "k", "origin": [0, 0, 0], "scale": [1, 1, 1]}], "bone_count": null, "armature": null, "mirror_target": null});
    let (st, saved) = h.post(&format!("/parts/{model}/saved"), Some(json!({"v": 1, "changed": true, "spool_path": spool, "manifest": prop_manifest, "source_file": "Kettle/model.blend"}))).await;
    assert_eq!(st, 201, "{saved}");
    let version_id = saved["version_id"].as_str().unwrap().to_string();
    wait_for_mirror(&h, &model, "synced").await;
    assert_eq!(h.fake.calls.load(Ordering::SeqCst), 2, "import then scan");
    let command = h.fake.last_command.lock().await.clone();
    assert!(command.contains("scan_refs.py"), "{command}");
    let args_path = command.split('"').nth(3).unwrap().to_string();
    let args: Value = serde_json::from_str(&std::fs::read_to_string(&args_path).unwrap()).unwrap();
    assert_eq!(args["asset_path"], "/Game/Nkata/Kettle/model");

    let director = dev_login(&server_url, DIRECTOR).await.unwrap();
    let versions: Value = reqwest::Client::new()
        .get(format!("{server_url}/parts/{model}/versions"))
        .bearer_auth(&director)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let v = versions["versions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|v| v["id"] == version_id)
        .unwrap();
    assert_eq!(v["mirror_status"], "synced");
    assert_eq!(
        v["refs"],
        json!([{"level": "/Game/Levels/L_EnuguMarket", "actors": 2}, {"level": "/Game/Levels/L_Compound", "actors": 1}])
    );
}

#[tokio::test]
async fn unreachable_ue5_keeps_the_job_pending() {
    let Ok(server_url) = std::env::var("NKATA_TEST_SERVER_URL") else {
        return;
    };
    let fake = FakeUe5 {
        script: Arc::new(Mutex::new(vec![])),
        calls: Arc::new(AtomicUsize::new(0)),
        last_command: Arc::new(Mutex::new(String::new())),
    };
    let token = dev_login(&server_url, ARTIST).await.unwrap();
    let projects: Value = reqwest::Client::new()
        .get(format!("{server_url}/projects"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let project_id = projects["projects"][0]["id"].as_str().unwrap().to_string();
    let server = ServerClient::new(&server_url, &token, &project_id).unwrap();
    let folder = std::env::temp_dir().join(format!("nkata-api-{}", ulid::Ulid::new()));
    std::fs::create_dir_all(&folder).unwrap();
    let scripts_dir = std::fs::canonicalize(env!("CARGO_MANIFEST_DIR"))
        .unwrap()
        .join("../../ue5-plugin/scripts");
    // A port with nothing listening.
    let dead = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let dead_url = format!("http://{}", dead.local_addr().unwrap());
    drop(dead);
    let (listener, state) = bind(
        server,
        ServeOptions {
            folder: folder.clone(),
            port: 0,
            ue5_url: dead_url,
            scripts_dir,
            token_file: None,
            mode: AgentMode::Sync,
        },
    )
    .await
    .unwrap();
    let addr = listener.local_addr().unwrap();
    let mirror = Arc::clone(&state.mirror);
    tokio::spawn(mirror.run());
    let (_stop_tx, stop_rx) = tokio::sync::watch::channel(false);
    tokio::spawn(Arc::clone(&state.relay).run(stop_rx));
    std::mem::forget(_stop_tx);
    tokio::spawn(async move { axum::serve(listener, router(state)).await.unwrap() });
    let agent_token = std::fs::read_to_string(folder.join(".nkata-agent/token")).unwrap();
    let h = Harness {
        base: format!("http://{addr}"),
        token: agent_token,
        http: reqwest::Client::new(),
        folder,
        fake,
        project_id,
    };

    let (_, parts) = h.get("/parts?file=Ojukwu%2Fcloth.blend").await;
    let cloth = parts["parts"][0]["id"].as_str().unwrap().to_string();
    let spool = spool_export(&h, &cloth);
    let (st, _) = h.post(&format!("/parts/{cloth}/saved"), Some(json!({"v": 1, "changed": true, "spool_path": spool, "manifest": manifest(), "source_file": "Ojukwu/cloth.blend"}))).await;
    assert_eq!(st, 201);
    tokio::time::sleep(Duration::from_millis(500)).await;
    let (_, body) = h.get(&format!("/parts/{cloth}/mirror")).await;
    assert_eq!(body["mirror"]["status"], "pending");
    assert_eq!(body["mirror"]["message"], "Waiting for UE5");
    assert_eq!(body["mirror"]["failures"], 0);
    std::fs::remove_dir_all(&h.folder).unwrap();
}

/// Mirror on save off and Pause both hold the newest job while every save still versions.
/// Mark Ready takes the engine's viewport as the render, and Blender's render is the fallback.
#[tokio::test]
async fn mirror_holds_on_pause_or_off_and_mark_ready_stores_a_render() {
    let Ok(server_url) = std::env::var("NKATA_TEST_SERVER_URL") else {
        return;
    };
    let fake = FakeUe5 {
        script: Arc::new(Mutex::new(vec![])),
        calls: Arc::new(AtomicUsize::new(0)),
        last_command: Arc::new(Mutex::new(String::new())),
    };
    let h = start_as(&server_url, fake.clone(), ENV_ARTIST).await;
    let (_, parts) = h.get("/parts?file=Kettle%2Fuvs.blend").await;
    let uvs = parts["parts"][0]["id"].as_str().unwrap().to_string();
    async fn save(h: &Harness, id: &str) -> Value {
        let spool = spool_export(h, id);
        let (st, body) = h
            .post(
                &format!("/parts/{id}/saved"),
                Some(json!({"v": 1, "changed": true, "spool_path": spool, "manifest": manifest(), "source_file": "Kettle/uvs.blend", "opened_at": "2026-10-10T09:00:00.000Z"})),
            )
            .await;
        assert_eq!(st, 201, "{body}");
        body
    }

    // Off: the save versions, nothing reaches the editor, the panel says why.
    let (st, off) = h
        .post(
            &format!("/parts/{uvs}/mirror/on-save"),
            Some(json!({"v": 1, "on_save": false})),
        )
        .await;
    assert_eq!(st, 200, "{off}");
    assert_eq!(off["mirror"]["on_save"], false);
    let saved = save(&h, &uvs).await;
    assert_eq!(saved["mirror"], "pending");
    tokio::time::sleep(Duration::from_millis(700)).await;
    assert_eq!(fake.calls.load(Ordering::SeqCst), 0);
    let (_, state) = h.get(&format!("/parts/{uvs}/mirror")).await;
    assert_eq!(state["mirror"]["status"], "pending");
    assert_eq!(state["mirror"]["message"], "Mirror on save is off");

    // On: the held job runs.
    h.post(
        &format!("/parts/{uvs}/mirror/on-save"),
        Some(json!({"v": 1, "on_save": true})),
    )
    .await;
    wait_for_mirror(&h, &uvs, "synced").await;
    let after_on = fake.calls.load(Ordering::SeqCst);
    assert!(after_on >= 1);

    // Pause holds every part the same way.
    let (st, paused) = h
        .post("/mirror/pause", Some(json!({"v": 1, "paused": true})))
        .await;
    assert_eq!(st, 200, "{paused}");
    let (_, me) = h.get("/me").await;
    assert_eq!(me["mirror_paused"], true);
    save(&h, &uvs).await;
    tokio::time::sleep(Duration::from_millis(700)).await;
    assert_eq!(fake.calls.load(Ordering::SeqCst), after_on);
    let (_, state) = h.get(&format!("/parts/{uvs}/mirror")).await;
    assert_eq!(state["mirror"]["message"], "Mirror paused");
    h.post("/mirror/pause", Some(json!({"v": 1, "paused": false})))
        .await;
    wait_for_mirror(&h, &uvs, "synced").await;

    // Mark Ready: the editor's capture becomes the render.
    let png = h.folder.join("capture.png");
    std::fs::write(&png, b"\x89PNG fake").unwrap();
    fake.script
        .lock()
        .await
        .push(json!({"ok": true, "message": "", "path": png.display().to_string()}));
    let (st, published) = h
        .post(
            &format!("/parts/{uvs}/publish"),
            Some(json!({"v": 1, "check_results": [], "ready": true, "note": "Ready for review"})),
        )
        .await;
    assert_eq!(st, 200, "{published}");
    assert_eq!(published["published"], true);
    assert_eq!(published["state"], "ready");
    assert_eq!(published["render_needed"], false);
    let version_id = published["version_id"].as_str().unwrap().to_string();
    assert!(fake
        .last_command
        .lock()
        .await
        .contains("capture_viewport.py"));
    let token = dev_login(&server_url, ENV_ARTIST).await.unwrap();
    let render = reqwest::Client::new()
        .get(format!(
            "{server_url}/parts/{uvs}/versions/{version_id}/render"
        ))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(render.status().as_u16(), 200);
    // The save's export is the version's model, uploaded off the save path.
    let http = reqwest::Client::new();
    let mut model_status = 0;
    for _ in 0..100 {
        model_status = http
            .get(format!(
                "{server_url}/parts/{uvs}/versions/{version_id}/model"
            ))
            .bearer_auth(&token)
            .send()
            .await
            .unwrap()
            .status()
            .as_u16();
        if model_status == 200 {
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    assert_eq!(model_status, 200, "the model never reached the server");

    // No capture from the editor: Blender renders and posts it.
    fake.script
        .lock()
        .await
        .push(json!({"ok": false, "message": "no viewport is active"}));
    let (_, again) = h
        .post(
            &format!("/parts/{uvs}/publish"),
            Some(json!({"v": 1, "check_results": [], "ready": true, "note": "Ready for review"})),
        )
        .await;
    assert_eq!(again["render_needed"], true, "{again}");
    let blender_png = h.folder.join("blender.png");
    std::fs::write(&blender_png, b"\x89PNG blender").unwrap();
    let (st, stored) = h
        .post(
            &format!("/parts/{uvs}/render"),
            Some(json!({"v": 1, "path": blender_png.display().to_string()})),
        )
        .await;
    assert_eq!(st, 200, "{stored}");
    assert_eq!(stored["stored"], true);
    let (st, missing) = h
        .post(
            &format!("/parts/{uvs}/render"),
            Some(json!({"v": 1, "path": h.folder.join("nope.png").display().to_string()})),
        )
        .await;
    assert_eq!(st, 400, "{missing}");
}
