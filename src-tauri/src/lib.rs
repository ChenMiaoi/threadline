mod db;

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
            save_workspace_data
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start ThreadLine");
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
