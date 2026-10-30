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
