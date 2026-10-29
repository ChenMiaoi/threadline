mod db;
mod github;

use db::{Database, SCHEMA_VERSION};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{Manager, State};

struct Workspace {
    database: Mutex<Database>,
    database_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppState {
    database_path: String,
    schema_version: i64,
    last_view: String,
}

#[tauri::command]
fn get_app_state(workspace: State<'_, Workspace>) -> Result<AppState, String> {
    let database = workspace
        .database
        .lock()
        .map_err(|error| error.to_string())?;
    Ok(AppState {
        database_path: workspace.database_path.clone(),
        schema_version: SCHEMA_VERSION,
        last_view: database.last_view().map_err(|error| error.to_string())?,
    })
}

#[tauri::command]
fn save_last_view(view: String, workspace: State<'_, Workspace>) -> Result<(), String> {
    workspace
        .database
        .lock()
        .map_err(|error| error.to_string())?
        .save_last_view(&view)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let path = data_dir.join("threadline.db");
            let database = Database::open(&path)?;
            app.manage(Workspace {
                database: Mutex::new(database),
                database_path: path.to_string_lossy().into_owned(),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_state,
            save_last_view,
            get_workspace_data,
            save_workspace_data,
            github_session,
            github_request,
            github_login,
            github_open,
            github_select_repository
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start ThreadLine");
}

#[tauri::command]
async fn github_session(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let user = github::account()?;
        let workspace = app.state::<Workspace>();
        let database = workspace.database.lock().map_err(|_| "DATABASE_LOCKED")?;
        let selected = database.setting(&format!("github:selected:{}", user["id"]))?;
        Ok(serde_json::json!({"user":user,"selected":selected}))
    })
    .await
    .map_err(|_| "GH_TASK_FAILED")?
}

#[tauri::command]
async fn github_request(
    operation: String,
    repo: String,
    number: u64,
    account_id: u64,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let user = github::account()?;
        if user["id"].as_u64() != Some(account_id) { return Err("GH_ACCOUNT_CHANGED: gh 的活动账号已切换，请重新检查连接。".into()); }
        let login = user["login"].as_str().ok_or("GH_RESPONSE_ERROR")?;
        let key = format!("github:cache:{account_id}:{repo}:{operation}:{number}");
        let result = github::request(&operation, &repo, number, login);
        if github::account()?["id"].as_u64() != Some(account_id) { return Err("GH_ACCOUNT_CHANGED: gh 的活动账号已切换，请重新检查连接。".into()); }
        let workspace = app.state::<Workspace>();
        let database = workspace.database.lock().map_err(|_| "DATABASE_LOCKED")?;
        match result {
            Ok(payload) => {
                let fetched_at = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|_| "INVALID_CLOCK")?.as_millis() as u64;
                let response = serde_json::json!({"payload":payload,"fetchedAt":fetched_at,"stale":false,"error":null});
                database.set_setting(&key, &response.to_string())?;
                Ok(response)
            }
            Err(error) => {
                // Permission and authentication failures must never reveal previously cached private data.
                if error.starts_with("GH_REQUEST_FAILED") || error.starts_with("GH_TIMEOUT") || error.starts_with("GH_RATE_LIMIT") {
                    if let Some(cached) = database.setting(&key)? {
                        let mut response: serde_json::Value = serde_json::from_str(&cached).map_err(|_| "CACHE_INVALID")?;
                        response["stale"] = true.into(); response["error"] = error.into(); return Ok(response);
                    }
                }
                Err(error)
            }
        }
    }).await.map_err(|_| "GH_TASK_FAILED")?
}

#[tauri::command]
async fn github_select_repository(
    repo: String,
    account_id: u64,
    app: tauri::AppHandle,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let user = github::account()?;
        if user["id"].as_u64() != Some(account_id) {
            return Err("GH_ACCOUNT_CHANGED".into());
        }
        github::request(
            "repository",
            &repo,
            0,
            user["login"].as_str().ok_or("GH_RESPONSE_ERROR")?,
        )?;
        app.state::<Workspace>()
            .database
            .lock()
            .map_err(|_| "DATABASE_LOCKED")?
            .set_setting(&format!("github:selected:{account_id}"), &repo)
    })
    .await
    .map_err(|_| "GH_TASK_FAILED")?
}

#[tauri::command]
fn github_login() -> Result<(), String> {
    github::login()
}

#[tauri::command]
fn github_open(url: String) -> Result<(), String> {
    github::open(&url)
}

#[tauri::command]
fn get_workspace_data(workspace: State<'_, Workspace>) -> Result<String, String> {
    workspace
        .database
        .lock()
        .map_err(|error| error.to_string())?
        .workspace_data()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_workspace_data(data: String, workspace: State<'_, Workspace>) -> Result<(), String> {
    workspace
        .database
        .lock()
        .map_err(|error| error.to_string())?
        .save_workspace_data(&data)
}
