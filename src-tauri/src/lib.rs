mod db;
mod github;
mod github_auth;
mod github_credentials;
mod github_http;
mod github_profile;
mod github_workspace;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(feature = "browser-preview")]
pub mod preview;

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
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let path = data_dir.join("threadline.db");
            let database = Database::open(&path)?;
            app.manage(github_auth::AuthManager::default());
            app.manage(Workspace {
                database: Mutex::new(database),
                database_path: path.to_string_lossy().into_owned(),
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                window.state::<github_auth::AuthManager>().cancel();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_app_state,
            updates_configured,
            save_last_view,
            get_workspace_data,
            save_workspace_data,
            github_session,
            github_cached_session,
            github_cached_request,
            github_request,
            github_login,
            github_login_status,
            github_login_cancel,
            github_logout,
            github_open,
            github_select_repository
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start ThreadLine");
}

#[tauri::command]
async fn github_session(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        github_workspace::session(
            &app.state::<Workspace>().database,
            &app.state::<github_auth::AuthManager>(),
        )
    })
    .await
    .map_err(|_| "GH_TASK_FAILED")?
}
#[tauri::command]
async fn github_cached_session(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        github_workspace::cached_session(
            &app.state::<Workspace>().database,
            &app.state::<github_auth::AuthManager>(),
        )
    })
    .await
    .map_err(|_| "GH_TASK_FAILED")?
}
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GitHubRequest {
    operation: String,
    repo: String,
    number: u64,
    account_id: u64,
    #[serde(default)]
    head: String,
    #[serde(default)]
    search_days: u16,
}
#[tauri::command]
async fn github_cached_request(
    request: GitHubRequest,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        github_workspace::cached_request_scoped(
            &app.state::<Workspace>().database,
            &app.state::<github_auth::AuthManager>(),
            &request.operation,
            &request.repo,
            request.number,
            request.account_id,
            github_workspace::RequestOptions {
                head: &request.head,
                search_days: request.search_days,
            },
        )
    })
    .await
    .map_err(|_| "GH_TASK_FAILED")?
}
#[tauri::command]
async fn github_request(
    request: GitHubRequest,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        github_workspace::request_scoped(
            &app.state::<Workspace>().database,
            &app.state::<github_auth::AuthManager>(),
            &request.operation,
            &request.repo,
            request.number,
            request.account_id,
            github_workspace::RequestOptions {
                head: &request.head,
                search_days: request.search_days,
            },
        )
    })
    .await
    .map_err(|_| "GH_TASK_FAILED")?
}
#[tauri::command]
async fn github_select_repository(
    repo: String,
    account_id: u64,
    app: tauri::AppHandle,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        github_workspace::select(
            &app.state::<Workspace>().database,
            &app.state::<github_auth::AuthManager>(),
            &repo,
            account_id,
        )
    })
    .await
    .map_err(|_| "GH_TASK_FAILED")?
}

#[tauri::command]
async fn github_login(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || app.state::<github_auth::AuthManager>().start())
        .await
        .map_err(|_| "GH_TASK_FAILED".into())
}
#[tauri::command]
async fn github_login_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || app.state::<github_auth::AuthManager>().status())
        .await
        .map_err(|_| "GH_TASK_FAILED".into())
}
#[tauri::command]
fn github_login_cancel(auth: State<'_, github_auth::AuthManager>) -> serde_json::Value {
    auth.cancel()
}
#[tauri::command]
async fn github_logout(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        github_workspace::logout(
            &app.state::<Workspace>().database,
            &app.state::<github_auth::AuthManager>(),
        )
    })
    .await
    .map_err(|_| "GH_TASK_FAILED")?
}
#[tauri::command]
async fn github_open(url: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || github::open(&url))
        .await
        .map_err(|_| "GH_TASK_FAILED")?
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

#[tauri::command]
fn updates_configured(app: tauri::AppHandle) -> bool {
    let config = app.config().plugins.0.get("updater");
    config.is_some_and(|config| {
        config["pubkey"]
            .as_str()
            .is_some_and(|key| !key.trim().is_empty())
            && config["endpoints"]
                .as_array()
                .is_some_and(|items| !items.is_empty())
    })
}
