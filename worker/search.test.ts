import { describe,it,expect } from 'vitest';
import { encryptText,getEncryptionKey } from './crypto';
import { findEncryptedBodyMatches } from './search';
describe('encrypted-body search',()=>{it('finds matches after worker-side decryption and ignores other users by caller scope',async()=>{const key=await getEncryptionKey(btoa('01234567890123456789012345678901'));const rows=[{id:'owned',body_md:await encryptText('secret phrase',key)},{id:'other',body_md:'plain text'}];expect((await findEncryptedBodyMatches(rows,'SECRET',key)).map(x=>x.id)).toEqual(['owned']);});});
