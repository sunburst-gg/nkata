//! Editor tools. The app installs the Blender add-on and the UE5 plugin itself, so an artist
//! installs one thing and signs in (docs/product.md, Setup). Pure file work plus two process
//! calls, tested here with a fake Blender and temp Unreal projects.
//!
//! Blender: the add-on is zipped and installed with Blender's own command line,
//! `blender --command extension install-file -r user_default -e <zip>`, which also enables it.
//! https://docs.blender.org/manual/en/4.2/advanced/command_line/extension_arguments.html
//!
//! Unreal: the plugin folder is copied into `<project>/Plugins/Nkata`, the .uproject gets the
//! plugin plus Python and Remote Control enabled, and DefaultEngine.ini starts the Remote
//! Control web server with the project. UE adds every enabled plugin's `Content/Python` to the
//! Python path and runs its `init_unreal.py`.
//! https://dev.epicgames.com/documentation/en-us/unreal-engine/scripting-the-unreal-editor-using-python
//! https://dev.epicgames.com/documentation/en-us/unreal-engine/remote-control-quick-start-for-unreal-engine

use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;
use walkdir::WalkDir;

use crate::error::{AgentError, Result};

/// The Blender repository the add-on lands in. Blender 4.2+ ships it by default.
pub const BLENDER_REPO: &str = "user_default";
pub const UE_PLUGIN_NAME: &str = "Nkata";
/// Plugins the .uproject must list as enabled. Names are the ones UE shows in Edit, Plugins.
pub const UE_PLUGINS: [&str; 3] = [UE_PLUGIN_NAME, "PythonScriptPlugin", "RemoteControl"];
const UE_INI_SECTION: &str = "SystemSettings";
const UE_INI_LINE: &str = "WebControl.EnableServerOnStartup=1";
/// Folders never copied into an editor: tests, caches, and the vendored copy's own caches.
const SKIP_DIRS: [&str; 4] = ["tests", "__pycache__", ".pytest_cache", ".ruff_cache"];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct BlenderInstall {
    pub exe: PathBuf,
    pub version: String,
}

/// Blender on this machine: the standard install folders, then PATH. `NKATA_BLENDER` wins.
pub fn find_blender() -> Option<BlenderInstall> {
    for exe in blender_candidates() {
        if !exe.is_file() {
            continue;
        }
        if let Some(version) = blender_version(&exe) {
            return Some(BlenderInstall { exe, version });
        }
    }
    None
}

fn blender_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(p) = std::env::var_os("NKATA_BLENDER") {
        out.push(PathBuf::from(p));
    }
    if cfg!(target_os = "macos") {
        out.push(PathBuf::from(
            "/Applications/Blender.app/Contents/MacOS/Blender",
        ));
        if let Some(home) = home_dir() {
            out.push(home.join("Applications/Blender.app/Contents/MacOS/Blender"));
        }
    }
    if cfg!(target_os = "windows") {
        for base in ["C:\\Program Files\\Blender Foundation"] {
            if let Ok(entries) = std::fs::read_dir(base) {
                let mut dirs: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
                dirs.sort();
                dirs.reverse();
                for d in dirs {
                    out.push(d.join("blender.exe"));
                }
            }
        }
    }
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            out.push(dir.join(if cfg!(target_os = "windows") {
                "blender.exe"
            } else {
                "blender"
            }));
        }
    }
    out
}

/// Runs `blender --version` and reads the first line.
pub fn blender_version(exe: &Path) -> Option<String> {
    let out = Command::new(exe).arg("--version").output().ok()?;
    parse_blender_version(&String::from_utf8_lossy(&out.stdout))
}

/// "Blender 4.2.3 LTS" on the first line becomes "4.2.3 LTS".
pub fn parse_blender_version(stdout: &str) -> Option<String> {
    let line = stdout
        .lines()
        .find(|l| l.trim_start().starts_with("Blender "))?;
    let rest = line.trim().strip_prefix("Blender ")?.trim();
    (!rest.is_empty()).then(|| rest.to_string())
}

