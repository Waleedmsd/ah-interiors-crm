'use client';
import {usePathname} from 'next/navigation';
import Link from 'next/link';
import {InventoryWorkspace} from '@/components/inventory-workspace';
import {CatalogueWorkspace} from '@/components/catalogue-workspace';
import {useAuth} from '@/components/auth-boundary';
export function StaffWork(){const {user,logout}=useAuth();const path=usePathname();return <main className="page" style={{maxWidth:1000,margin:'auto'}}><h1>{user?.name}'s workspace</h1><p>{user?.role}</p><div style={{display:"flex",gap:12}}><Link className="btn" href="/products">Products</Link>{user?.role==="Warehouse"&&<Link className="btn" href="/inventory">Stock & receiving</Link>}</div>{path==="/inventory"?<InventoryWorkspace/>:<CatalogueWorkspace module="products"/>}<button className="btn" onClick={()=>void logout()}>Sign out</button></main>;}
