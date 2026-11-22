import type { Folder, Note } from '@/lib/inotion/types'

const yaml = (value: unknown) => `'${String(value ?? '').replace(/'/g, "''").replace(/[\r\n]/g, ' ')}'`
export function noteMarkdown(note: Note, folder?: string) {
  const tags = (note.tags || []).map(t => `  - ${yaml(t.name)}`).join('\n')
  return `---\ntitle: ${yaml(note.title)}\n${tags ? `tags:\n${tags}\n` : 'tags: []\n'}folder: ${yaml(folder || '')}\ncreated_at: ${yaml(note.created_at)}\nupdated_at: ${yaml(note.updated_at)}\n---\n\n${note.body_md || ''}\n`
}
export function markdownToSafeHtml(markdown: string) {
  let html = markdown.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
  html = html.replace(/^### (.+)$/gm,'<h3>$1</h3>').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/^# (.+)$/gm,'<h1>$1</h1>')
  html = html.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/`([^`]+)`/g,'<code>$1</code>')
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" rel="noopener noreferrer">$1</a>')
  return html.split(/\n{2,}/).map(block => /^<h[1-3]>/.test(block)?block:`<p>${block.replace(/\n/g,'<br>')}</p>`).join('\n')
}
export function standaloneHtml(note: Note) {
  const title = note.title.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{font:16px/1.65 system-ui,sans-serif;max-width:760px;margin:48px auto;padding:0 20px;color:#202124}pre,code{background:#f3f4f6;padding:.15em .35em;border-radius:4px}pre{padding:1em;overflow:auto}img{max-width:100%}a{color:#2459a6}</style></head><body><h1>${title}</h1>${markdownToSafeHtml(note.body_md)}</body></html>`
}
export function triggerDownload(name: string, blob: Blob) { const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000) }
export function exportNote(note: Note, format: 'md'|'html'|'pdf', folder?: string) {
  if(format==='md') triggerDownload(`${note.title||'note'}.md`,new Blob([noteMarkdown(note,folder)],{type:'text/markdown'}))
  else if(format==='html') triggerDownload(`${note.title||'note'}.html`,new Blob([standaloneHtml(note)],{type:'text/html'}))
  else { const win=window.open('','_blank'); if(!win) throw new Error('Allow popups to print this note'); win.document.write(standaloneHtml(note));win.document.close();win.focus();win.print() }
}
const encoder = new TextEncoder()
function crc32(bytes: Uint8Array) { let crc=0xffffffff; for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return (crc^0xffffffff)>>>0 }
function u16(n:number){return [n&255,(n>>>8)&255]} function u32(n:number){return [n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]}
export function createStoredZip(files: Record<string,string|Uint8Array>): Uint8Array {
  const local:number[]=[], central:number[]=[]
  for(const [name,data] of Object.entries(files)) { const n=encoder.encode(name), bytes=typeof data==='string'?encoder.encode(data):data, crc=crc32(bytes),offset=local.length
    local.push(...u32(0x04034b50),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(bytes.length),...u32(bytes.length),...u16(n.length),...u16(0),...n,...bytes)
    central.push(...u32(0x02014b50),...u16(20),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(bytes.length),...u32(bytes.length),...u16(n.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...n)
  }
  const endOffset=local.length; return new Uint8Array([...local,...central,...u32(0x06054b50),...u16(0),...u16(0),...u16(Object.keys(files).length),...u16(Object.keys(files).length),...u32(central.length),...u32(endOffset),...u16(0)])
}
export function markdownWorkspaceZip(notes: Note[], folders: Folder[], attachments: Record<string,string[]> = {}) {
  const files:Record<string,string>={}, names=new Map<string,string>(), byId=new Map(folders.map(f=>[String(f.id),f]))
  const path=(id:unknown):string=>{const folder=id==null?null:byId.get(String(id));if(!folder)return '';if(names.has(String(folder.id)))return names.get(String(folder.id))!;const value=`${path(folder.parent_id)}${folder.name.replace(/[\\/:*?"<>|]/g,'_')}/`;names.set(String(folder.id),value);return value}
  for(const note of notes){const base=(note.title||'Untitled').replace(/[\\/:*?"<>|]/g,'_').slice(0,120);files[`${path(note.folder_id)}${base}-${note.id}.md`]=noteMarkdown(note, path(note.folder_id).replace(/\/$/,''))}
  files['manifest.json']=JSON.stringify({notes:notes.map(n=>({id:n.id,title:n.title,folder_id:n.folder_id,attachments:attachments[String(n.id)]||[]}))},null,2)
  return createStoredZip(files)
}
