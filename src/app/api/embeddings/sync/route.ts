import { createClient } from '@/lib/supabase/server';
import { getEffectiveUserId, getAuthBypassConfigError } from '@/lib/auth';
import { generateEmbedding } from '@/lib/ai/gemini';
import { NextResponse } from 'next/server';

const BATCH_SIZE = 15;

/**
 * 임베딩이 없는 로그에 대해 임베딩을 생성합니다.
 * POST body: { limit?: number } (기본 BATCH_SIZE)
 * 응답: { created, remaining }
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
  const limit = Math.min(Number(body.limit) || BATCH_SIZE, 30);

  const { data: logs } = await supabase
    .from('logs')
    .select('id, content')
    .eq('user_id', userId)
    .order('log_date', { ascending: false })
    .limit(500);

  if (!logs?.length) {
    return NextResponse.json({ created: 0, remaining: 0 });
  }

  const logIds = logs.map((l) => l.id);
  const { data: existing } = await supabase
    .from('log_embeddings')
    .select('log_id')
    .in('log_id', logIds);
  const hasEmbedding = new Set((existing ?? []).map((r) => r.log_id));
  const missingAll = logs.filter((l) => !hasEmbedding.has(l.id));
  const toProcess = missingAll.slice(0, limit);

  let created = 0;
  for (const log of toProcess) {
    try {
      const values = await generateEmbedding(log.content);
      const { error } = await supabase.from('log_embeddings').insert({
        log_id: log.id,
        embedding: values,
        content_chunk: log.content,
      });
      if (!error) created++;
    } catch {
      // 한 건 실패해도 나머지 계속
    }
  }

  const remaining = Math.max(0, missingAll.length - created);

  return NextResponse.json({ created, remaining });
}
