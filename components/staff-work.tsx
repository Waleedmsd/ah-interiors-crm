'use client';
import {useAuth} from '@/components/auth-boundary';
export function StaffWork(){const {user,logout}=useAuth();return <main className="page" style={{maxWidth:1000,margin:'auto'}}><h1>{user?.name}'s workspace</h1><p>{user?.role}</p><p>Your staff role has access to its operational modules. Financial and customer ledgers are restricted.</p><button className="btn" onClick={()=>void logout()}>Sign out</button></main>;}
