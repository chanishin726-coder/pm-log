import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabasePublicEnv } from '@/lib/env';

const AUTH_BYPASS = process.env.NEXT_PUBLIC_AUTH_BYPASS === 'true';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  // MCP 커넥터: 쿠키 로그인 대신 /api/mcp/<MCP_SECRET> 경로 비밀값으로 route에서 직접 인증
  if (request.nextUrl.pathname.startsWith('/api/mcp/')) {
    return response;
  }

  // 임시: 인증 우회 모드면 로그인/리다이렉트 없이 통과
  if (AUTH_BYPASS) {
    return response;
  }

  const { url, anonKey } = getSupabasePublicEnv();
  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            response.cookies.set(name, value)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/callback');
  const isProtected =
    pathname === '/' ||
    pathname.startsWith('/logs') ||
    pathname.startsWith('/tasks') ||
    pathname.startsWith('/projects') ||
    pathname.startsWith('/reports') ||
    pathname.startsWith('/query');

  if (isAuthPage && user) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (pathname.startsWith('/api') && !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!user && isProtected) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
