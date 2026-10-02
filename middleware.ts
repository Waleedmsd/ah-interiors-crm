import {NextResponse,type NextRequest} from 'next/server';
import {currentStaff} from '@/server/auth';
import {hasPermission} from '@/server/permissions';
export async function middleware(request:NextRequest){
 if(process.env.NEXT_PUBLIC_CRM_MODE==='preview'&&process.env.NODE_ENV!=='production')return NextResponse.next();
 const path=request.nextUrl.pathname;
 if(path.startsWith('/api/')||path==='/login')return NextResponse.next();
 try{const staff=await currentStaff(request);if(!hasPermission(staff,'commerce.read')&&path!=='/work')return NextResponse.redirect(new URL('/work',request.url));return NextResponse.next();}
 catch{return NextResponse.redirect(new URL('/login',request.url));}
}
export const config={matcher:['/((?!_next|favicon.svg|og.png).*)']};
