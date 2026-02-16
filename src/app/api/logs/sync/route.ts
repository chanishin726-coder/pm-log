import { createClient } from '@/lib/supabase/server';
import { getEffectiveUserId, getAuthBypassConfigError } from '@/lib/auth';
import { extractProjectCodeFromRaw, parseLogContent } from '@/lib/utils';
import { NextResponse } from 'next/server';

const TASK_STATE_VALUES = ['high', 'medium', 'low', 'review', 'done'] as const;

/**
 * 통합 동기화: (1) 프로젝트 (2) task_id_tag (3) 같은 task_id_tag의 task_state
 */
export async function POST() {
  const configError = getAuthBypassConfigError();
  if (configError) return configError;
  const supabase = await createClient();
  const userId = await getEffectiveUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let projectUpdated = 0;
  let taskIdTagUpdated = 0;
  let taskStateUpdated = 0;

  // (1) 프로젝트: project_id가 null인 로그에 raw_input에서 프로젝트 코드 매칭
  const { data: projects } = await supabase
    .from('projects')
    .select('id, code')
    .eq('user_id', userId);

  if (projects?.length) {
    const codes = projects.map((p) => p.code);
    const codeToId = new Map(projects.map((p) => [p.code, p.id]));

    const { data: logsNoProject } = await supabase
      .from('logs')
      .select('id, raw_input')
      .eq('user_id', userId)
      .is('project_id', null);

    for (const log of logsNoProject ?? []) {
      const code = extractProjectCodeFromRaw(log.raw_input ?? '', codes);
      if (!code) continue;
      const projectId = codeToId.get(code);
      if (!projectId) continue;

      const { error } = await supabase
        .from('logs')
        .update({ project_id: projectId })
        .eq('id', log.id)
        .eq('user_id', userId);

      if (!error) projectUpdated++;
    }
  }

  // (2) task_id_tag: task_id_tag가 null인 로그에 raw_input 끝 #태그 반영
  const { data: logsNoTag } = await supabase
    .from('logs')
    .select('id, raw_input')
    .eq('user_id', userId)
    .is('task_id_tag', null);

  for (const log of logsNoTag ?? []) {
    const tag = parseLogContent(log.raw_input ?? '').task_id_tag;
    if (!tag?.trim()) continue;

    const { error } = await supabase
      .from('logs')
      .update({ task_id_tag: tag })
      .eq('id', log.id)
      .eq('user_id', userId);

    if (!error) taskIdTagUpdated++;
  }

  // (3) 같은 task_id_tag의 task_state 통일: 태그별로 하나의 state로 맞춤 (null이 아닌 값 우선, 없으면 updated_at 최신 로그 기준)
  const { data: logsWithTag } = await supabase
    .from('logs')
    .select('id, task_id_tag, task_state, updated_at')
    .eq('user_id', userId)
    .not('task_id_tag', 'is', null);

  const byTag = new Map<string, { id: string; task_state: string | null; updated_at: string }[]>();
  for (const log of logsWithTag ?? []) {
    const tag = (log as { task_id_tag?: string | null }).task_id_tag;
    if (!tag) continue;
    const state = (log as { task_state?: string | null }).task_state;
    const updatedAt = (log as { updated_at?: string }).updated_at ?? '';
    if (!byTag.has(tag)) byTag.set(tag, []);
    byTag.get(tag)!.push({
      id: log.id,
      task_state: state && TASK_STATE_VALUES.includes(state as (typeof TASK_STATE_VALUES)[number]) ? state : null,
      updated_at: updatedAt,
    });
  }

  for (const [, entries] of byTag) {
    if (entries.length <= 1) continue;
    const withState = entries.filter((e) => e.task_state != null);
    const canonical = withState.length > 0
      ? withState.sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0].task_state
      : null;
    if (canonical == null) continue;

    for (const e of entries) {
      if (e.task_state === canonical) continue;
      const { error } = await supabase
        .from('logs')
        .update({ task_state: canonical })
        .eq('id', e.id)
        .eq('user_id', userId);
      if (!error) taskStateUpdated++;
    }
  }

  return NextResponse.json({
    projectUpdated,
    taskIdTagUpdated,
    taskStateUpdated,
  });
}
