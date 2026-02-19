import { createClient } from '@/lib/supabase/server';
import { getEffectiveUserId, getAuthBypassConfigError } from '@/lib/auth';
import { updateTaskStateSchema } from '@/lib/validators/schemas';
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
    const msg = parsedBody.error.flatten().formErrors[0] || 'Invalid state. Use: null, high, medium, low, review, done';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const newState = parsedBody.data.state;
  const { data: existing } = await supabase
    .from('logs')
    .select('task_state')
    .eq('id', id)
    .eq('user_id', userId)
    .single();
  const previousState = (existing as { task_state?: string | null } | null)?.task_state ?? null;

  const { data, error } = await supabase
    .from('logs')
    .update({ task_state: newState })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (newState !== previousState && newState != null) {
    await supabase.from('task_state_history').insert({
      log_id: id,
      task_state: newState,
    });
  }

  return NextResponse.json(data);
}
