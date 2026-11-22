import { beforeEach, describe, expect, it } from 'vitest';
import worker from './index';
import { sha256Hex } from './auth';

type AnyRow = Record<string, any>;
class FakeDB {
  users: AnyRow[] = [{ id: 'user-1', email: 'tranbinhanbr01@gmail.com', password_hash: 'pbkdf2-sha256$100000$c2VlZC1vbmx5LXNhbHQh$yoTKBqS5XcXPivLDMPTpcqANoXuIz6PBA52AELdVxPc', disabled_at: null }];
  sessions: AnyRow[] = [];
  attempts: AnyRow[] = [];
  prepare(sql: string) {
    let values: any[] = [];
    const db = this;
    return {
      bind(...args: any[]) { values = args; return this; },
      async first<T>() {
        if (sql.includes('FROM login_attempts')) return (db.attempts.find(x => x.key_hash === values[0]) || null) as T | null;
        if (sql.includes('FROM users WHERE email')) return (db.users.find(x => x.email === values[0] && !x.disabled_at) || null) as T | null;
        if (sql.includes('FROM users WHERE id')) return (db.users.find(x => x.id === values[0] && !x.disabled_at) || null) as T | null;
        if (sql.includes('FROM sessions s JOIN users')) {
          const session = db.sessions.find(x => x.id_hash === values[0] && !x.revoked_at && x.expires_at > values[1]);
          const user = db.users.find(x => x.id === session?.user_id && !x.disabled_at);
          return (user ? { id: user.id, email: user.email } : null) as T | null;
        }
        return null;
      },
      async run() {
        if (sql.startsWith('INSERT INTO sessions')) db.sessions.push({ id_hash: values[0], user_id: values[1], created_at: values[2], expires_at: values[3], last_seen_at: values[4], revoked_at: null });
        else if (sql.startsWith('UPDATE sessions SET last_seen_at')) { const s = db.sessions.find(x => x.id_hash === values[1]); if (s) s.last_seen_at = values[0]; }
        else if (sql.startsWith('UPDATE users SET password_hash')) { const u = db.users.find(x => x.id === values[2]); if (u) { u.password_hash = values[0]; u.updated_at = values[1]; } }
        else if (sql.startsWith('UPDATE sessions SET revoked_at') && sql.includes('user_id = ?')) { for (const s of db.sessions) if (s.user_id === values[1] && s.id_hash !== values[2] && !s.revoked_at) s.revoked_at = values[0]; }
        else if (sql.startsWith('UPDATE sessions SET revoked_at')) { const s = db.sessions.find(x => x.id_hash === values[1]); if (s) s.revoked_at = values[0]; }
        else if (sql.startsWith('DELETE FROM login_attempts')) db.attempts = db.attempts.filter(x => x.key_hash !== values[0]);
        else if (sql.startsWith('INSERT INTO login_attempts')) {
          const old = db.attempts.find(x => x.key_hash === values[0]);
          if (old) { old.attempts = values[1]; old.window_started_at = values[2]; }
          else db.attempts.push({ key_hash: values[0], attempts: values[1], window_started_at: values[2] });
        }
        return { success: true };
      }
    };
  }
}
let db: FakeDB;
const env = () => ({ DB: db as never, ASSETS: { fetch: async () => new Response('asset') } as never, ALLOWED_EMAILS: 'tranbinhanbr01@gmail.com' });
function post(path: string, body: unknown, cookie?: string) {
  const headers = new Headers({ Origin: 'https://inotion.eu.cc', 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.14' });
  if (cookie) headers.set('Cookie', cookie);
  return new Request(`https://inotion.eu.cc${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}
beforeEach(() => { db = new FakeDB(); });

describe('Phase 1 authentication', () => {
  it('logs in and stores only a SHA-256 session token hash', async () => {
    const response = await worker.fetch(post('/api/auth/login', { email: db.users[0].email, password: 'TEST_ONLY_change-me-123!' }), env());
    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toContain('notes_session=');
    const token = response.headers.get('Set-Cookie')!.match(/notes_session=([^;]+)/)![1];
    expect(db.sessions[0].id_hash).toBe(await sha256Hex(token));
    expect(db.sessions[0].id_hash).not.toBe(token);
  });
  it('rejects a wrong password with 401', async () => {
    const response = await worker.fetch(post('/api/auth/login', { email: db.users[0].email, password: 'wrong-password' }), env());
    expect(response.status).toBe(401);
  });
  it('rejects an address outside ALLOWED_EMAILS with 403', async () => {
    const response = await worker.fetch(post('/api/auth/login', { email: 'other@example.com', password: 'anything' }), env());
    expect(response.status).toBe(403);
  });
  it('returns 401 from /api/auth/me without a cookie', async () => {
    const response = await worker.fetch(new Request('https://inotion.eu.cc/api/auth/me'), env());
    expect(response.status).toBe(401);
  });
  it('revokes the session on logout and rejects its old cookie', async () => {
    const login = await worker.fetch(post('/api/auth/login', { email: db.users[0].email, password: 'TEST_ONLY_change-me-123!' }), env());
    const token = login.headers.get('Set-Cookie')!.match(/notes_session=([^;]+)/)![1];
    const logout = await worker.fetch(post('/api/auth/logout', {}, `notes_session=${token}`), env());
    expect(logout.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(db.sessions[0].revoked_at).toBeTruthy();
    const me = await worker.fetch(new Request('https://inotion.eu.cc/api/auth/me', { headers: { Cookie: `notes_session=${token}` } }), env());
    expect(me.status).toBe(401);
  });
  it('changes password and revokes other sessions while keeping the current session', async () => {
    const token = 'session-current';
    const other = 'session-other';
    db.sessions.push(
      { id_hash: await sha256Hex(token), user_id: 'user-1', expires_at: Date.now() + 60_000, revoked_at: null },
      { id_hash: await sha256Hex(other), user_id: 'user-1', expires_at: Date.now() + 60_000, revoked_at: null },
    );
    const response = await worker.fetch(post('/api/auth/change-password', { current_password: 'TEST_ONLY_change-me-123!', new_password: 'replacement-password' }, `notes_session=${token}`), env());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(db.sessions[0].revoked_at).toBeFalsy();
    expect(db.sessions[1].revoked_at).toBeTruthy();
    const login = await worker.fetch(post('/api/auth/login', { email: db.users[0].email, password: 'replacement-password' }), env());
    expect(login.status).toBe(200);
  });
  it('rejects an incorrect current password with 401', async () => {
    const token = 'session-current';
    db.sessions.push({ id_hash: await sha256Hex(token), user_id: 'user-1', expires_at: Date.now() + 60_000, revoked_at: null });
    expect((await worker.fetch(post('/api/auth/change-password', { current_password: 'wrong-password', new_password: 'replacement-password' }, `notes_session=${token}`), env())).status).toBe(401);
  });
  it('rejects password changes without a session with 401', async () => {
    expect((await worker.fetch(post('/api/auth/change-password', { current_password: 'anything', new_password: 'replacement-password' }), env())).status).toBe(401);
  });
  it('rejects a short new password with 400', async () => {
    const token = 'session-current';
    db.sessions.push({ id_hash: await sha256Hex(token), user_id: 'user-1', expires_at: Date.now() + 60_000, revoked_at: null });
    expect((await worker.fetch(post('/api/auth/change-password', { current_password: 'TEST_ONLY_change-me-123!', new_password: 'short' }, `notes_session=${token}`), env())).status).toBe(400);
  });
  it('blocks the sixth wrong password attempt within the 15-minute window', async () => {
    for (let i = 0; i < 5; i++) expect((await worker.fetch(post('/api/auth/login', { email: db.users[0].email, password: 'wrong-password' }), env())).status).toBe(401);
    expect((await worker.fetch(post('/api/auth/login', { email: db.users[0].email, password: 'wrong-password' }), env())).status).toBe(429);
  });
});
