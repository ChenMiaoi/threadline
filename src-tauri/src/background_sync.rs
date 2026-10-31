use crate::{github_auth::AuthManager, github_workspace, notification_outbox, Workspace};
use chrono::Timelike;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    sync::{Arc, Condvar, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Scope {
    pub account_id: u64,
    pub repo: String,
    pub search_days: u16,
}
impl Scope {
    fn key(&self, auth: &AuthManager) -> String {
        format!(
            "{}:{}:{}",
            auth.config.namespace(),
            self.account_id,
            self.repo
        )
    }
}
#[derive(Default)]
struct Control {
    scope: Option<Scope>,
    generation: u64,
    serial: u64,
    version: u64,
    due: Option<u64>,
    stopped: bool,
    phase: String,
    batch: Option<Value>,
    failures: u32,
    server_retry_at: u64,
    last_attempt_at: u64,
    interval_ms: u64,
    notification_error: Option<String>,
    notification_retry_at: Option<u64>,
}
#[derive(Clone, Default)]
pub struct BackgroundSync {
    inner: Arc<(Mutex<Control>, Condvar)>,
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn packet(control: &Control) -> Value {
    json!({"scope":control.scope,"serial":control.serial,"version":control.version,"state":{"phase":control.phase,"nextAttemptAt":control.due},
        "batch":control.batch,"notificationError":control.notification_error,"notificationRetryAt":control.notification_retry_at})
}
fn notice(control: &mut Control) -> Value {
    control.version += 1;
    packet(control)
}
fn emit(app: &AppHandle, control: &mut Control) {
    let _ = app.emit_to("main", "background-sync", notice(control));
}

fn preferences(app: &AppHandle) -> Result<Value, String> {
    serde_json::from_str(
        &app.state::<Workspace>()
            .database
            .lock()
            .map_err(|_| "DATABASE_LOCKED")?
            .workspace_data()
            .map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}
fn selected(app: &AppHandle) -> Result<Option<Scope>, String> {
    let session = github_workspace::cached_session(
        &app.state::<Workspace>().database,
        &app.state::<AuthManager>(),
    )?;
    let Some((account_id, repo)) = session["user"]["id"]
        .as_u64()
        .zip(session["selected"].as_str())
    else {
        return Ok(None);
    };
    let search_days = session["searchDays"].as_u64().unwrap_or(30) as u16;
    Ok(Some(Scope {
        account_id,
        repo: repo.into(),
        search_days,
    }))
}
fn interval(workspace: &Value) -> u64 {
    match workspace["preferences"]["refreshMinutes"].as_u64() {
        Some(0) => 0,
        Some(1) => 60_000,
        Some(15) => 900_000,
        _ => 300_000,
    }
}
fn retry_at(error: &str) -> u64 {
    error
        .split("retryAt=")
        .nth(1)
        .and_then(|s| s.split(|c: char| !c.is_ascii_digit()).next())
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
}
fn transient(error: &str) -> bool {
    [
        "GH_REQUEST_FAILED",
        "GH_TIMEOUT",
        "GH_RATE_LIMIT",
        "GH_RESPONSE_ERROR",
        "GH_API_ERROR",
        "GH_TASK_FAILED",
        "NOTIFICATION_QUEUE",
        "LOCAL_SYNC_STORAGE_FAILED",
    ]
    .iter()
    .any(|code| error.starts_with(code))
}
fn next_due(errors: &[String], failures: u32, time: u64, interval: u64) -> Option<u64> {
    if errors.is_empty() {
        return (interval > 0).then_some(time.saturating_add(interval));
    }
    if errors.iter().any(|e| !transient(e)) {
        return None;
    }
    let delay = (30_000u64 << failures.saturating_sub(1).min(4)).min(300_000);
    // Desynchronize clients without making the retry policy depend on the WebView clock.
    let jitter = time % (delay / 5 + 1);
    Some(
        errors
            .iter()
            .map(|e| retry_at(e))
            .max()
            .unwrap_or(0)
            .max(time.saturating_add(delay + jitter)),
    )
}
fn update_interval(control: &mut Control, period: u64, time: u64) -> bool {
    if control.interval_ms == period {
        return false;
    }
    control.interval_ms = period;
    if control.phase != "syncing" && control.last_attempt_at > 0 && control.failures == 0 {
        control.due = (period > 0).then_some(time.saturating_add(period));
        control.phase = if period > 0 { "waiting" } else { "idle" }.into();
        return true;
    }
    false
}
// Keep credential-read failures distinct from confirmed sign-out. Only the latter purges jobs.
fn update_selection(
    control: &mut Control,
    selection: Result<Option<Scope>, String>,
    time: u64,
) -> (Option<Scope>, Option<Value>) {
    match selection {
        Ok(Some(scope)) => {
            if control.scope.as_ref() != Some(&scope) {
                control.generation += 1;
                control.scope = Some(scope);
                control.batch = None;
                control.due = Some(time);
                control.phase = "waiting".into();
                control.failures = 0;
                control.server_retry_at = 0;
                control.notification_error = None;
                control.notification_retry_at = None;
                return (None, Some(notice(control)));
            }
        }
        Ok(None) => {
            if let Some(scope) = control.scope.clone() {
                control.generation += 1;
                control.serial += 1;
                control.phase = "blocked".into();
                control.batch = Some(
                    json!({"results":{"authored":{"error":"GH_AUTH_REQUIRED"}},"error":"GH_AUTH_REQUIRED","complete":false}),
                );
                let event = notice(control);
                control.scope = None;
                control.batch = None;
                control.due = None;
                return (Some(scope), Some(event));
            }
        }
        Err(error) => {
            let error = if error.starts_with("GH_") {
                error
            } else {
                "LOCAL_SYNC_STORAGE_FAILED".into()
            };
            control.serial += 1;
            control.phase = "waiting".into();
            control.due = Some(time.saturating_add(30_000));
            control.batch = Some(
                json!({"results":{"authored":{"error":error}},"error":error,"complete":false}),
            );
            return (None, Some(notice(control)));
        }
    }
    (None, None)
}
impl BackgroundSync {
    pub fn start(app: &AppHandle) {
        let service = Self::default();
        app.manage(service.clone());
        let worker = service.clone();
        let handle = app.clone();
        std::thread::spawn(move || worker.synchronize(handle));
        let handle = app.clone();
        std::thread::spawn(move || service.deliver(handle));
    }
    pub fn stop(&self) {
        if let Ok(mut control) = self.inner.0.lock() {
            control.stopped = true;
            self.inner.1.notify_all();
        }
    }
    pub fn resume(&self) {
        if let Ok(mut control) = self.inner.0.lock() {
            if control.scope.is_some()
                && control.phase != "syncing"
                && control.failures == 0
                && now().saturating_sub(control.last_attempt_at) >= 60_000
            {
                control.due = Some(now().max(control.server_retry_at));
                self.inner.1.notify_all();
            }
        }
    }
    pub fn preferences_changed(&self, app: &AppHandle) {
        if let Ok(data) = preferences(app) {
            if let Ok(mut control) = self.inner.0.lock() {
                if update_interval(&mut control, interval(&data), now()) {
                    emit(app, &mut control);
                }
            }
        }
        self.wake();
    }
    pub fn wake(&self) {
        self.inner.1.notify_all();
    }
    fn wait(&self, seconds: u64) -> bool {
        let Ok(control) = self.inner.0.lock() else {
            return false;
        };
        let Ok((control, _)) = self
            .inner
            .1
            .wait_timeout(control, Duration::from_secs(seconds))
        else {
            return false;
        };
        !control.stopped
    }
    pub fn configure(&self, app: &AppHandle, scope: Scope) -> Result<Value, String> {
        if !crate::github::valid_repo(&scope.repo)
            || !matches!(scope.search_days, 0 | 1 | 7 | 30 | 90 | 365)
        {
            return Err("INVALID_SYNC_SCOPE".into());
        }
        let current = selected(app)?.ok_or("GH_AUTH_REQUIRED")?;
        if current.account_id != scope.account_id || current.repo != scope.repo {
            return Err("GH_ACCOUNT_CHANGED".into());
        }
        let auth = app.state::<AuthManager>();
        let mut control = self.inner.0.lock().map_err(|_| "GH_TASK_FAILED")?;
        let database = app.state::<Workspace>();
        let database = database.database.lock().map_err(|_| "DATABASE_LOCKED")?;
        database.set_setting(
            &format!(
                "{}:background-range:{}",
                auth.config.namespace(),
                scope.account_id
            ),
            &scope.search_days.to_string(),
        )?;
        if control.scope.as_ref().is_some_and(|old| {
            old.account_id == scope.account_id
                && old.repo == scope.repo
                && old.search_days != scope.search_days
        }) {
            database
                .notifications()
                .reset_checkpoint(&scope.key(&auth), scope.search_days)?;
        }
        drop(database);
        if control.scope.as_ref() != Some(&scope) {
            control.generation += 1;
            control.scope = Some(scope);
            control.batch = None;
            control.notification_error = None;
            control.notification_retry_at = None;
            control.failures = 0;
            control.server_retry_at = 0;
            control.phase = "waiting".into();
            control.due = Some(now());
        } else if control.phase == "blocked" {
            control.due = Some(now());
            control.phase = "waiting".into();
        }
        self.inner.1.notify_all();
        emit(app, &mut control);
        Ok(packet(&control))
    }
    pub fn refresh(&self, app: &AppHandle, scope: Scope) -> Result<(), String> {
        let current = selected(app)?.ok_or("GH_AUTH_REQUIRED")?;
        if current.account_id != scope.account_id || current.repo != scope.repo {
            return Err("GH_ACCOUNT_CHANGED".into());
        }
        let mut control = self.inner.0.lock().map_err(|_| "GH_TASK_FAILED")?;
        if control.scope.as_ref() != Some(&scope) {
            return Err("INVALID_SYNC_SCOPE".into());
        }
        if control.phase != "syncing" {
            control.due = Some(now().max(control.server_retry_at));
            control.phase = "waiting".into();
            emit(app, &mut control);
            self.inner.1.notify_all();
        }
        Ok(())
    }
    fn synchronize(&self, app: AppHandle) {
        loop {
            let expected_generation = {
                let Ok(control) = self.inner.0.lock() else {
                    return;
                };
                if control.stopped {
                    return;
                };
                control.generation
            };
            let selection = selected(&app);
            let plan = {
                let Ok(mut control) = self.inner.0.lock() else {
                    return;
                };
                if expected_generation != control.generation {
                    continue;
                }
                let (purge, notice) = update_selection(&mut control, selection, now());
                if let Some(scope) = purge {
                    if let Ok(database) = app.state::<Workspace>().database.lock() {
                        let auth = app.state::<AuthManager>();
                        let _ = database.notifications().purge(&format!(
                            "{}:{}:",
                            auth.config.namespace(),
                            scope.account_id
                        ));
                    }
                }
                if let Some(notice) = notice {
                    let _ = app.emit_to("main", "background-sync", notice);
                }
                if control.due.is_some_and(|due| due <= now()) {
                    control.scope.clone().map(|scope| {
                        control.last_attempt_at = now();
                        control.phase = "syncing".into();
                        emit(&app, &mut control);
                        (scope, control.generation)
                    })
                } else {
                    None
                }
            };
            if let Some((scope, generation)) = plan {
                self.run_batch(&app, scope, generation);
            } else if !self.wait(10) {
                return;
            }
        }
    }
    fn run_batch(&self, app: &AppHandle, scope: Scope, generation: u64) {
        let auth = app.state::<AuthManager>();
        let workspace = app.state::<Workspace>();
        let epoch = workspace
            .database
            .lock()
            .map_err(|_| "DATABASE_LOCKED".to_string())
            .and_then(|db| github_workspace::account_epoch(&db, &auth, scope.account_id));
        let mut results = BTreeMap::new();
        let mut errors = Vec::new();
        let mut records: BTreeMap<String, Value> = BTreeMap::new();
        let mut complete = true;
        for (page, operation) in [
            ("authored", "authored"),
            ("inbox", "activity"),
            ("review", "review"),
            ("issues", "issues"),
        ] {
            if self
                .inner
                .0
                .lock()
                .map(|c| c.stopped || c.generation != generation)
                .unwrap_or(true)
            {
                return;
            }
            let result = github_workspace::request_scoped(
                &workspace.database,
                &auth,
                operation,
                &scope.repo,
                0,
                scope.account_id,
                github_workspace::RequestOptions {
                    head: "",
                    search_days: scope.search_days,
                },
            );
            match result {
                Ok(response) => {
                    if response["stale"] == true || !response["error"].is_null() {
                        errors.push(
                            response["error"]
                                .as_str()
                                .unwrap_or("GH_REQUEST_FAILED")
                                .into(),
                        );
                        complete = false;
                    }
                    if let Some(pages) = response["payload"].as_array() {
                        for page in pages {
                            if page["data"]["search"]["truncated"] == true {
                                complete = false;
                            }
                            if let Some(nodes) = page["data"]["search"]["nodes"].as_array() {
                                for record in nodes.iter().filter(|r| !r.is_null()) {
                                    let key =
                                        format!("{}:{}", record["__typename"], record["number"]);
                                    if records.get(&key).is_none_or(|old| {
                                        old["updatedAt"].as_str() <= record["updatedAt"].as_str()
                                    }) {
                                        records.insert(key, record.clone());
                                    }
                                }
                            } else {
                                errors.push("GH_RESPONSE_ERROR".into());
                                complete = false;
                            }
                        }
                    } else {
                        errors.push("GH_RESPONSE_ERROR".into());
                        complete = false;
                    }
                    results.insert(page, json!({"value":response}));
                }
                Err(error) => {
                    let error = if error.starts_with("GH_") {
                        error
                    } else {
                        "LOCAL_SYNC_STORAGE_FAILED".into()
                    };
                    complete = false;
                    errors.push(error.clone());
                    results.insert(page, json!({"error":error}));
                }
            }
            if results.len() < 4 && errors.is_empty() {
                let Ok(mut control) = self.inner.0.lock() else {
                    return;
                };
                if control.stopped || control.generation != generation {
                    return;
                }
                control.serial += 1;
                control.batch =
                    Some(json!({"results":results,"pending":true,"complete":false,"error":null}));
                emit(app, &mut control);
            }
            if errors.last().is_some_and(|e| {
                !transient(e)
                    || [
                        "GH_RATE_LIMIT",
                        "GH_TIMEOUT",
                        "GH_REQUEST_FAILED",
                        "LOCAL_SYNC_STORAGE_FAILED",
                    ]
                    .iter()
                    .any(|code| e.starts_with(code))
            }) {
                break;
            }
        }
        let Ok(mut control) = self.inner.0.lock() else {
            return;
        };
        if control.stopped || control.generation != generation {
            return;
        }
        if complete {
            let saved = preferences(app).and_then(|data| {
                let database = workspace.database.lock().map_err(|_| "DATABASE_LOCKED")?;
                github_workspace::ensure_epoch(
                    &database,
                    &auth,
                    scope.account_id,
                    epoch.map_err(|e| e.to_string())?,
                )?;
                auth.ensure_account(scope.account_id)?;
                let login = github_workspace::cached_session_user_login(
                    &database,
                    &auth,
                    scope.account_id,
                )?;
                database.notifications().observe(
                    &scope.key(&auth),
                    scope.search_days,
                    &login,
                    &records.into_values().collect::<Vec<_>>(),
                    &data,
                    now(),
                )
            });
            if let Err(error) = saved {
                let error = if error.starts_with("GH_") || error.starts_with("NOTIFICATION_QUEUE") {
                    error
                } else {
                    "NOTIFICATION_QUEUE_WRITE_FAILED".into()
                };
                if let Some(value) = results.get_mut("inbox").and_then(|p| p.get_mut("value")) {
                    value["error"] = json!(error);
                }
                errors.push(error);
            }
        }
        let delay = preferences(app).map(|p| interval(&p)).unwrap_or(300_000);
        control.interval_ms = delay;
        control.failures = if errors.is_empty() {
            0
        } else {
            control.failures.saturating_add(1)
        };
        control.server_retry_at = errors.iter().map(|e| retry_at(e)).max().unwrap_or(0);
        control.due = next_due(&errors, control.failures, now(), delay);
        control.phase = if errors.is_empty() {
            if control.due.is_some() {
                "waiting"
            } else {
                "idle"
            }
        } else if control.due.is_some() {
            "waiting"
        } else {
            "blocked"
        }
        .into();
        control.serial += 1;
        control.batch = Some(
            json!({"results":results,"error":errors.first(),"complete":complete && errors.is_empty(),"pending":false}),
        );
        emit(app, &mut control);
        self.inner.1.notify_all();
    }
    fn deliver(&self, app: AppHandle) {
        loop {
            if self.inner.0.lock().map(|c| c.stopped).unwrap_or(true) {
                return;
            }
            let generation = self.inner.0.lock().map(|c| c.generation).unwrap_or(0);
            let outcome = self.deliver_due(&app);
            let status = selected(&app).ok().flatten().and_then(|scope| {
                let auth = app.state::<AuthManager>();
                app.state::<Workspace>()
                    .database
                    .lock()
                    .ok()?
                    .notifications()
                    .status(&scope.key(&auth))
                    .ok()
                    .flatten()
            });
            if let Ok(mut control) = self.inner.0.lock() {
                if control.generation != generation {
                    continue;
                }
                let error = status
                    .as_ref()
                    .map(|s| s.0.clone())
                    .or_else(|| outcome.err());
                let retry = status.map(|s| s.1);
                if error != control.notification_error || retry != control.notification_retry_at {
                    control.notification_retry_at = retry;
                    control.notification_error = error;
                    emit(&app, &mut control);
                }
            }
            if !self.wait(10) {
                return;
            }
        }
    }
    fn deliver_due(&self, app: &AppHandle) -> Result<(), String> {
        let Some(scope) = selected(app)? else {
            return Ok(());
        };
        let auth = app.state::<AuthManager>();
        let workspace = app.state::<Workspace>();
        let data = preferences(app)?;
        let preferences = &data["preferences"];
        let minute = chrono::Local::now().hour() * 60 + chrono::Local::now().minute();
        if notification_outbox::quiet(preferences, minute) {
            return Ok(());
        };
        let database = workspace.database.lock().map_err(|_| "DATABASE_LOCKED")?;
        auth.ensure_account(scope.account_id)?;
        let due = database.notifications().due(&scope.key(&auth), now())?;
        let (eligible, ignored): (Vec<_>, Vec<_>) = due.into_iter().partition(|event| {
            notification_outbox::allowed(&data, &scope.key(&auth), event, now())
        });
        database.notifications().finish(&ignored, now(), None)?;
        if eligible.is_empty() {
            return Ok(());
        };
        database.notifications().reserve(&eligible, now())?;
        drop(database);
        let desktop = preferences["desktopNotifications"]
            .as_bool()
            .unwrap_or(false);
        let sound = preferences["notificationSoundEnabled"]
            .as_bool()
            .unwrap_or(false);
        let result = (|| {
            auth.ensure_account(scope.account_id)?;
            if selected(app)?.is_none_or(|active| {
                active.account_id != scope.account_id || active.repo != scope.repo
            }) {
                return Err("GH_ACCOUNT_CHANGED".into());
            }
            let desktop_pending = eligible
                .iter()
                .filter(|event| !event.desktop_done)
                .cloned()
                .collect::<Vec<_>>();
            if desktop && !desktop_pending.is_empty() {
                let body = notification_outbox::message(
                    &scope.repo,
                    &desktop_pending,
                    preferences["language"].as_str().unwrap_or("en"),
                );
                crate::system_notifications::send(
                    app,
                    &desktop_pending[0].id,
                    "ThreadLine",
                    &body,
                )?;
                workspace
                    .database
                    .lock()
                    .map_err(|_| "DATABASE_LOCKED")?
                    .notifications()
                    .mark_channel(&desktop_pending, true)?;
            }
            let sound_pending = eligible
                .iter()
                .filter(|event| !event.sound_done)
                .cloned()
                .collect::<Vec<_>>();
            if sound && !sound_pending.is_empty() {
                crate::notification_sound::play_background(
                    preferences["notificationSound"].as_str().unwrap_or("soft"),
                )?;
            }
            if sound {
                workspace
                    .database
                    .lock()
                    .map_err(|_| "DATABASE_LOCKED")?
                    .notifications()
                    .mark_channel(&sound_pending, false)?;
            }
            Ok::<_, String>(())
        })();
        // Acknowledgements update existing rows only; logout cannot resurrect an old job.
        workspace
            .database
            .lock()
            .map_err(|_| "DATABASE_LOCKED")?
            .notifications()
            .finish(&eligible, now(), result.as_ref().err().map(String::as_str))?;
        result
    }
}

#[tauri::command]
pub async fn background_sync_configure(scope: Scope, app: AppHandle) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<BackgroundSync>().configure(&app, scope)
    })
    .await
    .map_err(|_| "GH_TASK_FAILED")?
}
#[tauri::command]
pub async fn background_sync_refresh(scope: Scope, app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || app.state::<BackgroundSync>().refresh(&app, scope))
        .await
        .map_err(|_| "GH_TASK_FAILED")?
}

