import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {database,closeDatabase} from '../server/db';
import {users,settings,workspaces,suppliers,products,priceHistory,stockLocations} from '../server/db/schema';
import {emptyCosts} from '../lib/margin';
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
const [manager]=await db.select().from(users).where(eq(users.email,'manager@ahinteriors.test'));
await db.transaction(async tx=>{
 for(const [name,type] of [['Nelson Showroom','Physical'],['Nelson Warehouse','Physical'],['Burnley Showroom','Physical'],['Incoming Stock','Incoming'],['In Transit','In Transit'],['Customer Reserved','Reserved']])await tx.insert(stockLocations).values({id:name.toLowerCase().replaceAll(' ','-'),name,type}).onConflictDoNothing();
 for(const [code,name] of [['DEMO-RAUCH','Rauch'],['DEMO-WIEMANN','Wiemann']])await tx.insert(suppliers).values({id:code,name,code,active:true,details:{brands:name,contact:'Synthetic demonstration contact',email:'',phone:'',address:'',accountReference:'',paymentTerms:'Development example',leadTimeDays:42,deliveryTerms:'',collectionRequired:false,notes:'Synthetic demo supplier.'}}).onConflictDoNothing();
 for(const [sku,name,category,supplierId,cost,price] of [['DEMO-WARDROBE','Demo wardrobe','Wardrobes','DEMO-RAUCH',104000,240000],['DEMO-SOFA','Demo sofa','Sofas','DEMO-WIEMANN',60000,150000],['DEMO-FLOORING','Demo flooring (per sqm)','Flooring','DEMO-RAUCH',1200,3600]] as const){
  const [created]=await tx.insert(products).values({id:sku,name,sku,supplierId,supplierSku:sku,category,status:'Active',supplierCostPence:cost,sellingPricePence:price,details:{brand:'Demo',subcategory:'',article:sku,barcode:'',notes:'Synthetic demonstration data.',websiteUrl:'',shopifyProductId:'',shopifyVariantId:'',ebayListingId:'',websiteStatus:'Draft',widthMm:0,heightMm:0,depthMm:0,weightKg:0,packQuantity:1,packDimensions:'',vatTreatment:'Standard',discountPence:0,costs:emptyCosts}}).onConflictDoNothing().returning();
  if(created)await tx.insert(priceHistory).values({productId:created.id,supplierCostPence:cost,sellingPricePence:price,changedBy:manager.id});
 }
});
console.log('Development staff and settings seeded without replacing existing records.');
await closeDatabase();
