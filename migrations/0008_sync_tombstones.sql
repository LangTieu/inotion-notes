CREATE TABLE sync_tombstones (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, deleted_at INTEGER NOT NULL);
CREATE INDEX idx_tombstones_user_time ON sync_tombstones(user_id, deleted_at);
