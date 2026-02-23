import type { Task } from '@/types/database';

export type LogRowForTaskShape = {
  log_id: string;
  user_id: string;
  project_id: string | null;
  log_date: string;
  content: string;
  task_id_tag: string | null;
  task_state: Task['task_state'];
  created_at: string;
  source?: string | null;
  project?: { projects_id: string; name: string; code: string } | null;
};

/** Supabase join으로 project가 배열로 올 수 있음 → 단일 객체로 정규화 */
export function normalizeProject<T extends { project?: unknown }>(
  row: T
): Omit<T, 'project'> & { project: { projects_id: string; name: string; code: string } | null } {
  const p = (row as { project?: { projects_id: string; name: string; code: string } | { projects_id: string; name: string; code: string }[] | null }).project;
  const project = Array.isArray(p) ? (p[0] ?? null) : (p ?? null);
  return { ...row, project } as Omit<T, 'project'> & { project: { projects_id: string; name: string; code: string } | null };
}

/** 로그 행을 할일(Task) 형태로 변환. project_id가 없으면 null. */
export function logToTaskShape(log: LogRowForTaskShape): Task | null {
  if (!log.project_id) return null;
  return {
    id: log.log_id,
    user_id: log.user_id,
    log_id: log.log_id,
    project_id: log.project_id,
    task_id_tag: log.task_id_tag ?? '',
    description: log.content,
    task_state: log.task_state ?? null,
    due_date: null,
    created_at: log.created_at,
    completed_at: null,
    ai_recommended: false,
    ai_reason: null,
    sort_order: 0,
    project: log.project ?? null,
    source: log.source ?? null,
  };
}
