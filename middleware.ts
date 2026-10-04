import { NextResponse, type NextRequest } from 'next/server';
import { currentStaff } from '@/server/auth';

export async function middleware(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_CRM_MODE === 'preview' && process.env.NODE_ENV !== 'production') return NextResponse.next();
  const path = request.nextUrl.pathname;
  // API handlers independently authenticate and authorize every business request.
  if (path === '/api' || path.startsWith('/api/') || path === '/login') return NextResponse.next();
  try {
    await currentStaff(request);
    // AuthBoundary uses the shared route policy and displays a restricted page
    // without mounting protected children. Do not maintain a second, divergent
    // list of role routes here: it previously redirected legitimate staff pages.
    return NextResponse.next();
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 401) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    // Database/service outages are not a successful logout or a permission denial.
    return new NextResponse('The staff workspace is temporarily unavailable. Please try again shortly.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '30' },
    });
  }
}
export const config = { matcher: ['/((?!_next|favicon.svg|og.png).*)'] };
