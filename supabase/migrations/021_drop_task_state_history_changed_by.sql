-- task_state 변경은 항상 사용자 수동만 허용하므로 changed_by 컬럼 제거
ALTER TABLE task_state_history DROP COLUMN IF EXISTS changed_by;
