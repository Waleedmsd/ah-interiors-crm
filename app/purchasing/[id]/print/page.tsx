import {PurchaseDocument} from '@/components/purchase-document';
export default async function PurchasePrintPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <PurchaseDocument id={id}/>;}
