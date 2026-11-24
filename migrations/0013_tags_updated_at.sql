-- Sync feed for tags keys on updated_at (renames previously never reached clients).
ALTER TABLE tags ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
UPDATE tags SET updated_at = created_at WHERE updated_at = 0;
