//! Development-only line-framed adapter. One process retains only its unlocked vault key.
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
    #[serde(rename = "github_session")]
    Session,
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
    #[serde(rename = "github_vault_status")]
    VaultStatus,
    #[serde(rename = "github_vault_unlock")]
    VaultUnlock,
    #[serde(rename = "github_vault_lock")]
    VaultLock,
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
    url: String,
    #[serde(default)]
    password: String,
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
        Command::Session => github_workspace::session(database, auth),
        Command::Request => github_workspace::request(
            database,
            auth,
            &request.args.operation,
            &request.args.repo,
            request.args.number,
            request.args.account_id,
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
            auth.logout()?;
            Ok(Value::Null)
        }
        Command::VaultStatus => {
            serde_json::to_value(auth.vault_status()?).map_err(|_| "GH_VAULT_ERROR".into())
        }
        Command::VaultUnlock => {
            auth.unlock_vault(Zeroizing::new(request.args.password))?;
            Ok(Value::Null)
        }
        Command::VaultLock => {
            auth.lock_vault()?;
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
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_shell_commands_and_unrecognized_credential_fields() {
        for input in [
            r#"{"command":"exec","args":{"cmd":"gh auth token"}}"#,
            r#"{"command":"github_session","args":{"token":"secret"}}"#,
        ] {
            assert!(serde_json::from_str::<Request>(input).is_err());
        }
        assert!(serde_json::from_str::<Request>(
            r#"{"command":"github_vault_unlock","args":{"password":"test-only-passphrase"}}"#
        )
        .is_ok());
    }
}
