export type StoreName = 'notes'|'folders'|'tags'|'outbox'|'meta'
export interface QueueItem { id:string; sequence:number; type:'create'|'patch'|'delete'|'restore'; entity:'note'|'folder'|'tag'; entityId:string; body?:any; paused?:boolean }
const DB_NAME='inotion-offline-v1', STORES:StoreName[]=['notes','folders','tags','outbox','meta'];
function openDb():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{const db=req.result;for(const store of STORES)if(!db.objectStoreNames.contains(store))db.createObjectStore(store,{keyPath:store==='outbox'?'id':'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
export async function all<T=any>(store:StoreName):Promise<T[]>{const db=await openDb();return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result as T[]);r.onerror=()=>reject(r.error);});}
export async function get<T=any>(store:StoreName,id:string):Promise<T|undefined>{const db=await openDb();return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function put(store:StoreName,value:any):Promise<void>{const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
export async function remove(store:StoreName,id:string):Promise<void>{const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
export async function enqueue(item:Omit<QueueItem,'id'|'sequence'>):Promise<QueueItem>{const queue=await all<QueueItem>('outbox'),next={...item,id:crypto.randomUUID(),sequence:Math.max(0,...queue.map(x=>x.sequence))+1};await put('outbox',next);return next;}
export async function peekOutbox(){return (await all<QueueItem>('outbox')).sort((a,b)=>a.sequence-b.sequence)[0];}
export async function dequeue(id:string){return remove('outbox',id)}
export async function updateOutbox(item:QueueItem){return put('outbox',item)}
export async function clearAllOfflineData():Promise<void>{const db=await openDb();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORES,'readwrite');for(const store of STORES)tx.objectStore(store).clear();tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
