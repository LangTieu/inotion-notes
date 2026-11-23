import { encryptText, getEncryptionKey } from './crypto';
import type { SessionUser } from './auth';
import { generateShortCode } from './notes';
const json=(v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const bad=(message:string,status=400)=>json({error:message},status);
function blockedHost(host:string):boolean {
 const h=host.toLowerCase().replace(/^\[|\]$/g,'').replace(/\.$/,'');
 if(h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h==='metadata'||h==='metadata.google.internal'||h==='metadata.azure.internal'||h==='169.254.169.254')return true;
 // Only globally routable IPv6 unicast addresses use the 2000::/3 range.
 // This also rejects alternate and IPv4-mapped spellings of private IPv6 hosts.
 if(h.includes(':'))return !/^[23][0-9a-f]{0,3}:/i.test(h);
 if(/^\d{1,3}(\.\d{1,3}){3}$/.test(h)){const a=h.split('.').map(Number);if(a.some(x=>x>255))return true;return a[0]===0||a[0]===10||a[0]===127||a[0]>=224||a[0]===169&&a[1]===254||a[0]===172&&a[1]>=16&&a[1]<=31||a[0]===192&&a[1]===168||a[0]===100&&a[1]>=64&&a[1]<=127;}
 return false;
}
function decode(s:string){return s.replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)||32));}
function textify(html:string){
 const metaTitle=html.match(/<meta\b[^>]*\bproperty=["']og:title["'][^>]*>/i)?.[0]?.match(/\bcontent=["']([^"']*)["']/i)?.[1];
 const title=decode((html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]||metaTitle||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());
 let content=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|nav|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
 content=content.match(/<(article|main)\b[^>]*>[\s\S]*?<\/\1\s*>/i)?.[0]||content;
 const markdown=content.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi,(_,n,t)=>`\n${'#'.repeat(Number(n))} ${t}\n`).replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi,(_,u,t)=>`[${t}](${u})`).replace(/<p\b[^>]*>/gi,'\n\n').replace(/<\/p\s*>/gi,'\n\n').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,' ').split(/\n/).map(x=>decode(x).replace(/[ \t]+/g,' ').trim()).join('\n').replace(/\n{3,}/g,'\n\n').trim().slice(0,20_000);
 return {title:title.slice(0,200),markdown};
}
export async function handleClip(request:Request,env:{DB:D1Database;ENCRYPTION_KEY?:string},user:SessionUser):Promise<Response>{
 let input:any;try{input=await request.json()}catch{return bad('Invalid JSON body')}
 if(typeof input?.url!=='string'||input.url.length>2048)return bad('A valid URL is required');
 let url:URL;try{url=new URL(input.url)}catch{return bad('Invalid URL')}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||blockedHost(url.hostname))return bad('URL is not allowed');
 const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM notes WHERE user_id=? AND source_url IS NOT NULL AND created_at>?').bind(user.id,Date.now()-3_600_000).first<{n:number}>();
 if((count?.n||0)>=20)return bad('Clip rate limit exceeded',429);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10_000);
 let response:Response;try{response=await fetch(url.href,{signal:controller.signal,redirect:'manual',headers:{Accept:'text/html'}})}catch{clearTimeout(timer);return bad('Could not fetch URL',502)}
 if(!response.ok||response.status>=300){clearTimeout(timer);return bad('Could not fetch URL',502)}
 if((response.headers.get('content-type')||'').split(';',1)[0].trim().toLowerCase()!=='text/html'){clearTimeout(timer);return bad('URL did not return HTML',415)}
 const length=Number(response.headers.get('content-length')||0);if(length>2_097_152){clearTimeout(timer);return bad('Page is too large',413)}
 let html='';try{if(!response.body)return bad('Could not read page',502);const reader=response.body.getReader();const decoder=new TextDecoder();let bytes=0;while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>2_097_152){await reader.cancel();return bad('Page is too large',413)}html+=decoder.decode(value,{stream:true})}html+=decoder.decode()}catch{return bad('Could not read page',502)}finally{clearTimeout(timer)}
 const sourceUrl=input.url,extracted=textify(html),now=Date.now(),id=crypto.randomUUID(),key=await getEncryptionKey(env.ENCRYPTION_KEY),body=`${extracted.markdown}${extracted.markdown?'\n\n':''}Source: ${sourceUrl}`;
 try{await env.DB.prepare('INSERT INTO notes(id,user_id,title,body_md,created_at,updated_at,short_code,source_url) VALUES(?,?,?,?,?,?,?,?)').bind(id,user.id,extracted.title,await encryptText(body,key),now,now,generateShortCode(),sourceUrl).run()}catch{return bad('Could not save clipped page',500)}
 return json({id,title:extracted.title,body_md:body,source_url:sourceUrl},201);
}
