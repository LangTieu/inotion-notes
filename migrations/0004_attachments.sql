PRAGMA foreign_keys = ON;
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX attachments_note_created ON attachments(note_id, created_at);
CREATE INDEX attachments_user_created ON attachments(user_id, created_at);
