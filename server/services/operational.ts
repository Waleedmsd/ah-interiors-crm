import {digest} from '../auth';
import {deliveryReady,updateOrderProgress} from './order-progress';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {and,eq,desc,sql} from 'drizzle-orm';
import {database} from '../db';
import {deliveryJobs,assemblyJobs,flooringLeads,serviceCases,centralTasks,expenses,approvals,customers,invoices,orders,suppliers,products,users,auditLogs,notifications,workspaces,stockReservations,stockBalances,stockMovements} from '../db/schema';
import {businessModules,canUseModule,blankDetails,type BusinessModule} from '../../lib/business-modules';
import {AppError,type Staff} from '../permissions';
import {recordInput} from './operational-validation';
import {projectCommerce,workspaceId} from './commerce';
import {operationsReducer,isPaid,type OperationsState} from '../../lib/operations';
import {flooringRoom,type FlooringRoom} from '../../lib/flooring';
import {calculateMargin,type VariableCosts} from '../../lib/margin';
import {marginSettings} from './catalogue';
export const operationalTables={'deliveries':deliveryJobs,'assembly-jobs':assemblyJobs,'flooring':flooringLeads,'service-cases':serviceCases,'tasks':centralTasks,'expenses':expenses,'approvals':approvals} as const;
export type OperationalRecord=typeof deliveryJobs.$inferSelect;
type Tx=Parameters<Parameters<ReturnType<typeof database>['transaction']>[0]>[0];
function moduleAccess(staff:Staff,module:BusinessModule,write=false){if(!staff.active||!canUseModule(staff.role,module,write))throw new AppError(403,'FORBIDDEN','You do not have access to this business module.');}
function assignedOnly(staff:Staff,module:BusinessModule){return ['Delivery','Installer'].includes(staff.role)||module==='tasks'&&!['Management','Team Lead'].includes(staff.role)||module==='approvals'&&!['Management','Team Lead'].includes(staff.role);}
async function notify(tx:Tx,recipientId:string|undefined|null,module:BusinessModule,id:string,title:string,message:string,dedupe:string){if(recipientId)await tx.insert(notifications).values({id:randomUUID(),recipientId,type:module,entity:module,entityId:id,title,message,dedupeKey:dedupe}).onConflictDoNothing();}
export async function listRecords(staff:Staff,module:BusinessModule){moduleAccess(staff,module);const table=operationalTables[module];const rows=await database().select().from(table).where(assignedOnly(staff,module)?module==='approvals'?eq(table.createdBy,staff.id):eq(table.assignedUserId,staff.id):undefined).orderBy(desc(table.createdAt));if(module==='flooring'){const rules=await marginSettings();return rows.map(row=>{
 const rooms=(row.details.rooms??[]) as FlooringRoom[];const quote=row.details.quote as {lines:{quantity:number;unitPricePence:number}[];underlayPence:number;accessoriesPence:number;fittingPence:number;removalPence:number;deliveryPence:number;discountPence:number;costPence:number};const total=quote.lines.reduce((sum,v)=>sum+Math.round(v.quantity*v.unitPricePence),0)+quote.underlayPence+quote.accessoriesPence+quote.fittingPence+quote.removalPence+quote.deliveryPence;
 return {...row,rooms:rooms.map(v=>({...v,...flooringRoom(v)})),profitability:total>0?calculateMargin({revenuePence:total,supplierCostPence:quote.costPence,discountPence:quote.discountPence,vatBps:rules.vatBps,vatTreatment:'Standard',costs:{inboundFreightPence:0,deliveryPence:0,assemblyPence:0,paymentFeePence:0,financeFeePence:0,marketplaceFeePence:0,marketingPence:0,otherPence:0}},rules.marginThresholds):null};});}return rows;}
