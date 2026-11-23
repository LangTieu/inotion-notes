import type { SessionUser } from './auth';

export async function handleReminders(env:{DB:D1Database},user:SessionUser):Promise<Response>{
 const rows=await env.DB.prepare('SELECT id,title,reminder_at,updated_at FROM notes WHERE user_id=? AND trashed_at IS NULL AND archived_at IS NULL AND reminder_at IS NOT NULL ORDER BY reminder_at ASC LIMIT 100').bind(user.id).all<{id:string;title:string;reminder_at:number;updated_at:number}>();
 const now=Date.now(),items=rows.results||[];
 return new Response(JSON.stringify({upcoming:items.filter(n=>n.reminder_at>=now),overdue:items.filter(n=>n.reminder_at<now)}),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
}
