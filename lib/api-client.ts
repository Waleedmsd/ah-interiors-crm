export class ApiError extends Error {constructor(public status:number,public code:string,message:string){super(message);}}
export async function apiRequest<T>(url:string,init:RequestInit={}):Promise<T> {
 const response=await fetch(url,{...init,credentials:'same-origin',headers:{...(typeof init.body==='string'?{'Content-Type':'application/json'}:{}),...init.headers}});
 const result=await response.json() as {error?:{code?:string;message?:string}};
 if(!response.ok)throw new ApiError(response.status,result.error?.code??'REQUEST_FAILED',result.error?.message??'Request failed.');
 return result as T;
}