/// Zips the add-on folder with `blender_manifest.toml` at the root, as `extension build` does.
pub fn extension_zip(addon_dir: &Path, out: &Path) -> Result<()> {
    if !addon_dir.join("blender_manifest.toml").is_file() {
        return Err(AgentError::Config(format!(
            "{} has no blender_manifest.toml",
            addon_dir.display()
        )));
    }
    if let Some(parent) = out.parent() {
        std::fs::create_dir_all(parent).map_err(|e| AgentError::io(parent, e))?;
    }
    let file = std::fs::File::create(out).map_err(|e| AgentError::io(out, e))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    for entry in WalkDir::new(addon_dir)
        .sort_by_file_name()
        .into_iter()
        .filter_entry(|e| !skipped(e.path()))
        .flatten()
    {
        let path = entry.path();
        if !path.is_file() || path.extension().is_some_and(|x| x == "pyc") {
            continue;
        }
        let rel = path
            .strip_prefix(addon_dir)
            .map_err(|_| AgentError::Config(format!("{} left the add-on", path.display())))?;
        let name = rel.to_string_lossy().replace('\\', "/");
        zip.start_file(name, options)
            .map_err(|e| AgentError::Config(format!("zip {}: {e}", rel.display())))?;
        let bytes = std::fs::read(path).map_err(|e| AgentError::io(path, e))?;
        zip.write_all(&bytes).map_err(|e| AgentError::io(out, e))?;
    }
    zip.finish()
        .map_err(|e| AgentError::Config(format!("zip {}: {e}", out.display())))?;
    Ok(())
}

fn skipped(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| SKIP_DIRS.contains(&n))
}

/// Installs and enables the add-on through Blender itself. Returns Blender's last output line.
pub fn install_blender_addon(blender: &Path, addon_dir: &Path, work_dir: &Path) -> Result<String> {
    let zip_path = work_dir.join("nkata-addon.zip");
    extension_zip(addon_dir, &zip_path)?;
    let out = Command::new(blender)
        .args([
            "--command",
            "extension",
            "install-file",
            "-r",
            BLENDER_REPO,
            "-e",
        ])
        .arg(&zip_path)
        .output()
        .map_err(|e| AgentError::io(blender, e))?;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    let last = text
        .lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("")
        .to_string();
    if !out.status.success() {
        return Err(AgentError::Config(format!(
            "Blender could not install the add-on: {last}"
        )));
    }
    Ok(last)
}

/// Unreal projects inside the project folder, three levels deep at most. Engine output folders
/// are not entered.
pub fn find_uprojects(folder: &Path) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = WalkDir::new(folder)
        .max_depth(3)
        .into_iter()
        .filter_entry(|e| {
            e.depth() == 0
                || !e.file_name().to_str().is_some_and(|n| {
                    n.starts_with('.')
                        || matches!(
                            n,
                            "Plugins"
                                | "Saved"
                                | "Intermediate"
                                | "DerivedDataCache"
                                | "Binaries"
                                | "Content"
                        )
                })
        })
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "uproject"))
        .map(|e| e.into_path())
        .collect();
    out.sort();
    out
}

