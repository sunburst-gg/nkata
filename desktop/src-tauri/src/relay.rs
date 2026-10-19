//! Relays server events to the editors and keeps the user present.
//!
//! The agent polls `GET /events?since=` every two seconds and pushes every new event onto the
//! SSE stream the panels read. Events this agent caused and already announced locally (its own
//! lock grants and releases, its own mirror results, its own comments) are skipped so a panel
//! never sees one action twice. See docs/engineering.md, Protocols.
//!
//! Presence: editors post `/presence` on the agent; the agent forwards at once and then repeats
//! the last part every 15 s so the user stays online while an editor is open.

use std::sync::Arc;
use std::time::Duration;

use serde_json::Value;
use tokio::sync::{broadcast, Mutex};

use crate::client::ServerClient;
use crate::ids::new_id;

pub const POLL_EVERY: Duration = Duration::from_secs(2);
pub const HEARTBEAT_EVERY: Duration = Duration::from_secs(15);

/// Kinds this agent emits itself when it acts, so the relayed copy is dropped.
const LOCAL_KINDS: &[&str] = &[
    "lock.granted",
    "lock.released",
    "mirror.result",
    "comment.created",
    "comment.resolved",
];

pub struct Relay {
    server: ServerClient,
    events: broadcast::Sender<Value>,
    me: String,
    /// The part an editor last reported, for the periodic heartbeat. None before any report.
    presence: Mutex<Option<Option<String>>>,
}

impl Relay {
    pub fn new(server: ServerClient, events: broadcast::Sender<Value>, me: String) -> Arc<Self> {
        Arc::new(Self {
            server,
            events,
            me,
            presence: Mutex::new(None),
        })
    }

    /// An editor reported where the user is. Remembered for the heartbeat.
    pub async fn set_presence(&self, part_id: Option<String>) {
        *self.presence.lock().await = Some(part_id);
    }

    fn is_own_echo(&self, event: &Value) -> bool {
        let kind = event["kind"].as_str().unwrap_or("");
        let actor = event["actor_id"].as_str().unwrap_or("");
        actor == self.me && LOCAL_KINDS.contains(&kind)
    }

    /// Polls the server from now on. Runs until the stop signal.
    pub async fn run(self: Arc<Self>, mut stop: tokio::sync::watch::Receiver<bool>) {
        // A ULID minted now sorts after every event that exists; only new events relay.
        let mut cursor = new_id();
        let mut heartbeat = tokio::time::interval(HEARTBEAT_EVERY);
        let mut poll = tokio::time::interval(POLL_EVERY);
        loop {
            tokio::select! {
                _ = stop.changed() => {
                    if *stop.borrow() { return; }
                }
                _ = poll.tick() => {
                    match self.server.events_since(&cursor).await {
                        Ok(page) => {
                            for (id, event) in page.events {
                                cursor = id;
                                if !self.is_own_echo(&event) {
                                    let _ = self.events.send(event);
                                }
                            }
                        }
                        Err(e) => tracing::debug!(error = %e, "relay: events poll failed"),
                    }
                }
                _ = heartbeat.tick() => {
                    let part = self.presence.lock().await.clone();
                    if let Some(part_id) = part {
                        if let Err(e) = self.server.presence(part_id.as_deref()).await {
                            tracing::debug!(error = %e, "relay: heartbeat failed");
                        }
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn relay() -> Arc<Relay> {
        let (events, _) = broadcast::channel(8);
        let server = ServerClient::new("http://127.0.0.1:1", "t", "p").unwrap();
        Relay::new(server, events, "ME".into())
    }

    #[test]
    fn drops_only_its_own_echoes() {
        let r = relay();
        let own = serde_json::json!({"kind": "lock.granted", "actor_id": "ME"});
        let other = serde_json::json!({"kind": "lock.granted", "actor_id": "YOU"});
        let own_review = serde_json::json!({"kind": "review.decided", "actor_id": "ME"});
        assert!(r.is_own_echo(&own));
        assert!(!r.is_own_echo(&other));
        assert!(
            !r.is_own_echo(&own_review),
            "a review is never emitted locally"
        );
    }
}
