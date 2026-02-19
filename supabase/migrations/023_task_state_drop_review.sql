-- task_state에서 'review' 제거 (D AI 추천은 UI에서 task_state null로 필터)
-- review 데이터 없음 전제

ALTER TABLE logs DROP CONSTRAINT IF EXISTS logs_task_state_check;
ALTER TABLE logs ADD CONSTRAINT logs_task_state_check
  CHECK (task_state IS NULL OR task_state IN ('high', 'medium', 'low', 'done'));

ALTER TABLE task_state_history DROP CONSTRAINT IF EXISTS task_state_history_task_state_check;
ALTER TABLE task_state_history ADD CONSTRAINT task_state_history_task_state_check
  CHECK (task_state IN ('high', 'medium', 'low', 'done'));
