CREATE TABLE api_tokens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, prefix TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, scopes TEXT NOT NULL, expires_at INTEGER NULL, last_used_at INTEGER NULL, revoked_at INTEGER NULL, created_at INTEGER NOT NULL);
CREATE INDEX idx_api_tokens_user ON api_tokens(user_id, revoked_at);
CREATE TABLE mcp_audit_log (id TEXT PRIMARY KEY, token_id TEXT NOT NULL, user_id TEXT NOT NULL, tool TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX idx_mcp_audit_token_day ON mcp_audit_log(token_id, created_at);
