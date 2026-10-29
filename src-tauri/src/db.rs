use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::time::Duration;

pub const SCHEMA_VERSION: i64 = 1;
pub const VIEWS: [&str; 9] = [
    "inbox",
    "authored",
    "review",
    "issues",
    "settings",
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

#[cfg(test)]
mod tests {
    use super::*;

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
