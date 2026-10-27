//! Mirror runner. On a save with changes, the newest pending mirror per part runs in UE5 through
//! Remote Control. UE5 closed: the job waits and runs when the port answers. Import error: the
//! result carries the UE5 log line and the version still exists. Three failures in a row on one
//! part: the runner stops that part and the panel shows Retry. Pause holds every mirror and
//! Mirror on save holds one part; saves still version either way (docs/decisions.md, 2026-10-10).
//! See docs/engineering.md, The mirror.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Serialize;
use tokio::sync::{broadcast, Mutex, Notify};

use crate::client::{MirrorUpdate, ServerClient};
use crate::error::{AgentError, Result};
use crate::protocol::{
    iso_now, AgentEvent, ManifestAnimation, MirrorState, MirrorStatus, ObjectManifest, PartMapping,
    TemplateKind,
};
use crate::ue5::{CallOutcome, LevelRef, ScriptResult, Ue5Client};

pub const MAX_FAILURES: u32 = 3;
/// How long the agent waits for the editor to write a Mark Ready screenshot.
pub const CAPTURE_WAIT: Duration = Duration::from_secs(10);
pub const PAUSED_MESSAGE: &str = "Mirror paused";
pub const OFF_MESSAGE: &str = "Mirror on save is off";

fn event_value(event: &AgentEvent) -> serde_json::Value {
    serde_json::to_value(event).unwrap_or(serde_json::Value::Null)
}
pub const POLL_WHEN_UNREACHABLE: Duration = Duration::from_secs(5);

#[derive(Debug, Clone)]
pub struct MirrorJob {
    pub part_id: String,
    pub kind: TemplateKind,
    pub version_id: String,
    pub spool_path: PathBuf,
    pub manifest: ObjectManifest,
    pub mapping: PartMapping,
    pub asset_name: String,
    pub part_name: String,
    /// v8 step 18: an environment's USD export. When present the import reads it, not the GLB.
    pub usd_path: Option<PathBuf>,
}

/// Arguments written to <spool>/<part>/<version>.args.json for the import script.
#[derive(Debug, Serialize)]
pub struct ImportArgs<'a> {
    pub v: u8,
    pub kind: TemplateKind,
    pub part_id: &'a str,
    pub version_id: &'a str,
    pub spool_path: &'a Path,
    pub destination_path: &'a str,
    pub asset_name: &'a str,
    pub armature: Option<&'a str>,
    pub bone_count: Option<u64>,
    /// v8 step 17: what the export held, for the script to set beside what Unreal made.
    pub expect: Expect,
    /// Static mesh settings, applied on first import only. See docs/engineering.md, Static.
    pub nanite: bool,
    pub lod_group: Option<&'a str>,
    pub generate_collision: bool,
}

/// What the manifest says the export held: the material names, the rig's bones, the animations.
#[derive(Debug, Serialize, PartialEq)]
pub struct Expect {
    pub materials: Vec<String>,
    pub bones: Vec<String>,
    pub animations: Vec<ManifestAnimation>,
}

impl Expect {
    pub fn of(manifest: &ObjectManifest) -> Self {
        let mut materials: Vec<String> = manifest
            .objects
            .iter()
            .flat_map(|o| o.materials.iter().cloned())
            .collect();
        materials.sort();
        materials.dedup();
        Self {
            materials,
            bones: manifest.bones.clone().unwrap_or_default(),
            animations: manifest.animations.clone().unwrap_or_default(),
        }
    }
}

/// The UE5 script for a kind, or None when the kind is not mirrored from Blender. A level area
/// edited in UE5 syncs its actor files like any other file; one saved in Blender with a USD
/// export (the v8 Environment template) is imported whole with its actors (v8 step 18).
pub fn script_for(kind: TemplateKind, usd: bool) -> Option<&'static str> {
    match kind {
        TemplateKind::Character => Some("import_character.py"),
        TemplateKind::Prop => Some("import_static.py"),
        TemplateKind::LevelArea if usd => Some("import_environment.py"),
        TemplateKind::LevelArea => None,
    }
}

#[derive(Debug)]
struct PartEntry {
    pending: Option<MirrorJob>,
    running: bool,
    state: MirrorState,
}

impl PartEntry {
    fn new(part_id: &str) -> Self {
        Self {
            pending: None,
            running: false,
            state: MirrorState {
                part_id: part_id.to_string(),
                status: MirrorStatus::Pending,
                version_id: None,
                at: None,
                mirror_ms: None,
                message: String::new(),
                failures: 0,
                halted: false,
                on_save: true,
            },
        }
    }
}

