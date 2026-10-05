//! CLI binary for tests and headless use. The desktop window is desktop.rs on the same crate.
//! Every command prints one JSON report to stdout. Logs go to stderr as JSON lines.

use std::path::PathBuf;
use std::time::Duration;

use clap::{Parser, Subcommand};
use nkata_agent::{client, Agent, AgentConfig, AgentError};

#[derive(Parser)]
#[command(name = "nkata-agent", version, about = "Nkata local agent")]
struct Cli {
    /// Project folder.
    #[arg(long, global = true, default_value = ".")]
    folder: PathBuf,
    /// Index database path. Defaults to <folder>/.nkata-agent/index.db.
    #[arg(long, global = true)]
    index: Option<PathBuf>,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Dev-mode sign in. Prints a session token.
    Login {
        #[arg(long)]
        server: String,
        #[arg(long)]
        email: String,
    },
    /// Bind this folder to a project on a server. With --stream, bind a viewer cache instead:
    /// no folder, no index, files fetched on demand into ~/.nkata/<project>/cache.
    Init {
        #[arg(long)]
        server: String,
        #[arg(long)]
        project: String,
        #[arg(long)]
        token: String,
        #[arg(long, default_value_t = false)]
        stream: bool,
        /// Stream cache root. Defaults to ~/.nkata/<project>/cache (NKATA_HOME overrides ~/.nkata).
        #[arg(long)]
        cache: Option<PathBuf>,
        /// Stream cache cap in bytes. Default 5 GB.
        #[arg(long, default_value_t = nkata_agent::stream::DEFAULT_CAP_BYTES)]
        cap_bytes: u64,
    },
    /// Stream mode: fetch one file version into the cache and print its path.
    Fetch {
        #[arg(long)]
        file_version: String,
        #[arg(long)]
        cache: PathBuf,
        #[arg(long, default_value_t = nkata_agent::stream::DEFAULT_CAP_BYTES)]
        cap_bytes: u64,
    },
    /// Rescan the folder (or one subfolder) into the index.
    Scan {
        #[arg(long, default_value = "")]
        sub: String,
    },
    /// Upload changed files.
    Push,
    /// Download what is new on the server.
    Pull,
    /// Scan, push, pull.
    Sync,
    /// Watch the folder, push on change, pull on an interval.
    Watch {
        #[arg(long, default_value_t = 5)]
        pull_every_secs: u64,
    },
    /// Run the local API for the editors on 127.0.0.1:7420 and the mirror into UE5.
    Serve {
        #[arg(long, default_value_t = nkata_agent::api::DEFAULT_PORT)]
        port: u16,
        /// UE5 Remote Control API.
        #[arg(long, default_value = nkata_agent::ue5::DEFAULT_URL)]
        ue5_url: String,
        /// Folder with import_character.py, import_static.py, and refresh.py.
        #[arg(long, default_value = "ue5-plugin/scripts")]
        ue5_scripts: PathBuf,
        /// Token file the editors read. Defaults to <folder>/.nkata-agent/token.
        #[arg(long)]
        token_file: Option<PathBuf>,
        /// Stream mode for a viewer: serve from the cache at --cache, no index, no mirror.
        #[arg(long)]
        cache: Option<PathBuf>,
    },
}

fn init_logging() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(filter)
        .with_writer(std::io::stderr)
        .init();
}

