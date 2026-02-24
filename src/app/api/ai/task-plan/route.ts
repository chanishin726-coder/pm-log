import { createClient } from '@/lib/supabase/server';
import { getEffectiveUserId, getAuthBypassConfigError } from '@/lib/auth';
import { getTodayKST } from '@/lib/utils/date';
import { classifyLogsAsTask } from '@/lib/ai/gemini';
import { normalizeProject } from '@/lib/task-from-log';
import { NextResponse } from 'next/server';

/**
 * AI 할일 파악 (5일치): no_task_needed가 null인 로그만 AI에게 보내
 * "할일로 볼 것인지"만 판단하고, no_task_needed만 반영. 우선순위·상태·task_id_tag는 사용자가 수동 지정.
 * 이미 task_id_tag 또는 task_state가 있는 로그는 검토 대상에서 제외.
 */
export async function POST(req: Request) {
  const configError = getAuthBypassConfigError();
  if (configError) return configError;
  const supabase = await createClient();
  const userId = await getEffectiveUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const date = body.date || getTodayKST();
  const targetDate = date;

  // 1) 로그가 존재하는 최근 5개 날짜 (최대 500행 스캔으로 충분)
  const { data: dateRows } = await supabase
    .from('logs')
    .select('log_date')
    .eq('user_id', userId)
    .lte('log_date', targetDate)
    .order('log_date', { ascending: false })
    .limit(500);
  const recentDates = Array.from(new Set((dateRows ?? []).map((r) => r.log_date))).slice(0, 5);
  if (recentDates.length === 0) {
    return NextResponse.json({ classified: 0, message: '대상 로그가 없습니다.' });
  }

  // 2) no_task_needed가 null이고, task_id_tag·task_state가 없는 로그만 (아직 분류·관리 안 된 것만)
  const { data: logsToClassify } = await supabase
    .from('logs')
    .select('log_id, log_date, log_type, content, project:projects(projects_id, name, code)')
    .eq('user_id', userId)
    .in('log_date', recentDates)
    .is('no_task_needed', null)
    .is('task_id_tag', null)
    .is('task_state', null)
    .order('log_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (!logsToClassify?.length) {
    return NextResponse.json({ classified: 0, message: '분류할 로그가 없습니다. (이미 분류되었거나 할일로 관리 중인 로그만 있음)' });
  }

  let result;
  try {
    result = await classifyLogsAsTask({
      logs: logsToClassify.map((l) => {
        const n = normalizeProject(l as { project?: unknown; log_id: string; log_date: string; log_type: string; content: string | null });
        return {
          log_id: n.log_id,
          log_date: n.log_date,
          log_type: n.log_type,
          content: n.content ?? '',
          project: n.project,
        };
      }),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'AI 처리 실패' },
      { status: 500 }
    );
  }

  const logIdToIsTask = new Map((result.results ?? []).map((r) => [r.logId, r.isTask]));
  const logIdsNoTaskTrue: string[] = [];
  const logIdsNoTaskFalse: string[] = [];
  for (const log of logsToClassify) {
    const isTask = logIdToIsTask.get(log.log_id);
    if (isTask === undefined) continue;
    if (isTask) logIdsNoTaskFalse.push(log.log_id);
    else logIdsNoTaskTrue.push(log.log_id);
  }

  if (logIdsNoTaskTrue.length > 0) {
    await supabase
      .from('logs')
      .update({ no_task_needed: true })
      .eq('user_id', userId)
      .in('log_id', logIdsNoTaskTrue);
  }
  if (logIdsNoTaskFalse.length > 0) {
    await supabase
      .from('logs')
      .update({ no_task_needed: false })
      .eq('user_id', userId)
      .in('log_id', logIdsNoTaskFalse);
  }

  const classified = logIdsNoTaskTrue.length + logIdsNoTaskFalse.length;
  return NextResponse.json({ classified, total: logsToClassify.length });
}
