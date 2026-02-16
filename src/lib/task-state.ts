/**
 * 할일 상태. DB: task_state (null = 미분류)
 */
export type TaskState = 'high' | 'medium' | 'low' | 'review' | 'done';

export interface TaskLike {
  task_state?: TaskState | null;
  status?: string | null;
  priority?: string | null;
}

const STATE_VALUES: TaskState[] = ['high', 'medium', 'low', 'review', 'done'];

/** task_state 또는 구 status/priority에서 유도. 미분류 = null */
export function getTaskState(task: TaskLike): TaskState | null {
  const ts = task.task_state;
  if (ts && STATE_VALUES.includes(ts as TaskState)) return ts as TaskState;
  const s = task.status;
  const p = task.priority;
  if (s === 'done') return 'done';
  if (s === 'review') return 'review';
  if (s === 'pending') {
    if (p === 'high') return 'high';
    if (p === 'medium') return 'medium';
    if (p === 'low') return 'low';
  }
  return null;
}

const STATE_LABELS: Record<TaskState, string> = {
  high: 'A 우선',
  medium: 'B 후순위',
  low: 'C 대기',
  review: 'D AI추천',
  done: 'X 완료',
};

export function getTaskStateLabel(state: TaskState | null): string {
  return state === null ? '미분류' : STATE_LABELS[state];
}
