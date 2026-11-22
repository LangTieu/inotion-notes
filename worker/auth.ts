export const SESSION_COOKIE = 'notes_session';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface AuthEnv { DB: D1Database; ALLOWED_EMAILS?: string; }
export interface SessionUser { id: string; email: string; }

function b64url(bytes: Uint8Array): string {
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function fromB64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}
export async function sha256Hex(value: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  return [...hash].map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function hashPassword(password: string, salt = crypto.getRandomValues(new Uint8Array(16))): Promise<string> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, material, 256);
  return `pbkdf2-sha256$100000$${b64url(salt)}$${b64url(new Uint8Array(bits))}`;
}
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const aa = encoder.encode(a), bb = encoder.encode(b);
  let diff = aa.length ^ bb.length;
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) diff |= (aa[i % Math.max(aa.length, 1)] ?? 0) ^ (bb[i % Math.max(bb.length, 1)] ?? 0);
  return diff === 0;
}
export async function verifyPassword(encoded: string, password: string): Promise<boolean> {
  const [scheme, iterationsText, saltText, expected] = encoded.split('$');
  const iterations = Number(iterationsText);
  if (scheme !== 'pbkdf2-sha256' || !Number.isSafeInteger(iterations) || iterations < 100_000 || !saltText || !expected) return false;
  try {
    const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromB64url(saltText).buffer as ArrayBuffer, iterations, hash: 'SHA-256' }, material, 256);
    return safeEqual(b64url(new Uint8Array(bits)), expected);
  } catch { return false; }
}
export function isAllowed(email: string, list = ''): boolean {
  return list.split(',').map(x => x.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}
export function readCookie(request: Request, name = SESSION_COOKIE): string | null {
  const header = request.headers.get('Cookie') || '';
  for (const entry of header.split(';')) { const [key, ...value] = entry.trim().split('='); if (key === name) return value.join('=') || null; }
  return null;
}
export function cookieHeader(token: string, maxAge = SESSION_TTL_MS / 1000): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
export function validMutationOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return origin === 'https://inotion.eu.cc' || (['localhost', '127.0.0.1'].includes(parsed.hostname) && ['http:', 'https:'].includes(parsed.protocol));
  } catch { return false; }
}
export async function currentSession(request: Request, env: AuthEnv): Promise<SessionUser | null> {
  const token = readCookie(request);
  if (!token) return null;
  const idHash = await sha256Hex(token);
  const now = Date.now();
  const row = await env.DB.prepare('SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.disabled_at IS NULL').bind(idHash, now).first<SessionUser>();
  if (row) await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id_hash = ?').bind(now, idHash).run();
  return row;
}
export async function createSession(env: AuthEnv, user: SessionUser, userAgent = ''): Promise<string> {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (id_hash, user_id, created_at, expires_at, last_seen_at, session_id, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(await sha256Hex(token), user.id, now, now + SESSION_TTL_MS, now, crypto.randomUUID(), userAgent.slice(0, 200) || null).run();
  return token;
}
export { decoder };
