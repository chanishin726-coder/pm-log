-- 기존 logs.task_state가 있는 행을 task_state_history에 1건씩 반영
INSERT INTO task_state_history (log_id, task_state, changed_at, changed_by)
SELECT id, task_state, updated_at, 'manual'
FROM logs
WHERE task_state IS NOT NULL;
