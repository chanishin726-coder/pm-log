import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

/** 임시: 인증 없이 실행할지 여부 (.env에서 NEXT_PUBLIC_AUTH_BYPASS=true) */
export const AUTH_BYPASS = process.env.NEXT_PUBLIC_AUTH_BYPASS === 'true';

/** Bypass 모드일 때 사용할 사용자 ID (Supabase 대시보드에서 생성한 테스트 사용자 UUID) */
const AUTH_BYPASS_USER_ID = process.env.AUTH_BYPASS_USER_ID ?? null;

/**
 * Bypass 모드인데 AUTH_BYPASS_USER_ID가 비어 있으면 설정 안내 응답을 반환합니다.
 * API 라우트에서 먼저 호출해 반환값이 있으면 그대로 return 하세요.
 */
export function getAuthBypassConfigError(): NextResponse | null {
  if (AUTH_BYPASS && !AUTH_BYPASS_USER_ID) {
    return NextResponse.json(
      {
        error:
          'AUTH_BYPASS_USER_ID를 .env에 설정해 주세요. Supabase 대시보드 → Authentication → Users에서 사용자 UUID를 복사하거나, 이메일 인증을 끄고 회원가입 후 해당 사용자 UUID를 넣으세요.',
      },
      { status: 503 }
    );
  }
  return null;
}

/**
 * 현재 요청에 대한 "실제 사용자 ID"를 반환합니다.
 * - 로그인된 경우: auth user id
 * - AUTH_BYPASS=true 이고 AUTH_BYPASS_USER_ID 가 있으면: 해당 id
 * - 그 외: null (비인증)
 */
export async function getEffectiveUserId(
  supabase: SupabaseClient
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return user.id;
  if (AUTH_BYPASS && AUTH_BYPASS_USER_ID) return AUTH_BYPASS_USER_ID;
  return null;
}
