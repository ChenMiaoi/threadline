fn recording(sound: &str) -> Result<&'static [u8], String> {
    match sound {
        "soft" => Ok(include_bytes!("../../src/assets/sounds/soft.wav")),
        "bell" => Ok(include_bytes!("../../src/assets/sounds/bell.wav")),
        "double" => Ok(include_bytes!("../../src/assets/sounds/double.wav")),
        _ => Err("INVALID_NOTIFICATION_SOUND".into()),
    }
}

pub fn play(sound: &str) -> Result<bool, String> {
    let recording = recording(sound)?;
    #[cfg(windows)]
    {
        use windows::{
            core::PCWSTR,
            Win32::Media::Audio::{PlaySoundW, SND_ASYNC, SND_MEMORY, SND_NODEFAULT},
        };
        // SND_MEMORY treats this pointer as WAV bytes, not a string. The embedded
        // recording has static lifetime, including after asynchronous playback starts.
        let result = unsafe {
            PlaySoundW(
                PCWSTR(recording.as_ptr().cast()),
                None,
                SND_MEMORY | SND_ASYNC | SND_NODEFAULT,
            )
        };
        if !result.as_bool() {
            return Err("无法播放通知声音，请检查系统声音设置。".into());
        }
        Ok(true)
    }
    #[cfg(not(windows))]
    {
        let _ = recording;
        Ok(false)
    }
}

pub fn play_background(sound: &str) -> Result<(), String> {
    if play(sound)? {
        return Ok(());
    };
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::time::{Duration, Instant};
        #[cfg(target_os = "macos")]
        let players = ["/usr/bin/afplay"];
        #[cfg(not(target_os = "macos"))]
        let players = ["/usr/bin/paplay", "/usr/bin/aplay"];
        let player = players
            .into_iter()
            .find(|path| std::path::Path::new(path).is_file())
            .ok_or("无法播放通知声音，请检查系统声音设置。")?;
        let mut file = tempfile::Builder::new()
            .suffix(".wav")
            .tempfile()
            .map_err(|e| e.to_string())?;
        file.write_all(recording(sound)?)
            .map_err(|e| e.to_string())?;
        let mut child = std::process::Command::new(player)
            .arg(file.path())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| e.to_string())?;
        let started = Instant::now();
        loop {
            if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
                if status.success() {
                    return Ok(());
                };
                break;
            }
            if started.elapsed() >= Duration::from_secs(5) {
                let _ = child.kill();
                let _ = child.wait();
                break;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
    }
    Err("无法播放通知声音，请检查系统声音设置。".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_known_bundled_recordings_are_available() {
        for name in ["soft", "bell", "double"] {
            let bytes = recording(name).unwrap();
            assert_eq!(&bytes[..4], b"RIFF");
            assert_eq!(&bytes[8..12], b"WAVE");
            assert!(bytes.len() < 32_000);
        }
        assert!(recording("../../outside.wav").is_err());
    }
}
