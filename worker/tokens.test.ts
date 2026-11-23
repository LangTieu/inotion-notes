import { beforeEach,describe,expect,it,vi } from 'vitest';
import { handleTokens } from './tokens';
const state={inserted:[] as any[],revoked:false};
vi.mock('./auth',async importOriginal=>{const original=await importOriginal<typeof import('./auth')>();return {...original,currentSession:vi.fn(async()=>({id:'user-a',email:'a@test'}))};});
const env:any={DB:{prepare(sql:string){let args:any[]=[];const q:any={bind(...v:any[]){args=v;return q},async run(){if(sql.startsWith('INSERT INTO api_tokens'))state.inserted=args;if(sql.startsWith('UPDATE api_tokens'))state.revoked=true;return {meta:{changes:1}}},async all(){return {results:[]}}};return q;}}};
beforeEach(()=>{state.inserted=[];state.revoked=false;});
describe('personal access tokens',()=>{
 it('stores only the token hash and returns the raw secret once',async()=>{
  const response=await handleTokens(new Request('https://notes.test/api/tokens',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'MCP',scopes:['read']})}),env,'/api/tokens');
  const result=await response.json() as any;expect(response.status).toBe(201);expect(result.token).toMatch(/^ino_[A-Za-z0-9_-]{43}$/);
  expect(state.inserted[4]).not.toBe(result.token);expect(state.inserted[4]).toMatch(/^[a-f0-9]{64}$/);expect(result.token_hash).toBeUndefined();
 });
 it('returns metadata without hashes and revokes by owner scoped id',async()=>{
  const list=await handleTokens(new Request('https://notes.test/api/tokens'),env,'/api/tokens');expect(await list.json()).toEqual([]);
  const revoked=await handleTokens(new Request('https://notes.test/api/tokens/token-a',{method:'DELETE'}),env,'/api/tokens/token-a');expect(revoked.status).toBe(200);expect(state.revoked).toBe(true);
 });
});
