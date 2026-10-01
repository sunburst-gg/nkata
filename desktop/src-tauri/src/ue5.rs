//! UE5 Remote Control client. One call: PUT /remote/object/call on the Python script library
//! with a snippet file from ue5-plugin/scripts/ and a JSON args file. Results come back as a
//! JSON line in the Python log output, prefixed with NKATA_RESULT.
//! https://dev.epicgames.com/documentation/en-us/unreal-engine/remote-control-api-http-reference-for-unreal-engine

use std::path::Path;
use std::time::Duration;

use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::error::{AgentError, Result};

pub const DEFAULT_URL: &str = "http://127.0.0.1:30010";
pub const RESULT_PREFIX: &str = "NKATA_RESULT ";
const PYTHON_LIBRARY: &str = "/Script/PythonScriptPlugin.Default__PythonScriptLibrary";

/// What a script prints on its last line after NKATA_RESULT.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScriptResult {
    pub ok: bool,
    #[serde(default)]
    pub message: String,
    #[serde(default)]
    pub asset_path: Option<String>,
    #[serde(default)]
    pub first_import: bool,
}

#[derive(Debug)]
pub enum CallOutcome {
    Done(ScriptResult),
    /// The editor is not answering on the port. Keep the job pending.
    Unreachable(String),
}

#[derive(Serialize)]
struct CallBody<'a> {
    #[serde(rename = "objectPath")]
    object_path: &'a str,
    #[serde(rename = "functionName")]
    function_name: &'a str,
    parameters: CallParams<'a>,
    #[serde(rename = "generateTransaction")]
    generate_transaction: bool,
}

#[derive(Serialize)]
struct CallParams<'a> {
    #[serde(rename = "PythonCommand")]
    python_command: String,
    #[serde(rename = "ExecutionMode")]
    execution_mode: &'a str,
    #[serde(rename = "FileExecutionScope")]
    file_execution_scope: &'a str,
}

#[derive(Deserialize)]
struct CallResponse {
    #[serde(rename = "ReturnValue", default)]
    return_value: bool,
    #[serde(rename = "LogOutput", default)]
    log_output: Vec<LogLine>,
}

#[derive(Deserialize)]
struct LogLine {
    #[serde(rename = "Type", default)]
    kind: String,
    #[serde(rename = "Output", default)]
    output: String,
}

#[derive(Clone)]
pub struct Ue5Client {
    http: Client,
    base: String,
}

impl Ue5Client {
    pub fn new(base: &str) -> Result<Self> {
        let http = Client::builder()
            .timeout(Duration::from_secs(120))
            .connect_timeout(Duration::from_secs(2))
            .build()?;
        Ok(Self {
            http,
            base: base.trim_end_matches('/').to_string(),
        })
    }

    /// Runs `script` in the editor's Python with `args_file` as its only argument.
    pub async fn run_script(&self, script: &Path, args_file: &Path) -> Result<CallOutcome> {
        let command = format!("\"{}\" \"{}\"", script.display(), args_file.display());
        let body = CallBody {
            object_path: PYTHON_LIBRARY,
            function_name: "ExecutePythonCommandEx",
            parameters: CallParams {
                python_command: command,
                execution_mode: "ExecuteFile",
                file_execution_scope: "Private",
            },
            generate_transaction: false,
        };
        let res = match self
            .http
            .put(format!("{}/remote/object/call", self.base))
            .json(&body)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) if e.is_connect() || e.is_timeout() => {
                return Ok(CallOutcome::Unreachable(e.to_string()))
            }
            Err(e) => return Err(e.into()),
        };
        let status = res.status();
        let text = res.text().await?;
        if !status.is_success() {
            return Ok(CallOutcome::Done(ScriptResult {
                ok: false,
                message: format!("Remote Control answered {status}: {}", first_line(&text)),
                asset_path: None,
                first_import: false,
            }));
        }
        let parsed: CallResponse = serde_json::from_str(&text).map_err(|e| {
            AgentError::Config(format!(
                "bad Remote Control response: {e}: {}",
                first_line(&text)
            ))
        })?;
        Ok(CallOutcome::Done(parse_log(
            parsed.return_value,
            &parsed
                .log_output
                .iter()
                .map(|l| (l.kind.as_str(), l.output.as_str()))
                .collect::<Vec<_>>(),
        )))
    }
}

/// Finds the NKATA_RESULT line. Without one, the last Error log line is the message.
pub fn parse_log(return_value: bool, lines: &[(&str, &str)]) -> ScriptResult {
    for (_, output) in lines.iter().rev() {
        if let Some(rest) = output.trim().strip_prefix(RESULT_PREFIX) {
            if let Ok(r) = serde_json::from_str::<ScriptResult>(rest.trim()) {
                return r;
            }
        }
    }
    let last_error = lines
        .iter()
        .rev()
        .find(|(kind, _)| kind.eq_ignore_ascii_case("Error"))
        .map(|(_, out)| first_line(out).to_string());
    ScriptResult {
        ok: false,
        message: last_error.unwrap_or_else(|| {
            if return_value {
                "script printed no result".to_string()
            } else {
                "python command failed".to_string()
            }
        }),
        asset_path: None,
        first_import: false,
    }
}

fn first_line(s: &str) -> &str {
    s.lines().next().unwrap_or("").trim()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_result_line() {
        let r = parse_log(true, &[("Info", "LogPython: importing"), ("Info", "NKATA_RESULT {\"ok\": true, \"message\": \"\", \"asset_path\": \"/Game/X\", \"first_import\": true}")]);
        assert_eq!(
            r,
            ScriptResult {
                ok: true,
                message: String::new(),
                asset_path: Some("/Game/X".into()),
                first_import: true
            }
        );
    }

    #[test]
    fn falls_back_to_the_last_error_line() {
        let r = parse_log(
            false,
            &[
                ("Error", "LogPython: Traceback\n  File x"),
                ("Error", "RuntimeError: no skeleton\nmore"),
            ],
        );
        assert!(!r.ok);
        assert_eq!(r.message, "RuntimeError: no skeleton");
        assert_eq!(parse_log(true, &[]).message, "script printed no result");
    }
}
