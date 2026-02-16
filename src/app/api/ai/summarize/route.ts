import { createClient } from '@/lib/supabase/server';
import { getEffectiveUserId, getAuthBypassConfigError } from '@/lib/auth';
import { summarizeForExecutive } from '@/lib/ai/gemini';
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
  const { startDate, endDate } = body;

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: 'startDate, endDate required' },
      { status: 400 }
    );
  }

  const { data: reports } = await supabase
    .from('daily_reports')
    .select('content, report_date')
    .eq('user_id', userId)
    .gte('report_date', startDate)
    .lte('report_date', endDate)
    .order('report_date', { ascending: true });

  if (!reports || reports.length === 0) {
    return NextResponse.json(
      { error: '해당 기간의 일지가 없습니다.' },
      { status: 404 }
    );
  }

  const combined = reports.map((r) => `## ${r.report_date}\n${r.content}`).join('\n\n');

  let summary: string;
  try {
    summary = await summarizeForExecutive(combined);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '요약 실패' },
      { status: 500 }
    );
  }

  return NextResponse.json({ content: summary });
}
