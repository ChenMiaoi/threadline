use crate::github::Client;
use crate::github_credentials::{Credential, CredentialGuard, CredentialStore, VaultStore};
use crate::github_http::{Https, Request, Transport, DEVICE, TOKEN};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};

const VERIFY_URL: &str = "https://github.com/login/device";
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub client_id: String,
    pub app_slug: String,
}
impl AppConfig {
    pub fn load() -> Self {
        let mut config: Self = serde_json::from_str(include_str!("../github-app.json"))
            .expect("valid public GitHub App configuration");
        if let Ok(client) = std::env::var("THREADLINE_GITHUB_CLIENT_ID") {
            config.client_id = client;
        }
        if let Ok(slug) = std::env::var("THREADLINE_GITHUB_APP_SLUG") {
            config.app_slug = slug;
        }
        config
    }
    fn validate(&self) -> Result<(), String> {
        if !self.client_id.starts_with("Iv")
            || self.client_id.len() > 128
            || !self
                .client_id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '.')
            || self.app_slug.is_empty()
            || self.app_slug.len() > 100
            || !self
                .app_slug
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-')
        {
            return Err(
                "GH_APP_NOT_CONFIGURED: 请先注册并配置 ThreadLine 独立 GitHub App。".into(),
            );
        }
        Ok(())
    }
    pub fn namespace(&self) -> String {
        format!("github-app:{}", self.client_id)
    }
    pub fn installation_url(&self) -> String {
        format!(
            "https://github.com/apps/{}/installations/new",
            self.app_slug
        )
    }
}
pub trait Clock: Send + Sync {
    fn now(&self) -> u64;
}
struct SystemClock;
impl Clock for SystemClock {
    fn now(&self) -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }
}
struct Pending {
    device_code: String,
    user_code: String,
    expires_at: u64,
    next_poll: u64,
    interval: u64,
    in_flight: bool,
}
enum PollResult {
    Pending { slow: bool, interval: u64 },
    Authorized(Credential),
}
struct State {
    generation: u64,
    status: &'static str,
    error: Option<String>,
    pending: Option<Pending>,
}
impl Default for State {
    fn default() -> Self {
        Self {
            generation: 0,
            status: "idle",
            error: None,
            pending: None,
        }
    }
}
pub struct AuthManager {
    pub config: AppConfig,
    http: Arc<dyn Transport>,
    store: Arc<dyn CredentialStore>,
    clock: Arc<dyn Clock>,
    state: Mutex<State>,
    // Serialize encrypted vault access and rotating refresh-token use.
    credential_lock: Mutex<()>,
}
impl Default for AuthManager {
    fn default() -> Self {
        let config = AppConfig::load();
        let store = Arc::new(VaultStore::new(config.client_id.clone()));
        Self::new(
            config,
            Arc::new(Https::default()),
            store,
            Arc::new(SystemClock),
        )
    }
}
fn snapshot(state: &State) -> Value {
    json!({"status":state.status, "code":state.pending.as_ref().map(|p| &p.user_code),
        "verificationUrl":state.pending.as_ref().map(|_| VERIFY_URL), "error":state.error})
}
fn fail(state: &mut State, error: String) {
    state.status = "error";
    state.error = Some(error);
    state.pending = None;
}
impl AuthManager {
    fn credential_guard(
        &self,
    ) -> Result<(std::sync::MutexGuard<'_, ()>, Box<dyn CredentialGuard>), String> {
        let local = self
            .credential_lock
            .lock()
            .map_err(|_| "GH_SECURE_STORAGE")?;
        let process = self.store.lock()?;
        Ok((local, process))
    }
    pub fn new(
        config: AppConfig,
        http: Arc<dyn Transport>,
        store: Arc<dyn CredentialStore>,
        clock: Arc<dyn Clock>,
    ) -> Self {
        Self {
            config,
            http,
            store,
            clock,
            state: Mutex::new(State::default()),
            credential_lock: Mutex::new(()),
        }
    }
    pub fn start(&self) -> Value {
        let generation = {
            let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            if state.pending.is_some() || state.status == "starting" {
                return snapshot(&state);
            }
            state.generation += 1;
            state.status = "starting";
            state.error = None;
            state.generation
        };
        let result = self.config.validate().and_then(|_| {
            let response = self.http.send(Request::oauth(
                DEVICE,
                &[
                    ("client_id", &self.config.client_id),
                    ("scope", "offline_access"),
                ],
            ))?;
            if response.status != 200 {
                return Err(
                    "GH_LOGIN_FAILED: 无法获取 ThreadLine 授权码，请检查应用配置和网络。".into(),
                );
            }
            let body = response.body;
            if body.get("error").is_some() {
                return Err(oauth_error(&body));
            }
            let user_code = body["user_code"]
                .as_str()
                .filter(|code| {
                    code.len() == 9
                        && code.as_bytes()[4] == b'-'
                        && code
                            .chars()
                            .all(|c| c == '-' || c.is_ascii_uppercase() || c.is_ascii_digit())
                })
                .ok_or("GH_RESPONSE_ERROR")?;
            let device = body["device_code"]
                .as_str()
                .filter(|code| !code.is_empty())
                .ok_or("GH_RESPONSE_ERROR")?;
            if body["verification_uri"].as_str() != Some(VERIFY_URL) {
                return Err("GH_RESPONSE_ERROR".into());
            }
            let expires = body["expires_in"]
                .as_u64()
                .filter(|e| *e > 0 && *e <= 900)
                .ok_or("GH_RESPONSE_ERROR")?;
            let interval = body["interval"].as_u64().unwrap_or(5).max(5);
            Ok(Pending {
                device_code: device.into(),
                user_code: user_code.into(),
                expires_at: self.clock.now().saturating_add(expires),
                next_poll: self.clock.now().saturating_add(interval),
                interval,
                in_flight: false,
            })
        });
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if state.generation == generation {
            match result {
                Ok(pending) => {
                    state.pending = Some(pending);
                    state.status = "waiting";
                }
                Err(error) => fail(&mut state, error),
            }
        }
        snapshot(&state)
    }
    pub fn status(&self) -> Value {
        let (generation, device_code) = {
            let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            let generation = state.generation;
            let Some(pending) = state.pending.as_mut() else {
                return snapshot(&state);
            };
            if self.clock.now() >= pending.expires_at {
                fail(
                    &mut state,
                    "GH_LOGIN_TIMEOUT: 登录验证码已过期，请重试。".into(),
                );
                return snapshot(&state);
            }
            if pending.in_flight || self.clock.now() < pending.next_poll {
                return snapshot(&state);
            }
            pending.in_flight = true;
            (generation, pending.device_code.clone())
        };
        let mut result = self
            .http
            .send(Request::oauth(
                TOKEN,
                &[
                    ("client_id", &self.config.client_id),
                    ("device_code", &device_code),
                    ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                ],
            ))
            .and_then(|response| {
                if response.status != 200 {
                    return Err("GH_LOGIN_FAILED: 无法完成 GitHub 授权，请重试。".into());
                }
                if response.body["error"] == "authorization_pending"
                    || response.body["error"] == "slow_down"
                {
                    Ok(PollResult::Pending {
                        slow: response.body["error"] == "slow_down",
                        interval: response.body["interval"].as_u64().unwrap_or(0),
                    })
                } else {
                    self.accept_token(response.body).map(PollResult::Authorized)
                }
            });
        let _credential_guard = if matches!(result, Ok(PollResult::Authorized(_))) {
            match self.credential_guard() {
                Ok(guard) => Some(guard),
                Err(error) => {
                    result = Err(error);
                    None
                }
            }
        } else {
            None
        };
        // Cancellation invalidates both in-flight authorization and credential persistence.
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if state.generation != generation {
            return snapshot(&state);
        }
        match result {
            Ok(PollResult::Pending { slow, interval }) => {
                if let Some(pending) = state.pending.as_mut() {
                    if slow {
                        pending.interval = pending.interval.saturating_add(5).max(interval);
                    }
                    pending.next_poll = self.clock.now().saturating_add(pending.interval);
                    pending.in_flight = false;
                }
            }
            Ok(PollResult::Authorized(credential)) => match self.store.write(&credential) {
                Ok(()) => {
                    state.pending = None;
                    state.status = "complete";
                }
                Err(error) => fail(&mut state, error),
            },
            Err(error) => fail(&mut state, error),
        }
        snapshot(&state)
    }
    fn accept_token(&self, body: Value) -> Result<Credential, String> {
        let mut credential = self.parse_token(&body)?;
        credential.user_id = self.validate_token(&credential)?;
        Ok(credential)
    }
    fn parse_token(&self, body: &Value) -> Result<Credential, String> {
        if body.get("error").is_some() {
            return Err(oauth_error(body));
        }
        let access = body["access_token"]
            .as_str()
            .filter(|s| s.starts_with("ghu_"))
            .ok_or("GH_TOKEN_REJECTED: 仅接受 ThreadLine GitHub App 用户令牌。")?;
        let refresh = body["refresh_token"]
            .as_str()
            .filter(|s| s.starts_with("ghr_"))
            .ok_or("GH_TOKEN_REJECTED: 独立授权必须启用短期令牌。")?;
        if body["scope"].as_str() != Some("") || body["token_type"].as_str() != Some("bearer") {
            return Err("GH_TOKEN_REJECTED: 独立授权不接受 OAuth 宽泛权限。".into());
        }
        let expires = body["expires_in"]
            .as_u64()
            .filter(|e| *e > 0 && *e <= 28800)
            .ok_or("GH_TOKEN_REJECTED")?;
        let refresh_expires = body["refresh_token_expires_in"]
            .as_u64()
            .filter(|e| *e > 0 && *e <= 15897600)
            .ok_or("GH_TOKEN_REJECTED")?;
        Ok(Credential {
            client_id: self.config.client_id.clone(),
            access_token: access.into(),
            refresh_token: refresh.into(),
            expires_at: self.clock.now().saturating_add(expires),
            refresh_expires_at: self.clock.now().saturating_add(refresh_expires),
            user_id: 0,
        })
    }
    fn validate_token(&self, credential: &Credential) -> Result<u64, String> {
        let client = Client::new(self.http.clone(), credential.access_token.clone());
        let user = client.account()?;
        client.validate_app(&self.config.app_slug, &self.config.client_id)?;
        client.installations()?; // Refuse installations carrying write/admin or unexpected permissions.
        user["id"]
            .as_u64()
            .filter(|id| *id > 0)
            .ok_or("GH_RESPONSE_ERROR".into())
    }
    pub fn local_account(&self) -> Result<Option<u64>, String> {
        let _guard = self.credential_guard()?;
        Ok(self
            .store
            .read()?
            .filter(|credential| {
                credential.client_id == self.config.client_id
                    && credential.access_token.starts_with("ghu_")
                    && credential.refresh_token.starts_with("ghr_")
                    && credential.user_id > 0
            })
            .map(|credential| credential.user_id))
    }
    pub fn ensure_account(&self, expected: u64) -> Result<(), String> {
        let _guard = self.credential_guard()?;
        let credential = self.store.read()?.ok_or("GH_AUTH_REQUIRED")?;
        if credential.client_id != self.config.client_id || credential.user_id != expected {
            return Err("GH_ACCOUNT_CHANGED".into());
        }
        Ok(())
    }
    pub fn client(&self) -> Result<Client, String> {
        self.config.validate()?;
        let _guard = self.credential_guard()?;
        let mut credential = self
            .store
            .read()?
            .ok_or("GH_AUTH_REQUIRED: 请使用 ThreadLine 独立授权登录 GitHub。")?;
        if credential.client_id != self.config.client_id
            || !credential.access_token.starts_with("ghu_")
            || !credential.refresh_token.starts_with("ghr_")
        {
            return Err("GH_AUTH_REQUIRED: 凭据与 ThreadLine 独立应用不匹配，请重新登录。".into());
        }
        if self.clock.now().saturating_add(60) >= credential.expires_at {
            if self.clock.now() >= credential.refresh_expires_at {
                return Err("GH_AUTH_REQUIRED: ThreadLine 授权已过期，请重新登录。".into());
            }
            let response = self.http.send(Request::oauth(
                TOKEN,
                &[
                    ("client_id", &self.config.client_id),
                    ("refresh_token", &credential.refresh_token),
                    ("grant_type", "refresh_token"),
                ],
            ))?;
            if response.status != 200 {
                return Err(match response.status {
                    401 => "GH_AUTH_REQUIRED: ThreadLine 授权已失效，请重新登录。".into(),
                    429 => "GH_RATE_LIMIT: GitHub 请求额度已耗尽，请稍后重试。".into(),
                    500..=599 => format!(
                        "GH_REQUEST_FAILED: 无法更新 ThreadLine 授权 (HTTP {})，请稍后重试。",
                        response.status
                    ),
                    _ => oauth_error(&response.body),
                });
            }
            let mut updated = self.parse_token(&response.body)?;
            match self.validate_token(&updated) {
                Ok(account) if account == credential.user_id => updated.user_id = account,
                Ok(_) => {
                    return Err("GH_ACCOUNT_CHANGED: 刷新授权返回了不同账号，请重新登录。".into())
                }
                Err(error) => {
                    if [
                        "GH_REQUEST_FAILED",
                        "GH_TIMEOUT",
                        "GH_RATE_LIMIT",
                        "GH_RESPONSE_ERROR",
                    ]
                    .iter()
                    .any(|prefix| error.starts_with(prefix))
                    {
                        // Rotation has already succeeded: replaying the old refresh token after
                        // a failed identity read can lose the login. Preserve the new secrets
                        // under the original account; workspace reads still revalidate live access.
                        updated.user_id = credential.user_id;
                        self.store.write(&updated)?;
                    }
                    return Err(error);
                }
            }
            self.store.write(&updated)?;
            credential = updated;
        }
        Ok(Client::new(self.http.clone(), credential.access_token))
    }
    pub fn cancel(&self) -> Value {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        state.generation += 1;
        state.pending = None;
        state.status = "cancelled";
        state.error = None;
        snapshot(&state)
    }
    pub fn logout(&self) -> Result<(), String> {
        self.cancel();
        let _guard = self.credential_guard()?;
        self.store.clear()
    }
}
fn oauth_error(body: &Value) -> String {
    match body["error"].as_str() {
        Some("access_denied") => "GH_LOGIN_DENIED: 你已取消 GitHub 授权。",
        Some("expired_token") | Some("token_expired") => {
            "GH_LOGIN_TIMEOUT: 登录验证码已过期，请重试。"
        }
        Some("device_flow_disabled") | Some("incorrect_client_credentials") => {
            "GH_APP_NOT_CONFIGURED: 请确认 ThreadLine GitHub App 已启用设备授权。"
        }
        Some("bad_refresh_token") => "GH_AUTH_REQUIRED: ThreadLine 授权已失效，请重新登录。",
        _ => "GH_LOGIN_FAILED: GitHub 授权未完成，请重试。",
    }
    .into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::github_credentials::tests::MemoryStore;
    use crate::github_http::tests::FakeHttp;
    use crate::github_http::Response;
    use std::sync::atomic::{AtomicU64, Ordering};

    struct TestClock(AtomicU64);
    impl Clock for TestClock {
        fn now(&self) -> u64 {
            self.0.load(Ordering::SeqCst)
        }
    }
    impl TestClock {
        fn advance(&self, seconds: u64) {
            self.0.fetch_add(seconds, Ordering::SeqCst);
        }
    }
    fn config() -> AppConfig {
        AppConfig {
            client_id: "Iv1.threadlinetest".into(),
            app_slug: "threadline-test".into(),
        }
    }
    fn device() -> Value {
        json!({"device_code":"private-device-secret","user_code":"ABCD-1234","verification_uri":VERIFY_URL,"expires_in":900,"interval":5})
    }
    fn token() -> Value {
        json!({"access_token":"ghu_private-test-access","refresh_token":"ghr_private-test-refresh","expires_in":28800,"refresh_token_expires_in":15897600,"scope":"","token_type":"bearer"})
    }
    fn app() -> Value {
        json!({"client_id":config().client_id,"permissions":{"metadata":"read","contents":"read","issues":"read","pull_requests":"read","checks":"read","statuses":"read"}})
    }
    fn setup() -> (
        Arc<AuthManager>,
        Arc<FakeHttp>,
        Arc<MemoryStore>,
        Arc<TestClock>,
    ) {
        let http = Arc::new(FakeHttp::default());
        let store = Arc::new(MemoryStore::default());
        let clock = Arc::new(TestClock(AtomicU64::new(1000)));
        (
            Arc::new(AuthManager::new(
                config(),
                http.clone(),
                store.clone(),
                clock.clone(),
            )),
            http,
            store,
            clock,
        )
    }
    fn queue_identity(http: &FakeHttp) {
        http.push(json!({"id":7,"login":"tester"}));
        http.push(app());
        http.push(json!({"installations":[]}));
    }
    fn authorize(auth: &AuthManager, http: &FakeHttp, clock: &TestClock) -> Value {
        http.push(device());
        assert_eq!(auth.start()["status"], "waiting");
        clock.advance(5);
        http.push(token());
        queue_identity(http);
        auth.status()
    }
    #[test]
    fn no_shared_cli_or_environment_credentials_are_used_when_store_is_empty() {
        let (auth, http, _, _) = setup();
        assert!(auth.client().err().unwrap().starts_with("GH_AUTH_REQUIRED"));
        assert!(http.requests.lock().unwrap().is_empty());
        let mut bad = config();
        bad.client_id = "Ov23.github-cli-oauth-app".into();
        let manager = AuthManager::new(
            bad,
            http.clone(),
            Arc::new(MemoryStore::default()),
            Arc::new(SystemClock),
        );
        assert!(manager.start()["error"]
            .as_str()
            .unwrap()
            .starts_with("GH_APP_NOT_CONFIGURED"));
        assert!(http.requests.lock().unwrap().is_empty());
    }
    #[test]
    fn device_flow_reveals_only_user_code_and_honors_poll_intervals_and_slow_down() {
        let (auth, http, _, clock) = setup();
        http.push(device());
        let state = auth.start();
        assert_eq!(state["code"], "ABCD-1234");
        assert!(!state.to_string().contains("private-device-secret"));
        let requests = http.requests.lock().unwrap();
        assert_eq!(requests[0].url, DEVICE);
        assert_eq!(
            requests[0].form,
            vec![
                ("client_id".into(), config().client_id),
                ("scope".into(), "offline_access".into())
            ]
        );
        drop(requests);
        auth.status();
        assert_eq!(http.requests.lock().unwrap().len(), 1);
        clock.advance(5);
        http.push(json!({"error":"authorization_pending"}));
        auth.status();
        clock.advance(5);
        http.push(json!({"error":"slow_down","interval":10}));
        auth.status();
        clock.advance(9);
        auth.status();
        assert_eq!(http.requests.lock().unwrap().len(), 3);
        clock.advance(1);
        http.push(json!({"error":"access_denied","error_description":"private-error-secret"}));
        let state = auth.status();
        assert!(state["code"].is_null());
        assert!(state["error"]
            .as_str()
            .unwrap()
            .starts_with("GH_LOGIN_DENIED"));
        assert!(!state.to_string().contains("private-error-secret"));
    }
    #[test]
    fn completed_login_persists_only_in_credential_store_and_logout_clears_it() {
        let (auth, http, store, clock) = setup();
        let state = authorize(&auth, &http, &clock);
        assert_eq!(state["status"], "complete");
        assert!(state["code"].is_null());
        assert!(!state.to_string().contains("ghu_"));
        assert!(!state.to_string().contains("ghr_"));
        let credential = store.read().unwrap().unwrap();
        assert_eq!(credential.user_id, 7);
        assert_eq!(credential.client_id, config().client_id);
        assert_eq!(credential.expires_at, 29805);
        http.push(json!({"id":7}));
        assert_eq!(auth.client().unwrap().account().unwrap()["id"], 7);
        auth.logout().unwrap();
        assert!(store.read().unwrap().is_none());
        assert!(auth.client().is_err());
    }
    #[test]
    fn refresh_rotates_both_secrets_without_client_secret_and_retains_account_identity() {
        let (auth, http, store, clock) = setup();
        authorize(&auth, &http, &clock);
        clock.advance(28800 - 60);
        let mut rotated = token();
        rotated["access_token"] = "ghu_rotated".into();
        rotated["refresh_token"] = "ghr_rotated".into();
        http.push(rotated);
        queue_identity(&http);
        auth.client().unwrap();
        let updated = store.read().unwrap().unwrap();
        assert_eq!(updated.access_token, "ghu_rotated");
        assert_eq!(updated.refresh_token, "ghr_rotated");
        let requests = http.requests.lock().unwrap();
        let refresh = requests
            .iter()
            .find(|r| r.form.iter().any(|(k, _)| k == "refresh_token"))
            .unwrap();
        assert!(refresh
            .form
            .iter()
            .all(|(key, _)| ["client_id", "refresh_token", "grant_type"].contains(&key.as_str())));
        assert!(refresh
            .form
            .iter()
            .any(|(k, v)| k == "grant_type" && v == "refresh_token"));
    }
    #[test]
    fn temporary_refresh_failures_preserve_login_and_allow_a_later_retry() {
        for (status, prefix) in [
            (429, "GH_RATE_LIMIT"),
            (500, "GH_REQUEST_FAILED"),
            (502, "GH_REQUEST_FAILED"),
            (503, "GH_REQUEST_FAILED"),
            (504, "GH_REQUEST_FAILED"),
        ] {
            let (auth, http, store, clock) = setup();
            authorize(&auth, &http, &clock);
            clock.advance(28800 - 60);
            http.responses.lock().unwrap().push_back(Ok(Response {
                status,
                body: Value::Null,
                next: None,
            }));
            assert!(auth.client().err().unwrap().starts_with(prefix));
            assert_eq!(auth.local_account().unwrap(), Some(7));
            assert_eq!(
                store.read().unwrap().unwrap().refresh_token,
                "ghr_private-test-refresh"
            );
            http.push(token());
            queue_identity(&http);
            assert!(auth.client().is_ok());
        }
    }

    #[test]
    fn rotated_credentials_survive_a_temporary_failure_during_validation() {
        for stage in 0..3 {
            let (auth, http, store, clock) = setup();
            authorize(&auth, &http, &clock);
            clock.advance(28800 - 60);
            let mut rotated = token();
            rotated["access_token"] = "ghu_rotated".into();
            rotated["refresh_token"] = "ghr_rotated".into();
            http.push(rotated);
            for body in [json!({"id":7}), app()].into_iter().take(stage) {
                http.push(body);
            }
            http.responses
                .lock()
                .unwrap()
                .push_back(Err("GH_TIMEOUT".into()));
            assert_eq!(auth.client().err().unwrap(), "GH_TIMEOUT");
            let saved = store.read().unwrap().unwrap();
            assert_eq!(saved.user_id, 7);
            assert_eq!(saved.refresh_token, "ghr_rotated");
            http.push(json!({"id":7}));
            assert_eq!(auth.client().unwrap().account().unwrap()["id"], 7);
            let requests = http.requests.lock().unwrap();
            assert_eq!(requests.iter().filter(|r| r.url == TOKEN).count(), 2); // Login + one rotation.
            assert_eq!(
                requests.last().unwrap().bearer.as_deref(),
                Some("ghu_rotated")
            );
        }
    }

    #[test]
    fn refresh_still_rejects_revocation_and_a_different_account() {
        let (auth, http, store, clock) = setup();
        authorize(&auth, &http, &clock);
        clock.advance(28800 - 60);
        http.responses.lock().unwrap().push_back(Ok(Response {
            status: 400,
            body: json!({"error":"bad_refresh_token"}),
            next: None,
        }));
        assert!(auth.client().err().unwrap().starts_with("GH_AUTH_REQUIRED"));
        let mut rotated = token();
        rotated["refresh_token"] = "ghr_other-account".into();
        http.push(rotated);
        http.push(json!({"id":8}));
        http.push(app());
        http.push(json!({"installations":[]}));
        assert!(auth
            .client()
            .err()
            .unwrap()
            .starts_with("GH_ACCOUNT_CHANGED"));
        assert_eq!(store.read().unwrap().unwrap().user_id, 7);
        assert_ne!(
            store.read().unwrap().unwrap().refresh_token,
            "ghr_other-account"
        );
    }
    #[test]
    fn rejects_broad_tokens_missing_expiration_and_non_github_verification_urls() {
        for field in ["access_token", "scope", "expires_in"] {
            let (auth, http, store, clock) = setup();
            http.push(device());
            auth.start();
            clock.advance(5);
            let mut value = token();
            value[field] = match field {
                "access_token" => "gho_cli-token".into(),
                "scope" => "repo delete_repo".into(),
                _ => Value::Null,
            };
            http.push(value);
            let state = auth.status();
            assert_eq!(state["status"], "error");
            assert!(store.read().unwrap().is_none());
            assert!(!state.to_string().contains("cli-token"));
        }
        let (auth, http, _, _) = setup();
        let mut value = device();
        value["verification_uri"] = "https://github.com.evil.test/login/device".into();
        http.push(value);
        assert_eq!(auth.start()["status"], "error");
    }
    #[test]
    fn rejects_installation_write_permissions_and_credential_storage_failure() {
        let (auth, http, store, clock) = setup();
        http.push(device());
        auth.start();
        clock.advance(5);
        http.push(token());
        http.push(json!({"id":7}));
        let mut unsafe_app = app();
        unsafe_app["permissions"]["contents"] = "write".into();
        http.push(unsafe_app);
        assert!(auth.status()["error"]
            .as_str()
            .unwrap()
            .starts_with("GH_APP_PERMISSIONS_UNSAFE"));
        assert!(store.read().unwrap().is_none());
        struct FailedStore;
        impl CredentialStore for FailedStore {
            fn lock(&self) -> Result<Box<dyn CredentialGuard>, String> {
                Ok(Box::new(()))
            }
            fn read(&self) -> Result<Option<Credential>, String> {
                Ok(None)
            }
            fn write(&self, _: &Credential) -> Result<(), String> {
                Err("GH_SECURE_STORAGE".into())
            }
            fn clear(&self) -> Result<(), String> {
                Ok(())
            }
        }
        let http = Arc::new(FakeHttp::default());
        let clock = Arc::new(TestClock(AtomicU64::new(1000)));
        let auth = AuthManager::new(config(), http.clone(), Arc::new(FailedStore), clock.clone());
        assert_eq!(authorize(&auth, &http, &clock)["status"], "error");
    }
    #[test]
    fn cancelled_in_flight_login_cannot_save_late_token() {
        use std::sync::mpsc;
        struct BlockingHttp {
            inner: Arc<FakeHttp>,
            entered: std::sync::mpsc::Sender<()>,
            resume: Mutex<std::sync::mpsc::Receiver<()>>,
        }
        impl Transport for BlockingHttp {
            fn send(&self, request: Request) -> Result<Response, String> {
                if request.url == TOKEN {
                    self.entered.send(()).unwrap();
                    self.resume.lock().unwrap().recv().unwrap();
                }
                self.inner.send(request)
            }
        }
        let http = Arc::new(FakeHttp::default());
        let store = Arc::new(MemoryStore::default());
        let clock = Arc::new(TestClock(AtomicU64::new(1000)));
        let (entered_tx, entered_rx) = mpsc::channel();
        let (resume_tx, resume_rx) = mpsc::channel();
        let auth = Arc::new(AuthManager::new(
            config(),
            Arc::new(BlockingHttp {
                inner: http.clone(),
                entered: entered_tx,
                resume: Mutex::new(resume_rx),
            }),
            store.clone(),
            clock.clone(),
        ));
        http.push(device());
        auth.start();
        clock.advance(5);
        http.push(token());
        queue_identity(&http);
        let pending = auth.clone();
        let worker = std::thread::spawn(move || pending.status());
        entered_rx
            .recv_timeout(std::time::Duration::from_secs(3))
            .unwrap();
        assert_eq!(auth.cancel()["status"], "cancelled");
        resume_tx.send(()).unwrap();
        assert_eq!(worker.join().unwrap()["status"], "cancelled");
        assert!(store.read().unwrap().is_none());
    }
    #[test]
    fn expired_device_code_is_not_polled_and_can_be_retried() {
        let (auth, http, _, clock) = setup();
        http.push(device());
        auth.start();
        clock.advance(900);
        assert!(auth.status()["error"]
            .as_str()
            .unwrap()
            .starts_with("GH_LOGIN_TIMEOUT"));
        assert_eq!(http.requests.lock().unwrap().len(), 1);
        http.push(device());
        assert_eq!(auth.start()["status"], "waiting");
    }
}
