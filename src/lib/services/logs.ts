import type { SupabaseClient } from '@supabase/supabase-js';
import { parseLog } from '@/lib/ai/gemini';
import { parseLogContent } from '@/lib/utils';

/** 서비스 함수 공통 에러. status는 API 응답 코드로 그대로 쓴다. */
export class ServiceError extends Error {
  constructor(message: string, public status: number = 500) {
    super(message);
  }
}

/**
 * 원문 한 덩어리를 AI로 파싱해 로그 여러 건으로 저장한다.
 * 웹 앱(POST /api/logs)과 MCP 커넥터가 같은 로직을 쓰도록 분리한 함수.
 */
export async function createLogsFromRaw(
  supabase: SupabaseClient,
  userId: string,
  rawInput: string
) {
  const { data: projects } = await supabase
    .from('projects')
    .select('projects_id, name, code')
    .eq('user_id', userId);

  let items;
  try {
    items = await parseLog(rawInput, projects || []);
  } catch (e) {
    throw new ServiceError(e instanceof Error ? e.message : 'AI 파싱 실패', 500);
  }

  const fromRawTag = rawInput?.trim() ? parseLogContent(rawInput.trim()).task_id_tag : null;

  const rows = items.map((item) => {
    let projectId: string | null = null;
    if (item.projectCode && projects?.length) {
      const found = projects.find((p) => p.code === item.projectCode);
      if (!found) {
        throw new ServiceError(`프로젝트 코드 '${item.projectCode}'를 찾을 수 없습니다.`, 400);
      }
      projectId = found.projects_id;
    }

    const parsedContent = parseLogContent(item.content);
    const tag = parsedContent.task_id_tag ?? fromRawTag;
    const codes =
      Array.isArray(item.categoryCodes) && item.categoryCodes.length > 0 ? item.categoryCodes : [];

    return {
      user_id: userId,
      project_id: projectId,
      raw_input: rawInput,
      content: parsedContent.content,
      log_type: item.logType,
      category_codes: codes,
      keywords: item.extractedKeywords ?? null,
      source: parsedContent.source ?? null,
      task_id_tag: tag ?? null,
    };
  });

  const { data: logs, error } = await supabase.from('logs').insert(rows).select();
  if (error) throw new ServiceError(error.message, 500);

  const created = Array.isArray(logs) ? logs : [];

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  if (baseUrl) {
    for (const log of created) {
      fetch(`${baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId: log.log_id }),
      }).catch((err) => {
        console.warn('[createLogsFromRaw] Embedding request failed for log', log.log_id, err);
      });
    }
  }

  return created;
}
