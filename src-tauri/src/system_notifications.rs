use tauri::AppHandle;
#[cfg(not(target_os = "macos"))]
use tauri::Manager;

#[cfg(not(target_os = "macos"))]
#[derive(Default)]
pub struct Handles(std::sync::Mutex<std::collections::VecDeque<notify_rust::NotificationHandle>>);

pub fn setup(app: &AppHandle) {
    #[cfg(not(target_os = "macos"))]
    app.manage(Handles::default());
    #[cfg(target_os = "macos")]
    let _ = app;
}

// Return submission errors synchronously so callers acknowledge durable jobs only on success.
pub fn send(app: &AppHandle, id: &str, title: &str, body: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        use sha2::{Digest, Sha256};
        let identifier = format!("{:x}", Sha256::digest(id.as_bytes()));
        crate::macos_notifications::send(&identifier, title, body)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = id;
        let mut notification = notify_rust::Notification::new();
        notification.summary(title).body(body).appname("ThreadLine");
        #[cfg(windows)]
        {
            let executable = std::env::current_exe().map_err(|e| e.to_string())?;
            let development = executable.parent().is_some_and(|parent| {
                parent.ends_with("target/debug") || parent.ends_with("target/release")
            });
            if !development {
                notification.app_id(&app.config().identifier);
            }
        }
        #[cfg(all(unix, not(target_os = "macos")))]
        notification.hint(notify_rust::Hint::SuppressSound(true));
        let handle = notification.show().map_err(|e| e.to_string())?;
        let state = app.state::<Handles>();
        let mut handles = state
            .0
            .lock()
            .map_err(|_| "SYSTEM_NOTIFICATION_STATE_FAILED")?;
        handles.push_back(handle);
        // Keep the Linux bus connection alive while the server displays recent notifications.
        while handles.len() > 100 {
            handles.pop_front();
        }
        Ok(())
    }
}

#[tauri::command]
pub async fn send_system_notification(
    title: String,
    body: String,
    app: AppHandle,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || send(&app, "threadline-test", &title, &body))
        .await
        .map_err(|_| "SYSTEM_NOTIFICATION_STATE_FAILED")?
}
