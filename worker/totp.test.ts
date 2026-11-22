import { describe, expect, it } from 'vitest';
import { encodeBase32, totpAt, verifyTotp, decodeBase32, recoveryCodes, hashRecoveryCode } from './totp';

describe('TOTP (RFC 6238 SHA-1)',()=>{
 it('matches the RFC 4226/HOTP-derived SHA-1 six digit vector at 59 seconds',async()=>{const secret=encodeBase32(new TextEncoder().encode('12345678901234567890'));expect(await totpAt(secret,1)).toBe('287082');});
 it('accepts one adjacent time step and rejects two',async()=>{const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';const now=1_000_000;const code=await totpAt(secret,Math.floor(now/30000)-1);expect(await verifyTotp(secret,code,now)).not.toBeNull();const far=await totpAt(secret,Math.floor(now/30000)-2);expect(await verifyTotp(secret,far,now)).toBeNull();});
 it('round trips base32 and produces single-use-ready recovery code hashes',async()=>{const secret=crypto.getRandomValues(new Uint8Array(20));expect(decodeBase32(encodeBase32(secret))).toEqual(secret);const codes=recoveryCodes();expect(codes).toHaveLength(8);expect(await hashRecoveryCode(codes[0])).toHaveLength(64);});
});
