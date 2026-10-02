'use client';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {StaffWork} from '@/components/staff-work';
import {hasPermission} from '@/server/permissions';
import {apiRequest} from '@/lib/api-client';
import type {Staff} from '@/server/permissions';
const AuthContext=createContext<{user:Staff|null;logout:()=>Promise<void>}>({user:null,logout:async()=>{}});
export const useAuth=()=>useContext(AuthContext);
export function AuthBoundary({children}:{children:ReactNode}) {
 const preview=process.env.NEXT_PUBLIC_CRM_MODE==='preview' && process.env.NODE_ENV!=='production';
 const [user,setUser]=useState<Staff|null>(null);const [loading,setLoading]=useState(!preview);const [error,setError]=useState('');
 useEffect(()=>{if(preview)return;apiRequest<{user:Staff}>('/api/auth/me').then(v=>setUser(v.user)).catch(e=>{if(e.status!==401)setError(e.message);}).finally(()=>setLoading(false));},[preview]);
 async function logout(){await apiRequest('/api/auth/logout',{method:'POST'});window.location.assign('/login');}
 if(preview)return children;
 if(loading)return <main className="page"><p role="status">Loading staff session…</p></main>;
 if(!user)return <LoginForm initialError={error} onLogin={staff=>{setUser(staff); if(window.location.pathname==="/login") window.location.assign("/");}}/>;
 return <AuthContext.Provider value={{user,logout}}>{hasPermission(user,"commerce.read")?children:<StaffWork/>}</AuthContext.Provider>;
}
function LoginForm({initialError,onLogin}:{initialError:string;onLogin:(staff:Staff)=>void}) {
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState(initialError);const [busy,setBusy]=useState(false);
 return <main className="page" style={{maxWidth:460,margin:'8vh auto'}}><section className="panel" style={{padding:32}}><h1>AH Interiors</h1><p>Sign in to your staff workspace.</p><form onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{const result=await apiRequest<{user:Staff}>('/api/auth/login',{method:'POST',body:JSON.stringify({email,password})});setPassword('');onLogin(result.user);}catch(e){setError(e instanceof Error?e.message:'Sign-in failed.');}finally{setBusy(false);}}} style={{display:'grid',gap:16}}><label>Email<input className="input" style={{width:'100%'}} type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input className="input" style={{width:'100%'}} type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p role="alert">{error}</p>}<button className="btn btn-primary" disabled={busy}>{busy?'Signing in…':'Sign in'}</button></form></section></main>;
}
