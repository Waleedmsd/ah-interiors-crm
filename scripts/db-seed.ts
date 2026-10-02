import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {database,closeDatabase} from '../server/db';
import {users,settings,workspaces} from '../server/db/schema';
import {hashPassword} from '../server/auth';
import {createCommerceState} from '../lib/commerce';
import {projectCommerce,workspaceId} from '../server/services/commerce';
const password=process.env.SEED_PASSWORD;
if(!password)throw new Error('Set SEED_PASSWORD; seed never uses a built-in password.');
if(process.env.NODE_ENV==='production')throw new Error('Demo seed is disabled in production.');
const db=database();
await db.transaction(async tx=>{
 for(const [name,email,role] of [['Demo Manager','manager@ahinteriors.test','Management'],['Demo Sales','sales@ahinteriors.test','Customer Service & Sales'],['Demo Warehouse','warehouse@ahinteriors.test','Warehouse']]) {
  await tx.insert(users).values({id:randomUUID(),name,email,role,passwordHash:await hashPassword(password),department:role}).onConflictDoNothing();
 }
 await tx.insert(settings).values({key:'business',value:{vatBps:2000,marginThresholds:{excellent:3600,strong:3200,acceptable:2900},supplierConfirmationDays:3,serviceChaseDays:3,flooringFollowupDays:7,refundApprovalPence:10000,expenseApprovalPence:50000,paymentMethods:['Shopify','PayPal','Novuna','Bank Transfer','Cash','Card','eBay','Other'],branches:['Nelson','Burnley'],locations:['Nelson Showroom','Nelson Warehouse','Burnley Showroom','Incoming Stock','In Transit','Customer Reserved'],salesChannels:['Shopify','eBay','Showroom','Telephone','Manual','Other'],expenseCategories:['Advertising','Rent','Utilities','Delivery','Fuel','Salaries','Software','Office','Repairs','Professional Fees','Warehouse','Other']}}).onConflictDoNothing();
 if(process.env.SEED_COMMERCE!=='false'){
  const [existing]=await tx.select().from(workspaces).where(eq(workspaces.id,workspaceId));
  if(!existing){const data=createCommerceState();await projectCommerce(tx,data);await tx.insert(workspaces).values({id:workspaceId,data});}
 }
});
console.log('Development staff and settings seeded without replacing existing records.');
await closeDatabase();
