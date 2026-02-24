-- 할일 목록·상태 조회 및 generate-daily 히스토리 조회 가속

-- logs: 할일(task_id_tag 있음) 목록 조회 시 user_id + task_state + task_id_tag 커버
CREATE INDEX IF NOT EXISTS logs_user_task_state_tag_idx
  ON logs(user_id, task_state, task_id_tag)
  WHERE task_id_tag IS NOT NULL;

-- task_state_history: 해당 로그의 "현재 유효" 행(valid_to IS NULL) 조회 시 log_id + valid_from
CREATE INDEX IF NOT EXISTS task_state_history_log_valid_idx
  ON task_state_history(log_id, valid_from DESC)
  WHERE valid_to IS NULL;