#[tauri::command]
pub async fn background_notification_retry(scope: Scope, app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let active = selected(&app)?.ok_or("GH_AUTH_REQUIRED")?;
        if active.account_id != scope.account_id || active.repo != scope.repo {
            return Err("GH_ACCOUNT_CHANGED".into());
        }
        let auth = app.state::<AuthManager>();
        app.state::<Workspace>()
            .database
            .lock()
            .map_err(|_| "DATABASE_LOCKED")?
            .notifications()
            .retry(&scope.key(&auth), now())?;
        app.state::<BackgroundSync>().wake();
        Ok(())
    })
    .await
    .map_err(|_| "GH_TASK_FAILED")?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unread_state_saves_cannot_postpone_the_background_polling_deadline() {
        let mut control = Control {
            interval_ms: 60_000,
            last_attempt_at: 1,
            due: Some(60_000),
            phase: "waiting".into(),
            ..Default::default()
        };
        for time in [10_000, 20_000, 50_000] {
            assert!(!update_interval(&mut control, 60_000, time));
            assert_eq!(control.due, Some(60_000));
        }
        assert!(update_interval(&mut control, 300_000, 20_000));
        assert_eq!(control.due, Some(320_000));
        assert!(update_interval(&mut control, 0, 30_000));
        assert!(control.due.is_none());
    }
    #[test]
    fn credential_failures_preserve_jobs_but_confirmed_logout_invalidates_private_snapshots() {
        let scope = Scope {
            account_id: 7,
            repo: "owner/repo".into(),
            search_days: 30,
        };
        let mut control = Control {
            scope: Some(scope.clone()),
            batch: Some(json!({"private":"content"})),
            ..Default::default()
        };
        let (purge, notice) = update_selection(&mut control, Err("GH_SECURE_STORAGE".into()), 1000);
        assert!(purge.is_none());
        assert_eq!(control.scope, Some(scope.clone()));
        assert_eq!(notice.unwrap()["batch"]["error"], "GH_SECURE_STORAGE");
        let (purge, notice) = update_selection(&mut control, Ok(None), 2000);
        assert_eq!(purge, Some(scope));
        assert!(control.scope.is_none());
        assert!(control.batch.is_none());
        assert_eq!(notice.unwrap()["batch"]["error"], "GH_AUTH_REQUIRED");
    }
    #[test]
    fn failed_reads_back_off_with_jitter_and_server_deadlines_take_precedence() {
        let errors = vec!["GH_TIMEOUT".into()];
        for (failure, base) in [(1, 30_000), (2, 60_000), (3, 120_000), (10, 300_000)] {
            let due = next_due(&errors, failure, 1000, 300_000).unwrap();
            assert!((base + 1000..=base * 12 / 10 + 1000).contains(&due));
        }
        assert_eq!(
            next_due(&["GH_RATE_LIMIT retryAt=900000".into()], 1, 1000, 300_000),
            Some(900_000)
        );
        assert_eq!(
            next_due(&["GH_AUTH_REQUIRED".into()], 1, 1000, 300_000),
            None
        );
        assert_eq!(next_due(&[], 0, 1000, 0), None);
        assert_eq!(next_due(&[], 0, 1000, 60_000), Some(61_000));
    }
    #[test]
    fn focus_resume_does_not_overlap_inflight_requests_or_bypass_failure_backoff() {
        let service = BackgroundSync::default();
        {
            let mut c = service.inner.0.lock().unwrap();
            c.scope = Some(Scope {
                account_id: 7,
                repo: "o/r".into(),
                search_days: 30,
            });
            c.phase = "syncing".into();
        }
        service.resume();
        assert!(service.inner.0.lock().unwrap().due.is_none());
        {
            let mut c = service.inner.0.lock().unwrap();
            c.phase = "waiting".into();
            c.failures = 1;
        }
        service.resume();
        assert!(service.inner.0.lock().unwrap().due.is_none());
        service.inner.0.lock().unwrap().failures = 0;
        service.resume();
        assert!(service.inner.0.lock().unwrap().due.is_some());
        service.stop();
        assert!(service.inner.0.lock().unwrap().stopped);
    }
}
