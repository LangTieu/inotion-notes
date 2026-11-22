import { deleteB2, type B2Env } from './b2';

const encoder = new TextEncoder();
const hex = (data: ArrayBuffer | Uint8Array) => [...new Uint8Array(data instanceof Uint8Array ? data : data)].map(x => x.toString(16).padStart(2, '0')).join('');
const hash = async (value: string) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
const hmac = async (key: Uint8Array, value: string) => {
  const cryptoKey = await crypto.subtle.importKey('raw', key.slice().buffer as ArrayBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value)));
};
const enc = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

function config(env: B2Env) {
  if (!env.B2_KEY_ID || !env.B2_APPLICATION_KEY || !env.B2_BUCKET_NAME || !env.B2_S3_ENDPOINT) throw new Error('B2 storage is not configured');
  const endpoint = new URL(env.B2_S3_ENDPOINT);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Invalid B2 endpoint');
  const region = endpoint.hostname.match(/s3\.([a-z0-9-]+)\.backblazeb2\.com$/)?.[1];
  if (!region) throw new Error('Invalid B2 S3 endpoint region');
  return { endpoint, region, bucket: env.B2_BUCKET_NAME, keyId: env.B2_KEY_ID, secret: env.B2_APPLICATION_KEY };
}

export async function presignB2Put(env: B2Env, key: string, contentType: string, now = new Date(), expiresSeconds = 600): Promise<string> {
  const c = config(env), amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''), date = amzDate.slice(0, 8);
  const path = `${c.endpoint.pathname.replace(/\/$/, '')}/${enc(c.bucket)}/${key.split('/').map(enc).join('/')}`;
  const url = new URL(c.endpoint.origin + path), scope = `${date}/${c.region}/s3/aws4_request`;
  const params: Record<string,string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${c.keyId}/${scope}`,
    'X-Amz-Date': amzDate, 'X-Amz-Expires': String(expiresSeconds), 'X-Amz-SignedHeaders': 'content-type;host',
  };
  const query = Object.entries(params).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${enc(k)}=${enc(v)}`).join('&');
  const canonical = ['PUT', url.pathname, query, `content-type:${contentType.trim()}\nhost:${url.host}\n`, 'content-type;host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await hash(canonical)}`;
  let signing = await hmac(encoder.encode(`AWS4${c.secret}`), date);
  signing = await hmac(signing, c.region); signing = await hmac(signing, 's3'); signing = await hmac(signing, 'aws4_request');
  params['X-Amz-Signature'] = hex(await hmac(signing, toSign));
  const finalQuery = Object.entries(params).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${enc(k)}=${enc(v)}`).join('&');
  return `${url.origin}${url.pathname}?${finalQuery}`;
}

export async function headB2(env: B2Env, key: string): Promise<{ exists: boolean; contentLength: number | null }> {
  const c = config(env), url = new URL(`${c.endpoint.pathname.replace(/\/$/, '')}/${enc(c.bucket)}/${key.split('/').map(enc).join('/')}`, c.endpoint.origin);
  const now = new Date(), amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''), date = amzDate.slice(0,8), payloadHash = await hash('');
  const headers = new Headers({ 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate });
  const signedHeaders = `host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const names = 'host;x-amz-content-sha256;x-amz-date', canonical = ['HEAD',url.pathname,'',signedHeaders,names,payloadHash].join('\n'), scope = `${date}/${c.region}/s3/aws4_request`;
  const toSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await hash(canonical)}`;
  let signing = await hmac(encoder.encode(`AWS4${c.secret}`),date); signing=await hmac(signing,c.region); signing=await hmac(signing,'s3'); signing=await hmac(signing,'aws4_request');
  headers.set('Authorization',`AWS4-HMAC-SHA256 Credential=${c.keyId}/${scope}, SignedHeaders=${names}, Signature=${hex(await hmac(signing,toSign))}`);
  const response = await fetch(url,{method:'HEAD',headers});
  if(response.status===404) return {exists:false,contentLength:null};
  if(!response.ok) throw new Error(`B2 HEAD failed (${response.status})`);
  return {exists:true,contentLength:Number(response.headers.get('content-length'))};
}

export async function pruneB2Object(env: B2Env, key: string) { await deleteB2(env,key); }
