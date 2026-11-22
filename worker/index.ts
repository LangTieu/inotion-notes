import { cookieHeader, createSession, currentSession, hashPassword, isAllowed, readCookie, sha256Hex, validMutationOrigin, verifyPassword, type AuthEnv } from './auth';
import { handleNotes } from './notes';
import { decryptText, encryptText, getEncryptionKey } from './crypto';
import { generateTotpSecret, hashRecoveryCode, recoveryCodes, verifyTotp } from './totp';
import { deleteNoteAttachments, handleAttachments, type AttachmentEnv } from './attachments';

interface Env extends AuthEnv, AttachmentEnv { ASSETS: Fetcher; }
const json = (body: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const error = (message: string, status: number, headers: HeadersInit = {}) => json({ error: message }, status, headers);
const deniedCookie = 'notes_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';

async function login(request: Request, env: Env): Promise<Response> {
  if (!validMutationOrigin(request)) return error('Invalid request origin', 403);
  let input: { email?: unknown; password?: unknown };
  try { input = await request.json() as typeof input; } catch { return error('Invalid JSON body', 400); }
  if (typeof input.email !== 'string' || typeof input.password !== 'string' || input.password.length > 128) return error('Email and password are required', 400);
  const email = input.email.trim().toLowerCase();
  if (!isAllowed(email, env.ALLOWED_EMAILS)) return error('Account is not allowed', 403);
  const now = Date.now();
  const keyHash = await sha256Hex(`${request.headers.get('CF-Connecting-IP') || 'unknown'}\n${email}`);
  const attempt = await env.DB.prepare('SELECT attempts, window_started_at FROM login_attempts WHERE key_hash = ?').bind(keyHash).first<{ attempts: number; window_started_at: number }>();
  if (attempt && now - attempt.window_started_at < 900_000 && attempt.attempts >= 5) {
    return error('Too many login attempts', 429, { 'Retry-After': String(Math.max(1, Math.ceil((attempt.window_started_at + 900_000 - now) / 1000))) });
  }
  const row = await env.DB.prepare('SELECT id, email, password_hash, totp_enabled_at FROM users WHERE email = ? AND disabled_at IS NULL').bind(email).first<{ id: string; email: string; password_hash: string; totp_enabled_at: number | null }>();
  const valid = row ? await verifyPassword(row.password_hash, input.password) : await verifyPassword('pbkdf2-sha256$100000$c2VlZC1vbmx5LXNhbHQh$yoTKBqS5XcXPivLDMPTpcqANoXuIz6PBA52AELdVxPc', input.password);
  if (!row || !valid) {
    const resetWindow = !attempt || now - attempt.window_started_at >= 900_000;
    const started = resetWindow ? now : attempt!.window_started_at;
    const attempts = resetWindow ? 1 : attempt!.attempts + 1;
    await env.DB.prepare('INSERT INTO login_attempts (key_hash, attempts, window_started_at) VALUES (?, ?, ?) ON CONFLICT(key_hash) DO UPDATE SET attempts = excluded.attempts, window_started_at = excluded.window_started_at').bind(keyHash, attempts, started).run();
    return error('Incorrect email or password', 401);
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE key_hash = ?').bind(keyHash).run();
  if (row.totp_enabled_at != null) { const challenge = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); await env.DB.prepare('INSERT INTO auth_challenges (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)').bind(await sha256Hex(challenge),row.id,now+300000,now).run(); return json({ requires_2fa: true, challenge_token: challenge }); }
  const token = await createSession(env, row, request.headers.get('user-agent') || '');
  return json({ email: row.email }, 200, { 'Set-Cookie': cookieHeader(token) });
}

async function twoFactorVerify(request:Request,env:Env):Promise<Response>{
 let input:any;try{input=await request.json()}catch{return error('Invalid JSON body',400)}
 if(typeof input?.challenge_token!=='string'||typeof input?.code!=='string')return error('Challenge and code are required',400);
 const keyHash=await sha256Hex(`${request.headers.get('CF-Connecting-IP')||'unknown'}\nchallenge:${await sha256Hex(input.challenge_token)}`),now=Date.now();
 const attempt=await env.DB.prepare('SELECT attempts,window_started_at FROM login_attempts WHERE key_hash=?').bind(keyHash).first<any>();
 if(attempt&&now-attempt.window_started_at<900000&&attempt.attempts>=5)return error('Too many login attempts',429);
 const challenge=await env.DB.prepare('SELECT c.user_id,u.email,u.totp_secret_enc,u.last_totp_step FROM auth_challenges c JOIN users u ON u.id=c.user_id WHERE c.token_hash=? AND c.expires_at>? AND u.disabled_at IS NULL').bind(await sha256Hex(input.challenge_token),now).first<any>();
 let matched:number|null=null, recovery:any=null;
 if(challenge?.totp_secret_enc){const secret=await decryptText(challenge.totp_secret_enc,await getEncryptionKey((env as any).ENCRYPTION_KEY));matched=await verifyTotp(secret,input.code,now);if(matched!==null&&challenge.last_totp_step!=null&&matched<=challenge.last_totp_step)matched=null;if(matched===null){const hash=await hashRecoveryCode(input.code);recovery=await env.DB.prepare('SELECT id FROM user_recovery_codes WHERE user_id=? AND code_hash=? AND used_at IS NULL').bind(challenge.user_id,hash).first<any>();}}
 if(!challenge||(!matched&&!recovery)){const resetWindow=!attempt||now-attempt.window_started_at>=900000;const started=resetWindow?now:attempt.window_started_at;const count=resetWindow?1:attempt.attempts+1;await env.DB.prepare('INSERT INTO login_attempts(key_hash,attempts,window_started_at) VALUES(?,?,?) ON CONFLICT(key_hash) DO UPDATE SET attempts=excluded.attempts,window_started_at=excluded.window_started_at').bind(keyHash,count,started).run();return error('Invalid or expired authentication code',401);}
 await env.DB.prepare('DELETE FROM auth_challenges WHERE token_hash=?').bind(await sha256Hex(input.challenge_token)).run();if(matched!==null)await env.DB.prepare('UPDATE users SET last_totp_step=? WHERE id=?').bind(matched,challenge.user_id).run();else await env.DB.prepare('UPDATE user_recovery_codes SET used_at=? WHERE id=?').bind(now,recovery.id).run();
 await env.DB.prepare('DELETE FROM login_attempts WHERE key_hash=?').bind(keyHash).run();const token=await createSession(env,{id:challenge.user_id,email:challenge.email},request.headers.get('user-agent')||'');return json({email:challenge.email},200,{'Set-Cookie':cookieHeader(token)});
}
async function securityRoutes(request:Request,env:Env,path:string):Promise<Response|null>{
 const user=await currentSession(request,env);if(!user)return error('Not authenticated',401);
 if(path==='/api/auth/2fa/setup'&&request.method==='POST'){const secret=generateTotpSecret();await env.DB.prepare('UPDATE users SET totp_secret_enc=?,totp_enabled_at=NULL WHERE id=?').bind(await encryptText(secret,await getEncryptionKey((env as any).ENCRYPTION_KEY)),user.id).run();return json({secret_base32:secret,otpauth_uri:`otpauth://totp/${encodeURIComponent('inotion Notes:'+user.email)}?secret=${secret}&issuer=${encodeURIComponent('inotion Notes')}`});}
 if((path==='/api/auth/2fa/enable'||path==='/api/auth/2fa/disable')&&request.method==='POST'){let input:any;try{input=await request.json()}catch{return error('Invalid JSON body',400)}const row=await env.DB.prepare('SELECT password_hash,totp_secret_enc,last_totp_step FROM users WHERE id=?').bind(user.id).first<any>();if(!row||!await verifyPassword(row.password_hash,input?.password||''))return error('Password or code is incorrect',401);let matched:number|null=null;if(row.totp_secret_enc)matched=await verifyTotp(await decryptText(row.totp_secret_enc,await getEncryptionKey((env as any).ENCRYPTION_KEY)),input.code||'');if(matched===null||((path.endsWith('enable'))&&row.last_totp_step!=null&&matched<=row.last_totp_step))return error('Password or code is incorrect',401);if(path.endsWith('enable')){const codes=recoveryCodes();await env.DB.prepare('DELETE FROM user_recovery_codes WHERE user_id=?').bind(user.id).run();for(const code of codes)await env.DB.prepare('INSERT INTO user_recovery_codes(id,user_id,code_hash,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(),user.id,await hashRecoveryCode(code),Date.now()).run();await env.DB.prepare('UPDATE users SET totp_enabled_at=?,last_totp_step=? WHERE id=?').bind(Date.now(),matched,user.id).run();return json({recovery_codes:codes});}await env.DB.prepare('UPDATE users SET totp_secret_enc=NULL,totp_enabled_at=NULL,last_totp_step=NULL WHERE id=?').bind(user.id).run();await env.DB.prepare('DELETE FROM user_recovery_codes WHERE user_id=?').bind(user.id).run();return json({ok:true});}
 if(path==='/api/auth/sessions'&&request.method==='GET'){const hash=await sha256Hex(readCookie(request)!);const result=await env.DB.prepare('SELECT session_id,user_agent,created_at,last_seen_at,expires_at,(id_hash=?) AS is_current FROM sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY last_seen_at DESC').bind(hash,user.id,Date.now()).all();return json(result.results);}
 if(path==='/api/auth/sessions/revoke-others'&&request.method==='POST'){const hash=await sha256Hex(readCookie(request)!);const result=await env.DB.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND id_hash<>? AND revoked_at IS NULL').bind(Date.now(),user.id,hash).run();return json({ok:true,revoked_count:result.meta.changes});}
 const match=path.match(/^\/api\/auth\/sessions\/([^/]+)$/);if(match&&request.method==='DELETE'){const result=await env.DB.prepare('UPDATE sessions SET revoked_at=? WHERE session_id=? AND user_id=? AND revoked_at IS NULL').bind(Date.now(),match[1],user.id).run();return result.meta.changes?json({ok:true}):error('Session not found',404);}
 return null;
}

async function changePassword(request: Request, env: Env): Promise<Response> {
  if (!validMutationOrigin(request)) return error('Invalid request origin', 403);
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > 256_000) return error('Request too large', 413);
  const user = await currentSession(request, env);
  if (!user) return error('Not authenticated', 401);
  let input: { current_password?: unknown; new_password?: unknown };
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 256_000) return error('Request too large', 413);
    input = JSON.parse(body) as typeof input;
  } catch { return error('Invalid JSON body', 400); }
  if (!input || typeof input !== 'object' || typeof input.current_password !== 'string' || typeof input.new_password !== 'string') return error('Current and new passwords are required', 400);
  if (input.new_password.length < 8) return error('New password must be at least 8 characters', 400);
  const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ? AND disabled_at IS NULL').bind(user.id).first<{ password_hash: string }>();
  if (!row || !await verifyPassword(row.password_hash, input.current_password)) return error('Current password is incorrect', 401);
  const passwordHash = await hashPassword(input.new_password);
  const currentToken = readCookie(request)!;
  const currentHash = await sha256Hex(currentToken);
  const now = Date.now();
  await env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').bind(passwordHash, now, user.id).run();
  await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id_hash <> ? AND revoked_at IS NULL').bind(now, user.id, currentHash).run();
  return json({ ok: true });
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url), path = url.pathname.replace(/\/+$/, '') || '/';
  if (path === '/api/config' && request.method === 'GET') return json({ app: 'inotion-notes', auth: 'email-password' });
  if (path === '/api/auth/login' && request.method === 'POST') return login(request, env);
  if (path === '/api/auth/2fa/verify' && request.method === 'POST') { if(!validMutationOrigin(request)) return error('Invalid request origin',403); return twoFactorVerify(request,env); }
  if (path.startsWith('/api/auth/2fa/') || path.startsWith('/api/auth/sessions')) { if(['POST','DELETE'].includes(request.method)&&!validMutationOrigin(request)) return error('Invalid request origin',403); return await securityRoutes(request,env,path) || error('Not found',404); }
  if (path === '/api/auth/change-password' && request.method === 'POST') return changePassword(request, env);
  if (path === '/api/auth/me' && request.method === 'GET') {
    const user = await currentSession(request, env);
    return user ? json({ email: user.email }) : error('Not authenticated', 401);
  }
  if (path === '/api/auth/logout' && request.method === 'POST') {
    if (!validMutationOrigin(request)) return error('Invalid request origin', 403);
    const token = readCookie(request);
    if (token) await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE id_hash = ? AND revoked_at IS NULL').bind(Date.now(), await sha256Hex(token)).run();
    return json({ ok: true }, 200, { 'Set-Cookie': deniedCookie });
  }
  if (path.startsWith('/api/') && ['POST','PATCH','DELETE'].includes(request.method)) {
    if (!validMutationOrigin(request)) return error('Invalid request origin', 403);
    const length = Number(request.headers.get('Content-Length') || 0);
    const maxLength = request.headers.get('Content-Type')?.toLowerCase().startsWith('multipart/form-data') ? 26_500_000 : 256_000;
    if (length > maxLength) return error('Request too large', 413);
  }
  if (path.startsWith('/api/notes') || path.startsWith('/api/folders') || path.startsWith('/api/tags')) {
    const user = await currentSession(request, env);
    if (!user) return error('Not authenticated', 401);
    const noteIdPath = /^\/api\/notes\/[^/]+(?:\/restore)?$/.test(path);
    const logicalPath = noteIdPath ? path.replace(/^\/api\/notes\/[^/]+(?:\/restore)?$/, path.endsWith('/restore') ? '/api/notes/:id/restore' : '/api/notes/:id') : path;
    if (path.startsWith('/api/notes/') && path.endsWith('/attachments')) return await handleAttachments(request, env, user, path, url) || error('Not found', 404);
    if (/^\/api\/notes\/[^/]+$/.test(path) && request.method === 'DELETE') {
      const existing = await env.DB.prepare('SELECT id FROM notes WHERE id=? AND user_id=?').bind(path.split('/').pop(),user.id).first();
      if (!existing) return error('Note not found',404);
      try { await deleteNoteAttachments(env,user,path.split('/').pop()!); }
      catch { return error('Could not delete note attachments from storage',502); }
    }
    return await handleNotes(request, env, user, logicalPath, url) || error('Not found', 404);
  }
  if (path.startsWith('/api/attachments/')) {
    const user = await currentSession(request, env);
    if (!user) return error('Not authenticated', 401);
    if (request.method === 'DELETE' && !validMutationOrigin(request)) return error('Invalid request origin',403);
    return await handleAttachments(request,env,user,path,url) || error('Not found',404);
  }
  if (path.startsWith('/api/')) return error('Not found', 404);
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const response = await route(request, env);
      const headers = new Headers(response.headers);
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      headers.set('X-Frame-Options', 'DENY');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch { return error('Internal server error', 500); }
  }
};
