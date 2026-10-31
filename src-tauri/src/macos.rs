use std::process::Command;
use tauri::WebviewWindowBuilder;

pub fn setup_window(app: &tauri::App) -> tauri::Result<()> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|config| config.label == "main")
        .ok_or_else(|| tauri::Error::WindowNotFound)?;
    let mut builder = WebviewWindowBuilder::from_config(app, config)?;
    // Tauri 2.12 forwards the config inset only to Tao. Pass it to Wry as well,
    // so attaching/resizing the WebView does not restore AppKit's default position.
    if let Some(position) = &config.traffic_light_position {
        builder =
            builder.traffic_light_position(tauri::LogicalPosition::new(position.x, position.y));
    }
    builder.build()?;
    Ok(())
}

pub fn open(url: &str) -> Result<(), String> {
    let status = Command::new("/usr/bin/open")
        .arg(url)
        .status()
        .map_err(|_| "无法打开浏览器。")?;
    if !status.success() {
        return Err("无法打开浏览器。".into());
    }
    Ok(())
}
