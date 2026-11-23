import { SWRConfig } from 'swr'
import { InotionApp } from './components/inotion/app'
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { PublicShareView } from './components/public-share-view'
import { PublicNotebookView } from './components/public-notebook-view'

function Phase9PublicPage(){
  const [data,setData]=useState<any>(null),[error,setError]=useState('Loading…')
  const path=location.pathname
  useEffect(()=>{let live=true;(async()=>{try{
    const id=decodeURIComponent(path.split('/')[2]||'')
    if(path.startsWith('/s/')){
      const response=await fetch(`/api/public/share/${encodeURIComponent(id)}`);if(!response.ok)throw new Error('This share link is unavailable.')
      const snapshot=await response.json();if(live)setData({kind:'share',snapshot:{iv:snapshot.iv_b64,ciphertext:snapshot.ciphertext_b64}})
    }else{
      const response=await fetch(`/api/public/site/${encodeURIComponent(id)}`);if(!response.ok)throw new Error('This notebook is unavailable.')
      const site=await response.json();if(live)setData({kind:'notebook',notebook:{title:site.slug,notes:(site.notes||[]).map((n:any)=>({id:String(n.id),title:n.title,content:n.body_md,updatedAt:n.updated_at}))}})
    }
  }catch(e){if(live)setError(e instanceof Error?e.message:'Unable to open this page.')}})();return()=>{live=false}},[path])
  if(data?.kind==='share')return <PublicShareView snapshot={data.snapshot}/>
  if(data?.kind==='notebook')return <PublicNotebookView notebook={data.notebook}/>
  return <main className="mx-auto max-w-3xl px-6 py-10"><p role="status">{error}</p></main>
}

function PublicPage(){
  const [data,setData]=useState<any>(null),[error,setError]=useState('Loading…')
  const path=location.pathname
  useEffect(()=>{let live=true;(async()=>{try{
    if(path.startsWith('/s/')){
      const response=await fetch(`/api/public/share/${encodeURIComponent(path.split('/')[2]||'')}`);if(!response.ok)throw new Error('This share link is unavailable.')
      const encrypted=await response.json(),fragment=location.hash.slice(1);if(!fragment)throw new Error('The decryption key is missing.')
      const decode=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));const key=await crypto.subtle.importKey('raw',decode(fragment),'AES-GCM',false,['decrypt'])
      const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(encrypted.iv_b64)},key,decode(encrypted.ciphertext_b64));if(live)setData({notes:[JSON.parse(new TextDecoder().decode(plain))]})
    }else{const response=await fetch(`/api/public/site/${encodeURIComponent(path.split('/')[2]||'')}`);if(!response.ok)throw new Error('This notebook is unavailable.');if(live)setData(await response.json())}
  }catch(e){if(live)setError(e instanceof Error?e.message:'Unable to open this page.')}})();return()=>{live=false}},[path])
  return <main className="mx-auto max-w-3xl px-6 py-10"><h1 className="mb-8 text-2xl font-semibold">{data?.slug||'Shared note'}</h1>{data?data.notes.map((n:any,i:number)=><article key={n.id||i} className="mb-10"><h2 className="mb-4 text-xl font-medium">{n.title||'Untitled'}</h2><div className="prose max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{n.body_md||''}</ReactMarkdown></div></article>):<p role="status">{error}</p>}</main>
}

export default function App() {
  if(/^\/(s|p)\//.test(location.pathname))return <Phase9PublicPage />
  return (
    <SWRConfig>
      <InotionApp />
    </SWRConfig>
  )
}
