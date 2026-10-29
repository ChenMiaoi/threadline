use crate::{db::Database, github_auth::AuthManager};
use serde_json::{json, Value};
use std::sync::Mutex;
use std::time::Instant;

pub fn session(database: &Mutex<Database>, auth: &AuthManager) -> Result<Value, String> {
    let client = auth.client()?;
    let user = client.account()?;
    client.validate_app(&auth.config.app_slug, &auth.config.client_id)?;
    let selected = database
        .lock()
        .map_err(|_| "DATABASE_LOCKED")?
        .setting(&format!(
            "{}:selected:{}",
            auth.config.namespace(),
            user["id"]
        ))?;
    client.installations()?;
    let public_user = json!({"id":user["id"],"login":user["login"],"name":user["name"]});
    Ok(
        json!({"user":public_user,"selected":selected,"notificationsAvailable":false,"installationUrl":auth.config.installation_url(),"authProvider":"github-app"}),
    )
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
    let total = Instant::now();
    let mut stages = Vec::new();
    let client = timed(&mut stages, "credentials", || auth.client())?;
    // All live access checks finish before any collaboration data or persisted cache is read.
    let user = timed(&mut stages, "access", || {
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
    })?;
    let login = user["login"].as_str().ok_or("GH_RESPONSE_ERROR")?;
    let key = format!(
        "{}:cache:{account_id}:{repo}:{operation}:{number}{}",
        auth.config.namespace(),
        if head.is_empty() {
            String::new()
        } else {
            format!(":{head}")
        }
    );
    let result = timed(&mut stages, "data", || {
        client.section(operation, repo, number, login, head)
    });
    // A token's remote identity is immutable. Re-read the locked credential to detect logout or
    // cross-process account replacement, without issuing a redundant second /user request.
    timed(&mut stages, "sessionRecheck", || {
        auth.ensure_account(account_id)
    })?;
    let database = database.lock().map_err(|_| "DATABASE_LOCKED")?;
    match result {
        Ok(payload) => {
            let fetched_at = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|_| "INVALID_CLOCK")?
                .as_millis() as u64;
            let mut response =
                json!({"payload":payload,"fetchedAt":fetched_at,"stale":false,"error":null});
            timed(&mut stages, "cacheWrite", || {
                database.set_setting(&key, &response.to_string())
            })?;
            response["timing"] = json!({"totalMs":total.elapsed().as_secs_f64()*1000.0,"stages":stages,"requests":client.timings()});
            Ok(response)
        }
        Err(error) => {
            if cache_allowed(&error) {
                if let Some(cached) = database.setting(&key)? {
                    let mut response: Value =
                        serde_json::from_str(&cached).map_err(|_| "CACHE_INVALID")?;
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
    let client = auth.client()?;
    let user = client.account()?;
    if user["id"].as_u64() != Some(account_id) {
        return Err("GH_ACCOUNT_CHANGED".into());
    }
    client.ensure_repository(repo)?;
    if auth.client()?.account()?["id"].as_u64() != Some(account_id) {
        return Err("GH_ACCOUNT_CHANGED".into());
    }
    database.lock().map_err(|_| "DATABASE_LOCKED")?.set_setting(
        &format!("{}:selected:{account_id}", auth.config.namespace()),
        repo,
    )
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
