use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::time::Duration;

pub const SCHEMA_VERSION: i64 = 2;
pub const VIEWS: [&str; 10] = [
    "inbox",
    "authored",
    "review",
    "issues",
    "settings",
    "profile",
    "onboarding",
    "snoozed",
    "empty",
    "sync-error",
];

pub struct Database {
    connection: Connection,
}

impl Database {
    pub fn setting(&self, key: &str) -> Result<Option<String>, String> {
        self.connection
            .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
                row.get(0)
            })
            .optional()
            .map_err(|error| error.to_string())
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), String> {
        if value.len() > 16 * 1024 * 1024 {
            return Err("Cached data exceeds size limit".into());
        }
        self.connection.execute("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value", params![key,value]).map_err(|error| error.to_string())?;
        Ok(())
    }
    pub fn remove_setting(&self, key: &str) -> Result<(), String> {
        self.connection
            .execute("DELETE FROM settings WHERE key = ?1", [key])
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn remove_prefix(&self, prefix: &str) -> Result<(), String> {
        self.connection
            .execute(
                "DELETE FROM settings WHERE substr(key, 1, length(?1)) = ?1",
                [prefix],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn cache_response(&self, key: &str, value: &str, fetched_at: u64) -> Result<(), String> {
        if value.len() > 16 * 1024 * 1024 {
            return Err("Cached data exceeds size limit".into());
        }
        let transaction = self
            .connection
            .unchecked_transaction()
            .map_err(|error| error.to_string())?;
        transaction.execute("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value", params![key,value]).map_err(|error| error.to_string())?;
        transaction.execute("INSERT INTO github_cache_index (key, fetched_at, bytes) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET fetched_at = excluded.fetched_at, bytes = excluded.bytes", params![key, fetched_at as i64, value.len() as i64]).map_err(|error| error.to_string())?;
        prune_cache(&transaction).map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())
    }

    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        let mut connection = Connection::open(path)?;
        connection.busy_timeout(Duration::from_secs(5))?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        let version: i64 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
        if version > SCHEMA_VERSION {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Database version {version} is newer than supported version {SCHEMA_VERSION}"
            )));
        }
        if version < 1 {
            let transaction = connection.transaction()?;
            transaction.execute_batch(include_str!("../migrations/001_settings.sql"))?;
            transaction.pragma_update(None, "user_version", 1)?;
            transaction.commit()?;
        }
        if version < 2 {
            let transaction = connection.transaction()?;
            transaction.execute_batch(include_str!("../migrations/002_github_cache_index.sql"))?;
            // Legacy response bodies are inspected once during migration, never during routine eviction.
            let entries = {
                let mut statement = transaction.prepare(
                    "SELECT key, value FROM settings WHERE key LIKE 'github-app:%:cache:%'",
                )?;
                let entries = statement
                    .query_map([], |row| {
                        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
                entries
            };
            #[derive(serde::Deserialize)]
            struct Timestamp {
                #[serde(rename = "fetchedAt")]
                fetched_at: i64,
            }
            for (key, value) in entries {
                if let Ok(timestamp) = serde_json::from_str::<Timestamp>(&value) {
                    transaction.execute("INSERT INTO github_cache_index (key, fetched_at, bytes) VALUES (?1, ?2, ?3)", params![key, timestamp.fetched_at, value.len() as i64])?;
                } else {
                    transaction.execute("DELETE FROM settings WHERE key = ?1", [key])?;
                }
            }
            prune_cache(&transaction)?;
            transaction.pragma_update(None, "user_version", SCHEMA_VERSION)?;
            transaction.commit()?;
        }
        Ok(Self { connection })
    }

    pub fn last_view(&self) -> rusqlite::Result<String> {
        let view: Option<String> = self
            .connection
            .query_row(
                "SELECT value FROM settings WHERE key = 'last_view'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        Ok(view
            .filter(|value| VIEWS.contains(&value.as_str()))
            .unwrap_or_else(|| "inbox".into()))
    }

    pub fn save_last_view(&self, view: &str) -> Result<(), String> {
        if !VIEWS.contains(&view) {
            return Err("Unknown workspace view".into());
        }
        self.connection.execute(
            "INSERT INTO settings (key, value) VALUES ('last_view', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![view],
        ).map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn workspace_data(&self) -> rusqlite::Result<String> {
        self.connection
            .query_row(
                "SELECT value FROM settings WHERE key = 'workspace'",
                [],
                |row| row.get(0),
            )
            .optional()
            .map(|value| value.unwrap_or_else(|| "null".into()))
    }

    pub fn save_workspace_data(&self, data: &str) -> Result<(), String> {
        if data.len() > 2 * 1024 * 1024 {
            return Err("Workspace data exceeds size limit".into());
        }
        let value: serde_json::Value =
            serde_json::from_str(data).map_err(|error| error.to_string())?;
        if !value.is_object() {
            return Err("Workspace data must be an object".into());
        }
        self.connection.execute("INSERT INTO settings (key, value) VALUES ('workspace', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value", params![data]).map_err(|error| error.to_string())?;
        Ok(())
    }
}

fn prune_cache(connection: &Connection) -> rusqlite::Result<()> {
    // Only the lightweight index is scanned while holding the workspace lock.
    let entries = {
        let mut statement = connection.prepare(
            "SELECT key, fetched_at, bytes FROM github_cache_index ORDER BY fetched_at DESC, key",
        )?;
        let entries = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        entries
    };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let mut count = 0;
    let mut bytes = 0;
    for (key, fetched_at, size) in entries {
        if fetched_at > 0
            && now.saturating_sub(fetched_at) <= 30 * 24 * 60 * 60 * 1000
            && count < 128
            && bytes + size <= 32 * 1024 * 1024
        {
            count += 1;
            bytes += size;
        } else {
            connection.execute("DELETE FROM settings WHERE key = ?1", [key])?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_one_cache_migrates_once_and_metadata_tracks_updates_and_deletes() {
        let file = tempfile::NamedTempFile::new().unwrap();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        let key = "github-app:test:cache:7:owner/repo:issue:1";
        {
            let connection = Connection::open(file.path()).unwrap();
            connection
                .execute_batch(include_str!("../migrations/001_settings.sql"))
                .unwrap();
            connection.pragma_update(None, "user_version", 1).unwrap();
            connection
                .execute(
                    "INSERT INTO settings VALUES (?1, ?2)",
                    params![
                        key,
                        serde_json::json!({"fetchedAt":now,"payload":{"body":"legacy"}})
                            .to_string()
                    ],
                )
                .unwrap();
            connection
                .execute(
                    "INSERT INTO settings VALUES ('github-app:test:cache:corrupt', '{')",
                    [],
                )
                .unwrap();
        }
        {
            let database = Database::open(file.path()).unwrap();
            assert!(database.setting(key).unwrap().unwrap().contains("legacy"));
            assert!(database
                .setting("github-app:test:cache:corrupt")
                .unwrap()
                .is_none());
            database
                .cache_response(key, "replacement", now + 1)
                .unwrap();
            let metadata: (i64, i64) = database
                .connection
                .query_row(
                    "SELECT fetched_at, bytes FROM github_cache_index WHERE key = ?1",
                    [key],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .unwrap();
            assert_eq!(metadata, ((now + 1) as i64, 11));
        }
        let database = Database::open(file.path()).unwrap();
        // Reopening version two does not parse response bodies again.
        assert_eq!(database.setting(key).unwrap().unwrap(), "replacement");
        database.remove_prefix("github-app:test:cache:").unwrap();
        let count: i64 = database
            .connection
            .query_row("SELECT count(*) FROM github_cache_index", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    #[ignore = "manual representative cache eviction benchmark"]
    fn benchmark_near_capacity_cache_writes() {
        let database = Database::open(std::path::Path::new(":memory:")).unwrap();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        let response =
            serde_json::json!({"fetchedAt":now,"payload":"x".repeat(250 * 1024)}).to_string();
        for index in 0..128 {
            database
                .cache_response(&format!("github-app:bench:cache:{index}"), &response, now)
                .unwrap();
        }
        let mode = std::env::var("THREADLINE_CACHE_BENCH_MODE").unwrap_or_default();
        let started = std::time::Instant::now();
        for index in 0..if mode == "legacy" { 0 } else { 100 } {
            database
                .cache_response(
                    &format!("github-app:bench:cache:{}", index % 128),
                    &response,
                    now + index + 1,
                )
                .unwrap();
        }
        if mode != "legacy" {
            println!(
                "128 entries / 31.25 MiB: 100 indexed cache writes in {:.3} ms ({:.3} ms/write)",
                started.elapsed().as_secs_f64() * 1000.0,
                started.elapsed().as_secs_f64() * 10.0
            );
        }
        let started = std::time::Instant::now();
        for _ in 0..if mode == "indexed" { 0 } else { 3 } {
            let mut statement = database
                .connection
                .prepare("SELECT value FROM settings WHERE key LIKE 'github-app:%:cache:%'")
                .unwrap();
            let mut values = statement
                .query_map([], |row| row.get::<_, String>(0))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap();
            values.sort_by_key(|raw| {
                std::cmp::Reverse(
                    serde_json::from_str::<serde_json::Value>(raw).unwrap()["fetchedAt"]
                        .as_u64()
                        .unwrap(),
                )
            });
            for raw in values {
                std::hint::black_box(serde_json::from_str::<serde_json::Value>(&raw).unwrap());
            }
        }
        if mode != "indexed" {
            println!(
                "Legacy full-payload eviction scan: {:.3} ms/write",
                started.elapsed().as_secs_f64() * 1000.0 / 3.0
            );
        }
    }
    #[test]
    fn response_retention_bounds_entries_size_and_age() {
        let database = Database::open(std::path::Path::new(":memory:")).unwrap();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        database
            .cache_response("github-app:test:cache:old", r#"{"fetchedAt":1}"#, 1)
            .unwrap();
        for index in 0..140 {
            database
                .cache_response(
                    &format!("github-app:test:cache:{index}"),
                    &serde_json::json!({"fetchedAt":now+index,"payload":{}}).to_string(),
                    now + index,
                )
                .unwrap();
        }
        let count: i64 = database
            .connection
            .query_row(
                "SELECT count(*) FROM settings WHERE key LIKE 'github-app:%:cache:%'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 128);
        assert!(database
            .setting("github-app:test:cache:old")
            .unwrap()
            .is_none());
        for index in 0..4 {
            database.cache_response(&format!("github-app:large:cache:{index}"), &serde_json::json!({"fetchedAt":now+1000+index,"payload":"x".repeat(10 * 1024 * 1024)}).to_string(), now + 1000 + index).unwrap();
        }
        let bytes: i64 = database.connection.query_row("SELECT sum(length(CAST(value AS BLOB))) FROM settings WHERE key LIKE 'github-app:%:cache:%'", [], |row| row.get(0)).unwrap();
        assert!(bytes <= 32 * 1024 * 1024);
    }
    #[test]
    fn profile_view_can_be_saved_and_restored() {
        let database = Database::open(std::path::Path::new(":memory:")).unwrap();
        database.save_last_view("profile").unwrap();
        assert_eq!(database.last_view().unwrap(), "profile");
    }
    #[test]
    fn preferences_survive_reopening_and_invalid_views_are_rejected() {
        let path = std::env::temp_dir().join(format!(
            "threadline-db-test-{}-{}.db",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        {
            let database = Database::open(&path).unwrap();
            assert_eq!(database.last_view().unwrap(), "inbox");
            database.save_last_view("review").unwrap();
            assert_eq!(database.workspace_data().unwrap(), "null");
            database
                .set_setting(
                    "github:cache:7:owner/project:inbox:0",
                    r#"{"payload":[],"fetchedAt":123}"#,
                )
                .unwrap();
            assert!(database
                .setting("github:cache:8:owner/project:inbox:0")
                .unwrap()
                .is_none());
            assert!(database
                .setting("github:cache:7:owner/other:inbox:0")
                .unwrap()
                .is_none());
            database
                .save_workspace_data(r#"{"version":1,"read":["inbox-1042"]}"#)
                .unwrap();
            assert!(database.save_workspace_data("[]").is_err());
            assert!(database.save_workspace_data("invalid json").is_err());
            assert!(database
                .save_workspace_data(&"x".repeat(2 * 1024 * 1024 + 1))
                .is_err());
            assert!(database.save_last_view("invalid").is_err());
        }
        {
            let database = Database::open(&path).unwrap();
            assert_eq!(database.last_view().unwrap(), "review");
            assert_eq!(
                database
                    .setting("github:cache:7:owner/project:inbox:0")
                    .unwrap()
                    .unwrap(),
                r#"{"payload":[],"fetchedAt":123}"#
            );
            assert_eq!(
                database.workspace_data().unwrap(),
                r#"{"version":1,"read":["inbox-1042"]}"#
            );
            let version: i64 = database
                .connection
                .pragma_query_value(None, "user_version", |row| row.get(0))
                .unwrap();
            assert_eq!(version, SCHEMA_VERSION);
        }
        std::fs::remove_file(path).unwrap();
    }
}
