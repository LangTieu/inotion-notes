CREATE TABLE IF NOT EXISTS note_revisions (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  revision INTEGER NOT NULL,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_note_revisions_note_created ON note_revisions(note_id, created_at DESC);