/// Copies the plugin into the project, enables it with Python and Remote Control, and starts
/// the Remote Control server with the project. Returns the plugin folder.
pub fn install_ue_plugin(uproject: &Path, plugin_dir: &Path) -> Result<PathBuf> {
    if !plugin_dir
        .join(format!("{UE_PLUGIN_NAME}.uplugin"))
        .is_file()
    {
        return Err(AgentError::Config(format!(
            "{} has no {UE_PLUGIN_NAME}.uplugin",
            plugin_dir.display()
        )));
    }
    let project_dir = uproject
        .parent()
        .ok_or_else(|| AgentError::Config(format!("{} has no folder", uproject.display())))?;
    let target = project_dir.join("Plugins").join(UE_PLUGIN_NAME);
    if target.exists() {
        std::fs::remove_dir_all(&target).map_err(|e| AgentError::io(&target, e))?;
    }
    copy_dir(plugin_dir, &target)?;
    let json = std::fs::read_to_string(uproject).map_err(|e| AgentError::io(uproject, e))?;
    let json = enable_plugins(&json, &UE_PLUGINS)?;
    std::fs::write(uproject, json).map_err(|e| AgentError::io(uproject, e))?;
    let ini_path = project_dir.join("Config").join("DefaultEngine.ini");
    let ini = std::fs::read_to_string(&ini_path).unwrap_or_default();
    let ini = add_ini_line(&ini, UE_INI_SECTION, UE_INI_LINE);
    if let Some(parent) = ini_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| AgentError::io(parent, e))?;
    }
    std::fs::write(&ini_path, ini).map_err(|e| AgentError::io(&ini_path, e))?;
    Ok(target)
}

/// Adds `{"Name": .., "Enabled": true}` for each plugin missing from the descriptor's `Plugins`
/// list, and turns an existing entry on. Everything else in the file is kept.
pub fn enable_plugins(uproject_json: &str, names: &[&str]) -> Result<String> {
    let mut doc: serde_json::Value = serde_json::from_str(uproject_json)?;
    let obj = doc
        .as_object_mut()
        .ok_or_else(|| AgentError::Config("the .uproject is not a JSON object".into()))?;
    let plugins = obj
        .entry("Plugins")
        .or_insert_with(|| serde_json::Value::Array(Vec::new()));
    let list = plugins
        .as_array_mut()
        .ok_or_else(|| AgentError::Config("Plugins in the .uproject is not a list".into()))?;
    for name in names {
        match list
            .iter_mut()
            .find(|p| p.get("Name").and_then(|n| n.as_str()) == Some(name))
        {
            Some(entry) => {
                if let Some(e) = entry.as_object_mut() {
                    e.insert("Enabled".into(), serde_json::Value::Bool(true));
                }
            }
            None => list.push(serde_json::json!({ "Name": name, "Enabled": true })),
        }
    }
    Ok(format!("{}\n", serde_json::to_string_pretty(&doc)?))
}

/// Puts `line` under `[section]`, creating the section at the end when missing. A second call
/// changes nothing.
pub fn add_ini_line(ini: &str, section: &str, line: &str) -> String {
    let header = format!("[{section}]");
    let mut lines: Vec<String> = ini.lines().map(str::to_string).collect();
    let mut in_section = false;
    let mut insert_at: Option<usize> = None;
    for (i, l) in lines.iter().enumerate() {
        let t = l.trim();
        if t.starts_with('[') {
            if in_section {
                break;
            }
            in_section = t == header;
            if in_section {
                insert_at = Some(i + 1);
            }
            continue;
        }
        if in_section {
            if t == line {
                return ini.to_string();
            }
            if !t.is_empty() {
                insert_at = Some(i + 1);
            }
        }
    }
    match insert_at {
        Some(i) => lines.insert(i, line.to_string()),
        None => {
            if lines.last().is_some_and(|l| !l.trim().is_empty()) {
                lines.push(String::new());
            }
            lines.push(header);
            lines.push(line.to_string());
        }
    }
    format!("{}\n", lines.join("\n"))
}

fn copy_dir(from: &Path, to: &Path) -> Result<()> {
    for entry in WalkDir::new(from)
        .into_iter()
        .filter_entry(|e| !skipped(e.path()))
        .flatten()
    {
        let path = entry.path();
        let rel = path
            .strip_prefix(from)
            .map_err(|_| AgentError::Config(format!("{} left the plugin", path.display())))?;
        let dest = to.join(rel);
        if path.is_dir() {
            std::fs::create_dir_all(&dest).map_err(|e| AgentError::io(&dest, e))?;
        } else if !path.extension().is_some_and(|x| x == "pyc") {
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent).map_err(|e| AgentError::io(parent, e))?;
            }
            std::fs::copy(path, &dest).map_err(|e| AgentError::io(path, e))?;
        }
    }
    Ok(())
}

