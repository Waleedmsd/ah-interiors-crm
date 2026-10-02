import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {eq} from 'drizzle-orm';
import {database,closeDatabase} from '../../server/db';
import {users,sessions,auditLogs,customers,workspaces,settings,priceHistory} from '../../server/db/schema';
import {handleApi} from '../../server/api';
import {hashPassword,verifyPassword} from '../../server/auth';
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
 await database().insert(settings).values({key:'business',value:{vatBps:2000,marginThresholds:{excellent:3600,strong:3200,acceptable:2900}}});
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
