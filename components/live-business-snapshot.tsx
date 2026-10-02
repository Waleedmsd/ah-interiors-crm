'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {apiRequest} from '@/lib/api-client';
import {Panel,Stat} from '@/components/page-ui';
type Summary={sales?:{todayPence:number;weekPence:number;monthPence:number;orderCount:number;averageOrderPence:number};profit?:Record<string,number>;orders?:Record<string,number>;suppliers?:Record<string,number>;delivery?:Record<string,number>;assembly?:Record<string,number>;flooring?:Record<string,number>;service?:Record<string,number>;tasks?:Record<string,number>;notifications?:number};
const pounds=(value:number)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format((value??0)/100);
const tile=(title:string,values:Record<string,number>,href:string)=>Object.entries(values).map(([key,value])=><Link className="panel" key={key} href={href} style={{padding:18,textDecoration:'none'}}><small style={{textTransform:'capitalize'}}>{key.replace(/([A-Z])/g,' $1')}</small><strong style={{display:'block',fontSize:25,marginTop:6}}>{value}</strong><span>{title} →</span></Link>);
export function LiveBusinessSnapshot(){const [data,setData]=useState<Summary>({});const [error,setError]=useState('');useEffect(()=>{apiRequest<Summary>('/api/dashboard').then(setData).catch(e=>setError((e as Error).message));},[]);
return <div className="stack" style={{marginBottom:20}}>{error&&<p role="alert">{error}</p>}
{data.sales&&<><h2>Business overview</h2><div className="metric-grid"><Stat label="Sales today" value={pounds(data.sales.todayPence)} note="Issued invoices"/><Stat label="Sales this week" value={pounds(data.sales.weekPence)} note="Issued invoices"/><Stat label="Sales this month" value={pounds(data.sales.monthPence)} note="Issued invoices"/><Stat label="Average order" value={pounds(data.sales.averageOrderPence)} note={data.sales.orderCount+' shared orders'}/></div></>}
{data.profit&&<Panel title="Profitability" description={data.profit.costCoverage+' of '+data.profit.orderCount+' orders have cost coverage recorded.'}><div className="metric-grid"><Stat label="Gross profit" value={pounds(data.profit.grossPence)} note="Verified supplier costs recorded"/><Stat label="Contribution" value={pounds(data.profit.contributionPence)} note="Tracked costs only - review coverage"/><Stat label="Average margin" value={(data.profit.averageMarginBps/100).toFixed(1)+'%'} note="Across recorded orders"/><Stat label="Below threshold" value={String(data.profit.belowMinimum)} note="Review margin approvals"/></div></Panel>}
{data.orders&&<Panel title="Sales order flow"><div className="metric-grid">{tile('Sales orders',data.orders,'/orders')}</div></Panel>}
{data.suppliers&&<Panel title="Supplier flow"><div className="metric-grid">{tile('Supplier orders',data.suppliers,'/supplier-tracking')}</div></Panel>}
{data.delivery&&<Panel title="Delivery"><div className="metric-grid">{tile('Delivery jobs',data.delivery,'/deliveries')}</div></Panel>}
{data.assembly&&<Panel title="Assembly"><div className="metric-grid">{tile('Assembly jobs',data.assembly,'/assembly-jobs')}</div></Panel>}
{data.flooring&&<Panel title="Flooring"><div className="metric-grid">{tile('Flooring leads',data.flooring,'/flooring')}</div></Panel>}
{data.service&&<Panel title="Customer service"><div className="metric-grid">{tile('Customer service cases',data.service,'/service-cases')}</div></Panel>}
{data.tasks&&<Panel title="My tasks"><div className="metric-grid">{tile('Tasks and follow-ups',data.tasks,'/tasks')}</div></Panel>}
</div>}
