import { createClient } from '@/lib/supabase/server';
import { getEffectiveUserId, getAuthBypassConfigError } from '@/lib/auth';
import { extractProjectCodeFromRaw, parseLogContent } from '@/lib/utils';
import { NextResponse } from 'next/server';

/**
 * 통합 동기화: (1) 프로젝트 (2) task_id_tag. task_state는 사용자만 수동 변경.
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

  // (1) 프로젝트: project_id가 null인 로그에 raw_input에서 프로젝트 코드 매칭
  const { data: projects } = await supabase
    .from('projects')
    .select('projects_id, code')
    .eq('user_id', userId);

  if (projects?.length) {
    const codes = projects.map((p) => p.code);
    const codeToId = new Map(projects.map((p) => [p.code, p.projects_id]));

    const { data: logsNoProject } = await supabase
      .from('logs')
      .select('log_id, raw_input')
      .eq('user_id', userId)
      .is('project_id', null);

    // 프로젝트별로 log_id 묶어서 배치 UPDATE (N+1 방지)
    const logIdsByProjectId = new Map<string, string[]>();
    for (const log of logsNoProject ?? []) {
      const code = extractProjectCodeFromRaw(log.raw_input ?? '', codes);
      if (!code) continue;
      const projectId = codeToId.get(code);
      if (!projectId) continue;
      if (!logIdsByProjectId.has(projectId)) logIdsByProjectId.set(projectId, []);
      logIdsByProjectId.get(projectId)!.push(log.log_id);
    }
    for (const [projectId, logIds] of logIdsByProjectId) {
      const { error } = await supabase
        .from('logs')
        .update({ project_id: projectId })
        .eq('user_id', userId)
        .in('log_id', logIds);
      if (!error) projectUpdated += logIds.length;
    }
  }

  // (2) task_id_tag: task_id_tag가 null인 로그에 raw_input 끝 #태그 반영
  const { data: logsNoTag } = await supabase
    .from('logs')
    .select('log_id, raw_input')
    .eq('user_id', userId)
    .is('task_id_tag', null);

  // 태그별로 log_id 묶어서 배치 UPDATE (N+1 방지)
  const logIdsByTag = new Map<string, string[]>();
  for (const log of logsNoTag ?? []) {
    const tag = parseLogContent(log.raw_input ?? '').task_id_tag;
    if (!tag?.trim()) continue;
    if (!logIdsByTag.has(tag)) logIdsByTag.set(tag, []);
    logIdsByTag.get(tag)!.push(log.log_id);
  }
  for (const [tag, logIds] of logIdsByTag) {
    const { error } = await supabase
      .from('logs')
      .update({ task_id_tag: tag })
      .eq('user_id', userId)
      .in('log_id', logIds);
    if (!error) taskIdTagUpdated += logIds.length;
  }

  return NextResponse.json({
    projectUpdated,
    taskIdTagUpdated,
    taskStateUpdated: 0,
  });
}
