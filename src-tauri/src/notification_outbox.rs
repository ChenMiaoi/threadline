use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

#[derive(Clone, Serialize, Deserialize)]
struct Revision {
    signature: String,
    collaboration: String,
    external: String,
}
#[derive(Clone, Debug)]
pub struct Pending {
    pub id: String,
    pub kind: String,
    pub number: i64,
    pub change_type: String,
    pub attempts: u32,
    pub desktop_done: bool,
    pub sound_done: bool,
}
pub struct Store<'a> {
    connection: &'a Connection,
}
fn fingerprint(value: &Value) -> String {
    format!("{:x}", Sha256::digest(value.to_string().as_bytes()))
}
fn stamp(value: &Value) -> &str {
    value["updatedAt"]
        .as_str()
        .or(value["createdAt"].as_str())
        .or(value["submittedAt"].as_str())
        .unwrap_or("")
}
fn nodes(value: &Value) -> Vec<Value> {
    value["nodes"].as_array().cloned().unwrap_or_default()
}
fn revision(record: &Value, login: &str) -> (Revision, bool, String) {
    let comments = nodes(&record["comments"]);
    let reviews = nodes(&record["reviews"]);
    let latest_comment = comments.last();
    let latest_review = reviews
        .iter()
        .filter(|r| !stamp(r).is_empty())
        .max_by_key(|r| stamp(r));
    let latest = [
        record["updatedAt"].as_str().unwrap_or(""),
        latest_comment.map(stamp).unwrap_or(""),
        latest_review.map(stamp).unwrap_or(""),
        record["commits"]["nodes"][0]["commit"]["committedDate"]
            .as_str()
            .unwrap_or(""),
    ]
    .into_iter()
    .max()
    .unwrap_or("");
    let external: Vec<_> = comments
        .iter()
        .chain(&reviews)
        .filter(|r| {
            !r["author"]["login"]
                .as_str()
                .unwrap_or("")
                .eq_ignore_ascii_case(login)
        })
        .collect();
    let external_date = external.iter().map(|r| stamp(r)).max().unwrap_or("");
    let external = fingerprint(&json!(external
        .into_iter()
        .filter(|r| stamp(r) == external_date)
        .collect::<Vec<_>>()));
    let latest_event = comments
        .iter()
        .chain(&reviews)
        .filter(|r| !stamp(r).is_empty())
        .max_by_key(|r| stamp(r));
    let self_event = latest_event.is_some_and(|event| {
        event["author"]["login"]
            .as_str()
            .is_some_and(|actor| actor.eq_ignore_ascii_case(login))
            && chrono::DateTime::parse_from_rfc3339(stamp(event))
                .ok()
                .zip(
                    chrono::DateTime::parse_from_rfc3339(
                        record["updatedAt"].as_str().unwrap_or(""),
                    )
                    .ok(),
                )
                .is_some_and(|(a, b)| (a.timestamp_millis() - b.timestamp_millis()).abs() < 10_000)
    });
    let fields = json!([record["title"],record["body"],record["state"],record["isDraft"],record["headRefOid"],
        record["reviewDecision"],record["reviewRequests"],record["commits"],record["reviews"],
        {"totalCount":record["comments"]["totalCount"],"nodes":latest_comment.into_iter().collect::<Vec<_>>()}, latest]);
    let requests: Vec<_> = nodes(&record["reviewRequests"])
        .into_iter()
        .filter(|r| {
            !r["requestedReviewer"]["login"]
                .as_str()
                .unwrap_or("")
                .eq_ignore_ascii_case(login)
        })
        .collect();
    let collaboration = fingerprint(&json!([
        record["title"],
        record["body"],
        record["state"],
        record["isDraft"],
        record["headRefOid"],
        record["commits"],
        record["labels"],
        requests
    ]));
    let comment = latest_comment.is_some_and(|r| stamp(r) == latest)
        || latest_review.is_some_and(|r| stamp(r) == latest);
    let change_type = if comment {
        "comment"
    } else if record["__typename"] == "PullRequest" {
        "commit"
    } else {
        "attention"
    };
    (
        Revision {
            signature: fingerprint(&fields),
            collaboration,
            external,
        },
        self_event,
        change_type.into(),
    )
}

