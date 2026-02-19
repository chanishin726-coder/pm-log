import { createClient } from '@/lib/supabase/server';
import { getEffectiveUserId, getAuthBypassConfigError } from '@/lib/auth';
import { createProjectSchema } from '@/lib/validators/schemas';
import { NextResponse } from 'next/server';

export async function GET() {
  const configError = getAuthBypassConfigError();
  if (configError) return configError;
  const supabase = await createClient();
  const userId = await getEffectiveUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const configError = getAuthBypassConfigError();
  if (configError) return configError;
  const supabase = await createClient();
  const userId = await getEffectiveUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsedBody = createProjectSchema.safeParse(body);
  if (!parsedBody.success) {
    const msg = parsedBody.error.flatten().formErrors[0] || 'name, code required';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const { name, code, description } = parsedBody.data;
  const status = typeof (body as { status?: string }).status === 'string' ? (body as { status: string }).status : 'active';

  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id: userId,
      name,
      code,
      description: description || null,
      status: status || 'active',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
