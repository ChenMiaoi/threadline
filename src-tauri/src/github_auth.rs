use serde_json::{json, Value};
#[cfg(feature = "browser-preview")]
use std::io::Write;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{mpsc, Mutex};
use std::time::{Duration, Instant};

const VERIFY_URL: &str = "https://github.com/login/device";
const DEADLINE: Duration = Duration::from_secs(15 * 60);

struct Running {
    child: Child,
    lines: mpsc::Receiver<String>,
    started: Instant,
    code: Option<String>,
}
impl Drop for Running {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
struct Inner {
    running: Option<Running>,
    status: &'static str,
    error: Option<&'static str>,
}
impl Default for Inner {
    fn default() -> Self {
        Self {
            running: None,
            status: "idle",
            error: None,
        }
    }
}
#[derive(Default)]
pub struct AuthManager(Mutex<Inner>);

fn code_from_line(line: &str) -> Option<String> {
    let candidate = line
        .trim()
        .strip_prefix("! First copy your one-time code: ")?;
    let bytes = candidate.as_bytes();
    if bytes.len() == 9
        && bytes[4] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(i, c)| i == 4 || c.is_ascii_uppercase() || c.is_ascii_digit())
    {
        Some(candidate.to_owned())
    } else {
        None
    }
}
fn snapshot(inner: &Inner) -> Value {
    let code = inner.running.as_ref().and_then(|r| r.code.as_deref());
    json!({"status": inner.status, "code": code, "verificationUrl": code.map(|_| VERIFY_URL), "error": inner.error})
}
impl AuthManager {
    pub fn start(&self) -> Value {
        let mut inner = self.0.lock().unwrap_or_else(|e| e.into_inner());
        Self::poll(&mut inner);
        if inner.running.is_some() {
            return snapshot(&inner);
        }
        let mut command = Command::new("gh");
        command
            .args([
                "auth",
                "login",
                "--hostname",
                "github.com",
                "--web",
                "--git-protocol",
                "https",
                "--scopes",
                "notifications",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .env_remove("GH_FORCE_TTY")
            .env("NO_COLOR", "1");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        Self::start_command(&mut inner, &mut command);
        snapshot(&inner)
    }
    fn start_command(inner: &mut Inner, command: &mut Command) {
        match command.spawn() {
            Ok(mut child) => {
                let stderr = child.stderr.take().expect("piped stderr");
                let (sender, lines) = mpsc::channel();
                std::thread::spawn(move || {
                    for line in BufReader::new(stderr).lines() {
                        match line {
                            Ok(line) => {
                                if let Some(code) = code_from_line(&line) {
                                    let _ = sender.send(code);
                                }
                            }
                            Err(_) => break,
                        }
                    }
                });
                inner.running = Some(Running {
                    child,
                    lines,
                    started: Instant::now(),
                    code: None,
                });
                inner.status = "starting";
                inner.error = None;
            }
            Err(error) => {
                inner.status = "error";
                inner.error = Some(if error.kind() == std::io::ErrorKind::NotFound {
                    "GH_NOT_FOUND: 请先安装 GitHub CLI。"
                } else {
                    "GH_LOGIN_FAILED: 无法启动 GitHub 登录。"
                });
            }
        }
    }
    fn poll(inner: &mut Inner) {
        let Some(running) = inner.running.as_mut() else {
            return;
        };
        while let Ok(code) = running.lines.try_recv() {
            running.code = Some(code);
            inner.status = "waiting";
        }
        let result = running.child.try_wait();
        let timed_out = running.started.elapsed() >= DEADLINE;
        match result {
            Ok(Some(status)) => {
                inner.status = if status.success() {
                    "complete"
                } else {
                    "error"
                };
                inner.error = if status.success() {
                    None
                } else {
                    Some("GH_LOGIN_FAILED: GitHub 登录未完成，请重试。")
                };
                inner.running = None;
            }
            Err(_) => {
                inner.status = "error";
                inner.error = Some("GH_LOGIN_FAILED: 无法读取登录状态，请重试。");
                inner.running = None;
            }
            Ok(None) if timed_out => {
                inner.status = "error";
                inner.error = Some("GH_LOGIN_TIMEOUT: 登录已超时，请重试。");
                inner.running = None;
            }
            Ok(None) => {}
        }
    }
    pub fn status(&self) -> Value {
        let mut inner = self.0.lock().unwrap_or_else(|e| e.into_inner());
        Self::poll(&mut inner);
        snapshot(&inner)
    }
    pub fn cancel(&self) -> Value {
        let mut inner = self.0.lock().unwrap_or_else(|e| e.into_inner());
        inner.running = None;
        inner.status = "cancelled";
        inner.error = None;
        snapshot(&inner)
    }
}
#[cfg(feature = "browser-preview")]
pub fn run_bridge() {
    let auth = AuthManager::default();
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout().lock();
    for line in stdin.lock().lines() {
        let response = match line
            .ok()
            .and_then(|line| serde_json::from_str::<Value>(&line).ok())
            .and_then(|v| v.get("command").and_then(Value::as_str).map(str::to_owned))
            .as_deref()
        {
            Some("github_login") => json!({"ok":true,"value":auth.start()}),
            Some("github_login_status") => json!({"ok":true,"value":auth.status()}),
            Some("github_login_cancel") => json!({"ok":true,"value":auth.cancel()}),
            _ => json!({"ok":false,"error":"PREVIEW_INVALID_REQUEST"}),
        };
        if writeln!(stdout, "{response}")
            .and_then(|_| stdout.flush())
            .is_err()
        {
            break;
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_only_the_expected_one_time_code() {
        assert_eq!(
            code_from_line("! First copy your one-time code: AB12-CD34"),
            Some("AB12-CD34".into())
        );
        for line in [
            "AB12-CD34",
            "! First copy your one-time code: ABC-DEFG",
            "! First copy your one-time code: ab12-CD34",
            "! First copy your one-time code: AB12-CD34 secret",
            "\u{1b}[31m! First copy your one-time code: AB12-CD34",
        ] {
            assert_eq!(code_from_line(line), None);
        }
    }
    #[test]
    fn fake_login_child() {
        if std::env::var_os("THREADLINE_AUTH_TEST_CHILD").is_none() {
            return;
        }
        eprintln!("! First copy your one-time code: AB12-CD34");
        match std::env::var("THREADLINE_AUTH_TEST_CHILD")
            .unwrap()
            .as_str()
        {
            "success" => (),
            "failure" => {
                eprintln!("private stderr secret");
                std::process::exit(7);
            }
            _ => std::thread::sleep(Duration::from_secs(20)),
        }
    }
    #[test]
    fn running_login_exposes_code_and_cancel_stops_child() {
        let auth = AuthManager::default();
        let mut command = Command::new(std::env::current_exe().unwrap());
        command
            .args([
                "--exact",
                "github_auth::tests::fake_login_child",
                "--nocapture",
            ])
            .env("THREADLINE_AUTH_TEST_CHILD", "1")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped());
        {
            let mut inner = auth.0.lock().unwrap();
            AuthManager::start_command(&mut inner, &mut command);
            assert_eq!(inner.status, "starting");
        }
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            let status = auth.status();
            if status["status"] == "waiting" {
                assert_eq!(status["code"], "AB12-CD34");
                assert_eq!(status["verificationUrl"], VERIFY_URL);
                break;
            }
            assert!(Instant::now() < deadline, "fake login did not publish code");
            std::thread::sleep(Duration::from_millis(10));
        }
        let cancelled = auth.cancel();
        assert_eq!(cancelled["status"], "cancelled");
        assert!(cancelled["code"].is_null());
        assert!(auth.0.lock().unwrap().running.is_none());
    }
    fn fake_auth(mode: &str) -> AuthManager {
        let auth = AuthManager::default();
        let mut command = Command::new(std::env::current_exe().unwrap());
        command
            .args([
                "--exact",
                "github_auth::tests::fake_login_child",
                "--nocapture",
            ])
            .env("THREADLINE_AUTH_TEST_CHILD", mode)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped());
        AuthManager::start_command(&mut auth.0.lock().unwrap(), &mut command);
        auth
    }
    fn wait_for_terminal(auth: &AuthManager) -> Value {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            let status = auth.status();
            if status["status"] == "complete" || status["status"] == "error" {
                return status;
            }
            assert!(Instant::now() < deadline, "fake login did not finish");
            std::thread::sleep(Duration::from_millis(10));
        }
    }
    #[test]
    fn successful_child_completes_without_retaining_code() {
        let status = wait_for_terminal(&fake_auth("success"));
        assert_eq!(status["status"], "complete");
        assert!(status["code"].is_null());
        assert!(status["error"].is_null());
    }
    #[test]
    fn failed_child_exposes_only_a_generic_error() {
        let status = wait_for_terminal(&fake_auth("failure"));
        assert_eq!(status["status"], "error");
        assert!(status["error"]
            .as_str()
            .unwrap()
            .starts_with("GH_LOGIN_FAILED"));
        assert!(!status.to_string().contains("secret"));
        assert!(status["code"].is_null());
    }
    #[test]
    fn deadline_stops_child_and_clears_code() {
        let auth = fake_auth("wait");
        {
            let mut inner = auth.0.lock().unwrap();
            inner.running.as_mut().unwrap().started = Instant::now() - DEADLINE;
        }
        let status = auth.status();
        assert_eq!(status["status"], "error");
        assert!(status["error"]
            .as_str()
            .unwrap()
            .starts_with("GH_LOGIN_TIMEOUT"));
        assert!(status["code"].is_null());
        assert!(auth.0.lock().unwrap().running.is_none());
    }
    #[test]
    fn starting_again_preserves_the_running_child() {
        let auth = fake_auth("wait");
        let process_id = auth.0.lock().unwrap().running.as_ref().unwrap().child.id();
        let status = auth.start();
        assert!(status["status"] == "starting" || status["status"] == "waiting");
        assert_eq!(
            auth.0.lock().unwrap().running.as_ref().unwrap().child.id(),
            process_id
        );
        auth.cancel();
    }
    #[test]
    fn cancel_and_idle_have_no_sensitive_output() {
        let auth = AuthManager::default();
        assert_eq!(auth.status()["status"], "idle");
        let cancelled = auth.cancel();
        assert_eq!(cancelled["status"], "cancelled");
        assert!(cancelled["code"].is_null());
        assert!(cancelled["verificationUrl"].is_null());
    }
}
