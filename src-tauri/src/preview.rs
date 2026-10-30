//! Development-only line-framed adapter for the app-owned GitHub session.
use crate::{db::Database, github, github_auth::AuthManager, github_workspace};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    io::{BufRead, Write},
    sync::Mutex,
};
use zeroize::Zeroizing;

#[derive(Deserialize)]
enum Command {
    #[serde(rename = "get_storage_usage")]
    StorageUsage,
    #[serde(rename = "github_session")]
    Session,
    #[serde(rename = "github_cached_session")]
    CachedSession,
    #[serde(rename = "github_cached_request")]
    CachedRequest,
    #[serde(rename = "github_request")]
    Request,
    #[serde(rename = "github_select_repository")]
    SelectRepository,
    #[serde(rename = "github_open")]
    Open,
    #[serde(rename = "github_login")]
    Login,
    #[serde(rename = "github_login_status")]
    LoginStatus,
    #[serde(rename = "github_login_cancel")]
    LoginCancel,
    #[serde(rename = "github_logout")]
    Logout,
}
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Args {
    #[serde(default)]
    operation: String,
    #[serde(default)]
    repo: String,
    #[serde(default)]
    number: u64,
    #[serde(default)]
    account_id: u64,
    #[serde(default)]
    head: String,
    #[serde(default)]
    search_days: u16,
    #[serde(default)]
    url: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    command: Command,
    #[serde(default)]
    args: Args,
}
fn execute(
    request: Request,
    database: &Mutex<Database>,
    auth: &AuthManager,
) -> Result<Value, String> {
    match request.command {
        Command::StorageUsage => serde_json::to_value(crate::storage::preview_usage())
            .map_err(|_| "STORAGE_TASK_FAILED".into()),
        Command::Session => github_workspace::session(database, auth),
        Command::CachedSession => github_workspace::cached_session(database, auth),
        Command::CachedRequest => github_workspace::cached_request_scoped(
            database,
            auth,
            &request.args.operation,
            &request.args.repo,
            request.args.number,
            request.args.account_id,
            github_workspace::RequestOptions {
                head: &request.args.head,
                search_days: request.args.search_days,
            },
        ),
        Command::Request => github_workspace::request_scoped(
            database,
            auth,
            &request.args.operation,
            &request.args.repo,
            request.args.number,
            request.args.account_id,
            github_workspace::RequestOptions {
                head: &request.args.head,
                search_days: request.args.search_days,
            },
        ),
        Command::SelectRepository => {
            github_workspace::select(database, auth, &request.args.repo, request.args.account_id)?;
            Ok(Value::Null)
        }
        Command::Open => {
            github::open(&request.args.url)?;
            Ok(Value::Null)
        }
        Command::Login => Ok(auth.start()),
        Command::LoginStatus => Ok(auth.status()),
        Command::LoginCancel => Ok(auth.cancel()),
        Command::Logout => {
            github_workspace::logout(database, auth)?;
            Ok(Value::Null)
        }
    }
}
pub fn run_bridge() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("target/browser-preview.db");
    let database = Database::open(&path).map(Mutex::new);
    let auth = AuthManager::default();
    let mut stdout = std::io::stdout().lock();
    for line in std::io::stdin().lock().lines() {
        let response = match line {
            Ok(line) => {
                let line = Zeroizing::new(line);
                let result = if line.len() > 16384 {
                    Err("PREVIEW_INPUT_TOO_LARGE".into())
                } else {
                    serde_json::from_str::<Request>(&line)
                        .map_err(|_| "PREVIEW_INVALID_REQUEST".to_string())
                        .and_then(|request| {
                            let database =
                                database.as_ref().map_err(|_| "PREVIEW_DATABASE_ERROR")?;
                            execute(request, database, &auth)
                        })
                };
                match result {
                    Ok(value) => json!({"ok":true,"value":value}),
                    Err(error) => json!({"ok":false,"error":error}),
                }
            }
            Err(_) => break,
        };
        if writeln!(stdout, "{response}")
            .and_then(|_| stdout.flush())
            .is_err()
        {
            break;
        }
    }
}
/// Read-only diagnostic probe of the desktop services; emits durations, never record contents or secrets.
pub fn measure(repo: &str, number: u64, full: bool) -> Result<(), String> {
    let database =
        Mutex::new(Database::open(std::path::Path::new(":memory:")).map_err(|_| "DATABASE_ERROR")?);
    let auth = AuthManager::default();
    let account = auth.client()?.account()?["id"]
        .as_u64()
        .ok_or("GH_RESPONSE_ERROR")?;
    if full {
        let result = github_workspace::request(&database, &auth, "detail", repo, number, account)?;
        println!(
            "{}",
            json!({"operation":"detail","timing":result["timing"]})
        );
    } else {
        let result = github_workspace::request(&database, &auth, "pull", repo, number, account)?;
        println!("{}", json!({"operation":"pull","timing":result["timing"]}));
        let head = result["payload"]["pull"]["head"]["sha"]
            .as_str()
            .ok_or("GH_RESPONSE_ERROR")?;
        for operation in ["discussion", "files", "checks"] {
            let result = github_workspace::request_scoped(
                &database,
                &auth,
                operation,
                repo,
                number,
                account,
                github_workspace::RequestOptions {
                    head,
                    search_days: 0,
                },
            )?;
            println!(
                "{}",
                json!({"operation":operation,"timing":result["timing"]})
            );
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_shell_commands_and_unrecognized_credential_fields() {
        for input in [
            r#"{"command":"exec","args":{"cmd":"gh auth token"}}"#,
            r#"{"command":"github_session","args":{"token":"secret"}}"#,
            r#"{"command":"github_vault_unlock","args":{"password":"fixture"}}"#,
        ] {
            assert!(serde_json::from_str::<Request>(input).is_err());
        }
    }
}
