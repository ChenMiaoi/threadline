use serde::Serialize;
use std::path::PathBuf;

#[derive(Default, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageUsage {
    pub program_bytes: u64,
    pub program_available: bool,
    pub data_bytes: u64,
    pub cache_bytes: u64,
    pub total_bytes: u64,
    pub incomplete: bool,
}

// Count file lengths, never follow links outside application-owned directories.
pub fn measure(program: Option<PathBuf>, data: Vec<PathBuf>, caches: Vec<PathBuf>) -> StorageUsage {
    let mut usage = StorageUsage::default();
    let mut roots = Vec::new();
    for path in data.iter().chain(caches.iter()) {
        match path.canonicalize() {
            Ok(path) => roots.push(path),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => usage.incomplete = true,
        }
    }
    roots.sort_by_key(|path| path.components().count());
    let mut unique: Vec<PathBuf> = Vec::new();
    for root in roots {
        if !unique.iter().any(|parent| root.starts_with(parent)) {
            unique.push(root);
        }
    }
    let cache_roots: Vec<_> = caches
        .iter()
        .filter_map(|path| path.canonicalize().ok())
        .collect();
    let program = program.and_then(|path| path.canonicalize().ok());
    if let Some(path) = program.as_ref() {
        match std::fs::metadata(path) {
            Ok(metadata) if metadata.is_file() => {
                usage.program_bytes = metadata.len();
                usage.program_available = true;
            }
            Ok(_) => usage.incomplete = true,
            Err(_) => usage.incomplete = true,
        }
    }
    let mut pending = unique;
    let mut entries = 0;
    while let Some(path) = pending.pop() {
        entries += 1;
        if entries > 200_000 {
            usage.incomplete = true;
            break;
        }
        let metadata = match std::fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(_) => {
                usage.incomplete = true;
                continue;
            }
        };
        if is_link(&metadata) {
            continue;
        }
        if metadata.is_dir() {
            match std::fs::read_dir(&path) {
                Ok(children) => {
                    for child in children {
                        match child {
                            Ok(child) => pending.push(child.path()),
                            Err(_) => usage.incomplete = true,
                        }
                    }
                }
                Err(_) => usage.incomplete = true,
            }
        } else if metadata.is_file() && program.as_ref() != Some(&path) {
            if cache_roots.iter().any(|root| path.starts_with(root)) {
                usage.cache_bytes += metadata.len();
            } else {
                usage.data_bytes += metadata.len();
            }
        }
    }
    usage.total_bytes = usage.program_bytes + usage.data_bytes + usage.cache_bytes;
    usage
}

fn is_link(metadata: &std::fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        metadata.file_type().is_symlink()
    }
}

#[cfg(feature = "browser-preview")]
pub fn preview_usage() -> StorageUsage {
    let database =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("target/browser-preview.db");
    let mut data = vec![database.clone()];
    for suffix in ["-wal", "-shm"] {
        data.push(PathBuf::from(format!("{}{suffix}", database.display())));
    }
    if let Some(local) = dirs::data_local_dir() {
        data.push(local.join("io.chenmiaoi.threadline/vault"));
    }
    let program = std::env::current_exe().ok().and_then(|exe| {
        exe.parent()
            .map(|directory| directory.join(format!("threadline{}", std::env::consts::EXE_SUFFIX)))
    });
    measure(program, data, vec![])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_nested_roots_once_and_separates_cache_and_program() {
        let dir = tempfile::tempdir().unwrap();
        let cache = dir.path().join("cache");
        std::fs::create_dir(&cache).unwrap();
        let program = dir.path().join("app");
        std::fs::write(&program, [0; 7]).unwrap();
        std::fs::write(dir.path().join("data"), [0; 11]).unwrap();
        std::fs::write(cache.join("item"), [0; 13]).unwrap();
        let usage = measure(
            Some(program),
            vec![dir.path().into(), cache.clone()],
            vec![cache],
        );
        assert_eq!(
            (
                usage.program_bytes,
                usage.data_bytes,
                usage.cache_bytes,
                usage.total_bytes
            ),
            (7, 11, 13, 31)
        );
        assert!(!usage.incomplete);
    }

    #[test]
    fn absent_directories_do_not_make_an_empty_installation_incomplete() {
        let dir = tempfile::tempdir().unwrap();
        let usage = measure(None, vec![dir.path().join("missing")], vec![]);
        assert_eq!(usage.total_bytes, 0);
        assert!(!usage.incomplete);
    }
}
