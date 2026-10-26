import type { SupabaseClient } from '@supabase/supabase-js';
import type { TaskState } from '@/types/database';
import { ServiceError } from '@/lib/services/logs';

/**
 * 할일 상태 변경 + task_state_history 기록.
 * 웹 앱(PUT /api/tasks/[id]/state)과 MCP 커넥터가 같은 로직을 쓰도록 분리한 함수.
 * logId는 logs.log_id.
 */
export async function updateTaskState(
  supabase: SupabaseClient,
  userId: string,
  logId: string,
  newState: TaskState | null
) {
  const { data: existing } = await supabase
    .from('logs')
    .select('task_state')
    .eq('log_id', logId)
    .eq('user_id', userId)
    .single();
  const previousState = (existing as { task_state?: string | null } | null)?.task_state ?? null;

  const { data, error } = await supabase
    .from('logs')
    .update({ task_state: newState })
    .eq('log_id', logId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw new ServiceError(error.message, 500);

  if (newState !== previousState && newState != null) {
    const now = new Date().toISOString();
    const { data: openRow } = await supabase
      .from('task_state_history')
      .select('task_state_history_id')
      .eq('log_id', logId)
      .is('valid_to', null)
      .maybeSingle();
    if (openRow?.task_state_history_id) {
      await supabase
        .from('task_state_history')
        .update({ valid_to: now })
        .eq('task_state_history_id', (openRow as { task_state_history_id: string }).task_state_history_id);
    }
    await supabase.from('task_state_history').insert({
      log_id: logId,
      task_state: newState,
      valid_from: now,
      valid_to: null,
    });
  }

  return { data, previousState };
}
