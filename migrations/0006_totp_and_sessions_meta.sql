ALTER TABLE users ADD COLUMN totp_secret_enc TEXT NULL;
ALTER TABLE users ADD COLUMN totp_enabled_at INTEGER NULL;
ALTER TABLE users ADD COLUMN last_totp_step INTEGER NULL;
ALTER TABLE sessions ADD COLUMN session_id TEXT;
ALTER TABLE sessions ADD COLUMN user_agent TEXT NULL;
CREATE UNIQUE INDEX idx_sessions_public_id ON sessions(session_id);
CREATE TABLE user_recovery_codes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, code_hash TEXT NOT NULL, used_at INTEGER NULL, created_at INTEGER NOT NULL);
CREATE INDEX idx_recovery_codes_user ON user_recovery_codes(user_id, used_at);
CREATE TABLE auth_challenges (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
