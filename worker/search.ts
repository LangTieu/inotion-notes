import { decryptText, ENC_PREFIX } from './crypto';
export interface SearchRow { id:string; body_md:string; }
/** Search encrypted bodies only after decrypting them in the Worker; never persist snippets. */
export async function findEncryptedBodyMatches<T extends SearchRow>(rows:T[],query:string,key:CryptoKey):Promise<T[]>{
 const needle=query.trim().toLocaleLowerCase();if(!needle)return [];
 const matches:T[]=[];for(const row of rows){if(!row.body_md.startsWith(ENC_PREFIX))continue;const body=await decryptText(row.body_md,key);if(body.toLocaleLowerCase().includes(needle))matches.push(row);}return matches;
}
