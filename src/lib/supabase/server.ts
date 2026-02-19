import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabasePublicEnv } from '@/lib/env';

const AUTH_BYPASS = process.env.NEXT_PUBLIC_AUTH_BYPASS === 'true';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Bypass 모드일 때는 Service Role 클라이언트를 반환해 RLS를 우회합니다.
 * (auth.uid()가 없어서 RLS 정책이 막는 문제 해결)
 */
export async function createClient() {
  const { url } = getSupabasePublicEnv();
  if (AUTH_BYPASS && SERVICE_ROLE_KEY) {
    return createSupabaseClient(url, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  const cookieStore = await cookies();
  const { anonKey } = getSupabasePublicEnv();
  return createServerClient(url, anonKey, {
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
