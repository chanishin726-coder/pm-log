import { createClient } from '@/lib/supabase/server';
import { getEffectiveUserId, getAuthBypassConfigError } from '@/lib/auth';
import { NO_PROJECT_FILTER_VALUE } from '@/lib/utils';
import { createLogsFromRaw, ServiceError } from '@/lib/services/logs';
import { createLogSchema } from '@/lib/validators/schemas';
import { NextResponse } from 'next/server';

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

  const parsedBody = createLogSchema.safeParse(body);
  if (!parsedBody.success) {
    const msg = parsedBody.error.flatten().formErrors[0] || 'rawInput required';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const { rawInput } = parsedBody.data;

  try {
    const logs = await createLogsFromRaw(supabase, userId, rawInput);
    return NextResponse.json(logs);
  } catch (e) {
    const status = e instanceof ServiceError ? e.status : 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '로그 저장 실패' },
      { status }
    );
  }
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
  const logType = searchParams.get('logType');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const keyword = searchParams.get('keyword');
  const taskIdTag = searchParams.get('taskIdTag');
  const parentGroup = searchParams.get('parentGroup');
  const source = searchParams.get('source');
  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') ?? '100', 10)), 500);
  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10));

  const listColumns =
    'log_id, log_date, log_type, content, category_codes, source, task_id_tag, task_state, created_at, project_id, project:projects(projects_id, name, code)';
  let query = supabase
    .from('logs')
    .select(listColumns)
    .eq('user_id', userId)
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (projectId === NO_PROJECT_FILTER_VALUE) {
    query = query.is('project_id', null);
  } else if (projectId) {
    query = query.eq('project_id', projectId);
  }
  if (logType) query = query.eq('log_type', logType);
  if (startDate) query = query.gte('log_date', startDate);
  if (endDate) query = query.lte('log_date', endDate);
  if (keyword) query = query.contains('keywords', [keyword]);
  if (taskIdTag?.trim()) query = query.ilike('task_id_tag', `%${taskIdTag.trim()}%`);
  if (source?.trim()) query = query.ilike('source', `%${source.trim()}%`);

  if (parentGroup?.trim()) {
    const { data: cats } = await supabase
      .from('categories')
      .select('code')
      .eq('parent_group', parentGroup.trim());
    const codes = (cats ?? []).map((c) => (c as { code: string }).code);
    if (codes.length > 0) {
      query = query.overlaps('category_codes', codes);
    }
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
