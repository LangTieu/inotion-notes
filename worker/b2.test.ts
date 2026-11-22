import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteB2, getB2, putB2 } from './b2';

// Regression test (2026-11-22): SigV4 failed live with B2 "Signature validation
// failed" on PUT because canonicalHeaders prepended `host:` before the sorted
// entries instead of sorting host together with them. With a content-type
// header present, `host` sorts AFTER `content-type`, so the canonical request
// was mis-ordered and B2 rejected the signature. GET/DELETE (no content-type)
// passed by luck because host already sorts first.
// This test recomputes the signature with an independent reference signer
// (all signed headers, sorted) and compares it to the captured Authorization.

const env = {
  B2_KEY_ID: 'test-key-id',
  B2_APPLICATION_KEY: 'test-app-key',
  B2_BUCKET_NAME: 'private-bucket',
  B2_S3_ENDPOINT: 'https://s3.us-east-005.backblazeb2.com',
};

const encoder = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
const sha256hex = async (v: string | Uint8Array) =>
  hex(await crypto.subtle.digest('SHA-256', (typeof v === 'string' ? encoder.encode(v) : v) as BufferSource));
const hmac = async (key: Uint8Array<ArrayBuffer>, v: string) => {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, encoder.encode(v)));
};

async function referenceSignature(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: Uint8Array,
): Promise<string> {
  const u = new URL(url);
  const payloadHash = await sha256hex(body);
  const entries = Object.entries(headers).sort(([a], [b]) => a.localeCompare(b));
  const canonicalHeaders = entries.map(([n, v]) => `${n}:${v}\n`).join('');
  const signedHeaders = entries.map(([n]) => n).join(';');
  const canonical = [method, u.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const amzDate = headers['x-amz-date'];
  const date = amzDate.slice(0, 8);
  const region = 'us-east-005';
  const scope = `${date}/${region}/s3/aws4_request`;
  const toSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await sha256hex(canonical)}`;
  const kDate = await hmac(encoder.encode(`AWS4${env.B2_APPLICATION_KEY}`), date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, 's3');
  const kSigning = await hmac(kService, 'aws4_request');
  return hex(await hmac(kSigning, toSign));
}

interface Captured {
  url: string;
  method: string;
  headers: Headers;
}
let captured: Captured | null;
let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  captured = null;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    captured = { url, method: init?.method || 'GET', headers: new Headers(init?.headers) };
    return new Response(null, { status: 200 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function authParts(): { signature: string; signedHeaders: string } {
  const auth = captured!.headers.get('authorization')!;
  return {
    signature: auth.match(/Signature=([0-9a-f]+)/)?.[1] ?? '',
    signedHeaders: auth.match(/SignedHeaders=([^,]+)/)?.[1] ?? '',
  };
}

describe('B2 SigV4 signing', () => {
  it('PUT with content-type: signature matches sorted canonical headers (incl. host)', async () => {
    const body = encoder.encode('hello');
    await putB2(env, 'user-a/note-a/file.txt', body, 'text/plain');
    expect(captured).not.toBeNull();
    const { signature, signedHeaders } = authParts();
    expect(signedHeaders).toBe('content-type;host;x-amz-content-sha256;x-amz-date');
    const headers: Record<string, string> = {
      host: new URL(captured!.url).host,
      'x-amz-content-sha256': captured!.headers.get('x-amz-content-sha256')!,
      'x-amz-date': captured!.headers.get('x-amz-date')!,
      'content-type': captured!.headers.get('content-type')!,
    };
    expect(signature).toBe(await referenceSignature('PUT', captured!.url, headers, body));
  });

  it('GET without content-type: signature matches sorted canonical headers', async () => {
    await getB2(env, 'user-a/note-a/file.txt');
    expect(captured).not.toBeNull();
    const { signature, signedHeaders } = authParts();
    expect(signedHeaders).toBe('host;x-amz-content-sha256;x-amz-date');
    const headers: Record<string, string> = {
      host: new URL(captured!.url).host,
      'x-amz-content-sha256': captured!.headers.get('x-amz-content-sha256')!,
      'x-amz-date': captured!.headers.get('x-amz-date')!,
    };
    expect(signature).toBe(await referenceSignature('GET', captured!.url, headers, new Uint8Array()));
  });

  it('DELETE signs and tolerates 404', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 404 })) as typeof fetch;
    await expect(deleteB2(env, 'user-a/note-a/file.txt')).resolves.toBeUndefined();
  });
});
