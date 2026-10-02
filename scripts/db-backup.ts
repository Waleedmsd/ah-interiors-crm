import {spawn} from 'node:child_process';
import {mkdir,cp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const url=new URL(process.env.DATABASE_URL!);const folder=resolve('backups',new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(folder,{recursive:true});
const binary=process.env.PG_DUMP_PATH??'pg_dump';
const child=spawn(binary,['-Fc','--file',join(folder,'database.dump')],{stdio:['ignore','ignore','pipe'],windowsHide:true,env:{...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:url.pathname.slice(1)}});
await new Promise<void>((resolve,reject)=>{child.on('error',()=>reject(new Error('pg_dump could not start. Set PG_DUMP_PATH.')));child.on('exit',code=>code===0?resolve():reject(new Error('Database backup failed.')));});
await cp(resolve(process.env.ATTACHMENT_ROOT??'uploads'),join(folder,'attachments'),{recursive:true}).catch((e:NodeJS.ErrnoException)=>{if(e.code!=='ENOENT')throw e;});
console.log('Backup created:',folder);
