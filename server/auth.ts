import {randomBytes, scrypt as scryptCallback, timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {and,eq,gt,sql} from 'drizzle-orm';
import {database} from './db';
import {sessions,users,loginAttempts} from './db/schema';
import {AppError,type Staff,type Role} from './permissions';
const scrypt=promisify(scryptCallback);
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export async function hashPassword(password:string) {
  if(password.length<12 || password.length>128) throw new AppError(422,'VALIDATION','Password must contain 12 to 128 characters.');
  const salt=randomBytes(16).toString('hex');const hash=await scrypt(password,salt,64) as Buffer;
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password:string,encoded:string) {
  const [scheme,salt,value]=encoded.split(':');if(scheme!=='scrypt'||!salt||!value||password.length>128)return false;
  const expected=Buffer.from(value,'hex');const actual=await scrypt(password,salt,64) as Buffer;
  return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
export function publicStaff(user:typeof users.$inferSelect):Staff {
  return {id:user.id,name:user.name,email:user.email,role:user.role as Role,department:user.department,active:user.active};
}
export const cookieName='ah_session';
export function sessionToken(request:Request) {return request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);}
export function sessionCookie(token:string,maxAge=28800) {
  return `${cookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${process.env.NODE_ENV==='production'?'; Secure':''}`;
}
export async function currentStaff(request:Request):Promise<Staff> {
  const token=sessionToken(request);if(!token)throw new AppError(401,'UNAUTHENTICATED','Please sign in.');
  const [row]=await database().select({user:users}).from(sessions).innerJoin(users,eq(users.id,sessions.userId))
    .where(and(eq(sessions.tokenHash,digest(token)),gt(sessions.expiresAt,new Date()),eq(users.active,true))).limit(1);
  if(!row)throw new AppError(401,'UNAUTHENTICATED','Your session has expired. Please sign in.');
  return publicStaff(row.user);
}
export async function login(email:string,password:string) {
  const db=database();const key=digest(email.toLowerCase());
  // Atomic database throttle persists across restarts and concurrent requests.
  const [attempt]=await db.insert(loginAttempts).values({key,attempts:1,resetAt:new Date(Date.now()+900000)})
    .onConflictDoUpdate({target:loginAttempts.key,set:{attempts:sql`CASE WHEN ${loginAttempts.resetAt} < now() THEN 1 ELSE ${loginAttempts.attempts}+1 END`,resetAt:sql`CASE WHEN ${loginAttempts.resetAt} < now() THEN now()+interval '15 minutes' ELSE ${loginAttempts.resetAt} END`}}).returning();
  if(attempt.attempts>10)throw new AppError(429,'RATE_LIMIT','Too many sign-in attempts. Try again in 15 minutes.');
  const [user]=await db.select().from(users).where(eq(users.email,email.toLowerCase())).limit(1);
  const fallback='scrypt:00000000000000000000000000000000:'+ '00'.repeat(64);
  const valid=await verifyPassword(password,user?.passwordHash??fallback);
  if(!user||!user.active||!valid)throw new AppError(401,'INVALID_LOGIN','Email or password is incorrect.');
  const token=randomBytes(32).toString('hex');
  await db.transaction(async tx=>{
    await tx.insert(sessions).values({tokenHash:digest(token),userId:user.id,expiresAt:new Date(Date.now()+28800000)});
    await tx.update(users).set({lastLogin:new Date()}).where(eq(users.id,user.id));
    await tx.delete(loginAttempts).where(eq(loginAttempts.key,key));
  });
  return {user:publicStaff(user),token};
}
export async function logout(request:Request) {const token=sessionToken(request);if(token)await database().delete(sessions).where(eq(sessions.tokenHash,digest(token)));}
