import { createClient } from '@/lib/supabase/server';
import { getEffectiveUserId, getAuthBypassConfigError } from '@/lib/auth';
import { getTodayKST } from '@/lib/utils/date';
import { logToTaskShape, normalizeProject, type LogRowForTaskShape } from '@/lib/task-from-log';
import { createTaskSchema } from '@/lib/validators/schemas';
import { NextResponse } from 'next/server';
import type { Task } from '@/types/database';

export async function GET(req: Request) {
  const configError = getAuthBypassConfigError();
  if (configError) return configError;
  const supabase = await createClient();
  const userId = await getEffectiveUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') ?? '200', 10)), 500);
  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10));

  // 할일 = (1) task_id_tag/task_state 있는 로그, (2) no_task_needed=false인 로그(AI가 할일로 분류)
  let query = supabase
    .from('logs')
    .select('id, user_id, project_id, log_date, content, task_id_tag, task_state, created_at, source, project:projects(id, name, code)')
    .eq('user_id', userId)
    .not('project_id', 'is', null)
    .or('task_state.not.is.null,task_id_tag.not.is.null,no_task_needed.eq.false')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (projectId) query = query.eq('project_id', projectId);
  const stateParam = searchParams.get('state');
  if (stateParam) query = query.eq('task_state', stateParam);

  const { data: logs, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const normalizedLogs = (logs ?? []).map((l) => normalizeProject(l));
  const tasks = normalizedLogs.map(logToTaskShape).filter((t): t is Task => t != null);

  const withLogs = searchParams.get('withLogs') === 'true';
  if (withLogs && tasks.length > 0) {
    const tags = Array.from(new Set(tasks.map((t) => t.task_id_tag).filter(Boolean)));
    const { data: relatedLogs } = await supabase
      .from('logs')
      .select('id, log_date, log_type, content, source, task_id_tag, project:projects(name, code)')
      .eq('user_id', userId)
      .in('task_id_tag', tags)
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false });
    type RelatedLog = (NonNullable<typeof relatedLogs>)[number];
    const logsByTag = (relatedLogs ?? []).reduce<Record<string, RelatedLog[]>>(
      (acc, log) => {
        const tag = log.task_id_tag;
        if (tag) {
          if (!acc[tag]) acc[tag] = [];
          acc[tag].push(log);
        }
        return acc;
      },
      {}
    );
    const data = tasks.map((t) => ({
      ...t,
      relatedLogs: logsByTag[t.task_id_tag] ?? [],
    }));
    return NextResponse.json(data);
  }

  return NextResponse.json(tasks);
}

export async function POST(req: Request) {
  const configError = getAuthBypassConfigError();
  if (configError) return configError;
  const supabase = await createClient();
  const userId = await getEffectiveUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] || 'project_id, description을 입력해 주세요.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const { project_id, task_id_tag, description, priority } = parsed.data;

  let tag = task_id_tag;
  if (!tag) {
    const { data: project } = await supabase
      .from('projects')
      .select('code')
      .eq('id', project_id)
      .eq('user_id', userId)
      .single();
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    const todayStr = getTodayKST();
    const { data: generatedTag } = await supabase.rpc('generate_task_id', {
      p_project_code: project.code,
      p_date: todayStr,
    });
    tag = generatedTag as string;
  }

  const logDate = getTodayKST();
  const taskState = (priority === 'high' || priority === 'medium' || priority === 'low')
    ? priority
    : 'medium';
  const { data: log, error } = await supabase
    .from('logs')
    .insert({
      user_id: userId,
      project_id,
      log_date: logDate,
      raw_input: description,
      content: description,
      log_type: 'E9',
      task_id_tag: tag,
      task_state: taskState,
    })
    .select('*, project:projects(id, name, code)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const normalized = normalizeProject(log);
  const task = logToTaskShape(normalized as LogRowForTaskShape);
  return NextResponse.json(task ?? normalized);
}
