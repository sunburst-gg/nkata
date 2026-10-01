//! Step 2 gate. A 2 GB folder syncs from one agent to a second agent through the server and
//! store. An edit to one file moves only its changed chunks. Two CLI instances, two temp folders,
//! one server, one MinIO. Runs inside `make test` (scripts/test.sh starts the server and sets
//! NKATA_TEST_SERVER_URL). Without that variable the test is skipped with a message.

use std::fs::{self, File, OpenOptions};
use std::io::{Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Instant;

use nkata_agent::chunker::chunk_file;
use serde_json::Value;

const MIB: u64 = 1024 * 1024;
const BIG_FILES: u64 = 5;
const BIG_SIZE: u64 = 400 * MIB;
const SMALL_FILES: u64 = 100;
const SMALL_SIZE: u64 = MIB;
const ARTIST: &str = "artist@sunburst.gg";

struct Xorshift(u64);

impl Xorshift {
    fn fill(&mut self, buf: &mut [u8]) {
        for word in buf.chunks_mut(8) {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            let bytes = self.0.to_le_bytes();
            word.copy_from_slice(&bytes[..word.len()]);
        }
    }
}

fn write_random(path: &Path, size: u64, seed: u64) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    let mut f = File::create(path).unwrap();
    let mut rng = Xorshift(seed);
    let mut buf = vec![0u8; 8 * MIB as usize];
    let mut left = size;
    while left > 0 {
        let n = left.min(buf.len() as u64) as usize;
        rng.fill(&mut buf[..n]);
        f.write_all(&buf[..n]).unwrap();
        left -= n as u64;
    }
}

fn generate(root: &Path) -> u64 {
    let mut total = 0;
    for i in 0..BIG_FILES {
        write_random(
            &root.join(format!("Ojukwu/part{i}.blend")),
            BIG_SIZE,
            1000 + i,
        );
        total += BIG_SIZE;
    }
    for i in 0..SMALL_FILES {
        write_random(
            &root.join(format!("Textures/T_{i:03}.png")),
            SMALL_SIZE,
            5000 + i,
        );
        total += SMALL_SIZE;
    }
    fs::write(root.join("Ojukwu/part0.blend1"), b"backup, ignored").unwrap();
    fs::create_dir_all(root.join(".nkata/templates")).unwrap();
    fs::write(root.join(".nkata/templates/Character.json"), b"{}").unwrap();
    total += 2;
    total
}

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