pub fn enabled(preferences: &Value, change_type: &str) -> bool {
    preferences[match change_type {
        "comment" => "notifyComments",
        "commit" => "notifyCommits",
        _ => "notifyAttention",
    }]
    .as_bool()
    .unwrap_or(true)
}
pub fn quiet(preferences: &Value, minute: u32) -> bool {
    let parse = |key: &str, fallback| {
        preferences[key]
            .as_str()
            .and_then(|s| s.split_once(':'))
            .and_then(|(h, m)| Some((h.parse::<u32>().ok()?, m.parse::<u32>().ok()?)))
            .filter(|(h, m)| *h < 24 && *m < 60)
            .map(|(h, m)| h * 60 + m)
            .unwrap_or(fallback)
    };
    let start = parse("quietStart", 22 * 60);
    let end = parse("quietEnd", 8 * 60);
    start != end
        && if start < end {
            minute >= start && minute < end
        } else {
            minute >= start || minute < end
        }
}
fn snoozed(workspace: &Value, scope: &str, kind: &str, number: u64, now: u64) -> bool {
    let scope = scope
        .strip_prefix("github-app:")
        .and_then(|s| s.split_once(':'))
        .map(|(_, s)| s)
        .unwrap_or(scope);
    workspace["snoozeRecords"]
        .as_object()
        .is_some_and(|records| {
            records.iter().any(|(id, r)| {
                id.starts_with(&format!("github:{scope}:"))
                    && r["kind"] == kind
                    && r["number"] == number
                    && workspace["snoozed"][id]
                        .as_u64()
                        .is_some_and(|until| until > now)
            })
        })
}
pub fn allowed(workspace: &Value, scope: &str, event: &Pending, now: u64) -> bool {
    enabled(&workspace["preferences"], &event.change_type)
        && !snoozed(workspace, scope, &event.kind, event.number as u64, now)
}
impl<'a> Store<'a> {
    pub fn new(connection: &'a Connection) -> Self {
        Self { connection }
    }
    // Baseline advancement and enqueueing commit together; failure leaves both unchanged.
    pub fn observe(
        &self,
        scope: &str,
        days: u16,
        login: &str,
        records: &[Value],
        workspace: &Value,
        now: u64,
    ) -> Result<(), String> {
        let checkpoint = format!("{scope}:days:{days}");
        let transaction = self
            .connection
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        let previous: Option<String> = transaction
            .query_row(
                "SELECT value FROM native_sync_checkpoints WHERE scope=?1",
                [&checkpoint],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let previous: Option<BTreeMap<String, Revision>> = previous
            .map(|s| serde_json::from_str(&s))
            .transpose()
            .map_err(|e| e.to_string())?;
        let mut next = BTreeMap::new();
        for record in records {
            let number = record["number"].as_u64().ok_or("GH_RESPONSE_ERROR")?;
            let kind = if record["__typename"] == "PullRequest"
                || record["url"].as_str().is_some_and(|s| s.contains("/pull/"))
            {
                "pull"
            } else {
                "issue"
            };
            let key = format!("{kind}:{number}");
            let (revision, self_event, change_type) = revision(record, login);
            let before = previous.as_ref().and_then(|p| p.get(&key));
            let changed =
                previous.is_some() && before.is_none_or(|p| p.signature != revision.signature);
            let self_only = self_event
                && before.is_none_or(|p| {
                    p.collaboration == revision.collaboration && p.external == revision.external
                });
            if changed
                && !self_only
                && (workspace["preferences"]["desktopNotifications"]
                    .as_bool()
                    .unwrap_or(false)
                    || workspace["preferences"]["notificationSoundEnabled"]
                        .as_bool()
                        .unwrap_or(false))
                && enabled(&workspace["preferences"], &change_type)
                && !snoozed(workspace, scope, kind, number, now)
            {
                let id = format!("{scope}:{kind}:{number}:{}", revision.signature);
                transaction.execute("INSERT OR IGNORE INTO notification_outbox(event_id,scope,kind,number,change_type,created_at,next_at) VALUES(?1,?2,?3,?4,?5,?6,?6)", params![id,scope,kind,number as i64,change_type,now as i64]).map_err(|e| e.to_string())?;
            }
            next.insert(key, revision);
        }
        let count: i64 = transaction
            .query_row(
                "SELECT COUNT(*) FROM notification_outbox WHERE delivered_at IS NULL",
                [],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if count > 10_000 {
            return Err("NOTIFICATION_QUEUE_FULL".into());
        }
        transaction.execute("INSERT INTO native_sync_checkpoints(scope,value,updated_at) VALUES(?1,?2,?3) ON CONFLICT(scope) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at", params![checkpoint,serde_json::to_string(&next).map_err(|e| e.to_string())?,now as i64]).map_err(|e| e.to_string())?;
        transaction.execute("DELETE FROM notification_outbox WHERE delivered_at IS NOT NULL AND delivered_at < ?1", [now.saturating_sub(30*24*60*60*1000) as i64]).map_err(|e| e.to_string())?;
        transaction.execute("DELETE FROM native_sync_checkpoints WHERE scope IN (SELECT scope FROM native_sync_checkpoints WHERE scope != ?1 ORDER BY updated_at DESC LIMIT -1 OFFSET 127)",[&checkpoint]).map_err(|e|e.to_string())?;
        transaction.execute("DELETE FROM notification_outbox WHERE event_id IN (SELECT event_id FROM notification_outbox WHERE delivered_at IS NOT NULL ORDER BY delivered_at DESC LIMIT -1 OFFSET 5000)",[]).map_err(|e|e.to_string())?;
        transaction.commit().map_err(|e| e.to_string())
    }
    pub fn due(&self, scope: &str, now: u64) -> Result<Vec<Pending>, String> {
        let mut statement = self.connection.prepare("SELECT event_id,kind,number,change_type,attempts,desktop_done,sound_done FROM notification_outbox WHERE scope=?1 AND delivered_at IS NULL AND next_at <= ?2 ORDER BY created_at,event_id LIMIT 50").map_err(|e| e.to_string())?;
        let rows = statement
            .query_map(params![scope, now as i64], |r| {
                Ok(Pending {
                    id: r.get(0)?,
                    kind: r.get(1)?,
                    number: r.get(2)?,
                    change_type: r.get(3)?,
                    attempts: r.get(4)?,
                    desktop_done: r.get(5)?,
                    sound_done: r.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }
    pub fn finish(&self, events: &[Pending], now: u64, error: Option<&str>) -> Result<(), String> {
        let transaction = self
            .connection
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        for event in events {
            let delay = (30_000u64 << event.attempts.min(4)).min(300_000);
            transaction.execute("UPDATE notification_outbox SET delivered_at=?2,next_at=?3,attempts=attempts+1,error=?4 WHERE event_id=?1", params![event.id, error.is_none().then_some(now as i64),now.saturating_add(delay) as i64,error]).map_err(|e| e.to_string())?;
        }
        transaction.commit().map_err(|e| e.to_string())
    }
    // Persist a delivery lease before any OS side effect. If storage is unavailable,
    // do not submit a popup that cannot subsequently be acknowledged.
    pub fn reserve(&self, events: &[Pending], now: u64) -> Result<(), String> {
        let transaction = self
            .connection
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        for event in events {
            transaction.execute("UPDATE notification_outbox SET next_at=?2 WHERE event_id=?1 AND delivered_at IS NULL",params![event.id,now.saturating_add(60_000) as i64]).map_err(|e|e.to_string())?;
        }
        transaction.commit().map_err(|e| e.to_string())
    }
    pub fn mark_channel(&self, events: &[Pending], desktop: bool) -> Result<(), String> {
        let transaction = self
            .connection
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        let sql = if desktop {
            "UPDATE notification_outbox SET desktop_done=1 WHERE event_id=?1"
        } else {
            "UPDATE notification_outbox SET sound_done=1 WHERE event_id=?1"
        };
        for event in events {
            transaction
                .execute(sql, [&event.id])
                .map_err(|e| e.to_string())?;
        }
        transaction.commit().map_err(|e| e.to_string())
    }
    pub fn reset_checkpoint(&self, scope: &str, days: u16) -> Result<(), String> {
        self.connection
            .execute(
                "DELETE FROM native_sync_checkpoints WHERE scope=?1",
                [format!("{scope}:days:{days}")],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn retry(&self, scope: &str, now: u64) -> Result<(), String> {
        self.connection
            .execute(
                "UPDATE notification_outbox SET next_at=?2 WHERE scope=?1 AND delivered_at IS NULL",
                params![scope, now as i64],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn status(&self, scope: &str) -> Result<Option<(String, u64)>, String> {
        self.connection.query_row("SELECT error,next_at FROM notification_outbox WHERE scope=?1 AND delivered_at IS NULL AND error IS NOT NULL ORDER BY next_at LIMIT 1",[scope],|r|Ok((r.get(0)?,r.get::<_,i64>(1)? as u64))).optional().map_err(|e|e.to_string())
    }
    pub fn purge(&self, prefix: &str) -> Result<(), String> {
        let transaction = self
            .connection
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        let child_prefix = if prefix.ends_with(':') {
            prefix.to_string()
        } else {
            format!("{prefix}:")
        };
        for table in ["notification_outbox", "native_sync_checkpoints"] {
            transaction
                .execute(
                    &format!("DELETE FROM {table} WHERE scope=?1 OR substr(scope,1,length(?2))=?2"),
                    params![prefix, child_prefix],
                )
                .map_err(|e| e.to_string())?;
        }
        transaction.commit().map_err(|e| e.to_string())
    }
}

pub fn message(repo: &str, events: &[Pending], locale: &str) -> String {
    let (single, multiple) = match locale {
        "ja" => ("に新しい更新があります", "件の PR / Issue の更新"),
        "zh-TW" | "zh-HK" => ("有新動態", "條 PR / Issue 有新動態"),
        "zh-CN" => ("有新动态", "条 PR / Issue 有新动态"),
        _ => ("has new activity", "PR / Issue updates"),
    };
    let summary = if events.len() == 1 {
        format!(
            "{} #{} {single}",
            if events[0].kind == "pull" {
                "PR"
            } else {
                "Issue"
            },
            events[0].number
        )
    } else {
        format!("{} {multiple}", events.len())
    };
    format!("{repo} · {summary}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    fn record() -> Value {
        json!({"__typename":"PullRequest","number":42,"title":"A PR","body":"body","state":"OPEN","updatedAt":"2026-10-31T04:00:00Z","headRefOid":"aaa","comments":{"totalCount":1,"nodes":[{"author":{"login":"reviewer"},"body":"hello","createdAt":"2026-10-31T04:00:00Z"}]},"reviews":{"nodes":[]},"reviewRequests":{"nodes":[]}})
    }
    fn workspace() -> Value {
        json!({"preferences":{"desktopNotifications":true,"quietStart":"00:00","quietEnd":"00:00"}})
    }
    const SCOPE: &str = "github-app:client:7:owner/repo";
    #[test]
    fn delivery_leases_survive_restart_and_failed_reservations_do_not_advance() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("app.db");
        let db = Database::open(&path).unwrap();
        let mut row = record();
        db.notifications()
            .observe(SCOPE, 30, "me", &[row.clone()], &workspace(), 100)
            .unwrap();
        row["headRefOid"] = json!("bbb");
        db.notifications()
            .observe(SCOPE, 30, "me", &[row], &workspace(), 200)
            .unwrap();
        let pending = db.notifications().due(SCOPE, 200).unwrap();
        db.notifications().connection.execute_batch("CREATE TRIGGER fail_reservation BEFORE UPDATE ON notification_outbox BEGIN SELECT RAISE(ABORT,'storage unavailable'); END;").unwrap();
        assert!(db.notifications().reserve(&pending, 200).is_err());
        assert_eq!(db.notifications().due(SCOPE, 200).unwrap().len(), 1);
        db.notifications()
            .connection
            .execute_batch("DROP TRIGGER fail_reservation;")
            .unwrap();
        db.notifications().reserve(&pending, 200).unwrap();
        drop(db);
        let db = Database::open(&path).unwrap();
        assert!(db.notifications().due(SCOPE, 60_199).unwrap().is_empty());
        assert_eq!(db.notifications().due(SCOPE, 60_200).unwrap().len(), 1);
    }
    #[test]
    fn baseline_and_pending_events_survive_restart_without_duplicate_enqueue() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("app.db");
        let db = Database::open(&path).unwrap();
        let mut row = record();
        db.notifications()
            .observe(SCOPE, 30, "me", &[row.clone()], &workspace(), 100)
            .unwrap();
        assert!(db.notifications().due(SCOPE, 100).unwrap().is_empty());
        row["headRefOid"] = json!("bbb");
        db.notifications()
            .observe(SCOPE, 30, "me", &[row.clone()], &workspace(), 200)
            .unwrap();
        drop(db);
        let db = Database::open(&path).unwrap();
        db.notifications()
            .observe(SCOPE, 30, "me", &[row], &workspace(), 300)
            .unwrap();
        let pending = db.notifications().due(SCOPE, 300).unwrap();
        assert_eq!(pending.len(), 1);
        db.notifications().finish(&pending, 300, None).unwrap();
        assert!(db.notifications().due(SCOPE, 1_000_000).unwrap().is_empty());
    }
    #[test]
    fn queue_write_failure_rolls_back_the_baseline_and_can_be_recovered() {
        let db = Database::open(std::path::Path::new(":memory:")).unwrap();
        let mut row = record();
        db.notifications()
            .observe(SCOPE, 30, "me", &[row.clone()], &workspace(), 100)
            .unwrap();
        db.notifications().connection.execute_batch("CREATE TRIGGER fail_queue BEFORE INSERT ON notification_outbox BEGIN SELECT RAISE(ABORT,'disk unavailable'); END;").unwrap();
        row["headRefOid"] = json!("bbb");
        assert!(db
            .notifications()
            .observe(SCOPE, 30, "me", &[row.clone()], &workspace(), 200)
            .is_err());
        db.notifications()
            .connection
            .execute_batch("DROP TRIGGER fail_queue;")
            .unwrap();
        db.notifications()
            .observe(SCOPE, 30, "me", &[row], &workspace(), 300)
            .unwrap();
        assert_eq!(db.notifications().due(SCOPE, 300).unwrap().len(), 1);
    }
    #[test]
    fn delivery_retries_preserve_channel_acknowledgements_and_backoff() {
        let db = Database::open(std::path::Path::new(":memory:")).unwrap();
        let mut row = record();
        db.notifications()
            .observe(SCOPE, 30, "me", &[row.clone()], &workspace(), 100)
            .unwrap();
        row["body"] = json!("changed");
        db.notifications()
            .observe(SCOPE, 30, "me", &[row], &workspace(), 200)
            .unwrap();
        let pending = db.notifications().due(SCOPE, 200).unwrap();
        db.notifications().mark_channel(&pending, true).unwrap();
        db.notifications()
            .finish(&pending, 200, Some("sound unavailable"))
            .unwrap();
        assert!(db.notifications().due(SCOPE, 30_199).unwrap().is_empty());
        let retry = db.notifications().due(SCOPE, 30_200).unwrap();
        assert_eq!(retry.len(), 1);
        assert!(retry[0].desktop_done);
        assert!(!retry[0].sound_done);
        assert_eq!(
            db.notifications().status(SCOPE).unwrap(),
            Some(("sound unavailable".into(), 30_200))
        );
        db.notifications().finish(&retry, 30_200, None).unwrap();
        assert!(db.notifications().status(SCOPE).unwrap().is_none());
    }
    #[test]
    fn self_actions_history_expansion_and_transient_merge_states_do_not_notify() {
        let db = Database::open(std::path::Path::new(":memory:")).unwrap();
        let mut row = record();
        db.notifications()
            .observe(SCOPE, 30, "me", &[row.clone()], &workspace(), 100)
            .unwrap();
        row["mergeStateStatus"] = json!("BLOCKED");
        row["comments"]["nodes"].as_array_mut().unwrap().insert(
            0,
            json!({"body":"old","author":{"login":"someone"},"createdAt":"2026-10-30T04:00:00Z"}),
        );
        db.notifications()
            .observe(SCOPE, 30, "me", &[row.clone()], &workspace(), 200)
            .unwrap();
        assert!(db.notifications().due(SCOPE, 200).unwrap().is_empty());
        row["comments"]["totalCount"] = json!(2);
        row["updatedAt"] = json!("2026-10-31T05:00:00Z");
        row["comments"]["nodes"].as_array_mut().unwrap().push(
            json!({"body":"my reply","author":{"login":"Me"},"createdAt":"2026-10-31T05:00:00Z"}),
        );
        db.notifications()
            .observe(SCOPE, 30, "me", &[row.clone()], &workspace(), 300)
            .unwrap();
        assert!(db.notifications().due(SCOPE, 300).unwrap().is_empty());
        row["headRefOid"] = json!("foreign-code");
        db.notifications()
            .observe(SCOPE, 30, "me", &[row], &workspace(), 400)
            .unwrap();
        assert_eq!(db.notifications().due(SCOPE, 400).unwrap().len(), 1);
    }
    #[test]
    fn range_changes_establish_a_silent_baseline_and_revocation_purges_only_its_scope() {
        let db = Database::open(std::path::Path::new(":memory:")).unwrap();
        let mut row = record();
        for scope in [
            SCOPE,
            "github-app:client:7:owner/repository",
            "github-app:client:8:owner/repo",
        ] {
            db.notifications()
                .observe(scope, 30, "me", &[row.clone()], &workspace(), 100)
                .unwrap();
            let mut changed = row.clone();
            changed["headRefOid"] = json!("bbb");
            db.notifications()
                .observe(scope, 30, "me", &[changed], &workspace(), 200)
                .unwrap();
        }
        row["headRefOid"] = json!("ccc");
        db.notifications()
            .observe(SCOPE, 7, "me", &[row], &workspace(), 300)
            .unwrap();
        assert_eq!(db.notifications().due(SCOPE, 300).unwrap().len(), 1);
        db.notifications().reset_checkpoint(SCOPE, 30).unwrap();
        let mut reset = record();
        reset["headRefOid"] = json!("return-to-an-old-range");
        db.notifications()
            .observe(SCOPE, 30, "me", &[reset], &workspace(), 400)
            .unwrap();
        assert_eq!(db.notifications().due(SCOPE, 400).unwrap().len(), 1);
        db.notifications().purge(SCOPE).unwrap();
        assert!(db.notifications().due(SCOPE, 300).unwrap().is_empty());
        assert_eq!(
            db.notifications()
                .due("github-app:client:7:owner/repository", 300)
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            db.notifications()
                .due("github-app:client:8:owner/repo", 300)
                .unwrap()
                .len(),
            1
        );
    }
    #[test]
    fn quiet_hours_cover_midnight_and_category_preferences_remain_independent() {
        let p = json!({"quietStart":"22:00","quietEnd":"08:00","notifyComments":false});
        assert!(quiet(&p, 23 * 60));
        assert!(quiet(&p, 7 * 60));
        assert!(!quiet(&p, 12 * 60));
        assert!(!enabled(&p, "comment"));
        assert!(enabled(&p, "commit"));
    }
}
