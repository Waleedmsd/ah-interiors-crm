'use client';
import {OperationalWorkspace} from '@/components/operational-workspace';
import {businessModules,canUseModule,type BusinessModule} from '@/lib/business-modules';
import {usePathname} from 'next/navigation';
import Link from 'next/link';
import {InventoryWorkspace} from '@/components/inventory-workspace';
import {CatalogueWorkspace} from '@/components/catalogue-workspace';
import {useAuth} from '@/components/auth-boundary';
export function StaffWork(){const {user,logout}=useAuth();const path=usePathname();const module=path?.slice(1) as BusinessModule;return <main className="page" style={{maxWidth:1000,margin:'auto'}}><h1>{user?.name}'s workspace</h1><p>{user?.role}</p><div style={{display:"flex",gap:12}}>{["Warehouse","Shopify Store Manager"].includes(user?.role??"")&&<Link className="btn" href="/products">Products</Link>}{Object.entries(businessModules).filter(([key])=>user&&canUseModule(user.role,key as BusinessModule)).map(([key,v])=><Link className="btn" href={"/"+key} key={key}>{v.title}</Link>)}{user?.role==="Warehouse"&&<Link className="btn" href="/inventory">Stock & receiving</Link>}</div>{module in businessModules?<OperationalWorkspace module={module}/>:path==="/inventory"?<InventoryWorkspace/>:["Warehouse","Shopify Store Manager"].includes(user?.role??"")?<CatalogueWorkspace module="products"/>:<p>Select a permitted workspace.</p>}<button className="btn" onClick={()=>void logout()}>Sign out</button></main>;}
