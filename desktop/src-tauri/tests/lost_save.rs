//! Quality bar, lost save: the agent dies during an upload, restarts, and the queue drains. The
//! save is never lost. Runs inside `make test` against the live server (NKATA_TEST_SERVER_URL).
//! See docs/engineering.md, Quality bar.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use serde_json::Value;

const MIB: u64 = 1024 * 1024;
const ARTIST: &str = "artist@sunburst.gg";
const PRODUCER: &str = "producer@sunburst.gg";

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

async fn post(server: &str, token: &str, path: &str, body: Value) -> Value {
    reqwest::Client::new()
        .post(format!("{server}{path}"))
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap()
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
    let dir = base.join(format!("nkata-lost-{}", ulid::Ulid::new()));
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn write_pattern(path: &Path, size: u64, seed: u8) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    let chunk: Vec<u8> = (0..MIB as usize)
        .map(|i| (i as u8).wrapping_mul(seed).wrapping_add(seed))
        .collect();
    let mut out = Vec::with_capacity(size as usize);
    while (out.len() as u64) < size {
        out.extend_from_slice(&chunk);
    }
    out.truncate(size as usize);
    fs::write(path, out).unwrap();
}

#[tokio::test]
async fn a_push_killed_mid_upload_drains_on_the_next_run() {
    let Ok(server) = std::env::var("NKATA_TEST_SERVER_URL") else {
        eprintln!("lost_save: NKATA_TEST_SERVER_URL not set, skipped (make test sets it)");
        return;
    };
    let bin = env!("CARGO_BIN_EXE_nkata-agent");
    let root = temp_root();
    let folder = root.join("artist");
    fs::create_dir_all(&folder).unwrap();

    // A project of its own, so other tests' file counts stay exact.
    let stamp = ulid::Ulid::new().to_string();
    let producer = agent(
        bin,
        &folder,
        &["login", "--server", &server, "--email", PRODUCER],
    )["token"]
        .as_str()
        .unwrap()
        .to_string();
    let project = post(
        &server,
        &producer,
        "/projects",
        serde_json::json!({
            "name": format!("Lost save {stamp}"), "folder_name": format!("lost-{stamp}"),
            "blender_version": "4.2", "ue_version": "5.4", "package_version": "0.1.0"
        }),
    )
    .await["project"]["id"]
        .as_str()
        .expect("project created")
        .to_string();
    let token = agent(
        bin,
        &folder,
        &["login", "--server", &server, "--email", ARTIST],
    )["token"]
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
            &token,
        ],
    );

    // Six files of 32 MiB: enough chunks that a kill lands mid upload.
    let names: Vec<String> = (0..6).map(|i| format!("Ojukwu/part{i}.blend")).collect();
    for (i, name) in names.iter().enumerate() {
        write_pattern(&folder.join(name), 32 * MIB, i as u8 + 3);
    }
    agent(bin, &folder, &["scan"]);

    let mut child = Command::new(bin)
        .arg("--folder")
        .arg(&folder)
        .arg("push")
        .env("RUST_LOG", "warn")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("push starts");
    // Kill once the first chunks are on the wire, well before the push could finish.
    let started = Instant::now();
    loop {
        let versions = get(
            &server,
            &token,
            &format!("/projects/{project}/file-versions?limit=10"),
        )
        .await;
        let done = versions["file_versions"].as_array().map_or(0, Vec::len);
        if done >= 1 || started.elapsed() > Duration::from_millis(1500) {
            break;
        }
        if child.try_wait().unwrap().is_some() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    let killed = child.try_wait().unwrap().is_none();
    let _ = child.kill();
    let _ = child.wait();
    assert!(
        killed,
        "the push finished before it could be killed; raise the file count"
    );

    // Restart: the index remembers what was not sent and the queue drains in order.
    let again = agent(bin, &folder, &["push"]);
    assert_eq!(again["queue"]["remaining"].as_u64().unwrap(), 0, "{again}");

    let mut seen = Vec::new();
    let mut since: Option<String> = None;
    loop {
        let path = match &since {
            Some(s) => format!("/projects/{project}/file-versions?limit=1000&since={s}"),
            None => format!("/projects/{project}/file-versions?limit=1000"),
        };
        let page = get(&server, &token, &path).await;
        for fv in page["file_versions"].as_array().unwrap() {
            seen.push(fv["path"].as_str().unwrap().to_string());
        }
        if !page["more"].as_bool().unwrap_or(false) {
            break;
        }
        since = page["next"].as_str().map(String::from);
    }
    for name in &names {
        assert!(
            seen.contains(name),
            "{name} never reached the server: {seen:?}"
        );
    }

    // A second machine gets every byte back.
    let other = root.join("other");
    fs::create_dir_all(&other).unwrap();
    agent(
        bin,
        &other,
        &[
            "init",
            "--server",
            &server,
            "--project",
            &project,
            "--token",
            &token,
        ],
    );
    agent(bin, &other, &["pull"]);
    for name in &names {
        assert_eq!(
            fs::read(other.join(name)).unwrap(),
            fs::read(folder.join(name)).unwrap(),
            "{name}"
        );
    }
    let _ = fs::remove_dir_all(&root);
}
