export interface User { email: string }
export class ApiError extends Error { constructor(message:string,public status:number){super(message);this.name='ApiError';} }
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...init, headers: { ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || `Request failed (${response.status})`,response.status);
  return data as T;
}
export const api = {
  me: () => request<User>('/api/auth/me'),
  login: (email: string, password: string) => request<User>('/api/auth/login', { method: 'POST', headers: { Origin: location.origin }, body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST', headers: { Origin: location.origin } }),
  listNotes: (params: Record<string,string> = {}) => request<{notes:any[];nextCursor:string|null}>(`/api/notes?${new URLSearchParams(params)}`),
  async exportNotes() {
    const collected=new Map<string,any>();
    for(const view of ['all','archive','trash']) { let cursor:string|undefined;
      do { const page=await api.listNotes({view,...(cursor?{cursor}:{})}); for(const note of page.notes)collected.set(note.id,note); cursor=page.nextCursor||undefined; } while(cursor);
    }
    const [folders,tags]=await Promise.all([api.folders(),api.tags()]);
    return {format:'inotion-notes-export-v1',exported_at:new Date().toISOString(),notes:[...collected.values()],folders:folders.results||[],tags:tags.results||[]};
  },
  note: (id:string) => request<any>(`/api/notes/${id}`),
  createNote: (body:any) => request<any>('/api/notes', {method:'POST',headers:{Origin:location.origin},body:JSON.stringify(body)}),
  updateNote: (id:string,body:any) => request<any>(`/api/notes/${id}`, {method:'PATCH',headers:{Origin:location.origin},body:JSON.stringify(body)}),
  deleteNote: (id:string) => request<any>(`/api/notes/${id}`, {method:'DELETE',headers:{Origin:location.origin}}),
  restoreNote: (id:string) => request<any>(`/api/notes/${id}/restore`, {method:'POST',headers:{Origin:location.origin}}),
  folders: () => request<any>('/api/folders'),
  createFolder: (name:string) => request<any>('/api/folders',{method:'POST',headers:{Origin:location.origin},body:JSON.stringify({name})}),
  updateFolder: (id:string,name:string) => request<any>(`/api/folders/${id}`,{method:'PATCH',headers:{Origin:location.origin},body:JSON.stringify({name})}),
  deleteFolder: (id:string) => request<any>(`/api/folders/${id}`,{method:'DELETE',headers:{Origin:location.origin}}),
  tags: () => request<any>('/api/tags'),
  createTag: (name:string) => request<any>('/api/tags',{method:'POST',headers:{Origin:location.origin},body:JSON.stringify({name})}),
  updateTag: (id:string,name:string) => request<any>(`/api/tags/${id}`,{method:'PATCH',headers:{Origin:location.origin},body:JSON.stringify({name})}),
  deleteTag: (id:string) => request<any>(`/api/tags/${id}`,{method:'DELETE',headers:{Origin:location.origin}}),
  attachments: (noteId:string) => request<{attachments:any[]}>(`/api/notes/${noteId}/attachments`),
  uploadAttachment: (noteId:string,file:File) => { const form=new FormData();form.set('file',file);return request<any>(`/api/notes/${noteId}/attachments`,{method:'POST',headers:{Origin:location.origin},body:form}); },
  deleteAttachment: (id:string) => request<any>(`/api/attachments/${id}`,{method:'DELETE',headers:{Origin:location.origin}}),
};
