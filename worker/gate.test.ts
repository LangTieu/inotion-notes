import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import worker from './index';
import { sha256Hex } from './auth';

// Test-only gate value (64 hex chars, matches production secret format).
const GATE = 'a'.repeat(32) + 'b'.repeat(32);
const GATE_COOKIE = `inotion_gate=${GATE}`;

let sqlite: DatabaseSync, db: D1Database;
const env = () => ({
  DB: db,
  ASSETS: { fetch: async () => new Response('<html>inotion app</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }) },
  ALLOWED_EMAILS: 'owner@example.test',
  GATE_TOKEN: GATE,
} as never);

function get(path: string, cookie?: string, headers: Record<string, string> = {}) {
  if (cookie) headers['Cookie'] = cookie;
  return worker.fetch(new Request(`https://notes.inotion.eu.cc${path}`, { headers }), env());
}

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  db = { prepare(sql: string) { let args: unknown[] = []; const statement = sqlite.prepare(sql); const bound: any = { bind(...values: unknown[]) { args = values; return bound; }, first() { return statement.get(...args) || null; }, all() { return { results: statement.all(...args) }; }, run() { return statement.run(...args); } }; return bound; }, async exec(sql: string) { sqlite.exec(sql); return { count: 0, duration: 0, results: [] }; } } as unknown as D1Database;
  sqlite.exec(`
    CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,disabled_at INTEGER);
    CREATE TABLE sessions(id_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL,revoked_at INTEGER,session_id TEXT,user_agent TEXT);
    CREATE TABLE notes(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,folder_id TEXT,title TEXT NOT NULL DEFAULT '',body_md TEXT NOT NULL DEFAULT '',is_pinned INTEGER NOT NULL DEFAULT 0,archived_at INTEGER,trashed_at INTEGER,reminder_at INTEGER,source_url TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 1,short_code TEXT);
    CREATE TABLE note_shares(id TEXT PRIMARY KEY,note_id TEXT NOT NULL,user_id TEXT NOT NULL,ciphertext_b64 TEXT NOT NULL,iv_b64 TEXT NOT NULL,expires_at INTEGER,revoked_at INTEGER,created_at INTEGER NOT NULL);
    CREATE TABLE folder_publications(folder_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,slug TEXT NOT NULL UNIQUE,include_subfolders INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE public_route_traffic(day INTEGER PRIMARY KEY,requests INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE api_tokens(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,name TEXT NOT NULL,prefix TEXT NOT NULL,token_hash TEXT UNIQUE NOT NULL,scopes TEXT NOT NULL,expires_at INTEGER,last_used_at INTEGER,revoked_at INTEGER,created_at INTEGER NOT NULL);
  `);
  sqlite.prepare('INSERT INTO users(id,email,password_hash,created_at,updated_at) VALUES(?,?,?,?,?)').run('owner', 'owner@example.test', 'x', Date.now(), Date.now());
});
afterEach(() => { sqlite.close(); });

async function seedShare() {
  sqlite.prepare("INSERT INTO notes(id,user_id,created_at,updated_at) VALUES('n1','owner',?,?)").run(Date.now(), Date.now());
  sqlite.prepare("INSERT INTO note_shares(id,note_id,user_id,ciphertext_b64,iv_b64,expires_at,revoked_at,created_at) VALUES('share1','n1','owner','Y2lwaGVydGV4dA==','aXY=',NULL,NULL,?)").run(Date.now());
}

async function seedSession(token: string) {
  sqlite.prepare("INSERT INTO sessions(id_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)").run(await sha256Hex(token), 'owner', Date.now(), Date.now() + 3_600_000, Date.now());
}

const PAT = 'ino_' + 'A'.repeat(43);

async function seedPat() {
  sqlite.prepare("INSERT INTO api_tokens(id,user_id,name,prefix,token_hash,scopes,created_at) VALUES('t1','owner','test','ino_AAAAAAAAAA',?,'[\"read\"]',?)").run(await sha256Hex(PAT), Date.now());
}

describe('notes edge gate', () => {
  it('returns 404 with no store for strangers without a cookie', async () => {
    for (const path of ['/', '/notes', '/api/auth/me', '/api/config-x']) {
      const response = await get(path);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    }
  });

  it('lets the valid gate cookie through to the app', async () => {
    const response = await get('/', GATE_COOKIE);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('inotion app');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('lets a valid app login session through with no extra step', async () => {
    await seedSession('sessiontoken123');
    const response = await get('/', 'notes_session=sessiontoken123');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('inotion app');
  });

  it('rejects a wrong gate cookie even with the secret unset (fail closed)', async () => {
    const response = await worker.fetch(new Request('https://notes.inotion.eu.cc/', { headers: { Cookie: GATE_COOKIE } }), { DB: db, ASSETS: { fetch: async () => new Response('app') } } as never);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
  });

  it('handles GET /vao with the right token: sets cookie and redirects to /notes', async () => {
    const response = await get(`/vao?t=${GATE}`);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/notes');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const cookie = response.headers.get('Set-Cookie')!;
    expect(cookie).toContain(`inotion_gate=${GATE}`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=31536000');
  });

  it('returns 404 for /vao with a wrong or missing token', async () => {
    for (const path of ['/vao?t=wrong-token', '/vao']) {
      const response = await get(path);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('');
    }
  });

  it('serves a disallow-all robots.txt publicly', async () => {
    const response = await get('/robots.txt');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('User-agent: *\nDisallow: /\n');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('keeps MCP working with a valid Bearer ino_ PAT', async () => {
    await seedPat();
    const response = await worker.fetch(new Request('https://notes.inotion.eu.cc/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PAT}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    }), env());
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.result.serverInfo.name).toBe('inotion-notes');
  });

  it('keeps public share reads working without the gate', async () => {
    await seedShare();
    const response = await get('/api/public/share/share1');
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.ciphertext_b64).toBe('Y2lwaGVydGV4dA==');
    expect(body.iv_b64).toBe('aXY=');
  });
});
