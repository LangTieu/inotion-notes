ALTER TABLE notes ADD COLUMN reminder_at INTEGER NULL;
ALTER TABLE notes ADD COLUMN source_url TEXT NULL;
CREATE INDEX idx_notes_user_reminder ON notes(user_id, reminder_at);
