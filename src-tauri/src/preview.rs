//! Development-only stdio adapter. The HTTP boundary lives in the Vite development server.
use crate::{db::Database, github, github_workspace};
use serde::Deserialize;
use serde_json::Value;
use std::{io::Read, sync::Mutex};

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum Command {
    #[serde(rename = "github_session")]
    Session,
    #[serde(rename = "github_request")]
    Request,
    #[serde(rename = "github_select_repository")]
    SelectRepository,
    #[serde(rename = "github_login")]
    Login,
    #[serde(rename = "github_open")]
    Open,
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
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    command: Command,
    #[serde(default)]
    args: Args,
}

pub fn run() -> Result<Value, String> {
    let mut input = String::new();
    std::io::stdin()
        .take(16385)
        .read_to_string(&mut input)
        .map_err(|_| "PREVIEW_INPUT_ERROR")?;
    if input.len() > 16384 {
        return Err("PREVIEW_INPUT_TOO_LARGE".into());
    }
    let request: Request = serde_json::from_str(&input).map_err(|_| "PREVIEW_INVALID_REQUEST")?;
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("target/browser-preview.db");
    let database = Mutex::new(Database::open(&path).map_err(|e| e.to_string())?);
    match request.command {
        Command::Session => github_workspace::session(&database),
        Command::Request => github_workspace::request(
            &database,
            &request.args.operation,
            &request.args.repo,
            request.args.number,
            request.args.account_id,
        ),
        Command::SelectRepository => {
            github_workspace::select(&database, &request.args.repo, request.args.account_id)?;
            Ok(Value::Null)
        }
        Command::Login => {
            github::login()?;
            Ok(Value::Null)
        }
        Command::Open => {
            github::open(&request.args.url)?;
            Ok(Value::Null)
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_shell_commands_and_unrecognized_fields() {
        assert!(serde_json::from_str::<Request>(
            r#"{"command":"exec","args":{"cmd":"gh auth token"}}"#
        )
        .is_err());
        assert!(serde_json::from_str::<Request>(
            r#"{"command":"github_session","args":{"token":"secret"}}"#
        )
        .is_err());
    }
}
