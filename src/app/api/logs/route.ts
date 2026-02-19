import { createClient } from '@/lib/supabase/server';
import { getEffectiveUserId, getAuthBypassConfigError } from '@/lib/auth';
import { parseLog } from '@/lib/ai/gemini';
import { parseLogContent, NO_PROJECT_FILTER_VALUE } from '@/lib/utils';
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

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, code')
    .eq('user_id', userId);

  let items;
  try {
    items = await parseLog(rawInput, projects || []);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'AI 파싱 실패' },
      { status: 500 }
    );
  }

  const rows: Array<{
    user_id: string;
    project_id: string | null;
    raw_input: string;
    content: string;
    log_type: string;
    category_code: string | null;
    keywords: string[] | null;
    source: string | null;
    task_id_tag: string | null;
  }> = [];

  const fromRawTag = rawInput?.trim() ? parseLogContent(rawInput.trim()).task_id_tag : null;

  for (const item of items) {
    let projectId: string | null = null;
    if (item.projectCode && projects?.length) {
      const found = projects.find((p) => p.code === item.projectCode);
      if (!found) {
        return NextResponse.json(
          { error: `프로젝트 코드 '${item.projectCode}'를 찾을 수 없습니다.` },
          { status: 400 }
        );
      }
      projectId = found.id;
    }

    const parsedContent = parseLogContent(item.content);
    const tag = parsedContent.task_id_tag ?? fromRawTag;

    rows.push({
      user_id: userId,
      project_id: projectId,
      raw_input: rawInput,
      content: parsedContent.content,
      log_type: item.logType,
      category_code: item.categoryCode ?? null,
      keywords: item.extractedKeywords ?? null,
      source: parsedContent.source ?? null,
      task_id_tag: tag ?? null,
    });
  }

  const { data: logs, error } = await supabase.from('logs').insert(rows).select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  if (baseUrl && Array.isArray(logs)) {
    for (const log of logs) {
      fetch(`${baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId: log.id }),
      }).catch((err) => {
        console.warn('[POST /api/logs] Embedding request failed for log', log.id, err);
      });
    }
  }

  return NextResponse.json(Array.isArray(logs) ? logs : []);
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
  const categoryCode = searchParams.get('categoryCode');
  const source = searchParams.get('source');
  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') ?? '100', 10)), 500);
  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10));

  const listColumns =
    'id, log_date, log_type, content, category_code, source, task_id_tag, task_state, created_at, project_id, project:projects(id, name, code)';
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
  if (categoryCode?.trim()) query = query.ilike('category_code', `%${categoryCode.trim()}%`);
  if (source?.trim()) query = query.ilike('source', `%${source.trim()}%`);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