pub fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
    }

    #[test]
    fn blender_version_is_the_first_line_without_the_word_blender() {
        assert_eq!(
            parse_blender_version("Blender 4.2.3 LTS\n\tbuild date: 2024\n"),
            Some("4.2.3 LTS".into())
        );
        assert_eq!(
            parse_blender_version("Blender 5.0.1\n"),
            Some("5.0.1".into())
        );
        assert_eq!(parse_blender_version("something else"), None);
    }

    #[test]
    fn the_zip_has_the_manifest_at_the_root_and_no_tests() {
        let tmp = tempfile::tempdir().unwrap();
        let out = tmp.path().join("addon.zip");
        extension_zip(&repo_root().join("blender-addon"), &out).unwrap();
        let file = std::fs::File::open(&out).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        let names: Vec<String> = (0..archive.len())
            .map(|i| archive.by_index(i).unwrap().name().to_string())
            .collect();
        assert!(
            names.contains(&"blender_manifest.toml".to_string()),
            "{names:?}"
        );
        assert!(names.contains(&"nkata/panel.py".to_string()), "{names:?}");
        assert!(names.iter().all(|n| !n.starts_with("tests/")), "{names:?}");
        assert!(
            names.iter().all(|n| !n.contains("__pycache__")),
            "{names:?}"
        );
    }

    #[cfg(unix)]
    #[test]
    fn the_add_on_installs_through_blenders_command_line() {
        use std::os::unix::fs::PermissionsExt;
        let tmp = tempfile::tempdir().unwrap();
        let fake = tmp.path().join("blender");
        std::fs::write(&fake, "#!/bin/sh\necho \"$@\" > \"$(dirname \"$0\")/args\"\necho 'STATUS Installed \"nkata\"'\n").unwrap();
        std::fs::set_permissions(&fake, std::fs::Permissions::from_mode(0o755)).unwrap();
        let last =
            install_blender_addon(&fake, &repo_root().join("blender-addon"), tmp.path()).unwrap();
        assert_eq!(last, "STATUS Installed \"nkata\"");
        let args = std::fs::read_to_string(tmp.path().join("args")).unwrap();
        assert!(
            args.starts_with("--command extension install-file -r user_default -e "),
            "{args}"
        );
        assert!(args.trim().ends_with("nkata-addon.zip"), "{args}");
        assert!(tmp.path().join("nkata-addon.zip").is_file());
    }

    #[cfg(unix)]
    #[test]
    fn a_failing_blender_is_an_error_with_its_last_line() {
        use std::os::unix::fs::PermissionsExt;
        let tmp = tempfile::tempdir().unwrap();
        let fake = tmp.path().join("blender");
        std::fs::write(
            &fake,
            "#!/bin/sh\necho 'Error: repository \"user_default\" not found' >&2\nexit 1\n",
        )
        .unwrap();
        std::fs::set_permissions(&fake, std::fs::Permissions::from_mode(0o755)).unwrap();
        let err = install_blender_addon(&fake, &repo_root().join("blender-addon"), tmp.path())
            .unwrap_err();
        assert!(
            err.to_string()
                .contains("repository \"user_default\" not found"),
            "{err}"
        );
    }

    #[test]
    fn uprojects_are_found_three_levels_deep_and_not_in_engine_folders() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        std::fs::create_dir_all(root.join("RisingSunUE/Plugins/Other")).unwrap();
        std::fs::write(root.join("RisingSunUE/RisingSun.uproject"), "{}").unwrap();
        std::fs::write(root.join("RisingSunUE/Plugins/Other/Other.uproject"), "{}").unwrap();
        std::fs::create_dir_all(root.join("a/b/c/d")).unwrap();
        std::fs::write(root.join("a/b/c/d/Deep.uproject"), "{}").unwrap();
        std::fs::write(root.join("Top.uproject"), "{}").unwrap();
        let found = find_uprojects(root);
        assert_eq!(
            found,
            vec![
                root.join("RisingSunUE/RisingSun.uproject"),
                root.join("Top.uproject")
            ]
        );
    }

    #[test]
    fn enabling_plugins_adds_missing_ones_turns_on_existing_ones_and_keeps_the_rest() {
        let json = r#"{"FileVersion": 3, "EngineAssociation": "5.4", "Plugins": [{"Name": "RemoteControl", "Enabled": false}, {"Name": "Water", "Enabled": true}]}"#;
        let out = enable_plugins(json, &UE_PLUGINS).unwrap();
        let doc: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(doc["EngineAssociation"], "5.4");
        let list = doc["Plugins"].as_array().unwrap();
        let on = |name: &str| {
            list.iter()
                .find(|p| p["Name"] == name)
                .map(|p| p["Enabled"] == true)
        };
        assert_eq!(on("RemoteControl"), Some(true));
        assert_eq!(on("Water"), Some(true));
        assert_eq!(on("Nkata"), Some(true));
        assert_eq!(on("PythonScriptPlugin"), Some(true));
        assert_eq!(list.len(), 4);
        assert_eq!(enable_plugins(&out, &UE_PLUGINS).unwrap(), out);
        assert!(enable_plugins("[]", &UE_PLUGINS).is_err());
    }

    #[test]
    fn an_ini_line_lands_in_its_section_once() {
        let fresh = add_ini_line("", UE_INI_SECTION, UE_INI_LINE);
        assert_eq!(
            fresh,
            "[SystemSettings]\nWebControl.EnableServerOnStartup=1\n"
        );
        let existing =
            "[/Script/Engine.Engine]\nA=1\n\n[SystemSettings]\nr.Foo=2\n\n[Other]\nB=3\n";
        let out = add_ini_line(existing, UE_INI_SECTION, UE_INI_LINE);
        assert_eq!(out, "[/Script/Engine.Engine]\nA=1\n\n[SystemSettings]\nr.Foo=2\nWebControl.EnableServerOnStartup=1\n\n[Other]\nB=3\n");
        assert_eq!(add_ini_line(&out, UE_INI_SECTION, UE_INI_LINE), out);
        let appended = add_ini_line("[Other]\nB=3\n", UE_INI_SECTION, UE_INI_LINE);
        assert_eq!(
            appended,
            "[Other]\nB=3\n\n[SystemSettings]\nWebControl.EnableServerOnStartup=1\n"
        );
    }

    #[test]
    fn the_plugin_lands_in_the_project_with_python_and_remote_control_on() {
        let tmp = tempfile::tempdir().unwrap();
        let project = tmp.path().join("RisingSunUE");
        std::fs::create_dir_all(&project).unwrap();
        let uproject = project.join("RisingSun.uproject");
        std::fs::write(
            &uproject,
            r#"{"FileVersion": 3, "EngineAssociation": "5.4"}"#,
        )
        .unwrap();
        let target = install_ue_plugin(&uproject, &repo_root().join("ue5-plugin")).unwrap();
        assert_eq!(target, project.join("Plugins/Nkata"));
        assert!(target.join("Nkata.uplugin").is_file());
        assert!(target.join("scripts/import_character.py").is_file());
        assert!(target.join("Content/Python/init_unreal.py").is_file());
        assert!(!target.join("tests").exists());
        let doc: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&uproject).unwrap()).unwrap();
        assert_eq!(doc["Plugins"].as_array().unwrap().len(), 3);
        let ini = std::fs::read_to_string(project.join("Config/DefaultEngine.ini")).unwrap();
        assert!(ini.contains("[SystemSettings]\nWebControl.EnableServerOnStartup=1"));
        // A second install replaces the folder and changes nothing else.
        install_ue_plugin(&uproject, &repo_root().join("ue5-plugin")).unwrap();
        let doc2: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&uproject).unwrap()).unwrap();
        assert_eq!(doc, doc2);
    }
}
