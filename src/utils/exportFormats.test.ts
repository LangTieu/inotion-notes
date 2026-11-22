import { describe, expect, it, vi } from 'vitest'
import { createStoredZip, markdownToSafeHtml, markdownWorkspaceZip, noteMarkdown, standaloneHtml } from './exportFormats'
import { compressImage, parseImportFiles } from './importers'
import type { Note } from '@/lib/inotion/types'

const note:Note={id:'n1',folder_id:'f1',title:'A title',body_md:'<script>alert(1)</script>\n\n**bold**',is_pinned:false,archived_at:null,trashed_at:null,created_at:'2025-01-01',updated_at:'2025-01-02',revision:1,tags:[{id:'t',name:'work'}]}
describe('export formats',()=>{
 it('writes markdown YAML frontmatter',()=>{const md=noteMarkdown(note,'Work');expect(md).toContain("title: 'A title'");expect(md).toContain("folder: 'Work'");expect(md).toContain("  - 'work'")})
 it('escapes HTML and permits only safe markdown links',()=>{const html=markdownToSafeHtml('<img src=x onerror=alert(1)> [ok](javascript:alert(1))');expect(html).not.toContain('<img');expect(html).not.toContain('<a href="javascript:');expect(standaloneHtml(note)).toContain('&lt;script&gt;')})
 it('creates a stored ZIP containing note paths and attachment manifest',()=>{const zip=markdownWorkspaceZip([note],[{id:'f1',name:'Work',parent_id:null,position:0,created_at:'',updated_at:''}]);const text=new TextDecoder().decode(zip);expect(text).toContain('Work/A title-n1.md');expect(text).toContain('manifest.json');expect(createStoredZip({'a.txt':'hi'}).length).toBeGreaterThan(20)})
 it('leaves non-images untouched by image compression',async()=>{const file=new File(['text'],'a.txt',{type:'text/plain'});expect(await compressImage(file)).toBe(file)})
 it('compresses oversized image files through Canvas',async()=>{vi.stubGlobal('createImageBitmap',async()=>({width:3000,height:1500,close(){}}));vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){}}),toBlob:(cb:(b:Blob)=>void)=>cb(new Blob(['small'],{type:'image/jpeg'}))})});const file=new File([new Uint8Array(5*1024*1024)],'photo.jpg',{type:'image/jpeg'});const result=await compressImage(file);expect(result.size).toBeLessThan(file.size);vi.unstubAllGlobals()})
 it('reads stored Markdown ZIP archives in the browser',async()=>{const bytes=createStoredZip({'Folder/Note.md':'---\ntitle: Note\n---\nBody'}),file=new File([bytes.slice().buffer as ArrayBuffer],'vault.zip');const report=await parseImportFiles([file]);expect(report.notes[0].folder).toBe('Folder');expect(report.notes[0].title).toBe('Note')})
})
