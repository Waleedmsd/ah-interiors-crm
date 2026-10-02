import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {eq} from 'drizzle-orm';
import {database,closeDatabase} from '../../server/db';
import {users,sessions,auditLogs,customers,workspaces,settings,priceHistory,products,purchaseItems,purchaseOrders,stockLocations,stockBalances,stockReservations,deliveryJobs,assemblyJobs} from '../../server/db/schema';
import {handleApi} from '../../server/api';
import {hashPassword,verifyPassword} from '../../server/auth';
import {blankDetails} from '../../lib/business-modules';
import {emptyCosts} from '../../lib/margin';
import {createCommerceState} from '../../lib/commerce';
import {projectCommerce,workspaceId} from '../../server/services/commerce';
const testFiles=resolve('.runtime','test-files',String(process.pid));
const origin='http://localhost:3001';const password='Synthetic-test-password-2026';
let managerCookie='';let warehouseCookie='';let managerId='';
function request(path:string,method='GET',value?:unknown,cookie=managerCookie,headers:Record<string,string>={}) {
 return handleApi(new Request(origin+'/api/'+path,{method,headers:{origin,...(value!==undefined?{'Content-Type':'application/json'}:{}),cookie,...headers},body:value!==undefined?JSON.stringify(value):undefined}));
}
before(async()=>{
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required for PostgreSQL integration tests.');
 const source=new URL(process.env.DATABASE_URL);source.pathname='/postgres';const admin=new pg.Client({connectionString:source.toString()});await admin.connect();
 const name='ah_crm_test_'+process.pid;await admin.query(`CREATE DATABASE "${name}"`);await admin.end();
 source.pathname='/'+name;process.env.DATABASE_URL=source.toString();process.env.ATTACHMENT_ROOT=testFiles;process.env.APP_ORIGIN=origin;
 await migrate(database(),{migrationsFolder:'./drizzle'});
 await database().insert(settings).values({key:'business',value:{vatBps:2000,marginThresholds:{excellent:3600,strong:3200,acceptable:2900},supplierConfirmationDays:3}});
 managerId=randomUUID();const hash=await hashPassword(password);
 await database().insert(users).values([{id:managerId,name:'Test Manager',email:'manager@test.invalid',role:'Management',department:'Management',passwordHash:hash},{id:randomUUID(),name:'Test Warehouse',email:'warehouse@test.invalid',role:'Warehouse',department:'Warehouse',passwordHash:hash}]);
 await database().transaction(async tx=>{const data=createCommerceState();await projectCommerce(tx,data);await tx.insert(workspaces).values({id:workspaceId,data});});
 const manager=await request('auth/login','POST',{email:'manager@test.invalid',password},'');assert.equal(manager.status,200);managerCookie=manager.headers.get('set-cookie')!.split(';')[0];
 const warehouse=await request('auth/login','POST',{email:'warehouse@test.invalid',password},'');assert.equal(warehouse.status,200);warehouseCookie=warehouse.headers.get('set-cookie')!.split(';')[0];
});
after(async()=>{const name=new URL(process.env.DATABASE_URL!).pathname.slice(1);await closeDatabase();const source=new URL(process.env.DATABASE_URL!);source.pathname='/postgres';const admin=new pg.Client({connectionString:source.toString()});await admin.connect();if(!/^ah_crm_test_\d+$/.test(name))throw new Error('Unsafe test database name');await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);await admin.end(); if(!testFiles.startsWith(resolve('.runtime','test-files')+requireSeparator()))throw new Error('Unsafe test file path');await rm(testFiles,{recursive:true,force:true});});
function requireSeparator(){return process.platform==='win32'?'\\':'/';}
test('password hashing is salted and verifies without storing plaintext',async()=>{const a=await hashPassword(password),b=await hashPassword(password);assert.notEqual(a,b);assert.equal(await verifyPassword(password,a),true);assert.equal(await verifyPassword('wrong',a),false);});
test('unauthenticated and forged sessions cannot read commerce',async()=>{assert.equal((await request('commerce','GET',undefined,'')).status,401);assert.equal((await request('commerce','GET',undefined,'ah_session=forged')).status,401);});
test('staff response and secure session attributes exclude password hash',async()=>{const response=await request('auth/me');const payload=await response.json() as any;assert.equal(payload.user.id,managerId);assert.equal(payload.user.passwordHash,undefined);const login=await request('auth/login','POST',{email:'manager@test.invalid',password},'');assert.match(login.headers.get('set-cookie')!,/HttpOnly; SameSite=Lax/);});
test('wrong password, missing origin and cross-origin writes are rejected',async()=>{assert.equal((await request('auth/login','POST',{email:'manager@test.invalid',password:'wrong'},'')).status,401);assert.equal((await request('auth/logout','POST',undefined,managerCookie,{origin:'https://attacker.invalid'})).status,403);});
test('warehouse cannot read ledger, settings, staff or audit records directly',async()=>{for(const path of ['commerce','settings','users','audit'])assert.equal((await request(path,'GET',undefined,warehouseCookie)).status,403);});
test('server validation rejects malformed writes without mutating records',async()=>{const before=await database().select().from(customers);const response=await request('commerce','POST',{requestId:randomUUID(),version:1,action:{type:'create-customer',now:Date.now(),customer:{name:'Bad',email:'invalid',phone:'',address:'',city:'',postcode:''}}});assert.equal(response.status,422);assert.equal((await database().select().from(customers)).length,before.length);});
test('customer save is persistent, audited, idempotent and survives a new connection',async()=>{
 const read=await request('commerce');const initial=await read.json() as any;
 const payload={requestId:randomUUID(),version:initial.version,action:{type:'create-customer',now:Date.now(),customer:{name:'Synthetic Persistence',email:'persistent@test.invalid',phone:'07000000000',address:'Test address',city:'Nelson',postcode:'BB9 0AA'}}};
 const response=await request('commerce','POST',payload);assert.equal(response.status,200);const saved=await response.json() as any;
 assert.ok(saved.id);const replay=await request('commerce','POST',payload);assert.equal(replay.status,200);assert.equal((await replay.json() as any).id,saved.id);
 assert.equal((await database().select().from(auditLogs).where(eq(auditLogs.entityId,saved.id))).length,1);
 await closeDatabase();const [found]=await database().select().from(customers).where(eq(customers.id,saved.id));assert.equal(found.name,'Synthetic Persistence');
 const conflict=await request('commerce','POST',{...payload,requestId:randomUUID(),action:{...payload.action,customer:{...payload.action.customer,email:'different@test.invalid'}}});assert.equal(conflict.status,409);
});
test('failed workflow transactions do not leave audit or partial records',async()=>{const [row]=await database().select().from(workspaces);const before=await database().select().from(auditLogs);const response=await request('commerce','POST',{requestId:randomUUID(),version:row.version,action:{type:'pay-invoice',id:'does-not-exist',payment:{id:randomUUID(),amountPence:100,reference:'test',method:'Cash',at:Date.now()}}});assert.equal(response.status,422);assert.equal((await database().select().from(auditLogs)).length,before.length);});
test('supplier and product CRUD validate relationships, preserve price history and protect costs',async()=>{
 const supplier=await request('suppliers','POST',{name:'Synthetic supplier',code:'TEST-SUPPLIER',active:true,details:{brands:'Test',contact:'Test',email:'',phone:'',address:'',accountReference:'',paymentTerms:'',leadTimeDays:7,deliveryTerms:'',collectionRequired:false,notes:''}});assert.equal(supplier.status,201);const supplied=await supplier.json() as any;
 const data={name:'Synthetic Wardrobe',sku:'TEST-WARDROBE',supplierId:supplied.id,supplierSku:'SW-01',category:'Wardrobes',status:'Active',supplierCostPence:6000,sellingPricePence:12000,details:{brand:'Test',subcategory:'',article:'',barcode:'',notes:'',websiteUrl:'',shopifyProductId:'',shopifyVariantId:'',ebayListingId:'',websiteStatus:'Draft',widthMm:1000,heightMm:2000,depthMm:600,weightKg:50,packQuantity:3,packDimensions:'',vatTreatment:'Standard',discountPence:0,costs:emptyCosts}};
 const invalid=await request('products','POST',{...data,supplierId:'missing'});assert.equal(invalid.status,422);
 const created=await request('products','POST',data);assert.equal(created.status,201);const product=await created.json() as any;
 const updated=await request('products/'+product.id,'PUT',{...data,version:product.version,supplierCostPence:7000});assert.equal(updated.status,200);
 assert.equal((await database().select().from(priceHistory).where(eq(priceHistory.productId,product.id))).length,2);
 assert.equal((await request('products/'+product.id,'PUT',{...data,version:product.version})).status,409);
 const warehouse=await request('products','GET',undefined,warehouseCookie);assert.equal(warehouse.status,200);const rows=await warehouse.json() as any[];assert.equal(rows[0].supplierCostPence,undefined);assert.equal(rows[0].sellingPricePence,undefined);
 assert.equal((await request('products','POST',data,warehouseCookie)).status,403);
});
test('purchase orders preserve item history and supplier tracking validates confirmation and receiving stages',async()=>{
 const [product]=await database().select().from(products);
 const payload={supplierId:product.supplierId,orderId:'',customerId:'',date:'2026-10-02',expectedDate:'2026-11-01',currency:'GBP',accountReference:'Test',notes:'Synthetic purchase',items:[{productId:product.id,description:'Test wardrobe',quantity:2,unitCostPence:7000,customerId:''}]};
 const response=await request('purchase-orders','POST',payload);assert.equal(response.status,201);let purchase=await response.json() as any;
 const changed=await request('purchase-orders/'+purchase.id,'PUT',{...payload,version:purchase.version,notes:'Updated draft'});assert.equal(changed.status,200);purchase=await changed.json();
 const allItems=await database().select().from(purchaseItems).where(eq(purchaseItems.purchaseOrderId,purchase.id));assert.equal(allItems.length,2);assert.equal(allItems.filter(v=>v.active).length,1);
 assert.equal((await request('purchase-orders/'+purchase.id,'PATCH',{version:purchase.version,status:'Confirmed'})).status,422);
 for(const status of ['Ready to Send','Sent','Awaiting Confirmation','Confirmed']){const r=await request('purchase-orders/'+purchase.id,'PATCH',{version:purchase.version,status});assert.equal(r.status,200);purchase=await r.json();}
 assert.equal((await request('purchase-orders/'+purchase.id,'PATCH',{version:purchase.version,status:'Partially Received'})).status,422);
 const details={supplierOrderNumber:'TEST-SO',confirmationNumber:'CONFIRM-01',orderedDate:'2026-01-01',confirmationDate:'2026-01-02',expectedArrival:'2026-01-30',collectionRequired:false,collectionCompany:'',collectionReference:'',collectionDate:'',lastContacted:'',nextChaseDate:'2026-01-05',deliveryBooked:false,notes:'Synthetic tracking'};
 const tracking=await request('supplier-orders','POST',{purchaseOrderId:purchase.id,ownerId:managerId,details});assert.equal(tracking.status,201);let record=await tracking.json() as any;
 for(const status of ['Order Sent','Awaiting Confirmation','Confirmed']){const r=await request('supplier-orders/'+record.id,'PATCH',{version:record.version,status});assert.equal(r.status,200);record=await r.json();}
 const rows=await request('supplier-orders');assert.equal((await rows.json() as any[]).find(v=>v.id===record.id).flags.etaOverdue,true);
 assert.equal((await request('purchase-orders','GET',undefined,warehouseCookie)).status,403);
});
test('stock receiving, reservations, delivery, returns and retries remain atomic and auditable',async()=>{
 const [product]=await database().select().from(products);const [purchase]=await database().select().from(purchaseOrders);
 await database().insert(stockLocations).values([{id:'test-warehouse',name:'Test warehouse',type:'Physical'},{id:'test-showroom',name:'Test showroom',type:'Physical'}]);
 const movement={requestId:randomUUID(),type:'Goods Received',productId:product.id,locationId:'test-warehouse',purchaseOrderId:purchase.id,quantity:1,reason:'Synthetic receipt'};
 const first=await request('inventory/movements','POST',movement,warehouseCookie);assert.equal(first.status,201);assert.equal((await request('inventory/movements','POST',movement,warehouseCookie)).status,201);
 assert.equal((await request('inventory/movements','POST',{...movement,requestId:randomUUID(),quantity:2},warehouseCookie)).status,422);
 assert.equal((await request('inventory/movements','POST',{...movement,requestId:randomUUID()},warehouseCookie)).status,201);
 const [received]=await database().select().from(purchaseOrders).where(eq(purchaseOrders.id,purchase.id));assert.equal(received.status,'Received');
 const initial=await request('commerce');const state=await initial.json() as any;
 const created=await request('commerce','POST',{requestId:randomUUID(),version:state.version,action:{type:'create-order',input:{requestId:randomUUID(),customerId:state.data.customers[0].id,channel:'Shopify',sourceRef:'STOCK-TEST',lines:[{productId:product.id,name:product.name,supplier:'Test',article:'Test',quantity:1,unitPence:12000,options:'',route:'ProBuild'}],deliveryPence:0,note:'Stock test',now:Date.now()}}});assert.equal(created.status,200);let ledger=await created.json() as any;const orderId=ledger.id;
 const invoice=ledger.data.invoices.find((v:any)=>v.orderId===orderId);
 const issued=await request('commerce','POST',{requestId:randomUUID(),version:ledger.version,action:{type:'issue-invoice',id:invoice.id,now:Date.now()}});assert.equal(issued.status,200);ledger=await issued.json();
 const paid=await request('commerce','POST',{requestId:randomUUID(),version:ledger.version,action:{type:'pay-invoice',id:invoice.id,payment:{id:randomUUID(),amountPence:12000,reference:'STOCK-PAYMENT',method:'Cash',at:Date.now()}}});assert.equal(paid.status,200);
 const reserve={requestId:randomUUID(),type:'Reservation',productId:product.id,locationId:'test-warehouse',orderId,quantity:1,reason:'Customer allocation'};
 assert.equal((await request('inventory/movements','POST',reserve,warehouseCookie)).status,201);
 assert.equal((await request('inventory/movements','POST',{...reserve,requestId:randomUUID()},warehouseCookie)).status,422);
 assert.equal((await request('inventory/movements','POST',{requestId:randomUUID(),type:'Damage',productId:product.id,locationId:'test-warehouse',quantity:2,reason:'Test damage'},warehouseCookie)).status,422);
 assert.equal((await request('inventory/movements','POST',{requestId:randomUUID(),type:'Adjustment',productId:product.id,locationId:'test-warehouse',quantity:1,reason:'Test adjustment'},warehouseCookie)).status,403);
 const [reservation]=await database().select().from(stockReservations).where(eq(stockReservations.orderId,orderId));
 const delivered={requestId:randomUUID(),type:'Customer Delivery',productId:product.id,locationId:'test-warehouse',orderId,reservationId:reservation.id,quantity:1,reason:'Proof of delivery'};
 assert.equal((await request('inventory/movements','POST',delivered,warehouseCookie)).status,201);
 const returned={...delivered,requestId:randomUUID(),type:'Return',reason:'Customer return'};assert.equal((await request('inventory/movements','POST',returned,warehouseCookie)).status,201);assert.equal((await request('inventory/movements','POST',{...returned,requestId:randomUUID()},warehouseCookie)).status,422);
 const [balance]=await database().select().from(stockBalances).where(eq(stockBalances.productId,product.id));assert.equal(balance.physical,2);assert.equal(balance.reserved,0);
 const audit=await database().select().from(auditLogs).where(eq(auditLogs.entity,'stock-movement'));assert.equal(audit.length,5);
});
test('delivery and assembly enforce assignments, evidence, stock and canonical completion',async()=>{
 const driverId=randomUUID(),installerId=randomUUID();const hash=await hashPassword(password);
 await database().insert(users).values([{id:driverId,name:'Test Driver',email:'driver@test.invalid',role:'Delivery',department:'Delivery',passwordHash:hash},{id:installerId,name:'Test Installer',email:'installer@test.invalid',role:'Installer',department:'Assembly',passwordHash:hash}]);
 const driverLogin=await request('auth/login','POST',{email:'driver@test.invalid',password},'');const driverCookie=driverLogin.headers.get('set-cookie')!.split(';')[0];
 const installerLogin=await request('auth/login','POST',{email:'installer@test.invalid',password},'');const installerCookie=installerLogin.headers.get('set-cookie')!.split(';')[0];
 const [ledger]=await database().select().from(workspaces);const order=ledger.data.operations.cases.find(v=>v.sourceRef==='STOCK-TEST')!;const line=order.lines[0];
 const allocation=await request('inventory/movements','POST',{requestId:randomUUID(),type:'Reservation',productId:line.productId,locationId:'test-warehouse',orderId:order.id,quantity:1,reason:'Delivery allocation'},warehouseCookie);assert.equal(allocation.status,201);
 const input={title:'Synthetic delivery',customerId:order.customerId,orderId:order.id,supplierId:'',productId:'',assignedUserId:driverId,details:{...blankDetails('deliveries'),groupId:line.groupId,address:order.address,postcode:order.postcode,phone:order.phone,packs:1,scheduledDate:'2026-10-03',timeSlot:'09:00–12:00',customerConfirmed:true,assemblyRequired:true}};
 const created=await request('operations/deliveries','POST',input);assert.equal(created.status,201);let delivery=await created.json() as any;
 assert.equal((await request('operations/deliveries','POST',input)).status,409);
 const assigned=await request('operations/deliveries','GET',undefined,driverCookie);assert.equal((await assigned.json() as any[]).length,1);assert.equal((await request('commerce','GET',undefined,driverCookie)).status,403);
 assert.equal((await request('operations/deliveries/'+delivery.id,'PUT',{...input,version:delivery.version},driverCookie)).status,403);
 for(const status of ['Ready to Book','Booked','Confirmed']){const r=await request('operations/deliveries/'+delivery.id,'PATCH',{version:delivery.version,status});assert.equal(r.status,200);delivery=await r.json();}
 const outbound=await request('operations/deliveries/'+delivery.id,'PATCH',{version:delivery.version,status:'Out for Delivery'},driverCookie);assert.equal(outbound.status,200);delivery=await outbound.json();
 assert.equal((await request('operations/deliveries/'+delivery.id,'PATCH',{version:delivery.version,status:'Delivered'},driverCookie)).status,422);
 const done=await request('operations/deliveries/'+delivery.id,'PATCH',{version:delivery.version,status:'Delivered',evidence:'Signed by synthetic recipient'},driverCookie);assert.equal(done.status,200);
 const [stock]=await database().select().from(stockBalances).where(eq(stockBalances.productId,line.productId!));assert.equal(stock.physical,1);assert.equal(stock.reserved,0);
 const [updated]=await database().select().from(workspaces);assert.equal(updated.data.operations.cases.find(v=>v.id===order.id)!.groups[0].delivery,true);
 const [assembly]=await database().select().from(assemblyJobs).where(eq(assemblyJobs.orderId,order.id));assert.ok(assembly);
 const assemblyInput={title:assembly.title,customerId:assembly.customerId,orderId:assembly.orderId,supplierId:'',productId:'',assignedUserId:installerId,details:{...assembly.details,scheduledDate:'2026-10-04',timeSlot:'09:00–12:00'}};
 const edited=await request('operations/assembly-jobs/'+assembly.id,'PUT',{...assemblyInput,version:assembly.version});assert.equal(edited.status,200);let assemblyRecord=await edited.json() as any;
 for(const status of ['Booked','Confirmed']){const r=await request('operations/assembly-jobs/'+assembly.id,'PATCH',{version:assemblyRecord.version,status});assert.equal(r.status,200);assemblyRecord=await r.json();}
 const started=await request('operations/assembly-jobs/'+assembly.id,'PATCH',{version:assemblyRecord.version,status:'In Progress'},installerCookie);assert.equal(started.status,200);assemblyRecord=await started.json();
 const signed=await request('operations/assembly-jobs/'+assembly.id,'PATCH',{version:assemblyRecord.version,status:'Completed',evidence:'Synthetic customer sign-off'},installerCookie);assert.equal(signed.status,200);
 const [finished]=await database().select().from(workspaces);assert.equal(finished.data.operations.cases.find(v=>v.id===order.id)!.groups[0].assembly,'Complete');
});
test('flooring stores room measurements, quote totals and requires a lost reason',async()=>{
 const [ledger]=await database().select().from(workspaces);const [product]=await database().select().from(products);
 const details={...blankDetails('flooring'),leadSource:'Showroom',measureDate:'2026-10-05',surveyor:'Synthetic surveyor',rooms:[{name:'Lounge',length:4,width:3,wastePercent:10,stairs:false,landing:false,underlay:'Standard',accessories:'Grippers',notes:''}],quote:{lines:[{productId:product.id,quantity:13.2,unitPricePence:2000}],underlayPence:1000,accessoriesPence:500,fittingPence:5000,removalPence:0,deliveryPence:0,discountPence:0,costPence:10000}};
 const response=await request('operations/flooring','POST',{title:'Synthetic flooring lead',customerId:ledger.data.customers[0].id,assignedUserId:managerId,details});assert.equal(response.status,201);let lead=await response.json() as any;
 for(const status of ['Measure Booked','Measure Completed','Quote']){const r=await request('operations/flooring/'+lead.id,'PATCH',{version:lead.version,status});assert.equal(r.status,200);lead=await r.json();}
 const rows=await request('operations/flooring');const saved=(await rows.json() as any[])[0];assert.equal(saved.rooms[0].area,12);assert.equal(saved.rooms[0].requiredQuantity,13.2);assert.ok(saved.profitability.contributionProfitPence>0);
 assert.equal((await request('operations/flooring/'+lead.id,'PATCH',{version:lead.version,status:'Lost'})).status,422);
});
test('customer service, tasks and management approvals enforce lifecycle and authority',async()=>{
 const [ledger]=await database().select().from(workspaces);const customerId=ledger.data.customers[0].id;
 const created=await request('operations/service-cases','POST',{title:'Synthetic damage',customerId,assignedUserId:managerId,details:{...blankDetails('service-cases'),caseType:'Damage',reportedDate:'2026-10-02',description:'Synthetic damaged pack',resolution:'Replacement supplied'}});assert.equal(created.status,201);let record=await created.json() as any;
 for(const status of ['Investigating','Ready to Resolve','Resolved','Closed']){const response=await request('operations/service-cases/'+record.id,'PATCH',{version:record.version,status});assert.equal(response.status,200);record=await response.json();}
 assert.equal((await request('operations/service-cases/'+record.id,'PATCH',{version:record.version,status:'Investigating'})).status,422);
 const task=await request('operations/tasks','POST',{title:'Synthetic chase task',assignedUserId:managerId,details:{...blankDetails('tasks'),dueDate:'2026-10-02',linkedType:'customer',linkedId:customerId}});assert.equal(task.status,201);const taskRow=await task.json() as any;assert.equal((await request('operations/tasks/'+taskRow.id,'PATCH',{version:taskRow.version,status:'Completed'})).status,200);
 const [product]=await database().select().from(products);const approval=await request('operations/approvals','POST',{title:'Synthetic low-margin review',assignedUserId:managerId,details:{...blankDetails('approvals'),approvalType:'Low margin',reason:'Synthetic approval check',linkedType:'product',linkedId:product.id}});assert.equal(approval.status,201);const approvalRow=await approval.json() as any;
 assert.equal((await request('operations/approvals/'+approvalRow.id,'PATCH',{version:approvalRow.version,status:'Approved'},warehouseCookie)).status,403);
 assert.equal((await request('operations/approvals/'+approvalRow.id,'PATCH',{version:approvalRow.version,status:'Approved'})).status,200);
});
test('disabled users and expired sessions are rejected on every request',async()=>{await database().update(users).set({active:false}).where(eq(users.id,managerId));assert.equal((await request('auth/me')).status,401);await database().update(users).set({active:true}).where(eq(users.id,managerId));await database().update(sessions).set({expiresAt:new Date(0)}).where(eq(sessions.userId,managerId));assert.equal((await request('auth/me')).status,401);const result=await request('auth/login','POST',{email:'manager@test.invalid',password},'');managerCookie=result.headers.get('set-cookie')!.split(';')[0];});
test('attachments require linked record access and persist metadata and bytes',async()=>{
 const [row]=await database().select().from(customers);const bytes=Buffer.from('%PDF-1.4\nSynthetic test document');
 const upload=await handleApi(new Request(origin+'/api/attachments?entity=customer&entityId='+row.id,{method:'POST',headers:{origin,cookie:managerCookie,'x-filename':'synthetic.pdf'},body:bytes}));
 assert.equal(upload.status,201);const result=await upload.json() as any;
 const download=await request('attachments/'+result.id);assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);
 assert.equal((await request('attachments/'+result.id,'GET',undefined,warehouseCookie)).status,403);
 const bad=await handleApi(new Request(origin+'/api/attachments?entity=customer&entityId='+row.id,{method:'POST',headers:{origin,cookie:managerCookie,'x-filename':'script.html'},body:'<script>test</script>'}));assert.equal(bad.status,415);
});
test('logout invalidates the database session',async()=>{assert.equal((await request('auth/logout','POST')).status,200);assert.equal((await request('auth/me')).status,401);});
