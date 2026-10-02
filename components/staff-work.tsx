'use client';
import {CatalogueWorkspace} from '@/components/catalogue-workspace';
import {useAuth} from '@/components/auth-boundary';
export function StaffWork(){const {user,logout}=useAuth();return <main className="page" style={{maxWidth:1000,margin:'auto'}}><h1>{user?.name}'s workspace</h1><p>{user?.role}</p><CatalogueWorkspace module="products"/><button className="btn" onClick={()=>void logout()}>Sign out</button></main>;}
