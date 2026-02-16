import { createClient } from '@/lib/supabase/server';
import { getEffectiveUserId, getAuthBypassConfigError } from '@/lib/auth';
import { generateEmbedding } from '@/lib/ai/gemini';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const configError = getAuthBypassConfigError();
  if (configError) return configError;
  const supabase = await createClient();
  const userId = await getEffectiveUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { logId: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { logId } = body;
  if (!logId) {
    return NextResponse.json({ error: 'logId required' }, { status: 400 });
  }

  const { data: log, error: logError } = await supabase
    .from('logs')
    .select('id, content')
    .eq('id', logId)
    .eq('user_id', userId)
    .single();

  if (logError || !log) {
    return NextResponse.json({ error: 'Log not found' }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from('log_embeddings')
    .select('id')
    .eq('log_id', logId)
    .limit(1)
    .single();

  if (existing) {
    return NextResponse.json({ message: 'Embedding already exists' });
  }

  let values: number[];
  try {
    values = await generateEmbedding(log.content);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Embedding failed' },
      { status: 500 }
    );
  }

  const { error: insertError } = await supabase.from('log_embeddings').insert({
    log_id: logId,
    embedding: values,
    content_chunk: log.content,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
