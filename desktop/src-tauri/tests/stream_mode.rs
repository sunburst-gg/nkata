//! Stream mode for a viewer. One artist agent pushes three files; a viewer cache with a cap
//! smaller than all three fetches them one by one and the least recently used file goes first.
//! Runs inside `make test` against the live server (NKATA_TEST_SERVER_URL). Skipped without it.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::Value;

const MIB: u64 = 1024 * 1024;
const VIEWER: &str = "viewer@sunburst.gg";
const ARTIST: &str = "artist@sunburst.gg";

fn agent(bin: &str, folder: &Path, args: &[&str]) -> Value {
    let out = Command::new(bin)
        .arg("--folder")
        .arg(folder)
        .args(args)
        .env("RUST_LOG", "warn")
        .output()
        .expect("agent runs");
    assert!(
        out.status.success(),
        "agent {:?} failed:\nstdout: {}\nstderr: {}",
        args,
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    serde_json::from_slice(&out.stdout).expect("agent prints json")
}

async fn get(server: &str, token: &str, path: &str) -> Value {
    reqwest::Client::new()
        .get(format!("{server}{path}"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap()
}

fn temp_root() -> PathBuf {
    let base = std::env::var_os("NKATA_TEST_TMP")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    let dir = base.join(format!("nkata-stream-{}", ulid::Ulid::new()));
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn pattern(seed: u8, size: u64) -> Vec<u8> {
    (0..size)
        .map(|i| (i as u8).wrapping_mul(seed).wrapping_add(seed))
        .collect()
}

#[tokio::test]
async fn a_viewer_cache_fetches_on_demand_and_evicts_the_least_recently_used() {
    let Ok(server) = std::env::var("NKATA_TEST_SERVER_URL") else {
        eprintln!("stream_mode: NKATA_TEST_SERVER_URL not set, skipped (make test sets it)");
        return;
    };
    let bin = env!("CARGO_BIN_EXE_nkata-agent");
    let root = temp_root();
    let folder = root.join("artist");
    let cache = root.join("cache");
    fs::create_dir_all(&folder).unwrap();

    // The artist pushes three files of 1 MiB each, with a folder name no other test uses.
    let stamp = ulid::Ulid::new().to_string();
    let names: Vec<String> = (1..=3)
        .map(|i| format!("Stream-{stamp}/T_{i}.png"))
        .collect();
    for (i, name) in names.iter().enumerate() {
        let path = folder.join(name);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, pattern(i as u8 + 1, MIB)).unwrap();
    }
    let artist_token = agent(
        bin,
        &folder,
        &["login", "--server", &server, "--email", ARTIST],
    )["token"]
        .as_str()
        .unwrap()
        .to_string();
    let project = get(&server, &artist_token, "/projects").await["projects"][0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    agent(
        bin,
        &folder,
        &[
            "init",
            "--server",
            &server,
            "--project",
            &project,
            "--token",
            &artist_token,
        ],
    );
    agent(bin, &folder, &["sync"]);

    // The viewer finds the three file version ids on the server.
    let viewer_token = agent(
        bin,
        &folder,
        &["login", "--server", &server, "--email", VIEWER],
    )["token"]
        .as_str()
        .unwrap()
        .to_string();
    let mut ids: Vec<String> = Vec::new();
    let mut since: Option<String> = None;
    loop {
        let path = match &since {
            Some(s) => format!("/projects/{project}/file-versions?limit=1000&since={s}"),
            None => format!("/projects/{project}/file-versions?limit=1000"),
        };
        let page = get(&server, &viewer_token, &path).await;
        for fv in page["file_versions"].as_array().unwrap() {
            let p = fv["path"].as_str().unwrap();
            if let Some(pos) = names.iter().position(|n| n == p) {
                ids.resize(ids.len().max(pos + 1), String::new());
                ids[pos] = fv["id"].as_str().unwrap().to_string();
            }
        }
        if !page["more"].as_bool().unwrap_or(false) {
            break;
        }
        since = page["next"].as_str().map(String::from);
    }
    assert_eq!(ids.len(), 3, "all three files have a version: {ids:?}");

    // A cap of 2.5 MiB holds two files, never three.
    let cap = (5 * MIB / 2).to_string();
    let cache_s = cache.to_string_lossy().to_string();
    let init = agent(
        bin,
        &folder,
        &[
            "init",
            "--stream",
            "--server",
            &server,
            "--project",
            &project,
            "--token",
            &viewer_token,
            "--cache",
            &cache_s,
            "--cap-bytes",
            &cap,
        ],
    );
    assert_eq!(init["initialised"], Value::Bool(true));
    assert!(
        !cache.join(".nkata-agent").exists(),
        "no index in stream mode"
    );

    let fetch = |id: &str| {
        agent(
            bin,
            &folder,
            &[
                "fetch",
                "--file-version",
                id,
                "--cache",
                &cache_s,
                "--cap-bytes",
                &cap,
            ],
        )
    };
    let r1 = fetch(&ids[0]);
    assert_eq!(r1["downloaded"], Value::Bool(true));
    assert_eq!(r1["evicted"].as_array().unwrap().len(), 0);
    let p1 = PathBuf::from(r1["path"].as_str().unwrap());
    assert_eq!(fs::read(&p1).unwrap(), pattern(1, MIB));

    let r2 = fetch(&ids[1]);
    assert_eq!(r2["downloaded"], Value::Bool(true));
    assert_eq!(r2["total_bytes"].as_u64().unwrap(), 2 * MIB);

    // Using the first file again makes the second the oldest.
    let again = fetch(&ids[0]);
    assert_eq!(again["downloaded"], Value::Bool(false));

    let r3 = fetch(&ids[2]);
    assert_eq!(r3["downloaded"], Value::Bool(true));
    assert_eq!(r3["evicted"], serde_json::json!([ids[1]]));
    assert!(r3["total_bytes"].as_u64().unwrap() <= 5 * MIB / 2);
    assert!(p1.exists(), "the recently used file stays");
    assert!(
        !PathBuf::from(r2["path"].as_str().unwrap()).exists(),
        "the oldest file is gone"
    );

    // The evicted file comes back on demand and the oldest goes out again.
    let r2b = fetch(&ids[1]);
    assert_eq!(r2b["downloaded"], Value::Bool(true));
    assert_eq!(r2b["evicted"], serde_json::json!([ids[0]]));
    assert_eq!(
        fs::read(r2b["path"].as_str().unwrap()).unwrap(),
        pattern(2, MIB)
    );

    let _ = fs::remove_dir_all(&root);
}
