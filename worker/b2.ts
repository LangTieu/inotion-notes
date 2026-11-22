export interface B2Env {
  B2_KEY_ID?: string;
  B2_APPLICATION_KEY?: string;
  B2_BUCKET_NAME?: string;
  B2_S3_ENDPOINT?: string;
  B2_2_KEY_ID?: string;
  B2_2_APPLICATION_KEY?: string;
  B2_2_BUCKET_NAME?: string;
  B2_2_S3_ENDPOINT?: string;
}

export type B2Account = 'tk1' | 'tk2';

export function b2EnvFor(env: B2Env, account: B2Account): B2Env {
  if (account === 'tk1') return env;
  return {
    B2_KEY_ID: env.B2_2_KEY_ID,
    B2_APPLICATION_KEY: env.B2_2_APPLICATION_KEY,
    B2_BUCKET_NAME: env.B2_2_BUCKET_NAME,
    B2_S3_ENDPOINT: env.B2_2_S3_ENDPOINT,
  };
}

export function isB2AccountConfigured(env: B2Env, account: B2Account): boolean {
  const selected = b2EnvFor(env, account);
  return Boolean(selected.B2_KEY_ID && selected.B2_APPLICATION_KEY && selected.B2_BUCKET_NAME && selected.B2_S3_ENDPOINT);
}

const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer | Uint8Array) => [...new Uint8Array(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
const sha256 = async (value: string | Uint8Array) => { const data = typeof value === 'string' ? encoder.encode(value) : value; return hex(await crypto.subtle.digest('SHA-256', data.slice().buffer as ArrayBuffer)); };
const hmac = async (key: ArrayBuffer | Uint8Array, value: string) => {
  const keyBytes = key instanceof Uint8Array ? key : new Uint8Array(key);
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes.slice().buffer as ArrayBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const data = encoder.encode(value);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, data.buffer as ArrayBuffer));
};
const awsEncode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

async function signedRequest(env: B2Env, method: string, key: string, body?: Uint8Array, contentType?: string): Promise<Response> {
  if (!env.B2_KEY_ID || !env.B2_APPLICATION_KEY || !env.B2_BUCKET_NAME || !env.B2_S3_ENDPOINT) throw new Error('B2 storage is not configured');
  const endpoint = new URL(env.B2_S3_ENDPOINT);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Invalid B2 endpoint');
  const region = endpoint.hostname.match(/s3\.([a-z0-9-]+)\.backblazeb2\.com$/)?.[1];
  if (!region) throw new Error('Invalid B2 S3 endpoint region');
  const path = `${endpoint.pathname.replace(/\/$/, '')}/${awsEncode(env.B2_BUCKET_NAME)}/${key.split('/').map(awsEncode).join('/')}`;
  const url = new URL(endpoint.origin + path);
  const now = new Date(), amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''), date = amzDate.slice(0, 8);
  const payloadHash = await sha256(body || new Uint8Array());
  const headers = new Headers({ 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate });
  if (contentType) headers.set('content-type', contentType);
  const orderedHeaders = new Map([['host', url.host], ...headers.entries()]);
  const ordered = [...orderedHeaders.entries()].sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const signedHeaders = ordered.map(([name]) => name.toLowerCase()).join(';');
  const canonicalHeaders = ordered.map(([name, value]) => `${name.toLowerCase()}:${value.trim()}\n`).join('');
  const canonical = [method, url.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${date}/${region}/s3/aws4_request`;
  const toSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await sha256(canonical)}`;
  const kDate = await hmac(encoder.encode(`AWS4${env.B2_APPLICATION_KEY}`), date);
  const kRegion = await hmac(kDate, region), kService = await hmac(kRegion, 's3'), kSigning = await hmac(kService, 'aws4_request');
  const signature = hex(await hmac(kSigning, toSign));
  headers.set('Authorization', `AWS4-HMAC-SHA256 Credential=${env.B2_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`);
  return fetch(url, { method, headers, ...(method === 'PUT' ? { body: body as BodyInit } : {}) });
}

export async function putB2(env: B2Env, key: string, bytes: Uint8Array, contentType: string) {
  const response = await signedRequest(env, 'PUT', key, bytes, contentType);
  if (!response.ok) throw new Error(`B2 upload failed (${response.status})`);
}
export async function getB2(env: B2Env, key: string) {
  const response = await signedRequest(env, 'GET', key);
  if (!response.ok) throw new Error(`B2 download failed (${response.status})`);
  return response;
}
export async function deleteB2(env: B2Env, key: string) {
  const response = await signedRequest(env, 'DELETE', key);
  if (!response.ok && response.status !== 404) throw new Error(`B2 delete failed (${response.status})`);
}
