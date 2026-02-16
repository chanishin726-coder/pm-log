-- 009에서 unclassified를 썼다면 null로 바꾸고 CHECK 제약 수정
UPDATE logs SET task_state = NULL WHERE task_state = 'unclassified';

ALTER TABLE logs DROP CONSTRAINT IF EXISTS logs_task_state_check;
ALTER TABLE logs ADD CONSTRAINT logs_task_state_check
  CHECK (task_state IS NULL OR task_state IN ('high', 'medium', 'low', 'review', 'done'));
