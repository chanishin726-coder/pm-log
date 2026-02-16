import { createClient } from '@/lib/supabase/server';
import { getEffectiveUserId, getAuthBypassConfigError } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { Task } from '@/types/database';

/** 로그 행을 할일(Task) 형태로 변환 */
function logToTaskShape(log: {
  id: string;
  user_id: string;
  project_id: string | null;
  log_date: string;
  content: string;
  task_id_tag: string | null;
  task_state: Task['task_state'];
  created_at: string;
  project?: { id: string; name: string; code: string } | null;
}): Task | null {
  if (!log.project_id) return null;
  return {
    id: log.id,
    user_id: log.user_id,
    log_id: log.id,
    project_id: log.project_id,
    task_id_tag: log.task_id_tag ?? '',
    description: log.content,
    task_state: log.task_state ?? null,
    due_date: null,
    created_at: log.created_at,
    completed_at: null,
    ai_recommended: false,
    ai_reason: null,
    sort_order: 0,
    project: log.project ?? null,
  };
}

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

  // 할일 = (1) task_id_tag/task_state 있는 로그, (2) no_task_needed=false인 로그(AI가 할일로 분류)
  let query = supabase
    .from('logs')
    .select('id, user_id, project_id, log_date, content, task_id_tag, task_state, created_at, project:projects(id, name, code)')
    .eq('user_id', userId)
    .not('project_id', 'is', null)
    .or('task_state.not.is.null,task_id_tag.not.is.null,no_task_needed.eq.false')
    .order('created_at', { ascending: false })
    .limit(200);

  if (projectId) query = query.eq('project_id', projectId);
  const stateParam = searchParams.get('state');
  if (stateParam) query = query.eq('task_state', stateParam);

  const { data: logs, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const tasks = (logs ?? []).map(logToTaskShape).filter((t): t is Task => t != null);

  const withLogs = searchParams.get('withLogs') === 'true';
  if (withLogs && tasks.length > 0) {
    const tags = [...new Set(tasks.map((t) => t.task_id_tag).filter(Boolean))];
    const { data: relatedLogs } = await supabase
      .from('logs')
      .select('id, log_date, log_type, content, source, task_id_tag, project:projects(name, code)')
      .eq('user_id', userId)
      .in('task_id_tag', tags)
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false });
    const logsByTag = (relatedLogs ?? []).reduce(
      (acc, log) => {
        const tag = log.task_id_tag;
        if (tag) {
          if (!acc[tag]) acc[tag] = [];
          acc[tag].push(log);
        }
        return acc;
      },
      {} as Record<string, typeof relatedLogs extends (infer U)[] ? U[] : never>
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

  const body = await req.json();
  const { project_id, task_id_tag, description, priority } = body;

  if (!project_id || !description) {
    return NextResponse.json({ error: 'project_id, description required' }, { status: 400 });
  }

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
    const todayStr = new Date().toISOString().split('T')[0];
    const { data: generatedTag } = await supabase.rpc('generate_task_id', {
      p_project_code: project.code,
      p_date: todayStr,
    });
    tag = generatedTag as string;
  }

  const logDate = new Date().toISOString().split('T')[0];
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

  const task = logToTaskShape(log);
  return NextResponse.json(task ?? log);
}