async fn project_id(server: &str, token: &str) -> String {
    let res: Value = reqwest::Client::new()
        .get(format!("{server}/projects"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    res["projects"][0]["id"]
        .as_str()
        .expect("seeded project")
        .to_string()
}

fn all_files(root: &Path) -> Vec<(String, String)> {
    let mut out = Vec::new();
    for entry in walkdir::WalkDir::new(root)
        .into_iter()
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let rel = entry
            .path()
            .strip_prefix(root)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        if rel.starts_with(".nkata-agent/") {
            continue;
        }
        out.push((rel, chunk_file(entry.path()).unwrap().blake3));
    }
    out.sort();
    out
}

fn temp_root() -> PathBuf {
    let base = std::env::var_os("NKATA_TEST_TMP")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    let dir = base.join(format!("nkata-gate-{}", ulid::Ulid::new()));
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[tokio::test]
async fn two_gb_folder_syncs_and_an_edit_moves_only_its_chunks() {
    let Ok(server) = std::env::var("NKATA_TEST_SERVER_URL") else {
        eprintln!("sync_gate: NKATA_TEST_SERVER_URL not set, skipped (make test sets it)");
        return;
    };
    let bin = env!("CARGO_BIN_EXE_nkata-agent");
    let root = temp_root();
    let a = root.join("a");
    let b = root.join("b");
    fs::create_dir_all(&a).unwrap();
    fs::create_dir_all(&b).unwrap();

    let t = Instant::now();
    let total = generate(&a);
    assert!(total >= 2 * 1024 * MIB, "generated {total} bytes");
    let generate_ms = t.elapsed().as_millis();

    let token = agent(bin, &a, &["login", "--server", &server, "--email", ARTIST])["token"]
        .as_str()
        .unwrap()
        .to_string();
    let project = project_id(&server, &token).await;
    for folder in [&a, &b] {
        agent(
            bin,
            folder,
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
    }

    // First sync: A pushes everything, B pulls everything.
    let t = Instant::now();
    let push = agent(bin, &a, &["sync"]);
    let push_ms = t.elapsed().as_millis();
    assert_eq!(
        push["scan"]["scanned"].as_u64().unwrap(),
        BIG_FILES + SMALL_FILES + 1
    );
    assert_eq!(
        push["push"]["files"].as_u64().unwrap(),
        BIG_FILES + SMALL_FILES + 1
    );
    assert_eq!(push["push"]["queue"]["remaining"].as_u64().unwrap(), 0);
    let first_chunks = push["push"]["chunks_uploaded"].as_u64().unwrap();
    let first_bytes = push["push"]["bytes_uploaded"].as_u64().unwrap();
    assert_eq!(first_bytes, total);

    let t = Instant::now();
    let pull = agent(bin, &b, &["sync"]);
    let pull_ms = t.elapsed().as_millis();
    assert_eq!(
        pull["pull"]["files"].as_u64().unwrap(),
        BIG_FILES + SMALL_FILES + 1
    );
    assert_eq!(pull["pull"]["bytes_downloaded"].as_u64().unwrap(), total);
    assert_eq!(
        all_files(&a)
            .into_iter()
            .filter(|(p, _)| !p.ends_with(".blend1"))
            .collect::<Vec<_>>(),
        all_files(&b)
    );

    // A second push with nothing changed moves nothing.
    let again = agent(bin, &a, &["sync"]);
    assert_eq!(again["push"]["chunks_uploaded"].as_u64().unwrap(), 0);
    assert_eq!(again["scan"]["hashed"].as_u64().unwrap(), 0);

    // Edit 4 KB in the middle of one 400 MB file.
    let edited = a.join("Ojukwu/part2.blend");
    {
        let mut f = OpenOptions::new().write(true).open(&edited).unwrap();
        f.seek(SeekFrom::Start(BIG_SIZE / 2)).unwrap();
        f.write_all(&[0xAB; 4096]).unwrap();
    }
    let later = std::time::SystemTime::now() + std::time::Duration::from_secs(2);
    File::open(&edited).unwrap().set_modified(later).unwrap();

    let t = Instant::now();
    let edit_push = agent(bin, &a, &["sync"]);
    let edit_push_ms = t.elapsed().as_millis();
    assert_eq!(edit_push["scan"]["hashed"].as_u64().unwrap(), 1);
    let moved = edit_push["push"]["chunks_uploaded"].as_u64().unwrap();
    let moved_bytes = edit_push["push"]["bytes_uploaded"].as_u64().unwrap();
    assert!((1..=2).contains(&moved), "edit moved {moved} chunks");
    assert!(moved_bytes <= 2 * 8 * MIB, "edit moved {moved_bytes} bytes");

    let t = Instant::now();
    let edit_pull = agent(bin, &b, &["sync"]);
    let edit_pull_ms = t.elapsed().as_millis();
    assert_eq!(edit_pull["pull"]["files"].as_u64().unwrap(), 1);
    assert_eq!(
        edit_pull["pull"]["chunks_downloaded"].as_u64().unwrap(),
        moved
    );
    assert_eq!(
        edit_pull["pull"]["bytes_downloaded"].as_u64().unwrap(),
        moved_bytes
    );
    assert_eq!(
        chunk_file(&edited).unwrap().blake3,
        chunk_file(&b.join("Ojukwu/part2.blend")).unwrap().blake3
    );

    let report = serde_json::json!({
        "total_bytes": total,
        "files": BIG_FILES + SMALL_FILES + 1,
        "generate_ms": generate_ms,
        "first_push_ms": push_ms,
        "first_push_chunks": first_chunks,
        "first_pull_ms": pull_ms,
        "edit_push_ms": edit_push_ms,
        "edit_chunks_moved": moved,
        "edit_bytes_moved": moved_bytes,
        "edit_pull_ms": edit_pull_ms,
    });
    println!("GATE {report}");
    if let Some(path) = std::env::var_os("NKATA_GATE_REPORT") {
        fs::write(path, serde_json::to_string_pretty(&report).unwrap()).unwrap();
    }
    fs::remove_dir_all(&root).unwrap();
}