async fn run(cli: Cli) -> Result<serde_json::Value, AgentError> {
    match cli.command {
        Command::Login { server, email } => {
            let token = client::dev_login(&server, &email).await?;
            Ok(serde_json::json!({ "token": token }))
        }
        Command::Init {
            server,
            project,
            token,
            stream: true,
            cache,
            cap_bytes,
        } => {
            let root = cache.unwrap_or_else(|| nkata_agent::stream::default_root(&project));
            let store = nkata_agent::stream::StreamCache::open(&root, cap_bytes)?;
            store.save_config(&nkata_agent::stream::StreamConfig {
                server_url: server,
                token,
                project_id: project.clone(),
            })?;
            Ok(
                serde_json::json!({ "initialised": true, "project_id": project, "cache": root, "cap_bytes": cap_bytes }),
            )
        }
        Command::Fetch {
            file_version,
            cache,
            cap_bytes,
        } => {
            let store = nkata_agent::stream::StreamCache::open(&cache, cap_bytes)?;
            let config = store.load_config()?;
            let server = nkata_agent::client::ServerClient::new(
                &config.server_url,
                &config.token,
                &config.project_id,
            )?;
            let fv = server.get_file_version(&file_version).await?;
            Ok(serde_json::to_value(store.fetch(&server, &fv).await?)?)
        }
        Command::Serve {
            port,
            ue5_url,
            ue5_scripts,
            token_file,
            cache: Some(cache),
        } => {
            let store = nkata_agent::stream::StreamCache::open(
                &cache,
                nkata_agent::stream::DEFAULT_CAP_BYTES,
            )?;
            let config = store.load_config()?;
            let server = nkata_agent::client::ServerClient::new(
                &config.server_url,
                &config.token,
                &config.project_id,
            )?;
            let (tx, rx) = tokio::sync::watch::channel(false);
            tokio::spawn(async move {
                let _ = tokio::signal::ctrl_c().await;
                let _ = tx.send(true);
            });
            let scripts_dir =
                std::fs::canonicalize(&ue5_scripts).map_err(|e| AgentError::io(&ue5_scripts, e))?;
            let addr = nkata_agent::api::serve(
                server,
                nkata_agent::api::ServeOptions {
                    folder: cache,
                    port,
                    ue5_url,
                    scripts_dir,
                    token_file,
                    mode: nkata_agent::protocol::AgentMode::Stream,
                },
                rx,
            )
            .await?;
            Ok(serde_json::json!({ "stopped": true, "addr": addr.to_string(), "mode": "stream" }))
        }
        Command::Init {
            server,
            project,
            token,
            stream: false,
            ..
        } => {
            let folder =
                std::fs::canonicalize(&cli.folder).map_err(|e| AgentError::io(&cli.folder, e))?;
            let config = AgentConfig {
                index_path: cli
                    .index
                    .unwrap_or_else(|| AgentConfig::default_index_path(&folder)),
                folder,
                server_url: server,
                token,
                project_id: project,
            };
            let agent = Agent::open(config)?;
            Ok(
                serde_json::json!({ "initialised": true, "project_id": agent.config().project_id, "index": agent.config().index_path }),
            )
        }
        other => {
            let folder =
                std::fs::canonicalize(&cli.folder).map_err(|e| AgentError::io(&cli.folder, e))?;
            let agent = Agent::open(AgentConfig::load(&folder, cli.index)?)?;
            match other {
                Command::Scan { sub } => Ok(serde_json::to_value(agent.scan(&sub)?)?),
                Command::Push => Ok(serde_json::to_value(agent.push().await?)?),
                Command::Pull => Ok(serde_json::to_value(agent.pull().await?)?),
                Command::Sync => Ok(serde_json::to_value(agent.sync().await?)?),
                Command::Watch { pull_every_secs } => {
                    let (tx, rx) = tokio::sync::watch::channel(false);
                    tokio::spawn(async move {
                        let _ = tokio::signal::ctrl_c().await;
                        let _ = tx.send(true);
                    });
                    agent
                        .watch(Duration::from_secs(pull_every_secs), rx)
                        .await?;
                    Ok(serde_json::json!({ "stopped": true }))
                }
                Command::Serve {
                    port,
                    ue5_url,
                    ue5_scripts,
                    token_file,
                    cache: None,
                } => {
                    let (tx, rx) = tokio::sync::watch::channel(false);
                    tokio::spawn(async move {
                        let _ = tokio::signal::ctrl_c().await;
                        let _ = tx.send(true);
                    });
                    let scripts_dir = std::fs::canonicalize(&ue5_scripts)
                        .map_err(|e| AgentError::io(&ue5_scripts, e))?;
                    let server = nkata_agent::client::ServerClient::new(
                        &agent.config().server_url,
                        &agent.config().token,
                        &agent.config().project_id,
                    )?;
                    let addr = nkata_agent::api::serve(
                        server,
                        nkata_agent::api::ServeOptions {
                            folder,
                            port,
                            ue5_url,
                            scripts_dir,
                            token_file,
                            mode: nkata_agent::protocol::AgentMode::Sync,
                        },
                        rx,
                    )
                    .await?;
                    Ok(serde_json::json!({ "stopped": true, "addr": addr.to_string() }))
                }
                Command::Login { .. }
                | Command::Init { .. }
                | Command::Fetch { .. }
                | Command::Serve { cache: Some(_), .. } => unreachable!("handled above"),
            }
        }
    }
}

#[tokio::main]
async fn main() {
    init_logging();
    let cli = Cli::parse();
    match run(cli).await {
        Ok(report) => println!("{report}"),
        Err(e) => {
            eprintln!("{}", serde_json::json!({ "error": e.to_string() }));
            std::process::exit(1);
        }
    }
}
