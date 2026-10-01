//! Local queue of writes the agent would send. Online, it drains in order. Offline, it waits.
//! See docs/engineering.md, Offline.

use rusqlite::params;
use serde::{de::DeserializeOwned, Serialize};

use crate::error::Result;
use crate::index::Index;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QueueItem {
    pub id: i64,
    pub kind: String,
    pub payload: String,
    pub attempts: i64,
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize)]
pub struct DrainReport {
    pub sent: usize,
    pub remaining: usize,
    /// Set when draining stopped on a network failure.
    pub stopped_offline: bool,
}

pub fn enqueue<T: Serialize>(index: &Index, kind: &str, payload: &T) -> Result<i64> {
    index.conn().execute(
        "insert into queue (kind, payload) values (?1, ?2)",
        params![kind, serde_json::to_string(payload)?],
    )?;
    Ok(index.conn().last_insert_rowid())
}

pub fn pending(index: &Index) -> Result<Vec<QueueItem>> {
    let mut stmt = index
        .conn()
        .prepare("select id, kind, payload, attempts from queue order by id")?;
    let rows = stmt.query_map([], |r| {
        Ok(QueueItem {
            id: r.get(0)?,
            kind: r.get(1)?,
            payload: r.get(2)?,
            attempts: r.get(3)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

pub fn decode<T: DeserializeOwned>(item: &QueueItem) -> Result<T> {
    Ok(serde_json::from_str(&item.payload)?)
}

/// Sends items in order. Stops at the first network failure and keeps the rest.
/// A non-network failure drops the item and logs it: retrying would fail the same way.
pub async fn drain<F, Fut>(index: &Index, mut send: F) -> Result<DrainReport>
where
    F: FnMut(QueueItem) -> Fut,
    Fut: std::future::Future<Output = Result<()>>,
{
    let items = pending(index)?;
    let mut report = DrainReport::default();
    for item in items {
        let id = item.id;
        let kind = item.kind.clone();
        index.conn().execute(
            "update queue set attempts = attempts + 1 where id = ?1",
            [id],
        )?;
        match send(item).await {
            Ok(()) => {
                index
                    .conn()
                    .execute("delete from queue where id = ?1", [id])?;
                report.sent += 1;
            }
            Err(e) if e.is_offline() => {
                tracing::info!(queue_id = id, kind, error = %e, "offline, queue kept");
                report.stopped_offline = true;
                break;
            }
            Err(e) => {
                tracing::error!(queue_id = id, kind, error = %e, "queue item rejected, dropped");
                index
                    .conn()
                    .execute("delete from queue where id = ?1", [id])?;
            }
        }
    }
    report.remaining = pending(index)?.len();
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::AgentError;

    #[tokio::test]
    async fn drains_in_order_and_stops_when_offline() {
        let idx = Index::open_in_memory().unwrap();
        enqueue(&idx, "a", &1).unwrap();
        enqueue(&idx, "b", &2).unwrap();
        enqueue(&idx, "c", &3).unwrap();
        let mut seen = Vec::new();
        let report = drain(&idx, |item| {
            seen.push(item.kind.clone());
            async move {
                if item.kind == "b" {
                    Err(AgentError::Server {
                        status: 503,
                        code: "down".into(),
                        message: "down".into(),
                    })
                } else {
                    Ok(())
                }
            }
        })
        .await
        .unwrap();
        assert_eq!(seen, vec!["a", "b"]);
        assert_eq!(
            report,
            DrainReport {
                sent: 1,
                remaining: 2,
                stopped_offline: true
            }
        );
        assert_eq!(
            pending(&idx)
                .unwrap()
                .iter()
                .map(|i| i.attempts)
                .collect::<Vec<_>>(),
            vec![1, 0]
        );
    }

    #[tokio::test]
    async fn drops_rejected_items() {
        let idx = Index::open_in_memory().unwrap();
        enqueue(&idx, "bad", &0).unwrap();
        enqueue(&idx, "good", &0).unwrap();
        let report = drain(&idx, |item| async move {
            if item.kind == "bad" {
                Err(AgentError::Server {
                    status: 400,
                    code: "bad_request".into(),
                    message: "no".into(),
                })
            } else {
                Ok(())
            }
        })
        .await
        .unwrap();
        assert_eq!(
            report,
            DrainReport {
                sent: 1,
                remaining: 0,
                stopped_offline: false
            }
        );
    }
}
