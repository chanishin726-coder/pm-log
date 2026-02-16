export type LogType = 'F' | 'T' | 'W' | 'I';
export type TaskState = 'high' | 'medium' | 'low' | 'review' | 'done';
export type ProjectStatus = 'active' | 'completed' | 'hold';

export interface Category {
  id: number;
  code: string;
  name: string;
  parent_group: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  code: string;
  description: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

export interface Log {
  id: string;
  user_id: string;
  project_id: string | null;
  log_date: string;
  raw_input: string;
  content: string;
  log_type: LogType;
  category_code: string | null;
  keywords: string[] | null;
  task_id_tag: string | null;
  no_task_needed: boolean | null;
  source: string | null;
  task_state: TaskState | null;
  created_at: string;
  updated_at: string;
  project?: { id: string; name: string; code: string } | null;
}

export interface Task {
  id: string;
  user_id: string;
  log_id: string | null;
  project_id: string;
  task_id_tag: string;
  description: string;
  task_state: TaskState | null;
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
  ai_recommended: boolean;
  ai_reason: string | null;
  sort_order: number;
  project?: { id: string; name: string; code: string } | null;
}

export interface DailyReport {
  id: string;
  user_id: string;
  report_date: string;
  content: string;
  total_logs: number | null;
  f_count: number | null;
  t_count: number | null;
  w_count: number | null;
  i_count: number | null;
  created_at: string;
  updated_at: string;
}
