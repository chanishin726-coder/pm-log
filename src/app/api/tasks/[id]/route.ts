import { createClient } from '@/lib/supabase/server';
import { getEffectiveUserId, getAuthBypassConfigError } from '@/lib/auth';
import { logToTaskShape, normalizeProject } from '@/lib/task-from-log';
import { NextResponse } from 'next/server';

/** [id] = log id. 할일은 로그 기반이므로 logs 테이블 기준으로 조회/수정/삭제합니다. */
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

  const { data: log, error } = await supabase
    .from('logs')
    .select('id, user_id, project_id, log_date, content, task_id_tag, task_state, created_at, source, project:projects(id, name, code)')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error || !log) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const normalized = normalizeProject(log);
  const task = logToTaskShape(normalized);
  if (!task) {
    return NextResponse.json({ error: 'Not found (로그에 프로젝트가 없습니다)' }, { status: 404 });
  }

  return NextResponse.json(task);
}

/** [id] = log id. content(설명), task_state(우선순위) 수정. */
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
  const { content, task_state: bodyTaskState, priority } = body as { content?: string; task_state?: string; priority?: string };

  const update: Record<string, unknown> = {};
  if (content !== undefined) update.content = content;
  if (bodyTaskState !== undefined) {
    update.task_state = bodyTaskState;
  } else if (priority !== undefined && ['high', 'medium', 'low'].includes(priority)) {
    update.task_state = priority;
  }

  if (Object.keys(update).length === 0) {
    const { data: log } = await supabase
      .from('logs')
      .select('id, user_id, project_id, log_date, content, task_id_tag, task_state, created_at, source, project:projects(id, name, code)')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    if (!log) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const task = logToTaskShape(normalizeProject(log));
    return NextResponse.json(task ?? log);
  }

  let previousTaskState: string | null = null;
  if (update.task_state !== undefined) {
    const { data: existing } = await supabase
      .from('logs')
      .select('task_state')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    previousTaskState = (existing as { task_state?: string | null } | null)?.task_state ?? null;
  }

  const { data: log, error } = await supabase
    .from('logs')
    .update(update)
    .eq('id', id)
    .eq('user_id', userId)
    .select('id, user_id, project_id, log_date, content, task_id_tag, task_state, created_at, source, project:projects(id, name, code)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!log) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const newState = update.task_state as string | undefined;
  if (newState !== undefined && previousTaskState !== newState && newState != null) {
    await supabase.from('task_state_history').insert({
      log_id: id,
      task_state: newState,
    });
  }

  const task = logToTaskShape(normalizeProject(log));
  return NextResponse.json(task ?? log);
}

/** [id] = log id. 해당 로그(할일) 삭제. */
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
