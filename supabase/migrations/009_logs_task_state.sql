-- 할일 상태를 status+priority에서 task_state 한 컬럼으로 통합
-- 값: null(미분류) | high | medium | low | review | done

ALTER TABLE logs ADD COLUMN IF NOT EXISTS task_state TEXT
  CHECK (task_state IS NULL OR task_state IN ('high', 'medium', 'low', 'review', 'done'));

-- 기존 status, priority에서 백필 (미분류는 null)
UPDATE logs
SET task_state = CASE
  WHEN status = 'done' THEN 'done'
  WHEN status = 'review' THEN 'review'
  WHEN status = 'pending' AND priority = 'high' THEN 'high'
  WHEN status = 'pending' AND priority = 'medium' THEN 'medium'
  WHEN status = 'pending' AND priority = 'low' THEN 'low'
  WHEN status = 'pending' OR task_id_tag IS NOT NULL THEN NULL
  ELSE NULL
END
WHERE task_state IS NULL;

CREATE INDEX IF NOT EXISTS logs_task_state_idx ON logs(task_state) WHERE task_state IS NOT NULL;

COMMENT ON COLUMN logs.task_state IS '할일 상태. null=미분류, high=A, medium=B, low=C, review=D, done=X';

-- 기존 컬럼 제거
DROP INDEX IF EXISTS logs_status_idx;
DROP INDEX IF EXISTS logs_priority_idx;
ALTER TABLE logs DROP COLUMN IF EXISTS status;
ALTER TABLE logs DROP COLUMN IF EXISTS priority;