pub struct MirrorRunner {
    parts: Mutex<HashMap<String, PartEntry>>,
    paused: AtomicBool,
    wake: Notify,
    ue5: Ue5Client,
    server: ServerClient,
    events: broadcast::Sender<serde_json::Value>,
    scripts_dir: PathBuf,
    actor_id: String,
}

/// Destination path in the engine for a part. ue_asset carries it; blend_collection and file
/// parts land under /Game/Nkata/<asset>/<part> until the template export rules apply (step 3).
pub fn destination_for(mapping: &PartMapping, asset_name: &str, part_name: &str) -> String {
    match mapping {
        PartMapping::UeAsset { path } => path.clone(),
        PartMapping::UeActor { level, actor } => format!("/Game/{level}/{actor}"),
        PartMapping::UeArea { level, area } => format!("/Game/{level}/{area}"),
        PartMapping::BlendCollection { .. } | PartMapping::File { .. } => {
            format!("/Game/Nkata/{asset_name}/{part_name}")
        }
    }
}

impl MirrorRunner {
    pub fn new(
        ue5: Ue5Client,
        server: ServerClient,
        events: broadcast::Sender<serde_json::Value>,
        scripts_dir: PathBuf,
        actor_id: String,
    ) -> Arc<Self> {
        Arc::new(Self {
            parts: Mutex::new(HashMap::new()),
            paused: AtomicBool::new(false),
            wake: Notify::new(),
            ue5,
            server,
            events,
            scripts_dir,
            actor_id,
        })
    }

    /// Replaces any pending job for the part. Only the newest save matters.
    pub async fn enqueue(&self, job: MirrorJob) {
        let mut parts = self.parts.lock().await;
        let entry = parts
            .entry(job.part_id.clone())
            .or_insert_with(|| PartEntry::new(&job.part_id));
        entry.state.status = MirrorStatus::Pending;
        entry.state.version_id = Some(job.version_id.clone());
        entry.state.message = if self.is_paused() {
            PAUSED_MESSAGE.to_string()
        } else if !entry.state.on_save {
            OFF_MESSAGE.to_string()
        } else {
            String::new()
        };
        entry.pending = Some(job);
        drop(parts);
        self.wake.notify_one();
    }

    pub fn is_paused(&self) -> bool {
        self.paused.load(Ordering::SeqCst)
    }

    /// Holds every mirror, or lets them run again. Pending jobs stay and run on resume.
    pub async fn set_paused(&self, paused: bool) {
        self.paused.store(paused, Ordering::SeqCst);
        let mut parts = self.parts.lock().await;
        for e in parts.values_mut() {
            if e.pending.is_some() && !e.running {
                e.state.message = if paused {
                    PAUSED_MESSAGE.to_string()
                } else if !e.state.on_save {
                    OFF_MESSAGE.to_string()
                } else {
                    String::new()
                };
            }
        }
        drop(parts);
        self.wake.notify_one();
    }

    /// Mirror on save for one part. Off: saves version and the newest waits. On: it runs.
    pub async fn set_on_save(&self, part_id: &str, on_save: bool) -> MirrorState {
        let mut parts = self.parts.lock().await;
        let entry = parts
            .entry(part_id.to_string())
            .or_insert_with(|| PartEntry::new(part_id));
        entry.state.on_save = on_save;
        if entry.pending.is_some() && !entry.running {
            entry.state.message = if self.is_paused() {
                PAUSED_MESSAGE.to_string()
            } else if on_save {
                String::new()
            } else {
                OFF_MESSAGE.to_string()
            };
        }
        let state = entry.state.clone();
        drop(parts);
        self.wake.notify_one();
        state
    }

