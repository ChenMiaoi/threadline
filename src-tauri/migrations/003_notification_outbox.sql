CREATE TABLE native_sync_checkpoints (
    scope TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE TABLE notification_outbox (
    event_id TEXT PRIMARY KEY NOT NULL,
    scope TEXT NOT NULL,
    kind TEXT NOT NULL,
    number INTEGER NOT NULL,
    change_type TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    next_at INTEGER NOT NULL,
    desktop_done INTEGER NOT NULL DEFAULT 0,
    sound_done INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    delivered_at INTEGER,
    error TEXT
);
CREATE INDEX notification_outbox_due ON notification_outbox(delivered_at, next_at);
