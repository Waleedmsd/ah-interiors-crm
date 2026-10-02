'use client';
import {useEffect,useState} from 'react';
import {apiRequest} from '@/lib/api-client';
type Notice={id:string;title:string;message:string;readAt:string|null;entity:string;entityId:string};
export function NotificationCenter(){const [items,setItems]=useState<Notice[]>([]);const [error,setError]=useState('');async function load(){try{setItems(await apiRequest<Notice[]>('/api/notifications'));}catch(e){setError((e as Error).message);}}useEffect(()=>{void load();},[]);return <div className="page"><h1>Notification centre</h1>{error&&<p role="alert">{error}</p>}{!items.length&&<p>No notifications.</p>}{items.map(v=><article className="panel" key={v.id} style={{padding:20,marginBottom:12}}><h2>{v.title}</h2><p>{v.message}</p>{!v.readAt&&<button className="btn" onClick={async()=>{await apiRequest('/api/notifications/'+v.id,{method:'PATCH'});await load();}}>Mark read</button>}</article>)}</div>;}
