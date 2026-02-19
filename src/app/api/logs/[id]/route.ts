import { createClient } from '@/lib/supabase/server';
import { getEffectiveUserId, getAuthBypassConfigError } from '@/lib/auth';
import { updateLogSchema } from '@/lib/validators/schemas';
import { NextResponse } from 'next/server';

export async function GET(
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

  const { data, error } = await supabase
    .from('logs')
    .select('*, project:projects(id, name, code)')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}

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
  const parsed = updateLogSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] || '입력값을 확인해 주세요.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const { content, log_type, category_code, source, task_id_tag, task_state, project_id, log_date } = parsed.data;

  let previousTaskState: string | null = null;
  if (task_state !== undefined) {
    const { data: existing } = await supabase
      .from('logs')
      .select('task_state')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    previousTaskState = (existing as { task_state?: string | null } | null)?.task_state ?? null;
  }

  const update: Record<string, unknown> = {};
  if (content !== undefined) update.content = content;
  if (log_type !== undefined) update.log_type = log_type;
  if (category_code !== undefined) update.category_code = category_code;
  if (source !== undefined) update.source = source;
  if (task_id_tag !== undefined) update.task_id_tag = task_id_tag;
  if (task_state !== undefined) update.task_state = task_state;
  if (project_id !== undefined) update.project_id = project_id === '' || project_id == null ? null : project_id;
  if (log_date !== undefined && log_date !== '') update.log_date = log_date;

  const { data, error } = await supabase
    .from('logs')
    .update(update)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (task_state !== undefined && previousTaskState !== task_state) {
    await supabase.from('task_state_history').insert({
      log_id: id,
      task_state: task_state as string,
    });
  }

  return NextResponse.json(data);
}

export async function DELETE(
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

  const { error } = await supabase
    .from('logs')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
