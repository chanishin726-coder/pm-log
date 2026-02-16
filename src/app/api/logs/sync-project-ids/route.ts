import { createClient } from '@/lib/supabase/server';
import { getEffectiveUserId, getAuthBypassConfigError } from '@/lib/auth';
import { extractProjectCodeFromRaw } from '@/lib/utils';
import { NextResponse } from 'next/server';

/**
 * project_id가 null인 로그에 대해 raw_input에서 프로젝트 코드를 추출해
 * 등록된 프로젝트와 매칭하여 project_id를 반영합니다.
 * (뒤늦게 프로젝트 추가한 경우 기존 로그 분류용)
 */
export async function POST() {
  const configError = getAuthBypassConfigError();
  if (configError) return configError;
  const supabase = await createClient();
  const userId = await getEffectiveUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: projects } = await supabase
    .from('projects')
    .select('id, code')
    .eq('user_id', userId);

  if (!projects?.length) {
    return NextResponse.json({ updated: 0, message: '등록된 프로젝트가 없습니다.' });
  }

  const codes = projects.map((p) => p.code);
  const codeToId = new Map(projects.map((p) => [p.code, p.id]));

  const { data: logs } = await supabase
    .from('logs')
    .select('id, raw_input')
    .eq('user_id', userId)
    .is('project_id', null);

  let updated = 0;
  for (const log of logs ?? []) {
    const code = extractProjectCodeFromRaw(log.raw_input ?? '', codes);
    if (!code) continue;
    const projectId = codeToId.get(code);
    if (!projectId) continue;

    const { error } = await supabase
      .from('logs')
      .update({ project_id: projectId })
      .eq('id', log.id)
      .eq('user_id', userId);

    if (!error) updated++;
  }

  return NextResponse.json({ updated, total: logs?.length ?? 0 });
}
