import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

/**
 * 개발용: Bypass 모드에서 쓸 테스트 사용자를 Supabase에 생성하고 UUID를 반환합니다.
 * 브라우저에서 한 번만 호출한 뒤 반환된 userId를 .env의 AUTH_BYPASS_USER_ID에 넣으세요.
 * (AUTH_BYPASS=true 이고 AUTH_BYPASS_USER_ID가 비어 있을 때만 동작합니다.)
 */
export async function GET() {
  const bypass = process.env.NEXT_PUBLIC_AUTH_BYPASS === 'true';
  const hasBypassId = !!process.env.AUTH_BYPASS_USER_ID?.trim();
  if (!bypass || hasBypassId) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_AUTH_BYPASS=true 이고 AUTH_BYPASS_USER_ID가 비어 있을 때만 사용할 수 있습니다.' },
      { status: 400 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY가 .env에 있어야 합니다.' },
      { status: 500 }
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = `bypass-${Date.now()}@localhost`;
  const password = `bypass-dev-${Date.now()}`;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userId = data.user?.id;
  if (!userId) {
    return NextResponse.json({ error: '사용자 생성 후 ID를 가져오지 못했습니다.' }, { status: 500 });
  }

  return NextResponse.json({
    userId,
    message: '아래 userId를 복사해서 .env의 AUTH_BYPASS_USER_ID= 뒤에 붙여 넣고, 개발 서버를 다시 실행하세요.',
    envLine: `AUTH_BYPASS_USER_ID=${userId}`,
  });
}
