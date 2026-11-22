import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

type Tag={id:string;name:string};
type Note={id:string;title:string;body_md:string;snippet?:string;revision:number;updated_at:number;is_pinned:boolean;archived_at:number|null;trashed_at:number|null;folder_id:string|null;tags:Tag[]};
type View='all'|'pinned'|'archive'|'trash';
type Attachment={id:string;filename:string;content_type:string;byte_size:number};

function MarkdownPreview({value}:{value:string}) {
  return <article className="markdown-preview">{value.split('\n').map((line,index)=>{
    if(line.startsWith('### '))return <h3 key={index}>{line.slice(4)}</h3>;
    if(line.startsWith('## '))return <h2 key={index}>{line.slice(3)}</h2>;
    if(line.startsWith('# '))return <h1 key={index}>{line.slice(2)}</h1>;
    if(line.startsWith('> '))return <blockquote key={index}>{line.slice(2)}</blockquote>;
    if(/^[-*] /.test(line))return <p className="markdown-list-item" key={index}>• {line.slice(2)}</p>;
    if(!line.trim())return <br key={index}/>;
    return <p key={index}>{line}</p>;
  })}</article>;
}

export default function NotesWorkspace({user,onLogout}:{user:string;onLogout:()=>void}) {
  const [notes,setNotes]=useState<Note[]>([]),[folders,setFolders]=useState<any[]>([]),[tags,setTags]=useState<any[]>([]);
  const [selected,setSelected]=useState<Note|null>(null),[view,setView]=useState<View>('all'),[folder,setFolder]=useState(''),[tag,setTag]=useState(''),[query,setQuery]=useState('');
  const [saving,setSaving]=useState(false),[preview,setPreview]=useState(false),[conflict,setConflict]=useState(false),[error,setError]=useState(''),[drawerOpen,setDrawerOpen]=useState(false);
  const [attachments,setAttachments]=useState<Attachment[]>([]),[quotaWarning,setQuotaWarning]=useState(false),[uploading,setUploading]=useState(false);
  const [nextCursor,setNextCursor]=useState<string|null>(null),[exporting,setExporting]=useState(false);
  const timer=useRef<number|undefined>(undefined),search=useRef<HTMLInputElement>(null),saveRef=useRef<()=>void>(()=>{}),refreshSeq=useRef(0);

  const refresh=useCallback(async()=>{const seq=++refreshSeq.current;try{
    const [noteResult,folderResult,tagResult]=await Promise.all([api.listNotes({view,...(folder?{folder}:{}),...(tag?{tag}:{}),...(query.trim()?{q:query.trim()}:{})}),api.folders(),api.tags()]);
    if(seq!==refreshSeq.current)return;setNotes(noteResult.notes);setNextCursor(noteResult.nextCursor);setFolders(folderResult.results||[]);setTags(tagResult.results||[]);setError('');
  }catch(cause){setError((cause as Error).message);}},[view,folder,tag,query]);
  const loadMore=async()=>{if(!nextCursor)return;try{const page=await api.listNotes({view,...(folder?{folder}:{}),...(tag?{tag}:{}),...(query.trim()?{q:query.trim()}:{}),cursor:nextCursor});setNotes(current=>[...current,...page.notes.filter(note=>!current.some(item=>item.id===note.id))]);setNextCursor(page.nextCursor);}catch(cause){setError((cause as Error).message);}};
  const exportData=async()=>{setExporting(true);try{const data=await api.exportNotes();const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const href=URL.createObjectURL(blob);const link=document.createElement('a');link.href=href;link.download='inotion-notes-export.json';link.click();URL.revokeObjectURL(href);}catch(cause){setError((cause as Error).message);}finally{setExporting(false);}};
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{const onFocus=()=>{if(document.visibilityState==='visible')void refresh();};window.addEventListener('focus',onFocus);return()=>window.removeEventListener('focus',onFocus);},[refresh]);
  useEffect(()=>()=>window.clearTimeout(timer.current),[]);

  const open=async(note:Note)=>{try{setSelected(await api.note(note.id));setConflict(false);setError('');setDrawerOpen(false);}catch(cause){setError((cause as Error).message);}};
  useEffect(()=>{if(!selected)return;void api.attachments(selected.id).then(result=>setAttachments(result.attachments)).catch(cause=>setError((cause as Error).message));},[selected?.id]);
  const upload=async(file:File)=>{if(!selected)return;setUploading(true);try{const result=await api.uploadAttachment(selected.id,file);setAttachments(current=>[...current,result]);setQuotaWarning(!!result.quotaWarning);setError('');}catch(cause){setError((cause as Error).message);}finally{setUploading(false);}};
  const create=async()=>{try{const note=await api.createNote({title:'',body_md:'',...(folder?{folder_id:folder}:{})});setSelected(note);setPreview(false);setError('');await refresh();setDrawerOpen(false);}catch(cause){setError((cause as Error).message);}};
  const save=async(note:Note)=>{window.clearTimeout(timer.current);setSaving(true);try{const saved=await api.updateNote(note.id,{...note,tag_ids:note.tags?.map(item=>item.id)||[]});setSelected(current=>current?.id===saved.id?saved:current);setConflict(false);await refresh();}catch(cause){if((cause as any).status===409)setConflict(true);else setError((cause as Error).message);}finally{setSaving(false);}};
  saveRef.current=()=>{if(selected)void save(selected);};
  const update=(patch:Partial<Note>)=>{if(!selected)return;const next={...selected,...patch};setSelected(next);setSaving(true);window.clearTimeout(timer.current);timer.current=window.setTimeout(()=>void save(next),650);};
  useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();search.current?.focus();}if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='s'){event.preventDefault();saveRef.current();}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[]);

  const heading=view==='trash'?'Thùng rác':view==='archive'?'Đã lưu trữ':view==='pinned'?'Đã ghim':folder?folders.find(item=>item.id===folder)?.name:'Ghi chú';
  const nav=(next:View)=>{setView(next);setFolder('');setTag('');setSelected(null);setDrawerOpen(false);};
  const createOrRename=async(kind:'folder'|'tag',id?:string,currentName?:string)=>{const name=prompt(id?`Đổi tên ${currentName||''}`:`Tên ${kind==='folder'?'thư mục':'nhãn'}`,id?currentName:'');if(!name?.trim())return;try{if(kind==='folder')id?await api.updateFolder(id,name):await api.createFolder(name);else id?await api.updateTag(id,name):await api.createTag(name);await refresh();}catch(cause){setError((cause as Error).message);}};
  const remove = async(kind:'folder'|'tag',id:string,name:string)=>{if(!confirm(`Xóa ${kind==='folder'?'thư mục':'nhãn'} “${name}”?`))return;try{if(kind==='folder')await api.deleteFolder(id);else await api.deleteTag(id);if(folder===id)setFolder('');if(tag===id)setTag('');await refresh();}catch(cause){setError((cause as Error).message);}};

  return <main className="workspace notes-workspace">
    <header className="topbar"><div className="brand-lockup"><button className="mobile-menu" aria-label="Mở điều hướng" onClick={()=>setDrawerOpen(true)}>☰</button><span className="brand-mark">i</span><span>inotion</span></div><div className="topbar-right"><span className="save-state"><i className={saving?'is-saving':''}/>{saving?'Đang lưu…':'Đã lưu'}</span><span className="avatar">{user[0]?.toUpperCase()}</span><span className="user-email">{user}</span><button className="logout" onClick={onLogout}>Đăng xuất ↗</button></div></header>
    <div className="notes-toolbar"><label className="search-box"><span aria-hidden="true">⌕</span><input ref={search} id="notes-search" aria-label="Tìm ghi chú" placeholder="Tìm trong ghi chú · Ctrl/⌘ K" value={query} onChange={event=>setQuery(event.target.value)}/>{query&&<button aria-label="Xóa tìm kiếm" onClick={()=>setQuery('')}>×</button>}</label><button className="outline-button export-button" aria-label="Xuất toàn bộ ghi chú thành JSON" disabled={exporting} onClick={()=>void exportData()}>{exporting?'Đang xuất…':'Xuất dữ liệu'}</button><button className="create-note" aria-label="Tạo ghi chú mới" onClick={()=>void create()}><span aria-hidden="true">＋</span> Ghi chú mới</button></div>
    {drawerOpen&&<button className="drawer-scrim" aria-label="Đóng điều hướng" onClick={()=>setDrawerOpen(false)}/>}
    <div className="notes-layout">
      <aside className={`notes-sidebar ${drawerOpen?'drawer-open':''}`}>
        <div className="mobile-drawer-heading"><strong>Không gian</strong><button aria-label="Đóng điều hướng" onClick={()=>setDrawerOpen(false)}>×</button></div>
        <div className="side-section"><div className="section-title">KHÔNG GIAN</div>{([['all','Tất cả','▦'],['pinned','Đã ghim','◆'],['archive','Đã lưu trữ','▱'],['trash','Thùng rác','♲']] as [View,string,string][]).map(([value,label,icon])=><button key={value} className={`nav-item ${view===value&&!folder&&!tag?'active':''}`} onClick={()=>nav(value)}><span>{icon}</span>{label}</button>)}</div>
        <div className="side-section"><div className="section-title">THƯ MỤC <button aria-label="Tạo thư mục" onClick={()=>void createOrRename('folder')}>＋</button></div>{folders.map(item=><div className="side-row" key={item.id}><button className={`nav-item ${folder===item.id?'active':''}`} onClick={()=>{setFolder(item.id);setTag('');setView('all');setSelected(null);setDrawerOpen(false);}}>▱ {item.name}</button><div className="side-row-actions"><button aria-label={`Đổi tên ${item.name}`} onClick={()=>void createOrRename('folder',item.id,item.name)}>✎</button><button aria-label={`Xóa ${item.name}`} onClick={()=>void remove('folder',item.id,item.name)}>×</button></div></div>)}</div>
        <div className="side-section"><div className="section-title">NHÃN <button aria-label="Tạo nhãn" onClick={()=>void createOrRename('tag')}>＋</button></div>{tags.map(item=><div className="side-row" key={item.id}><button className={`nav-item ${tag===item.id?'active':''}`} onClick={()=>{setTag(item.id);setFolder('');setView('all');setSelected(null);setDrawerOpen(false);}}># {item.name}<small>{item.note_count}</small></button><div className="side-row-actions"><button aria-label={`Đổi tên ${item.name}`} onClick={()=>void createOrRename('tag',item.id,item.name)}>✎</button><button aria-label={`Xóa ${item.name}`} onClick={()=>void remove('tag',item.id,item.name)}>×</button></div></div>)}</div>
      </aside>
      <section className="notes-main" aria-label="Danh sách ghi chú"><div className="notes-heading"><div><p className="eyebrow">KHÔNG GIAN CỦA TÔI</p><h1>{heading}</h1></div><span aria-live="polite">{notes.length} ghi chú</span></div>{error&&<p className="error" role="alert">{error}</p>}
        <div className="notes-grid">{notes.map(note=><button className={`note-card ${selected?.id===note.id?'chosen':''}`} key={note.id} onClick={()=>void open(note)}><span className="card-pin">{note.is_pinned?'◆':''}</span><h2>{note.title||'Ghi chú không tiêu đề'}</h2><p>{note.snippet||note.body_md?.slice(0,140)||'Chưa có nội dung'}</p><div className="card-tags">{note.tags?.map(item=><span key={item.id}>#{item.name}</span>)}</div><small>{new Date(note.updated_at).toLocaleString()}</small></button>)}</div>
        {!notes.length&&<div className="notes-empty"><span className="empty-note-icon">✳</span><h2>{query?'Không tìm thấy ghi chú':'Chưa có ghi chú ở đây'}</h2><p>{query?'Thử một từ khóa khác.':'Tạo một ghi chú mới để bắt đầu.'}</p>{!query&&<button className="outline-button" onClick={()=>void create()}>＋ Tạo ghi chú</button>}</div>}
        {nextCursor&&<button className="outline-button load-more" onClick={()=>void loadMore()}>Tải thêm ghi chú</button>}
      </section>
      {selected&&<aside className="note-editor" aria-label="Trình soạn thảo ghi chú"><div className="editor-actions"><span className={saving?'saving':''} role="status">{saving?'Đang lưu…':'Đã lưu'}</span><button aria-label="Đóng trình soạn thảo" onClick={()=>setSelected(null)}>×</button></div>
        <input className="editor-title" aria-label="Tiêu đề ghi chú" placeholder="Tiêu đề" value={selected.title} onChange={event=>update({title:event.target.value})}/>
        <div className="editor-controls"><button aria-pressed={selected.is_pinned} onClick={()=>update({is_pinned:!selected.is_pinned})}>{selected.is_pinned?'◆ Đã ghim':'◇ Ghim'}</button><button onClick={()=>update({archived_at:selected.archived_at?null:Date.now()})}>{selected.archived_at?'Bỏ lưu trữ':'Lưu trữ'}</button><button onClick={()=>update({trashed_at:selected.trashed_at?null:Date.now()})}>Thùng rác</button><button onClick={()=>setPreview(value=>!value)}>{preview?'Sửa':'Xem trước'}</button></div>
        {preview?<MarkdownPreview value={selected.body_md}/>:<textarea className="editor-body" aria-label="Nội dung Markdown" placeholder="Viết bằng Markdown…" value={selected.body_md} onChange={event=>update({body_md:event.target.value})}/>}
        <label className="editor-label">Thư mục<select value={selected.folder_id||''} onChange={event=>update({folder_id:event.target.value||null})}><option value="">Không có</option>{folders.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="editor-label">Nhãn<div className="tag-checks">{tags.map(item=><label key={item.id}><input type="checkbox" checked={selected.tags?.some(entry=>entry.id===item.id)||false} onChange={event=>update({tags:event.target.checked?[...(selected.tags||[]),{id:item.id,name:item.name}]:selected.tags?.filter(entry=>entry.id!==item.id)})}/>{item.name}</label>)}</div></div>
        <section className="attachment-panel"><h3>Đính kèm</h3><label className="outline-button">{uploading?'Đang tải…':'＋ Thêm tệp'}<input type="file" hidden disabled={uploading} onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file);event.currentTarget.value='';}}/></label>{quotaWarning&&<p role="status">Dung lượng lưu trữ sắp chạm 7 GB.</p>}{attachments.map(item=><div className="attachment-item" key={item.id}>{item.content_type.startsWith('image/')&&<img src={`/api/attachments/${item.id}`} alt={item.filename}/>}<a href={`/api/attachments/${item.id}`} target="_blank" rel="noreferrer">{item.filename} · {(item.byte_size/1024).toFixed(1)} KB</a><button aria-label={`Xóa tệp ${item.filename}`} onClick={async()=>{try{await api.deleteAttachment(item.id);setAttachments(current=>current.filter(entry=>entry.id!==item.id));}catch(cause){setError((cause as Error).message);}}}>×</button></div>)}</section>
        {view==='trash'&&<div className="trash-actions"><button className="outline-button" onClick={async()=>{try{const result=await api.restoreNote(selected.id);setSelected(result);await refresh();}catch(cause){setError((cause as Error).message);}}}>Khôi phục</button><button className="danger-button" onClick={async()=>{if(confirm('Xóa vĩnh viễn ghi chú này?')){try{await api.deleteNote(selected.id);setSelected(null);await refresh();}catch(cause){setError((cause as Error).message);}}}}>Xóa vĩnh viễn</button></div>}
        {conflict&&<div className="conflict" role="alert"><p>Ghi chú đã được sửa ở thiết bị khác.</p><button onClick={async()=>{try{const latest=await api.note(selected.id);setSelected(latest);setConflict(false);}catch(cause){setError((cause as Error).message);}}}>Tải bản mới nhất</button><button onClick={async()=>{try{const latest=await api.note(selected.id),saved=await api.updateNote(selected.id,{...selected,revision:latest.revision,tag_ids:selected.tags?.map(item=>item.id)||[]});setSelected(saved);setConflict(false);await refresh();}catch(cause){if((cause as any).status===409)setConflict(true);else setError((cause as Error).message);}}}>Ghi đè có chủ đích</button></div>}
      </aside>}
    </div>
  </main>;
}
