-- Test-only credential. Password: TEST_ONLY_change-me-123! (replace before any live use).
INSERT OR IGNORE INTO users (id, email, password_hash, created_at, updated_at)
VALUES ('seed-user-test-only', 'tranbinhanbr01@gmail.com', 'pbkdf2-sha256$100000$c2VlZC1vbmx5LXNhbHQh$yoTKBqS5XcXPivLDMPTpcqANoXuIz6PBA52AELdVxPc', 0, 0);
