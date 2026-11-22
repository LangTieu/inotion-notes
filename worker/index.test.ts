import { describe, expect, it } from 'vitest';
import worker from './index';

describe('GET /api/config', () => {
  it('returns only minimal public app configuration', async () => {
    const response = await worker.fetch(new Request('https://inotion.eu.cc/api/config'), {} as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ app: 'inotion-notes', auth: 'email-password' });
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});
