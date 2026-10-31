use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

pub struct DesktopMenu {
    open: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
}

pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if let Err(error) = window
            .show()
            .and_then(|_| window.unminimize())
            .and_then(|_| window.set_focus())
        {
            eprintln!("Unable to show ThreadLine: {error}");
        }
    }
}

pub fn request_quit(app: &AppHandle) {
    if let Err(error) = app.emit_to("main", "desktop-quit-requested", ()) {
        show_main(app);
        eprintln!("Unable to request ThreadLine shutdown: {error}");
    }
}

pub fn setup(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open ThreadLine", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit ThreadLine", false, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| tauri::Error::AssetNotFound("ThreadLine tray icon".into()))?;
    TrayIconBuilder::with_id("threadline")
        .icon(icon)
        .tooltip("ThreadLine")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "quit" => request_quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    app.manage(DesktopMenu { open, quit });
    Ok(())
}

#[tauri::command]
pub fn set_desktop_menu(
    menu: tauri::State<'_, DesktopMenu>,
    open: String,
    quit: String,
) -> Result<(), String> {
    menu.open
        .set_text(open)
        .map_err(|error| error.to_string())?;
    menu.quit
        .set_text(quit)
        .map_err(|error| error.to_string())?;
    menu.quit
        .set_enabled(true)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn show_main_window(app: AppHandle) {
    show_main(&app);
}

#[tauri::command]
pub fn complete_quit(app: AppHandle) {
    app.state::<crate::background_sync::BackgroundSync>().stop();
    app.exit(0);
}

pub fn on_run_event(app: &AppHandle, event: tauri::RunEvent) {
    match event {
        // OS menu quit requests must flush frontend state too. Programmatic exits and
        // updater restarts have an explicit code and must not be converted back to hiding.
        tauri::RunEvent::ExitRequested {
            code: None, api, ..
        } => {
            api.prevent_exit();
            request_quit(app);
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen { .. } => show_main(app),
        _ => {}
    }
}
