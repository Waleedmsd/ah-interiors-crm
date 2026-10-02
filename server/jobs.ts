import {randomUUID} from 'node:crypto';
import {and,eq,isNull,lte,sql} from 'drizzle-orm';
import {database} from './db';
import {jobs,notifications,users,workspaces} from './db/schema';
export async function runJobs(){
 const db=database();let completed=0;
 await db.transaction(async tx=>{
  await tx.execute(sql`select pg_advisory_xact_lock(10202)`);
  const recipients=await tx.select({id:users.id}).from(users).where(and(eq(users.active,true),eq(users.role,'Management')));
  const [ledger]=await tx.select().from(workspaces).where(eq(workspaces.id,'ah-interiors'));
  for(const order of ledger?.data.operations.cases??[])for(const task of order.tasks??[]){
   if(task.dueAt>Date.now())continue;
   for(const staff of recipients)await tx.insert(notifications).values({id:randomUUID(),recipientId:staff.id,type:'followup-due',entity:'order',entityId:order.id,title:task.title,message:task.nextAction,dedupeKey:`${staff.id}:${order.id}:${task.id}:${task.dueAt}`}).onConflictDoNothing();
  }
  const pending=await tx.select().from(jobs).where(and(isNull(jobs.completedAt),lte(jobs.runAt,new Date()))).for('update',{skipLocked:true}).limit(50);
  for(const job of pending){if(job.type!=='notification') {await tx.update(jobs).set({attempts:job.attempts+1,lastError:'Unsupported job type',runAt:new Date(Date.now()+3600000)}).where(eq(jobs.id,job.id));continue;}
   const payload=job.payload as {recipientId:string;title:string;message:string};
   if(!payload.recipientId||!payload.title||!payload.message){await tx.update(jobs).set({lastError:'Invalid payload',completedAt:new Date()}).where(eq(jobs.id,job.id));continue;}
   await tx.insert(notifications).values({id:randomUUID(),...payload,type:'internal',dedupeKey:job.id}).onConflictDoNothing();await tx.update(jobs).set({completedAt:new Date(),attempts:job.attempts+1}).where(eq(jobs.id,job.id));completed++;
  }
 });return {completed};
}
