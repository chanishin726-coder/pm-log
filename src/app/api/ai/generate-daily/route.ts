import { createClient } from '@/lib/supabase/server';
import { getEffectiveUserId, getAuthBypassConfigError } from '@/lib/auth';
import { generateDailyReport } from '@/lib/ai/gemini';
import { NextResponse } from 'next/server';

type LogForSection3 = {
  log_type: string;
  content: string;
  source: string | null;
  task_id_tag: string | null;
  created_at: string;
  project: { name: string } | null;
};

/** 1수준 project, 2수준 task_id_tag(없으면 source), 3수준 created_at. 각 줄은 [F/T/W/I] source: content → #tag(있을 때만) */
function formatSection3Logs(logs: LogForSection3[]): string {
  if (logs.length === 0) return '   - 없음';
  const sorted = [...logs].sort((a, b) => {
    const projA = a.project?.name?.trim() ? a.project.name.trim() : '기타';
    const projB = b.project?.name?.trim() ? b.project.name.trim() : '기타';
    if (projA !== projB) return projA.localeCompare(projB);
    const groupA = a.task_id_tag ?? (a.source?.trim() ?? '');
    const groupB = b.task_id_tag ?? (b.source?.trim() ?? '');
    if (groupA !== groupB) return groupA.localeCompare(groupB);
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
  const lines: string[] = [];
  let currentProject = '';
  for (const l of sorted) {
    const proj = l.project?.name?.trim() ? l.project.name.trim() : '기타';
    if (proj !== currentProject) {
      currentProject = proj;
      lines.push(proj);
    }
    const source = (l.source && l.source.trim()) ? l.source.trim() : '(발신/대상 없음)';
    const suffix = l.task_id_tag ? ` → ${l.task_id_tag}` : '';
    lines.push(` - [${l.log_type}] ${source}: ${l.content}${suffix}`);
  }
  return lines.join('\n');
}

type TaskForSection1 = {
  task_id_tag: string;
  description: string;
  task_state: string | null;
  due_date: string | null;
};

/** 1. 할일, 2. 일정 절만 서버에서 생성 (AI 토큰 절약) */
function buildReportSection12(tasks: TaskForSection1[]): string {
  const A = tasks.filter((t) => t.task_state === 'high');
  const B = tasks.filter((t) => t.task_state === 'medium');
  const C = tasks.filter((t) => t.task_state === 'low' || t.task_state === 'review' || !t.task_state);
  const line = (t: TaskForSection1) =>
    `- [ ] ${t.task_id_tag} ${t.description}${t.due_date ? ` (마감: ${t.due_date})` : ''}`;
  return `1. 할일
   A. 우선순위
   ${A.length ? A.map(line).join('\n   ') : '없음'}
   B. 후순위
   ${B.length ? B.map(line).join('\n   ') : '없음'}
   C. 대기사항
   ${C.length ? C.map(line).join('\n   ') : '없음'}

2. 일정
   - 없음`;
}

export async function POST(req: Request) {
  const configError = getAuthBypassConfigError();
  if (configError) return configError;
  const supabase = await createClient();
  const userId = await getEffectiveUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const date = body.date || new Date().toISOString().split('T')[0];
  const targetDate = date;

  const { data: logs } = await supabase
    .from('logs')
    .select('id, log_date, log_type, content, category_code, source, created_at, project:projects(id, name, code)')
    .eq('user_id', userId)
    .eq('log_date', targetDate)
    .order('created_at', { ascending: true });

  if (!logs || logs.length === 0) {
    return NextResponse.json(
      { error: '해당 날짜의 로그가 없습니다.' },
      { status: 404 }
    );
  }

  // 로그가 기록된 최근 5일치만 조회 (당일 제외, 로그가 존재하는 날 기준)
  const { data: recentLogsRaw } = await supabase
    .from('logs')
    .select('id, log_date, log_type, content, category_code, source, task_id_tag, created_at, project:projects(id, name, code)')
    .eq('user_id', userId)
    .lt('log_date', targetDate)
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500);
  const recentDates = Array.from(new Set((recentLogsRaw ?? []).map((l) => l.log_date))).slice(0, 5);
  const recentLogs = (recentLogsRaw ?? [])
    .filter((l) => recentDates.includes(l.log_date))
    .sort((a, b) => (a.log_date !== b.log_date ? a.log_date.localeCompare(b.log_date) : (a.created_at ?? '').localeCompare(b.created_at ?? '')));

  // 할일 = logs (task_state 또는 task_id_tag 있는 것). report_date 기준 task_state_history에서 당시 상태 조회.
  const { data: taskLogs } = await supabase
    .from('logs')
    .select('id, task_id_tag, content, task_state, project:projects(name, code)')
    .eq('user_id', userId)
    .not('project_id', 'is', null)
    .or('task_state.not.is.null,task_id_tag.not.is.null')
    .order('created_at', { ascending: true });

  const logIds = (taskLogs ?? []).map((l) => l.id).filter(Boolean);
  const endOfTargetDate = `${targetDate}T23:59:59.999Z`;
  const effectiveStateByLogId: Record<string, string> = {};

  if (logIds.length > 0) {
    const { data: historyRows } = await supabase
      .from('task_state_history')
      .select('log_id, task_state, changed_at')
      .in('log_id', logIds)
      .lte('changed_at', endOfTargetDate)
      .order('changed_at', { ascending: false });

    const seen = new Set<string>();
    for (const row of historyRows ?? []) {
      const lid = (row as { log_id: string }).log_id;
      if (!seen.has(lid)) {
        seen.add(lid);
        effectiveStateByLogId[lid] = (row as { task_state: string }).task_state;
      }
    }
  }

  const tasks = (taskLogs ?? [])
    .map((l) => {
      const effectiveState = effectiveStateByLogId[l.id] ?? (l as { task_state?: string | null }).task_state ?? null;
      return {
        task_id_tag: l.task_id_tag ?? '',
        description: l.content ?? '',
        task_state: effectiveState,
        due_date: null as string | null,
      };
    })
    .filter((t) => t.task_id_tag)
    .filter((t) => t.task_state !== 'done');

  const prevDate = new Date(targetDate);
  prevDate.setDate(prevDate.getDate() - 1);
  const prevDateStr = prevDate.toISOString().split('T')[0];

  const { data: prevReport } = await supabase
    .from('daily_reports')
    .select('content')
    .eq('user_id', userId)
    .eq('report_date', prevDateStr)
    .single();

  const normalizeProject = <T extends { project?: unknown }>(arr: T[]): T[] =>
    arr.map((l) => {
      const p = l.project;
      const project = Array.isArray(p) ? (p[0] ?? null) : (p ?? null);
      return { ...l, project } as T;
    });

  let result: { logAssignments: Array<{ logId: string; taskIdTag: string | null }>; newTasks: Array<{ description: string; projectCode: string; priority: string; logIds: string[] }> };
  try {
    result = await generateDailyReport({
      logs: normalizeProject(logs ?? []) as unknown as Parameters<typeof generateDailyReport>[0]['logs'],
      recentLogs: normalizeProject((recentLogs ?? []).filter((l) => l.log_date !== targetDate)) as unknown as Parameters<typeof generateDailyReport>[0]['recentLogs'],
      tasks: tasks || [],
      previousReport: prevReport?.content,
      targetDate,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '일지 생성 실패' },
      { status: 500 }
    );
  }

  const { logAssignments, newTasks } = result;
  const logIdsThisDay = new Set(logs.map((l) => l.id));

  for (const nt of newTasks) {
    const { data: proj } = await supabase
      .from('projects')
      .select('id')
      .eq('user_id', userId)
      .eq('code', nt.projectCode)
      .single();
    if (!proj) continue;
    const { data: tag } = await supabase.rpc('generate_task_id', {
      p_project_code: nt.projectCode,
      p_date: targetDate,
    });
    const taskIdTag = (tag as string) ?? `#${nt.projectCode}-${targetDate.replace(/-/g, '')}-99`;
    const firstLogId = nt.logIds?.[0];
    if (firstLogId && logIdsThisDay.has(firstLogId)) {
      // 이미 task_id_tag가 있으면 덮어쓰지 않음(고유 ID 수동 지정 보존). task_state는 사용자만 수동 변경.
      await supabase.from('logs').update({ task_id_tag: taskIdTag, no_task_needed: false }).eq('id', firstLogId).eq('user_id', userId).is('task_id_tag', null);
    } else {
      await supabase
        .from('logs')
        .insert({
          user_id: userId,
          project_id: proj.id,
          log_date: targetDate,
          raw_input: nt.description,
          content: nt.description,
          log_type: 'I',
          task_id_tag: taskIdTag,
          no_task_needed: false,
        });
      // task_state는 사용자만 수동 변경. 이력은 기록하지 않음.
    }
    for (const logId of nt.logIds ?? []) {
      if (!logIdsThisDay.has(logId)) continue;
      // 이미 task_id_tag가 있으면 덮어쓰지 않음
      await supabase.from('logs').update({ task_id_tag: taskIdTag, no_task_needed: false }).eq('id', logId).eq('user_id', userId).is('task_id_tag', null);
    }
  }

  for (const a of logAssignments) {
    if (!logIdsThisDay.has(a.logId)) continue;
    if (a.taskIdTag != null) {
      // 이미 task_id_tag가 있으면 덮어쓰지 않음(수동 지정 보존)
      await supabase.from('logs').update({ task_id_tag: a.taskIdTag, no_task_needed: false }).eq('id', a.logId).eq('user_id', userId).is('task_id_tag', null);
    }
  }

  // 3. 일지 및 소통 이력: 프로젝트 있는 로그 전부, 1수준 project → 2수준 task_id_tag(없으면 source) → 3수준 created_at, 각 줄은 source 표기
  const { data: logsForSection3 } = await supabase
    .from('logs')
    .select('id, log_type, content, source, task_id_tag, created_at, project:projects(name)')
    .eq('user_id', userId)
    .eq('log_date', targetDate)
    .order('created_at', { ascending: true });

  const section3Text = formatSection3Logs((logsForSection3 ?? []) as unknown as LogForSection3[]);

  const section12 = buildReportSection12((tasks || []) as TaskForSection1[]);
  const reportContentFinal = `${section12}\n\n3. 일지 및 소통 이력\n${section3Text}`;

  const { data: report, error } = await supabase
    .from('daily_reports')
    .upsert(
      {
        user_id: userId,
        report_date: targetDate,
        content: reportContentFinal,
        total_logs: logs.length,
        f_count: logs.filter((l) => l.log_type === 'F').length,
        t_count: logs.filter((l) => l.log_type === 'T').length,
        w_count: logs.filter((l) => l.log_type === 'W').length,
        i_count: logs.filter((l) => l.log_type === 'I').length,
      },
      { onConflict: 'user_id,report_date' }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(report);
}
