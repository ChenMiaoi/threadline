CREATE TABLE github_cache_index (
    key TEXT PRIMARY KEY NOT NULL REFERENCES settings(key) ON DELETE CASCADE,
    fetched_at INTEGER NOT NULL,
    bytes INTEGER NOT NULL
);
CREATE INDEX github_cache_by_fetched_at ON github_cache_index(fetched_at DESC, key);