    /// Mark Ready: asks the editor for a viewport capture and waits for the file. None when
    /// the editor is closed, refuses, or never writes it; the caller falls back to Blender.
    pub async fn capture(
        &self,
        part_id: &str,
        version_id: &str,
        spool_dir: &Path,
    ) -> Option<PathBuf> {
        let script = self.scripts_dir.join("capture_viewport.py");
        let dir = spool_dir.join(part_id);
        if let Err(e) = std::fs::create_dir_all(&dir) {
            tracing::warn!(part_id, error = %e, "capture: spool dir");
            return None;
        }
        let args_path = dir.join(format!("{version_id}.capture.args.json"));
        let args = serde_json::json!({ "v": 1, "part_id": part_id, "version_id": version_id, "width": 1280, "height": 720 });
        if let Err(e) = std::fs::write(&args_path, serde_json::to_vec_pretty(&args).ok()?) {
            tracing::warn!(part_id, error = %e, "capture: args not written");
            return None;
        }
        let path = match self.ue5.run_script(&script, &args_path).await {
            Ok(CallOutcome::Done(r)) if r.ok => r.path.map(PathBuf::from)?,
            Ok(CallOutcome::Done(r)) => {
                tracing::info!(part_id, message = r.message, "capture: refused");
                return None;
            }
            Ok(CallOutcome::Unreachable(why)) => {
                tracing::info!(part_id, why, "capture: UE5 not reachable");
                return None;
            }
            Err(e) => {
                tracing::warn!(part_id, error = %e, "capture: error");
                return None;
            }
        };
        let started = Instant::now();
        while started.elapsed() < CAPTURE_WAIT {
            if std::fs::metadata(&path)
                .map(|m| m.len() > 0)
                .unwrap_or(false)
            {
                return Some(path);
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
        tracing::info!(part_id, path = %path.display(), "capture: file never appeared");
        None
    }

    /// Mark Ready on a level area: the editor exports the tagged actors as one GLB and the
    /// caller stores it as the version's model. None when the editor is closed or refuses.
    pub async fn export_area(
        &self,
        part_id: &str,
        version_id: &str,
        level: &str,
        area: &str,
        spool_dir: &Path,
    ) -> Option<PathBuf> {
        let script = self.scripts_dir.join("export_area.py");
        let dir = spool_dir.join(part_id);
        if let Err(e) = std::fs::create_dir_all(&dir) {
            tracing::warn!(part_id, error = %e, "export area: spool dir");
            return None;
        }
        let out_path = dir.join(format!("{version_id}.area.glb"));
        let args_path = dir.join(format!("{version_id}.area.args.json"));
        let args = serde_json::json!({ "v": 1, "part_id": part_id, "version_id": version_id, "level": level, "area": area, "out_path": out_path });
        if let Err(e) = std::fs::write(&args_path, serde_json::to_vec_pretty(&args).ok()?) {
            tracing::warn!(part_id, error = %e, "export area: args not written");
            return None;
        }
        match self.ue5.run_script(&script, &args_path).await {
            Ok(CallOutcome::Done(r)) if r.ok => {
                let path = r.path.map(PathBuf::from).unwrap_or(out_path);
                if std::fs::metadata(&path)
                    .map(|m| m.len() > 0)
                    .unwrap_or(false)
                {
                    Some(path)
                } else {
                    tracing::info!(part_id, path = %path.display(), "export area: file never appeared");
                    None
                }
            }
            Ok(CallOutcome::Done(r)) => {
                tracing::info!(part_id, message = r.message, "export area: refused");
                None
            }
            Ok(CallOutcome::Unreachable(why)) => {
                tracing::info!(part_id, why, "export area: UE5 not reachable");
                None
            }
            Err(e) => {
                tracing::warn!(part_id, error = %e, "export area: error");
                None
            }
        }
    }

    pub async fn state(&self, part_id: &str) -> MirrorState {
        let parts = self.parts.lock().await;
        parts
            .get(part_id)
            .map(|e| e.state.clone())
            .unwrap_or_else(|| PartEntry::new(part_id).state)
    }

    /// Clears the failure count and runs the newest pending mirror again. Returns false when
    /// nothing is pending for the part.
    pub async fn retry(&self, part_id: &str) -> bool {
        let mut parts = self.parts.lock().await;
        let Some(entry) = parts.get_mut(part_id) else {
            return false;
        };
        entry.state.failures = 0;
        entry.state.halted = false;
        let queued = entry.pending.is_some();
        if queued {
            entry.state.status = MirrorStatus::Pending;
        }
        drop(parts);
        self.wake.notify_one();
        queued
    }

    /// Runs forever. One import at a time: the editor runs Python on its game thread.
    pub async fn run(self: Arc<Self>) {
        loop {
            let next = {
                let mut parts = self.parts.lock().await;
                let paused = self.is_paused();
                let picked = parts
                    .iter_mut()
                    .find(|(_, e)| {
                        !paused
                            && e.state.on_save
                            && e.pending.is_some()
                            && !e.running
                            && !e.state.halted
                    })
                    .map(|(id, e)| {
                        e.running = true;
                        e.state.status = MirrorStatus::Syncing;
                        (id.clone(), e.pending.take().expect("checked is_some"))
                    });
                picked
            };
            match next {
                Some((part_id, job)) => {
                    let unreachable = self.run_job(&part_id, job).await;
                    if unreachable {
                        tokio::select! {
                            _ = self.wake.notified() => {}
                            _ = tokio::time::sleep(POLL_WHEN_UNREACHABLE) => {}
                        }
                    }
                }
                None => self.wake.notified().await,
            }
        }
    }

    /// Returns true when UE5 was unreachable and the job was put back.
    async fn run_job(&self, part_id: &str, job: MirrorJob) -> bool {
        let started = Instant::now();
        let outcome = self.import(&job).await;
        let mirror_ms = started.elapsed().as_millis() as u64;
        let mut parts = self.parts.lock().await;
        let entry = parts
            .entry(part_id.to_string())
            .or_insert_with(|| PartEntry::new(part_id));
        entry.running = false;
        match outcome {
            Ok(CallOutcome::Unreachable(why)) => {
                tracing::info!(part_id, why, "mirror: UE5 not reachable, job kept");
                if entry.pending.is_none() {
                    entry.pending = Some(job);
                }
                entry.state.status = MirrorStatus::Pending;
                entry.state.message = "Waiting for UE5".to_string();
                return true;
            }
            Ok(CallOutcome::Done(result)) => {
                let refs = if result.ok {
                    self.scan_refs(&job, &result).await
                } else {
                    None
                };
                let (status, message) = if result.ok {
                    (MirrorStatus::Synced, String::new())
                } else {
                    (MirrorStatus::Failed, result.message)
                };
                self.finish(entry, &job, status, mirror_ms, message, refs)
                    .await;
            }
            Err(e) => {
                self.finish(
                    entry,
                    &job,
                    MirrorStatus::Failed,
                    mirror_ms,
                    e.to_string(),
                    None,
                )
                .await;
            }
        }
        false
    }

    /// After a static import: which levels place the mesh. The one piece of the dependency map
    /// in v1 (docs/product.md, Later). A scan failure is logged, never a mirror failure.
    async fn scan_refs(&self, job: &MirrorJob, result: &ScriptResult) -> Option<Vec<LevelRef>> {
        if job.kind != TemplateKind::Prop {
            return None;
        }
        let asset_path = result.asset_path.clone()?;
        let script = self.scripts_dir.join("scan_refs.py");
        let args_path = job.spool_path.with_extension("refs.args.json");
        let args = serde_json::json!({ "v": 1, "asset_path": asset_path });
        if let Err(e) = std::fs::write(&args_path, serde_json::to_vec_pretty(&args).ok()?) {
            tracing::warn!(part_id = job.part_id, error = %e, "scan_refs: args not written");
            return None;
        }
        match self.ue5.run_script(&script, &args_path).await {
            Ok(CallOutcome::Done(r)) if r.ok => r.levels,
            Ok(CallOutcome::Done(r)) => {
                tracing::warn!(
                    part_id = job.part_id,
                    message = r.message,
                    "scan_refs: failed"
                );
                None
            }
            Ok(CallOutcome::Unreachable(why)) => {
                tracing::warn!(part_id = job.part_id, why, "scan_refs: UE5 not reachable");
                None
            }
            Err(e) => {
                tracing::warn!(part_id = job.part_id, error = %e, "scan_refs: error");
                None
            }
        }
    }

    async fn finish(
        &self,
        entry: &mut PartEntry,
        job: &MirrorJob,
        status: MirrorStatus,
        mirror_ms: u64,
        message: String,
        refs: Option<Vec<LevelRef>>,
    ) {
        if status == MirrorStatus::Failed {
            entry.state.failures += 1;
            if entry.state.failures >= MAX_FAILURES {
                entry.state.halted = true;
                // Keep the job so Retry can run it.
                if entry.pending.is_none() {
                    entry.pending = Some(job.clone());
                }
            }
        } else {
            entry.state.failures = 0;
        }
        let at = iso_now();
        entry.state.status = status;
        entry.state.version_id = Some(job.version_id.clone());
        entry.state.at = Some(at.clone());
        entry.state.mirror_ms = Some(mirror_ms);
        entry.state.message = message.clone();
        tracing::info!(project_id = self.server.project_id(), part_id = job.part_id, version_id = job.version_id, status = ?status, mirror_ms, message, failures = entry.state.failures, "mirror: result");

        if let Err(e) = self
            .server
            .put_mirror(
                &job.part_id,
                &job.version_id,
                &MirrorUpdate {
                    mirror_status: status,
                    mirror_ms: Some(mirror_ms),
                    message: &message,
                    refs,
                },
            )
            .await
        {
            tracing::warn!(part_id = job.part_id, error = %e, "mirror: could not record result on the server");
        }
        let _ = self.events.send(event_value(&AgentEvent::MirrorResult {
            v: 1,
            project_id: self.server.project_id().to_string(),
            actor_id: self.actor_id.clone(),
            at,
            part_id: job.part_id.clone(),
            version_id: job.version_id.clone(),
            status,
            mirror_ms: Some(mirror_ms),
            message,
        }));
    }

    async fn import(&self, job: &MirrorJob) -> Result<CallOutcome> {
        if !job.spool_path.is_file() {
            return Ok(CallOutcome::Done(crate::ue5::ScriptResult {
                ok: false,
                message: format!("export not found at {}", job.spool_path.display()),
                asset_path: None,
                first_import: false,
                levels: None,
                path: None,
            }));
        }
        let Some(script_name) = script_for(job.kind, job.usd_path.is_some()) else {
            return Ok(CallOutcome::Done(crate::ue5::ScriptResult {
                ok: false,
                message: "a level area is edited in UE5, nothing to mirror".to_string(),
                asset_path: None,
                first_import: false,
                levels: None,
                path: None,
            }));
        };
        let destination = destination_for(&job.mapping, &job.asset_name, &job.part_name);
        let args = ImportArgs {
            v: 1,
            kind: job.kind,
            part_id: &job.part_id,
            version_id: &job.version_id,
            spool_path: job.usd_path.as_deref().unwrap_or(&job.spool_path),
            destination_path: &destination,
            asset_name: &job.part_name,
            armature: job.manifest.armature.as_deref(),
            bone_count: job.manifest.bone_count,
            expect: Expect::of(&job.manifest),
            nanite: false,
            lod_group: None,
            generate_collision: true,
        };
        let args_path = job.spool_path.with_extension("args.json");
        std::fs::write(&args_path, serde_json::to_vec_pretty(&args)?)
            .map_err(|e| AgentError::io(&args_path, e))?;
        let script = self.scripts_dir.join(script_name);
        if !script.is_file() {
            return Err(AgentError::Config(format!(
                "import script not found at {}",
                script.display()
            )));
        }
        self.ue5.run_script(&script, &args_path).await
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_import_is_told_what_the_export_held() {
        let manifest: ObjectManifest = serde_json::from_value(serde_json::json!({
            "v": 1, "kind": "character",
            "objects": [
                {"name": "Body", "triangles": 1, "materials": ["M_Skin", "M_Cloth"], "bounds_min": [0.0, 0.0, 0.0], "bounds_max": [1.0, 1.0, 1.0], "hash": "a", "origin": [0.0, 0.0, 0.0], "scale": [1.0, 1.0, 1.0]},
                {"name": "Eyes", "triangles": 1, "materials": ["M_Skin"], "bounds_min": [0.0, 0.0, 0.0], "bounds_max": [1.0, 1.0, 1.0], "hash": "b", "origin": [0.0, 0.0, 0.0], "scale": [1.0, 1.0, 1.0]}
            ],
            "bone_count": 2, "armature": "Rig", "mirror_target": null,
            "bones": ["root", "spine"], "animations": [{"name": "Walk", "seconds": 1.25}]
        }))
        .unwrap();
        let expect = Expect::of(&manifest);
        assert_eq!(expect.materials, vec!["M_Cloth", "M_Skin"]);
        assert_eq!(expect.bones, vec!["root", "spine"]);
        assert_eq!(
            expect.animations,
            vec![ManifestAnimation {
                name: "Walk".into(),
                seconds: 1.25
            }]
        );
    }

    use super::*;

    #[test]
    fn script_follows_the_kind() {
        assert_eq!(
            script_for(TemplateKind::Character, false),
            Some("import_character.py")
        );
        assert_eq!(
            script_for(TemplateKind::Prop, false),
            Some("import_static.py")
        );
        assert_eq!(script_for(TemplateKind::LevelArea, false), None);
        assert_eq!(
            script_for(TemplateKind::LevelArea, true),
            Some("import_environment.py")
        );
    }

    #[test]
    fn destination_follows_the_mapping() {
        assert_eq!(
            destination_for(
                &PartMapping::UeAsset {
                    path: "/Game/Characters/Ojukwu/lookdev".into()
                },
                "Ojukwu",
                "lookdev"
            ),
            "/Game/Characters/Ojukwu/lookdev"
        );
        assert_eq!(
            destination_for(
                &PartMapping::BlendCollection {
                    file: "Ojukwu/face.blend".into(),
                    collection: "face".into()
                },
                "Ojukwu",
                "face"
            ),
            "/Game/Nkata/Ojukwu/face"
        );
        assert_eq!(
            destination_for(
                &PartMapping::UeArea {
                    level: "Enugu Market".into(),
                    area: "square".into()
                },
                "Enugu Market / square",
                "blockout"
            ),
            "/Game/Enugu Market/square"
        );
    }
}
