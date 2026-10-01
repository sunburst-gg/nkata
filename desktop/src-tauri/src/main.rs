//! CLI binary for tests and headless use. The desktop window comes in a later step.
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
    /// Bind this folder to a project on a server.
    Init {
        #[arg(long)]
        server: String,
        #[arg(long)]
        project: String,
        #[arg(long)]
        token: String,
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
        /// Folder with import_part.py and refresh.py.
        #[arg(long, default_value = "ue5-plugin/scripts")]
        ue5_scripts: PathBuf,
        /// Token file the editors read. Defaults to <folder>/.nkata-agent/token.
        #[arg(long)]
        token_file: Option<PathBuf>,
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
                        },
                        rx,
                    )
                    .await?;
                    Ok(serde_json::json!({ "stopped": true, "addr": addr.to_string() }))
                }
                Command::Login { .. } | Command::Init { .. } => unreachable!("handled above"),
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
