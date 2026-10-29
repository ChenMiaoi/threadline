use crate::{db::Database, github_auth::AuthManager};
use serde_json::{json, Value};
use std::sync::Mutex;
use std::time::Instant;

pub fn session(database: &Mutex<Database>, auth: &AuthManager) -> Result<Value, String> {
    let account_before = auth.local_account()?.ok_or("GH_AUTH_REQUIRED")?;
    let epoch = account_epoch(
        &*database.lock().map_err(|_| "DATABASE_LOCKED")?,
        auth,
        account_before,
    )?;
    let result = (|| {
        let client = auth.client()?;
        let user = client.account()?;
        client.validate_app(&auth.config.app_slug, &auth.config.client_id)?;
        client.installations()?;
        Ok::<_, String>(user)
    })();
    let user = match result {
        Ok(user) => user,
        Err(error) => {
            purge_denied(
                database,
                auth,
                auth.local_account()?.unwrap_or(0),
                None,
                &error,
            )?;
            return Err(error);
        }
    };
    let selected = database
        .lock()
        .map_err(|_| "DATABASE_LOCKED")?
        .setting(&format!(
            "{}:selected:{}",
            auth.config.namespace(),
            user["id"]
        ))?;
    let public_user = json!({"id":user["id"],"login":user["login"],"name":user["name"],"avatar_url":user["avatar_url"]});
    let value = json!({"user":public_user,"selected":selected,"notificationsAvailable":false,"installationUrl":auth.config.installation_url(),"authProvider":"github-app"});
    let account = user["id"]
        .as_u64()
        .filter(|id| *id > 0)
        .ok_or("GH_RESPONSE_ERROR")?;
    let database = database.lock().map_err(|_| "DATABASE_LOCKED")?;
    auth.ensure_account(account)?;
    ensure_epoch(&database, auth, account, epoch)?;
    database.set_setting(&session_key(auth, account), &value.to_string())?;
    Ok(value)
}

