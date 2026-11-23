'use client'

import { useEffect, useState } from 'react'

export type ReminderValue = number | null | undefined
export interface ReminderNote { id: string; title: string; reminderAt?: ReminderValue }
export function toTimestamp(value: ReminderValue): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null }
export function laterToday(now = new Date()): Date { const date = new Date(now); date.setHours(18,0,0,0); return date.getTime() <= now.getTime() ? new Date(now.getTime()+3*60*60*1000) : date }
export function tomorrowMorning(now = new Date()): Date { const date = new Date(now); date.setDate(date.getDate()+1); date.setHours(9,0,0,0); return date }
export function nextWeek(now = new Date()): Date { const date = new Date(now); date.setDate(date.getDate()+7); date.setHours(9,0,0,0); return date }
export function toDatetimeLocal(value: ReminderValue): string { const time=toTimestamp(value); if(time===null)return ''; const d=new Date(time); const pad=(n:number)=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` }
export function isOverdue(value: ReminderValue, now = Date.now()): boolean { const time=toTimestamp(value); return time!==null&&time<=now }
export function formatReminder(value: ReminderValue): string { const time=toTimestamp(value); if(time===null)return ''; const date=new Date(time), today=new Date(); const day=(d:Date)=>new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime(); const timeText=date.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}); if(day(date)===day(today))return `Today, ${timeText}`; const tomorrow=new Date(today); tomorrow.setDate(today.getDate()+1); if(day(date)===day(tomorrow))return `Tomorrow, ${timeText}`; return `${date.toLocaleDateString([], {month:'short',day:'numeric',...(date.getFullYear()===today.getFullYear()?{}:{year:'numeric'})})}, ${timeText}` }
export function useNow(intervalMs=30_000): number { const [now,setNow]=useState(()=>Date.now()); useEffect(()=>{const id=window.setInterval(()=>setNow(Date.now()),intervalMs);return()=>window.clearInterval(id)},[intervalMs]);return now }
