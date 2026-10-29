use crate::{db::Database, github};
use serde_json::{json, Value};
use std::sync::Mutex;

pub fn session(database: &Mutex<Database>) -> Result<Value, String> {
    let user = github::account()?;
    let selected = database
        .lock()
        .map_err(|_| "DATABASE_LOCKED")?
        .setting(&format!("github:selected:{}", user["id"]))?;
    Ok(json!({"user":user,"selected":selected}))
}

pub fn request(
    database: &Mutex<Database>,
    operation: &str,
    repo: &str,
    number: u64,
    account_id: u64,
) -> Result<Value, String> {
    let user = github::account()?;
    if user["id"].as_u64() != Some(account_id) {
        return Err("GH_ACCOUNT_CHANGED: gh 的活动账号已切换，请重新检查连接。".into());
    }
    let login = user["login"].as_str().ok_or("GH_RESPONSE_ERROR")?;
    let key = format!("github:cache:{account_id}:{repo}:{operation}:{number}");
    let result = github::request(operation, repo, number, login);
    if github::account()?["id"].as_u64() != Some(account_id) {
        return Err("GH_ACCOUNT_CHANGED: gh 的活动账号已切换，请重新检查连接。".into());
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
pub fn select(database: &Mutex<Database>, repo: &str, account_id: u64) -> Result<(), String> {
    let user = github::account()?;
    if user["id"].as_u64() != Some(account_id) {
        return Err("GH_ACCOUNT_CHANGED".into());
    }
    github::request(
        "repository",
        repo,
        0,
        user["login"].as_str().ok_or("GH_RESPONSE_ERROR")?,
    )?;
    if github::account()?["id"].as_u64() != Some(account_id) {
        return Err("GH_ACCOUNT_CHANGED".into());
    }
    database
        .lock()
        .map_err(|_| "DATABASE_LOCKED")?
        .set_setting(&format!("github:selected:{account_id}"), repo)
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