fn account_epoch(database: &Database, auth: &AuthManager, account: u64) -> Result<u64, String> {
    Ok(database
        .setting(&format!("{}:epoch:{account}", auth.config.namespace()))?
        .and_then(|raw| raw.parse().ok())
        .unwrap_or(0))
}
fn invalidate_epoch(database: &Database, auth: &AuthManager, account: u64) -> Result<(), String> {
    database.set_setting(
        &format!("{}:epoch:{account}", auth.config.namespace()),
        &account_epoch(database, auth, account)?
            .wrapping_add(1)
            .to_string(),
    )
}
fn ensure_epoch(
    database: &Database,
    auth: &AuthManager,
    account: u64,
    expected: u64,
) -> Result<(), String> {
    if account_epoch(database, auth, account)? != expected {
        return Err(
            "GH_FORBIDDEN: Cached access was invalidated; refresh authorization before retrying."
                .into(),
        );
    }
    Ok(())
}
fn pull_operation(operation: &str) -> bool {
    matches!(
        operation,
        "pull" | "detail" | "discussion" | "files" | "checks"
    )
}
fn record_epoch_key(auth: &AuthManager, account: u64, repo: &str, number: u64) -> String {
    format!(
        "{}:record-epoch:{account}:{repo}:{number}",
        auth.config.namespace()
    )
}
fn record_epoch(
    database: &Database,
    auth: &AuthManager,
    account: u64,
    repo: &str,
    number: u64,
) -> Result<u64, String> {
    Ok(database
        .setting(&record_epoch_key(auth, account, repo, number))?
        .and_then(|raw| raw.parse().ok())
        .unwrap_or(0))
}
fn invalidate_pull(
    database: &Database,
    auth: &AuthManager,
    account: u64,
    repo: &str,
    number: u64,
) -> Result<(), String> {
    database.set_setting(
        &record_epoch_key(auth, account, repo, number),
        &record_epoch(database, auth, account, repo, number)?
            .wrapping_add(1)
            .to_string(),
    )?;
    for operation in ["pull", "detail", "discussion", "files", "checks"] {
        let key = response_key(auth, operation, repo, number, account, "");
        database.remove_setting(&key)?;
        database.remove_prefix(&format!("{key}:"))?;
    }
    Ok(())
}
fn session_key(auth: &AuthManager, account: u64) -> String {
    format!("{}:session:{account}", auth.config.namespace())
}
fn response_key(
    auth: &AuthManager,
    operation: &str,
    repo: &str,
    number: u64,
    account: u64,
    head: &str,
) -> String {
    format!(
        "{}:cache:{account}:{repo}:{operation}:{number}{}",
        auth.config.namespace(),
        if head.is_empty() {
            String::new()
        } else {
            format!(":{head}")
        }
    )
}
fn read_response(database: &Database, key: &str) -> Result<Option<Value>, String> {
    let Some(raw) = database.setting(key)? else {
        return Ok(None);
    };
    let value = serde_json::from_str::<Value>(&raw).ok().filter(|value| {
        value.is_object()
            && value
                .get("payload")
                .is_some_and(|payload| !payload.is_null())
            && value["fetchedAt"].as_u64().is_some_and(|time| time > 0)
            && value["error"].is_null()
            && value["stale"] == false
    });
    if value.is_none() {
        database.remove_setting(key)?;
    }
    Ok(value.map(|value| json!({"payload":value["payload"],"fetchedAt":value["fetchedAt"],"stale":false,"error":null})))
}
pub fn cached_session(database: &Mutex<Database>, auth: &AuthManager) -> Result<Value, String> {
    let database = database.lock().map_err(|_| "DATABASE_LOCKED")?;
    let Some(account) = auth.local_account()? else {
        return Ok(Value::Null);
    };
    let key = session_key(auth, account);
    let Some(raw) = database.setting(&key)? else {
        return Ok(Value::Null);
    };
    let value = serde_json::from_str::<Value>(&raw).ok().filter(|value| {
        value["user"]["id"].as_u64() == Some(account)
            && value["user"]["login"]
                .as_str()
                .is_some_and(|login| !login.is_empty())
            && value["authProvider"] == "github-app"
            && (value["selected"].is_null()
                || value["selected"]
                    .as_str()
                    .is_some_and(crate::github::valid_repo))
    });
    auth.ensure_account(account)?;
    if value.is_none() {
        database.remove_setting(&key)?;
    }
    Ok(value.map(|value| json!({"user":{"id":value["user"]["id"],"login":value["user"]["login"],"name":value["user"]["name"],"avatar_url":value["user"]["avatar_url"]},"selected":value["selected"],"notificationsAvailable":false,"installationUrl":auth.config.installation_url(),"authProvider":"github-app"})).unwrap_or(Value::Null))
}
pub fn cached_request(
    database: &Mutex<Database>,
    auth: &AuthManager,
    operation: &str,
    repo: &str,
    number: u64,
    account: u64,
    head: &str,
) -> Result<Value, String> {
    if !(matches!(
        operation,
        "repositories"
            | "repository"
            | "activity"
            | "inbox"
            | "authored"
            | "review"
            | "issues"
            | "detail"
            | "issue"
            | "profile"
            | "pull"
            | "discussion"
            | "files"
            | "checks"
    )) || (operation != "repositories" && !crate::github::valid_repo(repo))
        || (operation == "repositories" && !repo.is_empty())
        || (!head.is_empty() && (head.len() != 40 || !head.chars().all(|c| c.is_ascii_hexdigit())))
    {
        return Ok(Value::Null);
    }
    let database = database.lock().map_err(|_| "DATABASE_LOCKED")?;
    auth.ensure_account(account)?;
    let value = read_response(
        &database,
        &response_key(auth, operation, repo, number, account, head),
    )?;
    auth.ensure_account(account)?;
    Ok(value.unwrap_or(Value::Null))
}
pub fn logout(database: &Mutex<Database>, auth: &AuthManager) -> Result<(), String> {
    let database = database.lock().map_err(|_| "DATABASE_LOCKED")?;
    let account = auth.local_account()?;
    auth.logout()?;
    if let Some(account) = account {
        purge_account(&database, auth, account)?;
    }
    Ok(())
}
fn purge_account(database: &Database, auth: &AuthManager, account: u64) -> Result<(), String> {
    invalidate_epoch(database, auth, account)?;
    database.remove_prefix(&format!(
        "{}:record-epoch:{account}:",
        auth.config.namespace()
    ))?;
    database.remove_prefix(&format!("{}:cache:{account}:", auth.config.namespace()))?;
    database.remove_setting(&session_key(auth, account))?;
    database.remove_setting(&format!("{}:selected:{account}", auth.config.namespace()))
}
fn purge_denied(
    database: &Mutex<Database>,
    auth: &AuthManager,
    account: u64,
    repo: Option<&str>,
    error: &str,
) -> Result<(), String> {
    if ![
        "GH_AUTH_REQUIRED",
        "GH_ACCOUNT_CHANGED",
        "GH_FORBIDDEN",
        "GH_NOT_FOUND",
        "GH_APP_PERMISSIONS_UNSAFE",
        "GH_APP_IDENTITY_MISMATCH",
    ]
    .iter()
    .any(|prefix| error.starts_with(prefix))
    {
        return Ok(());
    }
    let database = database.lock().map_err(|_| "DATABASE_LOCKED")?;
    if let Some(repo) =
        repo.filter(|_| error.starts_with("GH_FORBIDDEN") || error.starts_with("GH_NOT_FOUND"))
    {
        invalidate_epoch(&database, auth, account)?;
        database.remove_prefix(&format!(
            "{}:cache:{account}:{repo}:",
            auth.config.namespace()
        ))?;
        database.remove_setting(&session_key(auth, account))?;
    } else {
        purge_account(&database, auth, account)?;
    }
    Ok(())
}

