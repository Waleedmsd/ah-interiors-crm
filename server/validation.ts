import {z} from 'zod';
const text=z.string().trim().max(10000);
const id=z.string().trim().min(1).max(128);
const money=z.number().int().min(0).max(1000000000);
const now=z.number().int().min(0).max(9999999999999);
const date=z.iso.date();
export const customerInput=z.object({name:text.min(1).max(200),email:z.union([z.email(),z.literal('')]),phone:text.max(50),address:text.max(500),city:text.max(100),postcode:text.max(20)}).strict();
const route=z.enum(['ProBuild','Flat Pack Pro','AH showroom → BStar','Supplier → BStar']);
const invoiceInput=z.object({customerId:id,orderId:id.optional(),issueDate:date,dueDate:date,lines:z.array(z.object({id,description:text.min(1),quantity:z.number().int().min(1).max(10000),unitPence:money}).strict()).min(1).max(200),discountPence:money,taxBps:z.number().int().min(0).max(10000),notes:text,now}).strict();
const operation=z.discriminatedUnion('type',[
 z.object({type:z.literal('prepare'),id,now}), z.object({type:z.literal('approve'),id,now}),z.object({type:z.literal('revise'),id,now}),
 z.object({type:z.literal('draft'),id,draftId:id,patch:z.object({to:text.max(500),subject:text.max(500),body:text,reviewed:z.boolean()}).partial().strict()}),
 z.object({type:z.literal('check'),id,key:z.enum(['specification','routing','payment','split']),value:z.boolean()}),
 z.object({type:z.literal('line'),id,lineId:id,article:text.max(200),matched:z.boolean(),cost:z.number().finite().min(0).max(10000000).optional(),now}),
 z.object({type:z.literal('route'),id,groupId:id,route,checked:z.boolean(),now}),
 z.object({type:z.literal('note'),id,text:text.min(1),now}),z.object({type:z.literal('snooze'),id,taskId:id,now}),
 z.object({type:z.literal('evidence'),id,groupId:id,event:z.enum(['receipt','release','booking','delivery','assembly']),detail:text.min(1),now}),
]);
export const commerceAction=z.discriminatedUnion('type',[
 z.object({type:z.literal('create-customer'),customer:customerInput,now}),
 z.object({type:z.literal('operation'),action:operation}),
 z.object({type:z.literal('create-order'),input:z.object({requestId:id,customerId:id.optional(),customer:customerInput.optional(),channel:z.enum(['Magento','Shopify','Amazon','eBay','WhatsApp']),sourceRef:text.max(200),lines:z.array(z.object({productId:id.optional(),name:text.min(1),supplier:text.min(1),article:text,quantity:z.number().int().min(1).max(10000),unitPence:money,options:text,route}).strict()).min(1).max(200),deliveryPence:money,note:text,now}).strict()}),
 z.object({type:z.literal('create-invoice'),id,input:invoiceInput}),z.object({type:z.literal('edit-invoice'),id,input:invoiceInput}),
 z.object({type:z.literal('issue-invoice'),id,now}), z.object({type:z.literal('void-invoice'),id,reason:text.min(1),now}),
 z.object({type:z.literal('pay-invoice'),id,payment:z.object({id,amountPence:money.positive(),reference:text.min(1).max(200),method:text.min(1).max(100),at:now}).strict()}),
 z.object({type:z.literal('invoice-email'),id,to:z.email(),subject:text.min(1).max(500),body:text.min(1),now}),
]);
export const mutationInput=z.object({requestId:z.uuid(),version:z.number().int().positive(),action:commerceAction}).strict();

