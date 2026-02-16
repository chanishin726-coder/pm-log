import { createClient } from '@/lib/supabase/server';
import { getEffectiveUserId, getAuthBypassConfigError } from '@/lib/auth';
import { answerQuery, generateEmbedding } from '@/lib/ai/gemini';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const configError = getAuthBypassConfigError();
  if (configError) return configError;
  const supabase = await createClient();
  const userId = await getEffectiveUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const query = body.query;

  if (!query || typeof query !== 'string') {
    return NextResponse.json({ error: 'query required' }, { status: 400 });
  }

  let queryEmbedding: number[];
  try {
    queryEmbedding = await generateEmbedding(query);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Embedding failed' },
      { status: 500 }
    );
  }

  const { data: logs } = await supabase.rpc('match_logs', {
    query_embedding: queryEmbedding,
    match_threshold: 0.4,
    match_count: 20,
    p_user_id: userId,
  });

  if (!logs || logs.length === 0) {
    const { data: userLogs } = await supabase.from('logs').select('id').eq('user_id', userId);
    const logIds = userLogs?.map((l) => l.id) ?? [];
    let hasAnyEmbeddings = false;
    if (logIds.length > 0) {
      const { count } = await supabase
        .from('log_embeddings')
        .select('id', { count: 'exact', head: true })
        .in('log_id', logIds);
      hasAnyEmbeddings = (count ?? 0) > 0;
    }
    return NextResponse.json({
      answer: hasAnyEmbeddings
        ? '관련된 로그를 찾을 수 없습니다. 다른 키워드로 검색해보세요.'
        : '검색할 로그 인덱스(임베딩)가 없습니다. 아래 "임베딩 생성"을 실행하거나, 로그를 다시 저장하면 자동 생성됩니다.',
      sources: [],
      noEmbeddings: !hasAnyEmbeddings,
    });
  }

  let answer: string;
  try {
    answer = await answerQuery({
      query,
      logs,
      tasks: [],
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '답변 생성 실패' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    answer,
    sources: (logs as Array<{ log_id: string; content: string; log_date: string; project_name: string | null; similarity: number }>).map(
      (l) => ({
        logId: l.log_id,
        content: l.content,
        date: l.log_date,
        projectName: l.project_name,
        similarity: l.similarity,
      })
    ),
  });
}
