//! Ignore rules. Defaults from docs/engineering.md, Ignore rules, plus a `.nkataignore`
//! file in the project root with one pattern per line.
//!
//! Pattern forms: `name/` matches a directory anywhere in the tree, `*.ext` matches a
//! file extension, anything else matches a file or directory name exactly. `#` starts a comment.

use std::path::{Component, Path};

/// Agent working data inside the project folder. Never synced.
pub const AGENT_DIR: &str = ".nkata-agent";

const DEFAULT_RULES: &[&str] = &[
    "*.blend1",
    "*.blend2",
    "Saved/",
    "Intermediate/",
    "DerivedDataCache/",
    "Binaries/",
    ".git/",
    ".DS_Store",
    "Thumbs.db",
];

#[derive(Debug, Clone)]
enum Rule {
    Dir(String),
    Ext(String),
    Name(String),
}

#[derive(Debug, Clone)]
pub struct IgnoreRules {
    rules: Vec<Rule>,
}

impl Default for IgnoreRules {
    fn default() -> Self {
        Self::from_lines(DEFAULT_RULES.iter().map(|s| s.to_string()))
    }
}

impl IgnoreRules {
    pub fn from_lines(lines: impl IntoIterator<Item = String>) -> Self {
        let mut rules = vec![Rule::Dir(AGENT_DIR.to_string())];
        for line in lines {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some(dir) = line.strip_suffix('/') {
                rules.push(Rule::Dir(dir.to_string()));
            } else if let Some(ext) = line.strip_prefix("*.") {
                rules.push(Rule::Ext(ext.to_string()));
            } else {
                rules.push(Rule::Name(line.to_string()));
            }
        }
        Self { rules }
    }

    /// Defaults plus the project's `.nkataignore` when present.
    pub fn for_project(root: &Path) -> Self {
        let mut lines: Vec<String> = DEFAULT_RULES.iter().map(|s| s.to_string()).collect();
        if let Ok(text) = std::fs::read_to_string(root.join(".nkataignore")) {
            lines.extend(text.lines().map(|l| l.to_string()));
        }
        Self::from_lines(lines)
    }

    /// `rel` is relative to the project root, forward slashes.
    pub fn is_ignored(&self, rel: &Path, is_dir: bool) -> bool {
        let name = rel.file_name().and_then(|n| n.to_str()).unwrap_or_default();
        for rule in &self.rules {
            match rule {
                Rule::Dir(d) => {
                    if rel
                        .components()
                        .any(|c| matches!(c, Component::Normal(n) if n == d.as_str()))
                    {
                        return true;
                    }
                }
                Rule::Ext(e) => {
                    if !is_dir && rel.extension().and_then(|x| x.to_str()) == Some(e.as_str()) {
                        return true;
                    }
                }
                Rule::Name(n) => {
                    if name == n {
                        return true;
                    }
                }
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_cover_the_engineering_doc() {
        let r = IgnoreRules::default();
        assert!(r.is_ignored(Path::new("Ojukwu/face.blend1"), false));
        assert!(!r.is_ignored(Path::new("Ojukwu/face.blend"), false));
        assert!(r.is_ignored(Path::new("Game/Saved/x.log"), false));
        assert!(r.is_ignored(Path::new("Game/Intermediate"), true));
        assert!(r.is_ignored(Path::new(".nkata-agent/index.db"), false));
        assert!(!r.is_ignored(Path::new(".nkata/templates/Character.json"), false));
    }

    #[test]
    fn nkataignore_adds_rules() {
        let r = IgnoreRules::from_lines([
            "# comment".to_string(),
            "*.psd".to_string(),
            "renders/".to_string(),
            "notes.txt".to_string(),
        ]);
        assert!(r.is_ignored(Path::new("a/b.psd"), false));
        assert!(r.is_ignored(Path::new("x/renders/y.png"), false));
        assert!(r.is_ignored(Path::new("notes.txt"), false));
        assert!(!r.is_ignored(Path::new("other.txt"), false));
    }
}
