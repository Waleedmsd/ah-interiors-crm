'use client';
import {useCallback,useEffect,useState} from 'react';
import {createCommerceState,type CommerceState,type CommerceAction,type CommerceResult} from '@/lib/commerce';
import {apiRequest} from '@/lib/api-client';
type Snapshot={data:CommerceState;version:number;ready:boolean;persistence:'loading'|'saved'|'session-only'|'read-only';recoveryNotice:boolean};
export function useServerCommerce(enabled:boolean) {
 const [snapshot,setSnapshot]=useState<Snapshot>({data:createCommerceState(),version:0,ready:false,persistence:'loading',recoveryNotice:false});
 const [error,setError]=useState('');
 const load=useCallback(async()=>{
  try{const response=await apiRequest<{data:CommerceState;version:number}>('/api/commerce');setSnapshot({...response,ready:true,persistence:'saved',recoveryNotice:false});setError('');}
  catch(error){setError(error instanceof Error?error.message:'Unable to load records.');setSnapshot(v=>({...v,ready:false,persistence:'read-only'}));}
 },[]);
 useEffect(()=>{if(enabled)void load();},[enabled,load]);
 const commit=useCallback(async(action:CommerceAction):Promise<CommerceResult>=>{
  if(!snapshot.ready)return {state:snapshot.data,error:'The shared workspace is unavailable. Reload and try again.'};
  setSnapshot(v=>({...v,ready:false}));
  try{
   const result=await apiRequest<{data:CommerceState;version:number;id?:string}>('/api/commerce',{method:'POST',body:JSON.stringify({requestId:crypto.randomUUID(),version:snapshot.version,action})});
   setSnapshot({...result,ready:true,persistence:'saved',recoveryNotice:false});return {state:result.data,id:result.id};
  }catch(error){await load();return {state:snapshot.data,error:error instanceof Error?error.message:'The change was not saved.'};}
 },[load,snapshot]);
 return {...snapshot,commit,error,reload:load};
}