async function linkedRecord(tx:Tx,type:string,id:string){const table=type==='customer'?customers:type==='invoice'?invoices:type==='order'?orders:type==='supplier'?suppliers:type==='product'?products:type==='delivery'?deliveryJobs:type==='assembly'?assemblyJobs:type==='flooring'?flooringLeads:type==='service-case'?serviceCases:type==='expense'?expenses:undefined;if(!table)return false;return !!(await tx.select({id:table.id}).from(table).where(eq(table.id,id))).length;}
export async function saveRecord(staff:Staff,module:BusinessModule,input:unknown,idValue?:string){moduleAccess(staff,module,true);const {version,...data}=recordInput(module).parse(input);const table=operationalTables[module];const id=idValue??randomUUID();return database().transaction(async tx=>{
 await tx.execute(sql`select pg_advisory_xact_lock(10204)`);
 const [prior]=await tx.select().from(table).where(eq(table.id,id)).for('update');if(idValue&&!prior)throw new AppError(404,'NOT_FOUND','Record not found.');if(prior&&prior.version!==version)throw new AppError(409,'VERSION_CONFLICT','This record changed. Reload before saving.');
 if(prior&&['Completed','Closed','Cancelled','Paid','Approved','Rejected'].includes(prior.status))throw new AppError(422,'LOCKED','This completed record is locked.');
 if(prior&&module==='approvals'&&prior.createdBy!==staff.id)throw new AppError(403,'FORBIDDEN','Only the requester may edit a pending approval.');
 if(prior&&(prior.orderId!==(data.orderId||null)||prior.customerId!==(data.customerId||null)))throw new AppError(422,'LOCKED_LINK','Existing records cannot change customer or sales order.');
 if(businessModules[module].customer&&!data.customerId)throw new AppError(422,'CUSTOMER_REQUIRED','Select a customer.');
 if(businessModules[module].order&&!data.orderId)throw new AppError(422,'ORDER_REQUIRED','Select a sales order.');
 for(const [type,key] of [['customer','customerId'],['order','orderId'],['supplier','supplierId'],['product','productId']] as const){if(data[key]&&!await linkedRecord(tx,type,data[key]!))throw new AppError(422,'LINK_REQUIRED','Linked '+type+' was not found.');}
 if(data.orderId){const [order]=await tx.select().from(orders).where(eq(orders.id,data.orderId));if(['deliveries','assembly-jobs'].includes(module)){const groupId=String(data.details.groupId??'');if(!order.data.groups.some(g=>g.id===groupId))throw new AppError(422,'GROUP_REQUIRED','Select the sales order fulfilment group.');const activeJobs=await tx.select().from(table).where(eq(table.orderId,data.orderId));if(!prior&&activeJobs.some(v=>v.details.groupId===groupId&&!['Completed','Cancelled'].includes(v.status)))throw new AppError(409,'DUPLICATE_JOB','An active job already exists for this fulfilment group.');}
 if(data.customerId&&order.customerId!==data.customerId)throw new AppError(422,'CUSTOMER_MISMATCH','Sales order belongs to a different customer.');}
 if(data.assignedUserId){const [owner]=await tx.select().from(users).where(and(eq(users.id,data.assignedUserId),eq(users.active,true)));if(!owner||!canUseModule(owner.role,module))throw new AppError(422,'ASSIGNEE_REQUIRED','Select active staff with access to this module.');}
 if(module==='tasks'&&!data.assignedUserId)throw new AppError(422,'OWNER_REQUIRED','Assign a task owner.');
 if(module==='tasks'&&data.details.linkedId&&!await linkedRecord(tx,String(data.details.linkedType),String(data.details.linkedId)))throw new AppError(422,'LINK_REQUIRED','Linked task record not found.');
 if(module==='approvals'&&data.details.approvalType==='Refund'&&(data.details.linkedType!=='invoice'||!Number(data.details.amountPence)||!await linkedRecord(tx,'invoice',String(data.details.linkedId))))throw new AppError(422,'REFUND_APPROVAL','Link the refund request to an existing invoice and enter the exact positive amount.');
 if(module==='flooring'){const quote=data.details.quote as {lines:{productId:string}[]};for(const line of quote.lines)if(!await linkedRecord(tx,'product',line.productId))throw new AppError(422,'PRODUCT_REQUIRED','Quote products must exist.');}
 if(module==='assembly-jobs'&&data.details.deliveryId){const [delivery]=await tx.select().from(deliveryJobs).where(eq(deliveryJobs.id,String(data.details.deliveryId)));if(!delivery||delivery.orderId!==data.orderId)throw new AppError(422,'DELIVERY_LINK','Assembly and delivery must belong to the same order.');}
 const [record]=await tx.insert(table).values({...data,id,number:businessModules[module].prefix+'-'+id.slice(0,8).toUpperCase(),status:businessModules[module].statuses[0],customerId:data.customerId||null,orderId:data.orderId||null,supplierId:data.supplierId||null,productId:data.productId||null,assignedUserId:data.assignedUserId||null,createdBy:staff.id}).onConflictDoUpdate({target:table.id,set:{title:data.title,supplierId:data.supplierId||null,productId:data.productId||null,assignedUserId:data.assignedUserId||null,details:data.details,version:(prior?.version??0)+1,updatedAt:new Date()}}).returning();
 await tx.insert(auditLogs).values({userId:staff.id,entity:module,entityId:id,action:prior?'updated':'created',before:prior,after:record});
 if(!prior||prior.assignedUserId!==record.assignedUserId)await notify(tx,record.assignedUserId,module,id,'New '+businessModules[module].singular+' assigned',record.title,`${module}:${id}:assigned:${record.assignedUserId}:${record.version}`);
 if(module==='deliveries'&&data.details.assemblyRequired){
  const existing=await tx.select().from(assemblyJobs).where(eq(assemblyJobs.orderId,data.orderId!));if(!existing.some(v=>v.details.groupId===data.details.groupId)){const assemblyId=randomUUID();const details={...blankDetails('assembly-jobs'),groupId:data.details.groupId,deliveryId:id,address:data.details.address};await tx.insert(assemblyJobs).values({id:assemblyId,number:'ASM-'+assemblyId.slice(0,8).toUpperCase(),title:'Assembly · '+record.title,status:'Awaiting Booking',customerId:record.customerId,orderId:record.orderId,createdBy:staff.id,details});await tx.insert(auditLogs).values({userId:staff.id,entity:'assembly-jobs',entityId:assemblyId,action:'automatically-created',after:{deliveryId:id,orderId:record.orderId}});}
 }
 return record;
});}
const transitions:Record<BusinessModule,Record<string,string[]>>={
 'deliveries':{'Awaiting Stock':['Ready to Book'],'Ready to Book':['Customer Contact Required','Booked'],'Customer Contact Required':['Booked'],'Booked':['Confirmed','Rescheduled'],'Confirmed':['Out for Delivery','Rescheduled'],'Out for Delivery':['Delivered','Failed'],'Delivered':['Completed'],'Failed':['Rescheduled'],'Rescheduled':['Booked']},
 'assembly-jobs':{'Awaiting Booking':['Booked','Cancelled'],'Booked':['Confirmed','Rescheduled','Cancelled'],'Confirmed':['In Progress','Rescheduled','Cancelled'],'In Progress':['Completed','Issue Reported'],'Issue Reported':['Rescheduled','In Progress'],'Rescheduled':['Booked','Cancelled']},
 'flooring':{'Lead':['Measure Booked','Lost'],'Measure Booked':['Measure Completed','Lost'],'Measure Completed':['Quote','Lost'],'Quote':['Follow-up','Won','Lost'],'Follow-up':['Won','Lost'],'Won':['Materials Ordered'],'Materials Ordered':['Fitting Booked'],'Fitting Booked':['Installation'],'Installation':['Completed']},
 'service-cases':{'New':['Investigating'],'Investigating':['Awaiting Customer','Awaiting Supplier','Replacement Ordered','Ready to Resolve'],'Awaiting Customer':['Investigating','Ready to Resolve'],'Awaiting Supplier':['Investigating','Replacement Ordered','Ready to Resolve'],'Replacement Ordered':['Replacement In Transit'],'Replacement In Transit':['Ready to Resolve'],'Ready to Resolve':['Resolved'],'Resolved':['Closed']},
 'tasks':{'Open':['In Progress','Completed','Cancelled'],'In Progress':['Completed','Cancelled']},
 'expenses':{'Draft':['Submitted'],'Submitted':['Approved','Rejected'],'Approved':['Paid']},
 'approvals':{'Requested':['Approved','Rejected']},
};
export async function transitionRecord(staff:Staff,module:BusinessModule,id:string,input:unknown){
 const assignedRole=(module==='deliveries'&&staff.role==='Delivery')||(module==='assembly-jobs'&&staff.role==='Installer')||(module==='tasks'&&['Delivery','Installer'].includes(staff.role));moduleAccess(staff,module,!assignedRole);
 const data=z.object({version:z.number().int().positive(),status:z.enum(businessModules[module].statuses as [string,...string[]]),evidence:z.string().trim().max(2000).optional()}).strict().parse(input);const table=operationalTables[module];
 return database().transaction(async tx=>{
  await tx.execute(sql`select pg_advisory_xact_lock(10204)`);
  const [prior]=await tx.select().from(table).where(eq(table.id,id)).for('update');if(!prior)throw new AppError(404,'NOT_FOUND','Record not found.');if(assignedOnly(staff,module)&&prior.assignedUserId!==staff.id&&module!=='approvals')throw new AppError(403,'FORBIDDEN','This job is not assigned to you.');
  if(prior.version!==data.version)throw new AppError(409,'VERSION_CONFLICT','Record changed. Reload first.');if(!transitions[module][prior.status]?.includes(data.status))throw new AppError(422,'TRANSITION','This status transition is not allowed.');
  if(['approvals','expenses'].includes(module)&&['Approved','Rejected'].includes(data.status)&&staff.role!=='Management')throw new AppError(403,'MANAGEMENT_REQUIRED','A manager must make this decision.');
  if(module==='approvals'&&data.status==='Approved'&&prior.details.approvalType==='Refund'&&prior.createdBy===staff.id)throw new AppError(422,'SELF_APPROVAL','Another manager must approve your refund request.');
  if(staff.role==='Delivery'&&!['Out for Delivery','Delivered','Failed'].includes(data.status))throw new AppError(403,'DRIVER_SCOPE','Drivers may update assigned delivery progress only.');
  if(staff.role==='Installer'&&!['In Progress','Completed','Issue Reported'].includes(data.status))throw new AppError(403,'INSTALLER_SCOPE','Installers may update assigned assembly progress only.');
  const details={...prior.details};if(data.evidence){if(module==='deliveries'&&data.status==='Delivered')details.proof=data.evidence;else if(module==='deliveries'&&data.status==='Failed')details.failedReason=data.evidence;else if(module==='assembly-jobs'&&data.status==='Completed')details.customerSignoff=data.evidence;else if(module==='assembly-jobs'&&data.status==='Issue Reported')details.problem=data.evidence;else details.notes=data.evidence;}
  if(module==='deliveries'){
   if(data.status==='Ready to Book'){const [order]=await tx.select().from(orders).where(eq(orders.id,prior.orderId!));const reservations=await tx.select().from(stockReservations).where(and(eq(stockReservations.orderId,prior.orderId!),eq(stockReservations.groupId,String(details.groupId)),eq(stockReservations.status,'Active')));if(!order||!isPaid(order.data)||!deliveryReady(order.data,reservations,String(details.groupId)))throw new AppError(422,'STOCK_REQUIRED','Verify full payment and received or allocated stock first.');}
   if(['Booked','Confirmed'].includes(data.status)&&(!details.scheduledDate||!details.timeSlot||!prior.assignedUserId))throw new AppError(422,'BOOKING_REQUIRED','Set delivery date, time slot and assigned driver first.');
   if(data.status==='Confirmed'&&!details.customerConfirmed)throw new AppError(422,'CUSTOMER_CONFIRMATION','Record customer confirmation first.');
   if(data.status==='Delivered'&&!details.proof)throw new AppError(422,'PROOF_REQUIRED','Record proof of delivery or signature.');
   if(data.status==='Failed'&&!details.failedReason)throw new AppError(422,'REASON_REQUIRED','Record why delivery failed.');
   if(data.status==='Rescheduled'&&!details.rescheduledDate)throw new AppError(422,'DATE_REQUIRED','Record a rescheduled date.');
  }
  if(module==='assembly-jobs'){
   if(['Booked','Confirmed'].includes(data.status)&&(!details.scheduledDate||!details.timeSlot||!prior.assignedUserId))throw new AppError(422,'BOOKING_REQUIRED','Set scheduled date, time slot and assigned installer.');
   if(data.status==='Completed'&&!details.customerSignoff)throw new AppError(422,'SIGNOFF_REQUIRED','Record customer sign-off.');
   if(data.status==='Issue Reported'&&!details.problem)throw new AppError(422,'PROBLEM_REQUIRED','Record the assembly problem.');
  }
  if(module==='flooring'){
   if(data.status==='Measure Booked'&&(!details.measureDate||!details.surveyor))throw new AppError(422,'MEASURE_REQUIRED','Set the measure date and surveyor.');
   if(data.status==='Measure Completed'&&!(details.rooms as unknown[]).length)throw new AppError(422,'ROOMS_REQUIRED','Record room measurements first.');
   if(data.status==='Quote'&&!(details.quote as {lines:unknown[]}).lines.length)throw new AppError(422,'QUOTE_REQUIRED','Add quote products first.');
   if(data.status==='Lost'&&!details.lostReason)throw new AppError(422,'LOST_REASON','Record the lost reason.');
   if(data.status==='Fitting Booked'&&!details.fittingDate)throw new AppError(422,'FITTING_DATE','Set fitting date first.');
  }
  if(module==='service-cases'){
   if(['Replacement Ordered','Replacement In Transit'].includes(data.status)&&(!details.replacementReference||!details.expectedReplacementDate))throw new AppError(422,'REPLACEMENT_REQUIRED','Record replacement reference and expected date.');
   if(data.status==='Resolved'&&!details.resolution)throw new AppError(422,'RESOLUTION_REQUIRED','Record the resolution first.');if(data.status==='Resolved')details.resolutionDate=new Date().toISOString().slice(0,10);
  }
  if(module==='approvals')Object.assign(details,{decidedBy:staff.id,decisionDate:new Date().toISOString()});
  if(module==='expenses'&&data.status==='Approved')Object.assign(details,{approvedBy:staff.id});
  if(module==='deliveries'&&data.status==='Delivered'){
   const [order]=await tx.select().from(orders).where(eq(orders.id,prior.orderId!));const reservations=await tx.select().from(stockReservations).where(and(eq(stockReservations.orderId,prior.orderId!),eq(stockReservations.status,'Active'))).for('update');
   if(!order||!isPaid(order.data)||!deliveryReady(order.data,reservations))throw new AppError(422,'STOCK_REQUIRED','Delivery requires verified payment and complete stock allocation.');
   await tx.execute(sql`select pg_advisory_xact_lock(10203)`);
   for(const reservation of reservations){const [before]=await tx.select().from(stockBalances).where(and(eq(stockBalances.productId,reservation.productId),eq(stockBalances.locationId,reservation.locationId))).for('update');if(!before||before.reserved<reservation.quantity||before.physical<reservation.quantity)throw new AppError(422,'STOCK_INTEGRITY','Reserved stock is unavailable.');const after={...before,physical:before.physical-reservation.quantity,reserved:before.reserved-reservation.quantity};await tx.update(stockBalances).set({physical:after.physical,reserved:after.reserved}).where(eq(stockBalances.id,before.id));await tx.update(stockReservations).set({status:'Delivered',updatedAt:new Date()}).where(eq(stockReservations.id,reservation.id));const movementId=randomUUID();await tx.insert(stockMovements).values({id:movementId,type:'Customer Delivery',productId:reservation.productId,locationId:reservation.locationId,orderId:prior.orderId,quantity:reservation.quantity,reason:String(details.proof),createdBy:staff.id,before,after,requestId:'delivery:'+id+':'+reservation.id,requestDigest:digest('delivery:'+id+':'+reservation.id)});await tx.insert(auditLogs).values({userId:staff.id,entity:'stock-movement',entityId:movementId,action:'Customer Delivery',before,after});}
   await updateOrderProgress(tx,staff.id,prior.orderId!,'delivery',prior.number+' · '+String(details.proof),undefined,String(details.groupId));
  }
  if(module==='assembly-jobs'&&data.status==='Completed'){
   const [order]=await tx.select().from(orders).where(eq(orders.id,prior.orderId!));if(!order?.data.groups.find(g=>g.id===details.groupId)?.delivery)throw new AppError(422,'DELIVERY_REQUIRED','Record completed delivery before assembly sign-off.');await updateOrderProgress(tx,staff.id,prior.orderId!,'assembly',prior.number+' · '+String(details.customerSignoff),undefined,String(details.groupId));
  }
  const [record]=await tx.update(table).set({status:data.status,details,version:prior.version+1,updatedAt:new Date()}).where(eq(table.id,id)).returning();
  await tx.insert(auditLogs).values({userId:staff.id,entity:module,entityId:id,action:'status-changed',before:{status:prior.status,details:prior.details},after:{status:data.status,details}});
  await notify(tx,prior.assignedUserId,module,id,businessModules[module].singular+' updated',record.title+' · '+data.status,`${module}:${id}:status:${record.version}`);
  return record;
 });
}
