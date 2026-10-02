'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {ArrowRight,ShieldCheck,Layers3,Truck,ChartNoAxesCombined} from 'lucide-react';
import {StaffWork} from '@/components/staff-work';
import {hasPermission} from '@/server/permissions';
import {apiRequest} from '@/lib/api-client';
import {ReportsWorkspace} from '@/components/reports-workspace';
import type {Staff} from '@/server/permissions';
import {AuthContext} from '@/components/auth-context';
export {useAuth} from '@/components/auth-context';
export function AuthBoundary({children}:{children:ReactNode}) {
 const preview=process.env.NEXT_PUBLIC_CRM_MODE==='preview' && process.env.NODE_ENV!=='production';
 const [user,setUser]=useState<Staff|null>(null);const [loading,setLoading]=useState(!preview);const [error,setError]=useState('');
 useEffect(()=>{if(preview)return;apiRequest<{user:Staff}>('/api/auth/me').then(v=>setUser(v.user)).catch(e=>{if(e.status!==401)setError(e.message);}).finally(()=>setLoading(false));},[preview]);
 async function logout(){await apiRequest('/api/auth/logout',{method:'POST'});window.location.assign('/login');}
 if(preview)return children;
 if(loading)return <main className="page"><p role="status">Loading staff session…</p></main>;
 if(!user)return <LoginForm initialError={error} onLogin={staff=>{setUser(staff); if(window.location.pathname==="/login") window.location.assign("/");}}/>;
 return <AuthContext.Provider value={{user,logout}}>{hasPermission(user,"commerce.read")?children:hasPermission(user,"reports.read")?<ReportsWorkspace/>:<StaffWork/>}</AuthContext.Provider>;
}
function LoginForm({initialError,onLogin}:{initialError:string;onLogin:(staff:Staff)=>void}) {
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState(initialError);const [busy,setBusy]=useState(false);
 return <main className="login-page"><aside className="login-story"><a className="login-brand" href="/">amiro<span>.</span><small>AH INTERIORS</small></a><div className="login-story-copy"><span className="login-kicker">YOUR BUSINESS, BEAUTIFULLY CONNECTED</span><h1>Great interiors.<br/>Seamless operations.</h1><p>One home for your customers, your team and every detail in between.</p><div className="login-features"><span><Layers3 size={18}/>Every order in view</span><span><Truck size={18}/>Every delivery connected</span><span><ChartNoAxesCombined size={18}/>Every decision informed</span></div></div><div className="login-story-footer">Built around the way AH Interiors works.</div><div className="login-orbit" aria-hidden="true"/></aside><section className="login-main"><div className="login-card"><span className="login-emblem">AH</span><span className="login-kicker">WELCOME TO YOUR WORKSPACE</span><h2>Good to see you.</h2><p>Sign in to keep your business moving.</p><form onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{const result=await apiRequest<{user:Staff}>('/api/auth/login',{method:'POST',body:JSON.stringify({email,password})});setPassword('');onLogin(result.user);}catch(e){setError(e instanceof Error?e.message:'Sign-in failed.');}finally{setBusy(false);}}}><label className="ops-field">Work email<input className="input" type="email" autoComplete="username" placeholder="you@ahinteriors.co.uk" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label className="ops-field">Password<input className="input" type="password" autoComplete="current-password" placeholder="Enter your password" required maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p role="alert" className="ops-error">{error}</p>}<button className="btn btn-primary ops-primary" disabled={busy}>{busy?'Signing in…':'Sign in'}<ArrowRight size={16}/></button></form><p className="login-help">Need access? Contact your workspace manager.</p><div className="login-secure"><ShieldCheck size={14}/>Your private staff workspace</div></div><footer>AH Interiors · Operations workspace</footer></section></main>;
}
