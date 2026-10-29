use crate::{db::Database, github_auth::AuthManager};
use serde_json::{json, Value};
use std::sync::Mutex;

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

pub fn request(
    database: &Mutex<Database>,
    auth: &AuthManager,
    operation: &str,
    repo: &str,
    number: u64,
    account_id: u64,
) -> Result<Value, String> {
    let client = auth.client()?;
    let user = client.account()?;
    if user["id"].as_u64() != Some(account_id) {
        return Err("GH_ACCOUNT_CHANGED: ThreadLine 登录账号已切换，请重新检查连接。".into());
    }
    let login = user["login"].as_str().ok_or("GH_RESPONSE_ERROR")?;
    let key = format!(
        "{}:cache:{account_id}:{repo}:{operation}:{number}",
        auth.config.namespace()
    );
    client.validate_app(&auth.config.app_slug, &auth.config.client_id)?;
    if operation != "repositories" {
        client.ensure_repository(repo)?;
    }
    let result = client.request(operation, repo, number, login);
    if auth.client()?.account()?["id"].as_u64() != Some(account_id) {
        return Err("GH_ACCOUNT_CHANGED: ThreadLine 登录账号已切换，请重新检查连接。".into());
    }
    let database = database.lock().map_err(|_| "DATABASE_LOCKED")?;
    match result {
        Ok(payload) => {
            let fetched_at = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|_| "INVALID_CLOCK")?
                .as_millis() as u64;
            let response =
                json!({"payload":payload,"fetchedAt":fetched_at,"stale":false,"error":null});
            database.set_setting(&key, &response.to_string())?;
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
    fn setup() -> (Database, AuthManager, Arc<FakeHttp>) {
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
            store,
            Arc::new(FixedClock),
        );
        (database, auth, http)
    }
    fn identity(http: &FakeHttp) {
        http.push(json!({"id":7,"login":"tester"}));
    }
    fn app(http: &FakeHttp) {
        http.push(json!({"client_id":"Iv1.test","permissions":{"metadata":"read"}}));
    }
    #[test]
    fn independent_session_does_not_restore_a_shared_cli_repository() {
        let (database, auth, http) = setup();
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
        let (database, auth, http) = setup();
        let old = json!({"payload":{"private":"old-shared-cli-content"},"fetchedAt":1,"stale":false,"error":null});
        database
            .set_setting("github:cache:7:owner/repo:issue:1", &old.to_string())
            .unwrap();
        identity(&http);
        app(&http);
        http.push(json!({"private":false}));
        http.responses
            .lock()
            .unwrap()
            .push_back(Err("GH_REQUEST_FAILED".into()));
        identity(&http);
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
        http.push(json!({"private":false}));
        http.responses
            .lock()
            .unwrap()
            .push_back(Err("GH_REQUEST_FAILED".into()));
        identity(&http);
        let cached = request(&database, &auth, "issue", "owner/repo", 1, 7).unwrap();
        assert_eq!(cached["stale"], true);
        assert_eq!(cached["payload"]["body"], "app-scoped-content");
    }
}
