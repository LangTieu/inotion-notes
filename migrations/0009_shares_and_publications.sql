PRAGMA foreign_keys = ON;
CREATE TABLE note_shares (id TEXT PRIMARY KEY, note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE, user_id TEXT NOT NULL, ciphertext_b64 TEXT NOT NULL, iv_b64 TEXT NOT NULL, expires_at INTEGER NULL, revoked_at INTEGER NULL, created_at INTEGER NOT NULL);
CREATE INDEX note_shares_note_revoked ON note_shares(note_id, revoked_at);
CREATE TABLE folder_publications (folder_id TEXT PRIMARY KEY REFERENCES folders(id) ON DELETE CASCADE, user_id TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, include_subfolders INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX folder_publications_slug ON folder_publications(slug);
CREATE TABLE public_route_traffic (day INTEGER PRIMARY KEY, requests INTEGER NOT NULL DEFAULT 0);
