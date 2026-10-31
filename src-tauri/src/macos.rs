use std::process::Command;

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
