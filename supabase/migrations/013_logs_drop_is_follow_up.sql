-- is_follow_up 컬럼 제거 (할일 여부는 no_task_needed / task_id_tag로만 관리)
DROP INDEX IF EXISTS logs_follow_up_idx;
ALTER TABLE logs DROP COLUMN IF EXISTS is_follow_up;
