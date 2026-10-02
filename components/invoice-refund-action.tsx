'use client';
import {useRef,useState} from 'react';
import {CreditCard} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {useWorkspace} from '@/components/workspace-provider';
import {useAuth} from '@/components/auth-context';
import {invoiceTotals,parsePounds,type Invoice} from '@/lib/commerce';
import {pounds} from '@/components/invoice-list';
import {Panel} from '@/components/page-ui';

export function InvoiceRefundAction({invoice}:{invoice:Invoice}){
 const {user}=useAuth();const {mutate,notify,ready}=useWorkspace();
 const [open,setOpen]=useState(false);const [amount,setAmount]=useState('');const [reference,setReference]=useState('');const [method,setMethod]=useState('Bank transfer');const [approval,setApproval]=useState('');const [error,setError]=useState('');
 const submitting=useRef(false);const [pending,setPending]=useState(false);
 const totals=invoiceTotals(invoice);const available=totals.paid-totals.refunded;
 if(!user||!['Management','Accounts'].includes(user.role))return null;
 async function submit(){
  if(submitting.current)return;
  const amountPence=parsePounds(amount);
  if(!Number.isSafeInteger(amountPence)||amountPence<=0||amountPence>available||!reference.trim()){setError('Enter a positive amount within the refundable balance and its payment reference.');return;}
  submitting.current=true;setPending(true);setError('');
  try{const result=await mutate({type:'refund-invoice',id:invoice.id,approvalId:approval.trim()||undefined,refund:{id:crypto.randomUUID(),amountPence,reference,method,at:Date.now()}});if(result.error){setError(result.error);return;}notify('Refund recorded in the invoice ledger. The linked order balance was recalculated.');setOpen(false);}
  finally{submitting.current=false;setPending(false);}
 }
 return <>{available>0&&invoice.lifecycle==='Issued'&&<Button variant="outline" className="btn full-width subtle-danger" disabled={!ready||pending} onClick={()=>{setAmount((available/100).toFixed(2));setReference('');setApproval('');setError('');setOpen(true);}}><CreditCard size={16}/> Record refund</Button>}
 {(invoice.refunds??[]).length>0&&<Panel title="Refund history"><div className="payment-history">{invoice.refunds!.map(refund=><div key={refund.id}><span className="payment-history-icon"><CreditCard size={16}/></span><div><strong>{refund.reference}</strong><span>{refund.method} · {new Date(refund.at).toLocaleString('en-GB')}{refund.approvalId?' · '+refund.approvalId:''}</span></div><strong>−{pounds(refund.amountPence)}</strong></div>)}</div></Panel>}
 <Dialog open={open} onOpenChange={setOpen}><DialogContent className="commerce-dialog"><DialogTitle>Record an invoice refund</DialogTitle><DialogDescription>Enter a refund already sent and verified. Above the configured limit, use the exact amount on an approved management request.</DialogDescription><div className="soft-notice">Maximum refundable: <strong>{pounds(available)}</strong></div><div className="form-grid"><div className="field"><label htmlFor="refund-amount">Amount refunded (£)</label><input id="refund-amount" className="commerce-input" value={amount} onChange={e=>setAmount(e.target.value)} /></div><div className="field"><label htmlFor="refund-method">Method</label><select id="refund-method" className="commerce-input" value={method} onChange={e=>setMethod(e.target.value)}>{['Bank transfer','Card','Cash','Marketplace payout','Other'].map(value=><option key={value}>{value}</option>)}</select></div><div className="field span-2"><label htmlFor="refund-reference">Refund payment reference</label><input id="refund-reference" className="commerce-input" value={reference} onChange={e=>setReference(e.target.value)} required maxLength={200}/></div><div className="field span-2"><label htmlFor="refund-approval">Approved request reference (above limit)</label><input id="refund-approval" className="commerce-input" value={approval} onChange={e=>setApproval(e.target.value)} placeholder="APR-…"/></div></div>{error&&<p role="alert" className="form-error">{error}</p>}<div className="action-row justify-end"><Button variant="outline" className="btn" onClick={()=>setOpen(false)}>Cancel</Button><Button className="btn btn-primary" disabled={!ready||pending} onClick={()=>void submit()}>Record refund</Button></div></DialogContent></Dialog></>;
}
