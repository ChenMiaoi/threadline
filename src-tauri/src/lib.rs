mod background_sync;
mod db;
mod desktop;
mod fonts;
mod github;
mod github_auth;
mod github_credentials;
mod github_http;
mod github_profile;
mod github_profile_reviews;
mod github_workspace;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
mod macos_notifications;
mod notification_outbox;
mod notification_sound;
#[cfg(feature = "browser-preview")]
pub mod preview;
mod storage;
mod system_notifications;

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
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            desktop::show_main(app);
        }))
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
            desktop::setup(app)?;
            system_notifications::setup(app.handle());
            #[cfg(target_os = "macos")]
            macos_notifications::setup();
            background_sync::BackgroundSync::start(app.handle());
            #[cfg(target_os = "macos")]
            macos::setup_window(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if matches!(event, tauri::WindowEvent::Focused(true)) {
                    if let Some(service) = window.try_state::<background_sync::BackgroundSync>() {
                        service.resume();
                    }
                }
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    if let Err(error) = window.hide() {
                        eprintln!("Unable to hide ThreadLine: {error}");
                    }
                    return;
                }
            }
            if matches!(event, tauri::WindowEvent::Destroyed) {
                window.state::<github_auth::AuthManager>().cancel();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_app_state,
            #[cfg(target_os = "macos")]
            macos_notifications::macos_notification_permission,
            #[cfg(target_os = "macos")]
            macos_notifications::macos_notify,
            desktop::set_desktop_menu,
            desktop::complete_quit,
            desktop::show_main_window,
            background_sync::background_sync_configure,
            background_sync::background_sync_refresh,
            background_sync::background_notification_retry,
            system_notifications::send_system_notification,
            get_system_fonts,
            play_notification_sound,
            updates_configured,
            get_storage_usage,
            clear_cache,
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
        .build(tauri::generate_context!())
        .expect("Unable to start ThreadLine")
        .run(desktop::on_run_event);
}

#[tauri::command]
async fn get_storage_usage(app: tauri::AppHandle) -> Result<storage::StorageUsage, String> {
    let mut data = vec![
        app.path()
            .app_data_dir()
            .map_err(|_| "STORAGE_PATH_FAILED")?,
        app.path()
            .app_local_data_dir()
            .map_err(|_| "STORAGE_PATH_FAILED")?,
    ];
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|_| "STORAGE_PATH_FAILED")?;
    let mut caches = vec![cache.clone()];
    let mut runtimes = vec![];
    if cfg!(target_os = "windows") {
        let root = cache.join("EBWebView");
        caches = storage::webview_cache_paths(&root);
        data.push(root.join("Default"));
        runtimes.push(root);
    }

    let program = std::env::current_exe().map_err(|_| "STORAGE_PATH_FAILED")?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut usage = storage::measure(Some(program), data, caches, runtimes);
        usage.web_cache_clearable = cfg!(target_os = "windows");
        usage
    })
    .await
    .map_err(|_| "STORAGE_TASK_FAILED".into())
}

#[tauri::command]
async fn clear_cache(app: tauri::AppHandle, kind: String) -> Result<(), String> {
    match kind.as_str() {
        "responses" => tauri::async_runtime::spawn_blocking(move || {
            let state = app.state::<Workspace>();
            let result = state
                .database
                .lock()
                .map_err(|_| "DATABASE_LOCKED")?
                .clear_response_cache();
            result
        })
        .await
        .map_err(|_| "CACHE_CLEAR_FAILED")?,
        "web-resources" => storage::clear_web_cache(app).await,
        _ => Err("INVALID_CACHE_KIND".into()),
    }
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
async fn save_workspace_data(data: String, app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<Workspace>()
            .database
            .lock()
            .map_err(|_| "DATABASE_LOCKED")?
            .save_workspace_data(&data)?;
        app.state::<background_sync::BackgroundSync>()
            .preferences_changed(&app);
        Ok(())
    })
    .await
    .map_err(|_| "GH_TASK_FAILED")?
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

#[tauri::command]
async fn get_system_fonts() -> Result<Vec<fonts::SystemFont>, String> {
    tauri::async_runtime::spawn_blocking(fonts::system_fonts)
        .await
        .map_err(|_| "FONT_SCAN_FAILED".into())
}

#[tauri::command]
fn play_notification_sound(sound: &str) -> Result<bool, String> {
    notification_sound::play(sound)
}

#[cfg(test)]
mod startup_tests {
    #[test]
    fn default_build_has_valid_but_unconfigured_updater() {
        // Plugin initialization deserializes this value even when updates are disabled.
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let updater: tauri_plugin_updater::Config =
            serde_json::from_value(config["plugins"]["updater"].clone()).unwrap();
        assert!(updater.pubkey.is_empty());
        assert!(updater.endpoints.is_empty());
    }
}
