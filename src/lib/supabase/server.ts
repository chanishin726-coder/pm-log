import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const AUTH_BYPASS = process.env.NEXT_PUBLIC_AUTH_BYPASS === 'true';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Bypass 모드일 때는 Service Role 클라이언트를 반환해 RLS를 우회합니다.
 * (auth.uid()가 없어서 RLS 정책이 막는 문제 해결)
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (AUTH_BYPASS && SERVICE_ROLE_KEY) {
    return createSupabaseClient(url, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  const cookieStore = await cookies();
  return createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Component에서 호출 시 무시
        }
      },
    },
  });
}
