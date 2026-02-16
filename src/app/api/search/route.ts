import { createClient } from '@/lib/supabase/server';
import { getEffectiveUserId, getAuthBypassConfigError } from '@/lib/auth';
import { generateEmbedding } from '@/lib/ai/gemini';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const configError = getAuthBypassConfigError();
  if (configError) return configError;
  const supabase = await createClient();
  const userId = await getEffectiveUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  const threshold = parseFloat(searchParams.get('threshold') || '0.7');
  const limit = parseInt(searchParams.get('limit') || '10', 10);

  if (!q) {
    return NextResponse.json({ error: 'Query (q) required' }, { status: 400 });
  }

  let queryEmbedding: number[];
  try {
    queryEmbedding = await generateEmbedding(q);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Embedding failed' },
      { status: 500 }
    );
  }

  const { data, error } = await supabase.rpc('match_logs', {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: limit,
    p_user_id: userId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
