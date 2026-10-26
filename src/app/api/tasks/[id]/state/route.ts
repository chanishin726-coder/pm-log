import { createClient } from '@/lib/supabase/server';
import { getEffectiveUserId, getAuthBypassConfigError } from '@/lib/auth';
import { updateTaskStateSchema } from '@/lib/validators/schemas';
import { updateTaskState } from '@/lib/services/tasks';
import { ServiceError } from '@/lib/services/logs';
import { NextResponse } from 'next/server';

/** 할일 상태 업데이트. id는 log id. */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const configError = getAuthBypassConfigError();
  if (configError) return configError;
  const supabase = await createClient();
  const userId = await getEffectiveUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsedBody = updateTaskStateSchema.safeParse(body);
  if (!parsedBody.success) {
    const msg = parsedBody.error.flatten().formErrors[0] || 'Invalid state. Use: null, high, medium, low, done';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const newState = parsedBody.data.state;
  try {
    const { data } = await updateTaskState(supabase, userId, id, newState);
    return NextResponse.json(data);
  } catch (e) {
    const status = e instanceof ServiceError ? e.status : 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '상태 변경 실패' },
      { status }
    );
  }
}
