import { createClient } from '@/lib/supabase/server';
import { getEffectiveUserId, getAuthBypassConfigError } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { type TaskState } from '@/lib/task-state';

const VALID_STATES: TaskState[] = ['high', 'medium', 'low', 'review', 'done'];

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
  const body = await req.json();
  const state = body.state as string | null;

  if (state != null && !VALID_STATES.includes(state as TaskState)) {
    return NextResponse.json(
      { error: 'Invalid state. Use: null, high, medium, low, review, done' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('logs')
    .update({ task_state: state ?? null })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