#[cfg(any(test, feature = "browser-preview"))]
pub fn request(
    database: &Mutex<Database>,
    auth: &AuthManager,
    operation: &str,
    repo: &str,
    number: u64,
    account_id: u64,
) -> Result<Value, String> {
    request_at_head(database, auth, operation, repo, number, account_id, "")
}
pub fn request_at_head(
    database: &Mutex<Database>,
    auth: &AuthManager,
    operation: &str,
    repo: &str,
    number: u64,
    account_id: u64,
    head: &str,
) -> Result<Value, String> {
    let (epoch, pull_epoch) = {
        let database = database.lock().map_err(|_| "DATABASE_LOCKED")?;
        (
            account_epoch(&database, auth, account_id)?,
            if pull_operation(operation) {
                Some(record_epoch(&database, auth, account_id, repo, number)?)
            } else {
                None
            },
        )
    };
    let total = Instant::now();
    let mut stages = Vec::new();
    let client = match timed(&mut stages, "credentials", || auth.client()) {
        Ok(client) => client,
        Err(error) => {
            purge_denied(database, auth, account_id, None, &error)?;
            return Err(error);
        }
    };
    // The network path finishes all live access checks before reading collaboration data or fallback cache.
    let access = timed(&mut stages, "access", || {
        std::thread::scope(|scope| {
            let identity = scope.spawn(|| client.account());
            let app =
                scope.spawn(|| client.validate_app(&auth.config.app_slug, &auth.config.client_id));
            let repository = scope.spawn(|| {
                if operation == "repositories" {
                    Ok(())
                } else {
                    client.ensure_repository(repo)
                }
            });
            let user = identity.join().map_err(|_| "GH_TASK_FAILED")??;
            let app = app.join().map_err(|_| "GH_TASK_FAILED")?;
            let repository = repository.join().map_err(|_| "GH_TASK_FAILED")?;
            if user["id"].as_u64() != Some(account_id) {
                return Err("GH_ACCOUNT_CHANGED".into());
            }
            app?;
            repository?;
            Ok(user)
        })
    });
    let user = match access {
        Ok(user) => user,
        Err(error) => {
            purge_denied(database, auth, account_id, Some(repo), &error)?;
            return Err(error);
        }
    };
    let login = user["login"].as_str().ok_or("GH_RESPONSE_ERROR")?;
    let key = response_key(auth, operation, repo, number, account_id, head);
    let result = timed(&mut stages, "data", || {
        client.section(operation, repo, number, login, head)
    });
    // A token's remote identity is immutable. Re-read the locked credential to detect logout or
    // cross-process account replacement, without issuing a redundant second /user request.
    let database_guard = database.lock().map_err(|_| "DATABASE_LOCKED")?;
    timed(&mut stages, "sessionRecheck", || {
        auth.ensure_account(account_id)
    })?;
    let database = database_guard;
    ensure_epoch(&database, auth, account_id, epoch)?;
    if let Some(expected) = pull_epoch {
        if record_epoch(&database, auth, account_id, repo, number)? != expected {
            return Err("GH_HEAD_CHANGED: PR revision changed; refresh the overview.".into());
        }
    }
    match result {
        Ok(payload) => {
            let fetched_at = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|_| "INVALID_CLOCK")?
                .as_millis() as u64;
            let mut response =
                json!({"payload":payload,"fetchedAt":fetched_at,"stale":false,"error":null});
            timed(&mut stages, "cacheWrite", || {
                database.cache_response(&key, &response.to_string(), fetched_at)
            })?;
            response["timing"] = json!({"totalMs":total.elapsed().as_secs_f64()*1000.0,"stages":stages,"requests":client.timings()});
            Ok(response)
        }
        Err(error) => {
            if error.starts_with("GH_HEAD_CHANGED") {
                invalidate_pull(&database, auth, account_id, repo, number)?;
            } else if error.starts_with("GH_AUTH_REQUIRED")
                || error.starts_with("GH_ACCOUNT_CHANGED")
            {
                purge_account(&database, auth, account_id)?;
            } else if error.starts_with("GH_FORBIDDEN") || error.starts_with("GH_NOT_FOUND") {
                invalidate_epoch(&database, auth, account_id)?;
                database.remove_prefix(&format!(
                    "{}:cache:{account_id}:{repo}:",
                    auth.config.namespace()
                ))?;
                database.remove_setting(&session_key(auth, account_id))?;
            }
            if cache_allowed(&error) {
                if let Some(mut response) = read_response(&database, &key)? {
                    response["stale"] = true.into();
                    response["error"] = error.into();
                    return Ok(response);
                }
            }
            Err(error)
        }
    }
}
fn timed<T>(
    stages: &mut Vec<Value>,
    stage: &'static str,
    work: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    let started = Instant::now();
    let result = work();
    stages.push(json!({"stage":stage,"elapsedMs":started.elapsed().as_secs_f64()*1000.0}));
    result
}
fn cache_allowed(error: &str) -> bool {
    error.starts_with("GH_REQUEST_FAILED")
        || error.starts_with("GH_TIMEOUT")
        || error.starts_with("GH_RATE_LIMIT")
}
pub fn select(
    database: &Mutex<Database>,
    auth: &AuthManager,
    repo: &str,
    account_id: u64,
) -> Result<(), String> {
    let epoch = account_epoch(
        &*database.lock().map_err(|_| "DATABASE_LOCKED")?,
        auth,
        account_id,
    )?;
    let access = (|| {
        let client = auth.client()?;
        let user = client.account()?;
        if user["id"].as_u64() != Some(account_id) {
            return Err("GH_ACCOUNT_CHANGED".into());
        }
        client.ensure_repository(repo)
    })();
    if let Err(error) = access {
        purge_denied(database, auth, account_id, Some(repo), &error)?;
        return Err(error);
    }
    let database = database.lock().map_err(|_| "DATABASE_LOCKED")?;
    auth.ensure_account(account_id)?;
    ensure_epoch(&database, auth, account_id, epoch)?;
    database.set_setting(
        &format!("{}:selected:{account_id}", auth.config.namespace()),
        repo,
    )?;
    let key = session_key(auth, account_id);
    if let Some(raw) = database.setting(&key)? {
        if let Ok(mut value) = serde_json::from_str::<Value>(&raw) {
            value["selected"] = repo.into();
            database.set_setting(&key, &value.to_string())?;
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn authorization_failures_never_load_cache() {
        for error in [
            "GH_FORBIDDEN",
            "GH_AUTH_REQUIRED",
            "GH_NOT_FOUND",
            "GH_ACCOUNT_CHANGED",
            "GH_API_ERROR",
        ] {
            assert!(!cache_allowed(error));
        }
        for error in ["GH_REQUEST_FAILED", "GH_TIMEOUT", "GH_RATE_LIMIT"] {
            assert!(cache_allowed(error));
        }
    }
}

#[cfg(test)]
mod isolation_tests {
    use super::*;
    use crate::github_auth::{AppConfig, Clock};
    use crate::github_credentials::{tests::MemoryStore, Credential, CredentialStore};
    use crate::github_http::tests::FakeHttp;
    use std::sync::Arc;
    struct FixedClock;
    impl Clock for FixedClock {
        fn now(&self) -> u64 {
            1000
        }
    }
    fn setup() -> (Database, AuthManager, Arc<FakeHttp>, Arc<MemoryStore>) {
        let database = Database::open(std::path::Path::new(":memory:")).unwrap();
        let http = Arc::new(FakeHttp::default());
        let store = Arc::new(MemoryStore::default());
        store
            .write(&Credential {
                client_id: "Iv1.test".into(),
                access_token: "ghu_test".into(),
                refresh_token: "ghr_test".into(),
                expires_at: 9000,
                refresh_expires_at: 10000,
                user_id: 7,
            })
            .unwrap();
        let auth = AuthManager::new(
            AppConfig {
                client_id: "Iv1.test".into(),
                app_slug: "test".into(),
            },
            http.clone(),
            store.clone(),
            Arc::new(FixedClock),
        );
        (database, auth, http, store)
    }
    fn identity(http: &FakeHttp) {
        http.push_for("/user", json!({"id":7,"login":"tester"}));
    }
    fn app(http: &FakeHttp) {
        http.push_for(
            "/apps/test",
            json!({"client_id":"Iv1.test","permissions":{"metadata":"read"}}),
        );
    }
    #[test]
    fn disk_reads_are_local_even_with_expired_tokens_and_reject_corruption() {
        let (database, auth, http, store) = setup();
        let mut credential = store.read().unwrap().unwrap();
        credential.expires_at = 1;
        credential.refresh_expires_at = 1;
        store.write(&credential).unwrap();
        let key = response_key(&auth, "issue", "owner/repo", 1, 7, "");
        let database = Mutex::new(database);
        assert!(cached_session(&database, &auth).unwrap().is_null());
        assert!(
            cached_request(&database, &auth, "issue", "owner/repo", 1, 7, "")
                .unwrap()
                .is_null()
        );
        let response =
            json!({"payload":{"body":"cached"},"fetchedAt":42,"stale":false,"error":null});
        database
            .lock()
            .unwrap()
            .set_setting(&key, &response.to_string())
            .unwrap();
        assert_eq!(
            cached_request(&database, &auth, "issue", "owner/repo", 1, 7, "").unwrap(),
            response
        );
        assert!(
            cached_request(&database, &auth, "issue", "owner/other", 1, 7, "")
                .unwrap()
                .is_null()
        );
        assert!(cached_request(&database, &auth, "issue", "owner/repo", 1, 8, "").is_err());
        database.lock().unwrap().set_setting(&key, "{").unwrap();
        assert!(
            cached_request(&database, &auth, "issue", "owner/repo", 1, 7, "")
                .unwrap()
                .is_null()
        );
        assert!(database.lock().unwrap().setting(&key).unwrap().is_none());
        assert!(http.requests.lock().unwrap().is_empty());
    }
    #[test]
    fn successful_session_is_sanitized_persisted_and_logout_clears_only_account_data() {
        let (database, auth, http, _) = setup();
        http.push_for("/user", json!({"id":7,"login":"tester","token":"secret"}));
        app(&http);
        http.push_for(
            "/user/installations?per_page=100",
            json!({"installations":[]}),
        );
        database
            .save_workspace_data(r#"{"read":["issue-1"]}"#)
            .unwrap();
        let other = response_key(&auth, "issue", "owner/repo", 1, 8, "");
        database.set_setting(&other, "other-account").unwrap();
        let key = response_key(&auth, "issue", "owner/repo", 1, 7, "");
        database.set_setting(&key, "account-seven").unwrap();
        let database = Mutex::new(database);
        let state = session(&database, &auth).unwrap();
        let count = http.requests.lock().unwrap().len();
        assert_eq!(cached_session(&database, &auth).unwrap(), state);
        assert!(!state.to_string().contains("secret"));
        assert_eq!(http.requests.lock().unwrap().len(), count);
        logout(&database, &auth).unwrap();
        assert!(cached_session(&database, &auth).unwrap().is_null());
        let database = database.lock().unwrap();
        assert!(database.setting(&key).unwrap().is_none());
        assert!(database.setting(&other).unwrap().is_some());
        assert_eq!(
            database.workspace_data().unwrap(),
            r#"{"read":["issue-1"]}"#
        );
    }
    #[test]
    fn cached_session_and_responses_survive_database_reopen_and_selection_updates() {
        let (_, auth, http, _) = setup();
        let file = tempfile::NamedTempFile::new().unwrap();
        let key = response_key(&auth, "files", "owner/repo", 1, 7, &"a".repeat(40));
        let response = json!({"payload":{"files":[]},"fetchedAt":42,"stale":false,"error":null});
        {
            let database = Mutex::new(Database::open(file.path()).unwrap());
            identity(&http);
            app(&http);
            http.push_for(
                "/user/installations?per_page=100",
                json!({"installations":[]}),
            );
            session(&database, &auth).unwrap();
            identity(&http);
            http.push_for("/repos/owner/repo", json!({"private":false}));
            select(&database, &auth, "owner/repo", 7).unwrap();
            database
                .lock()
                .unwrap()
                .set_setting(&key, &response.to_string())
                .unwrap();
        }
        let count = http.requests.lock().unwrap().len();
        let database = Mutex::new(Database::open(file.path()).unwrap());
        assert_eq!(
            cached_session(&database, &auth).unwrap()["selected"],
            "owner/repo"
        );
        assert_eq!(
            cached_request(
                &database,
                &auth,
                "files",
                "owner/repo",
                1,
                7,
                &"a".repeat(40)
            )
            .unwrap(),
            response
        );
        assert!(cached_request(
            &database,
            &auth,
            "files",
            "owner/repo",
            1,
            7,
            &"b".repeat(40)
        )
        .unwrap()
        .is_null());
        assert_eq!(http.requests.lock().unwrap().len(), count);
    }
    #[test]
    fn permission_revocation_during_an_older_request_blocks_late_publication() {
        use crate::github_http::{Request, Response, Transport};
        use std::sync::Barrier;
        struct DelayedHttp {
            inner: Arc<FakeHttp>,
            entered: Arc<Barrier>,
            released: Arc<Barrier>,
        }
        impl Transport for DelayedHttp {
            fn send(&self, request: Request) -> Result<Response, String> {
                if request.url.ends_with("/issues/1") {
                    self.entered.wait();
                    self.released.wait();
                }
                self.inner.send(request)
            }
        }
        let (database, original, http, store) = setup();
        identity(&http);
        app(&http);
        http.push_for("/repos/owner/repo", json!({"private":false}));
        http.push_for("/repos/owner/repo/issues/1", json!({"body":"late"}));
        http.push_for(
            "/repos/owner/repo/issues/1/comments?per_page=100",
            json!([]),
        );
        let entered = Arc::new(Barrier::new(2));
        let released = Arc::new(Barrier::new(2));
        let auth = AuthManager::new(
            original.config,
            Arc::new(DelayedHttp {
                inner: http,
                entered: entered.clone(),
                released: released.clone(),
            }),
            store,
            Arc::new(FixedClock),
        );
        let database = Mutex::new(database);
        std::thread::scope(|scope| {
            let older = scope.spawn(|| request(&database, &auth, "issue", "owner/repo", 1, 7));
            entered.wait();
            purge_denied(&database, &auth, 7, Some("owner/repo"), "GH_FORBIDDEN").unwrap();
            released.wait();
            assert!(older
                .join()
                .unwrap()
                .unwrap_err()
                .starts_with("GH_FORBIDDEN"));
        });
        assert!(
            cached_request(&database, &auth, "issue", "owner/repo", 1, 7, "")
                .unwrap()
                .is_null()
        );
    }
    #[test]
    fn changed_head_purges_record_cache_and_blocks_older_in_flight_overview() {
        use crate::github_http::{Request, Response, Transport};
        use std::sync::Barrier;
        struct ChangingHeadHttp {
            entered: Arc<Barrier>,
            released: Arc<Barrier>,
        }
        impl Transport for ChangingHeadHttp {
            fn send(&self, request: Request) -> Result<Response, String> {
                let body = if request.url.ends_with("/user") {
                    json!({"id":7,"login":"tester"})
                } else if request.url.ends_with("/apps/test") {
                    json!({"client_id":"Iv1.test","permissions":{"metadata":"read"}})
                } else if request.url.ends_with("/repos/owner/repo") {
                    json!({"private":false})
                } else if request.url.ends_with("/graphql") {
                    let overview = request.json.as_ref().unwrap()["query"]
                        .as_str()
                        .unwrap()
                        .contains("query PullOverview");
                    if overview {
                        self.entered.wait();
                        self.released.wait();
                    }
                    json!({"data":{"repository":{"pullRequest":{"headRefOid":if overview { "a".repeat(40) } else { "b".repeat(40) },"number":1}}}})
                } else {
                    json!([])
                };
                Ok(Response {
                    status: 200,
                    body,
                    next: None,
                })
            }
        }
        let (_, original, _, store) = setup();
        let entered = Arc::new(Barrier::new(2));
        let released = Arc::new(Barrier::new(2));
        let auth = AuthManager::new(
            original.config,
            Arc::new(ChangingHeadHttp {
                entered: entered.clone(),
                released: released.clone(),
            }),
            store,
            Arc::new(FixedClock),
        );
        let file = tempfile::NamedTempFile::new().unwrap();
        let database = Mutex::new(Database::open(file.path()).unwrap());
        let response = json!({"payload":{"old":true},"fetchedAt":42,"stale":false,"error":null});
        for operation in ["pull", "detail", "discussion", "files", "checks"] {
            for head in [String::new(), "a".repeat(40)] {
                database
                    .lock()
                    .unwrap()
                    .set_setting(
                        &response_key(&auth, operation, "owner/repo", 1, 7, &head),
                        &response.to_string(),
                    )
                    .unwrap();
            }
        }
        for (operation, number) in [("pull", 2), ("pull", 10), ("authored", 0)] {
            database
                .lock()
                .unwrap()
                .set_setting(
                    &response_key(&auth, operation, "owner/repo", number, 7, ""),
                    &response.to_string(),
                )
                .unwrap();
        }
        std::thread::scope(|scope| {
            let older = scope.spawn(|| request(&database, &auth, "pull", "owner/repo", 1, 7));
            entered.wait();
            assert!(request_at_head(
                &database,
                &auth,
                "files",
                "owner/repo",
                1,
                7,
                &"a".repeat(40)
            )
            .unwrap_err()
            .starts_with("GH_HEAD_CHANGED"));
            released.wait();
            assert!(older
                .join()
                .unwrap()
                .unwrap_err()
                .starts_with("GH_HEAD_CHANGED"));
        });
        drop(database);
        let database = Mutex::new(Database::open(file.path()).unwrap());
        for operation in ["pull", "detail", "discussion", "files", "checks"] {
            for head in [String::new(), "a".repeat(40)] {
                assert!(
                    cached_request(&database, &auth, operation, "owner/repo", 1, 7, &head)
                        .unwrap()
                        .is_null()
                );
            }
        }
        for (operation, number) in [("pull", 2), ("pull", 10), ("authored", 0)] {
            assert_eq!(
                cached_request(&database, &auth, operation, "owner/repo", number, 7, "").unwrap(),
                response
            );
        }
        assert_eq!(
            account_epoch(&database.lock().unwrap(), &auth, 7).unwrap(),
            0
        );
    }
    #[test]
    fn revoked_repository_cache_is_removed_and_cannot_be_restored_locally() {
        let (database, auth, http, _) = setup();
        let key = response_key(&auth, "issue", "owner/repo", 1, 7, "");
        database
            .set_setting(
                &key,
                &json!({"payload":{},"fetchedAt":42,"stale":false,"error":null}).to_string(),
            )
            .unwrap();
        identity(&http);
        app(&http);
        http.push_for("/repos/owner/repo", json!({"private":true}));
        http.push_for(
            "/user/installations?per_page=100",
            json!({"installations":[]}),
        );
        let database = Mutex::new(database);
        assert!(request(&database, &auth, "issue", "owner/repo", 1, 7).is_err());
        assert!(
            cached_request(&database, &auth, "issue", "owner/repo", 1, 7, "")
                .unwrap()
                .is_null()
        );
    }
    #[test]
    fn access_denial_never_returns_persisted_data_and_all_checks_finish_before_data_reads() {
        let (database, auth, http, _) = setup();
        database.set_setting("github-app:Iv1.test:cache:7:owner/repo:issue:1", &json!({"payload":{"body":"private-cached-content"},"fetchedAt":1,"stale":false,"error":null}).to_string()).unwrap();
        identity(&http);
        app(&http);
        http.push_for("/repos/owner/repo", json!({"private":true}));
        http.push_for(
            "/user/installations?per_page=100",
            json!({"installations":[]}),
        );
        let error = request(&Mutex::new(database), &auth, "issue", "owner/repo", 1, 7).unwrap_err();
        assert!(error.starts_with("GH_FORBIDDEN"));
        assert!(!http
            .requests
            .lock()
            .unwrap()
            .iter()
            .any(|request| request.url.contains("/issues/1")));
    }
    #[test]
    fn local_session_recheck_detects_logout_and_account_replacement() {
        let (_, auth, _, store) = setup();
        auth.ensure_account(7).unwrap();
        let mut credential = store.read().unwrap().unwrap();
        credential.user_id = 8;
        store.write(&credential).unwrap();
        assert_eq!(auth.ensure_account(7).unwrap_err(), "GH_ACCOUNT_CHANGED");
        store.clear().unwrap();
        assert_eq!(auth.ensure_account(7).unwrap_err(), "GH_AUTH_REQUIRED");
    }
    #[test]
    fn account_changes_during_data_reads_cannot_publish_or_cache_the_previous_result() {
        use crate::github_http::{Request, Response, Transport};
        struct ReplacingHttp {
            inner: Arc<FakeHttp>,
            store: Arc<MemoryStore>,
            logout: bool,
        }
        impl Transport for ReplacingHttp {
            fn send(&self, request: Request) -> Result<Response, String> {
                if request.url.ends_with("/issues/1") {
                    if self.logout {
                        self.store.clear()?;
                    } else {
                        let mut credential = self.store.read()?.unwrap();
                        credential.user_id = 8;
                        self.store.write(&credential)?;
                    }
                }
                self.inner.send(request)
            }
        }
        for logout in [false, true] {
            let (database, original, http, store) = setup();
            identity(&http);
            app(&http);
            http.push_for("/repos/owner/repo", json!({"private":false}));
            http.push_for(
                "/repos/owner/repo/issues/1",
                json!({"body":"previous-account-content"}),
            );
            http.push_for(
                "/repos/owner/repo/issues/1/comments?per_page=100",
                json!([]),
            );
            let auth = AuthManager::new(
                original.config,
                Arc::new(ReplacingHttp {
                    inner: http.clone(),
                    store: store.clone(),
                    logout,
                }),
                store,
                Arc::new(FixedClock),
            );
            let database = Mutex::new(database);
            assert_eq!(
                request(&database, &auth, "issue", "owner/repo", 1, 7).unwrap_err(),
                if logout {
                    "GH_AUTH_REQUIRED"
                } else {
                    "GH_ACCOUNT_CHANGED"
                }
            );
            assert!(database
                .lock()
                .unwrap()
                .setting("github-app:Iv1.test:cache:7:owner/repo:issue:1")
                .unwrap()
                .is_none());
            assert_eq!(
                http.requests
                    .lock()
                    .unwrap()
                    .iter()
                    .filter(|request| request.url.ends_with("/user"))
                    .count(),
                1
            );
        }
    }
    #[test]
    fn independent_session_does_not_restore_a_shared_cli_repository() {
        let (database, auth, http, _) = setup();
        database
            .set_setting("github:selected:7", "old/private")
            .unwrap();
        identity(&http);
        app(&http);
        http.push(json!({"installations":[]}));
        let state = session(&Mutex::new(database), &auth).unwrap();
        assert!(state["selected"].is_null());
        assert_eq!(state["notificationsAvailable"], false);
        assert_eq!(state["authProvider"], "github-app");
        assert!(!state.to_string().contains("ghu_"));
    }
    #[test]
    fn network_failure_never_uses_cache_written_under_the_old_cli_identity() {
        let (database, auth, http, _) = setup();
        let old = json!({"payload":{"private":"old-shared-cli-content"},"fetchedAt":1,"stale":false,"error":null});
        database
            .set_setting("github:cache:7:owner/repo:issue:1", &old.to_string())
            .unwrap();
        identity(&http);
        app(&http);
        http.push_for("/repos/owner/repo", json!({"private":false}));
        http.responses
            .lock()
            .unwrap()
            .push_back(Err("GH_REQUEST_FAILED".into()));
        let database = Mutex::new(database);
        assert_eq!(
            request(&database, &auth, "issue", "owner/repo", 1, 7).unwrap_err(),
            "GH_REQUEST_FAILED"
        );
        let independent = json!({"payload":{"body":"app-scoped-content"},"fetchedAt":1,"stale":false,"error":null});
        database
            .lock()
            .unwrap()
            .set_setting(
                "github-app:Iv1.test:cache:7:owner/repo:issue:1",
                &independent.to_string(),
            )
            .unwrap();
        identity(&http);
        app(&http);
        http.push_for("/repos/owner/repo", json!({"private":false}));
        http.responses
            .lock()
            .unwrap()
            .push_back(Err("GH_REQUEST_FAILED".into()));
        let cached = request(&database, &auth, "issue", "owner/repo", 1, 7).unwrap();
        assert_eq!(cached["stale"], true);
        assert_eq!(cached["payload"]["body"], "app-scoped-content");
    }
}
