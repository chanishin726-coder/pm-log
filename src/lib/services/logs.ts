import type { SupabaseClient } from '@supabase/supabase-js';
import { parseLog, generateEmbedding } from '@/lib/ai/gemini';
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

/** 로그 임베딩 생성(의미 검색용). 실패해도 저장은 유지되므로 결과만 반환한다. */
export async function embedLogs(
  supabase: SupabaseClient,
  logs: { log_id: string; content: string }[]
): Promise<{ ok: number; failed: number }> {
  const results = await Promise.allSettled(
    logs.map(async (log) => {
      const values = await generateEmbedding(log.content);
      const { error } = await supabase.from('log_embeddings').insert({
        log_id: log.log_id,
        embedding: values,
        content_chunk: log.content,
      });
      if (error) throw new Error(error.message);
    })
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  return { ok: results.length - failed, failed };
}

export type StructuredLogInput = {
  log_date: string;
  project_code: string | null;
  log_type: 'F' | 'T' | 'W' | 'I';
  category_codes: string[];
  source: string | null;
  content: string;
  task_tag: string | null;
  keywords: string[];
  raw_excerpt: string | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 이미 분류가 끝난 로그(Claude 등)를 AI 파싱 없이 저장한다.
 * - 프로젝트·카테고리 코드, 유형, 날짜를 서버에서 검증. 하나라도 틀리면 아무것도 저장하지 않음.
 * - 같은 날짜·같은 내용의 로그가 이미 있으면 중복으로 보고 건너뜀.
 * - 임베딩은 만들지 않음. 호출 측에서 embedLogs()로 처리.
 */
export async function createLogsStructured(
  supabase: SupabaseClient,
  userId: string,
  items: StructuredLogInput[]
) {
  const [{ data: projects }, { data: cats }] = await Promise.all([
    supabase.from('projects').select('projects_id, code').eq('user_id', userId),
    supabase.from('categories').select('code'),
  ]);
  const projectByCode = new Map((projects ?? []).map((p) => [p.code as string, p.projects_id as string]));
  const validCats = new Set((cats ?? []).map((c) => c.code as string));

  const errors: string[] = [];
  items.forEach((it, i) => {
    const n = `${i + 1}번`;
    if (!DATE_RE.test(it.log_date) || Number.isNaN(Date.parse(it.log_date))) {
      errors.push(`${n}: 날짜 형식 오류 '${it.log_date}' (YYYY-MM-DD)`);
    }
    if (it.project_code && !projectByCode.has(it.project_code)) {
      errors.push(`${n}: 없는 프로젝트 코드 '${it.project_code}'`);
    }
    const badCats = it.category_codes.filter((c) => !validCats.has(c));
    if (badCats.length) errors.push(`${n}: 없는 카테고리 코드 ${badCats.join(', ')}`);
    if (!it.content.trim()) errors.push(`${n}: 내용이 비어 있음`);
  });
  if (errors.length) throw new ServiceError(`검증 실패 — 저장하지 않았습니다.\n${errors.join('\n')}`, 400);

  // 중복 확인: 같은 날짜 범위의 기존 로그 내용과 비교
  const dates = Array.from(new Set(items.map((it) => it.log_date)));
  const { data: existing } = await supabase
    .from('logs')
    .select('log_date, content')
    .eq('user_id', userId)
    .in('log_date', dates);
  const norm = (s: string) => s.replace(/\s+/g, '').trim();
  const existingKeys = new Set((existing ?? []).map((e) => `${e.log_date}|${norm(e.content as string)}`));

  const skipped: { index: number; content: string }[] = [];
  const rows: Record<string, unknown>[] = [];
  items.forEach((it, i) => {
    const key = `${it.log_date}|${norm(it.content)}`;
    if (existingKeys.has(key)) {
      skipped.push({ index: i + 1, content: it.content });
      return;
    }
    existingKeys.add(key);
    const tag = it.task_tag?.trim()
      ? it.task_tag.trim().startsWith('#') ? it.task_tag.trim() : `#${it.task_tag.trim()}`
      : null;
    const line = `${it.source ? `${it.source}: ` : ''}${it.content}${tag ? ` ${tag}` : ''}`;
    rows.push({
      user_id: userId,
      project_id: it.project_code ? projectByCode.get(it.project_code) : null,
      log_date: it.log_date,
      raw_input: it.raw_excerpt?.trim() || `${it.project_code ?? ''} ${it.log_type} ${line}`.trim(),
      content: it.content.trim(),
      log_type: it.log_type,
      category_codes: it.category_codes,
      keywords: it.keywords.length ? it.keywords.slice(0, 5) : null,
      source: it.source?.trim() || null,
      task_id_tag: tag,
    });
  });

  if (!rows.length) return { created: [], skipped };

  const { data: logs, error } = await supabase.from('logs').insert(rows).select();
  if (error) throw new ServiceError(error.message, 500);
  const created = Array.isArray(logs) ? logs : [];
  // 임베딩은 호출 측에서 처리(응답 지연 방지를 위해 백그라운드 실행 권장): embedLogs()
  return { created, skipped };
}
