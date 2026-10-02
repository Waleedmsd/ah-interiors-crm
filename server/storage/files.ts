import {mkdir,writeFile,readFile,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
export interface FileStorage { put(key:string,data:Uint8Array):Promise<void>; get(key:string):Promise<Uint8Array>; remove(key:string):Promise<void>; }
export class LocalFileStorage implements FileStorage {
 private root=resolve(process.env.ATTACHMENT_ROOT??'./uploads');
 private path(key:string){if(!/^[0-9a-f-]{36}$/.test(key))throw new Error('Invalid storage key');return join(this.root,key);}
 async put(key:string,data:Uint8Array){await mkdir(this.root,{recursive:true});await writeFile(this.path(key),data,{flag:'wx',mode:0o600});}
 async get(key:string){return readFile(this.path(key));}
 async remove(key:string){await unlink(this.path(key));}
}
export function fileStorage():FileStorage{return new LocalFileStorage();}
export function detectedMime(bytes:Uint8Array):string|undefined {
 const b=Buffer.from(bytes);
 if(b.subarray(0,5).toString()==='%PDF-')return 'application/pdf';
 if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
 if(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP')return 'image/webp';
 return undefined;
}
