-- 로그에 할일 ID(task_id_tag) 연결: 관련 로그들을 하나의 할일로 묶어 후속조치·진행 추적
ALTER TABLE logs ADD COLUMN IF NOT EXISTS task_id_tag TEXT;
CREATE INDEX IF NOT EXISTS logs_task_id_tag_idx ON logs(task_id_tag) WHERE task_id_tag IS NOT NULL;
COMMENT ON COLUMN logs.task_id_tag IS '할일일지 작성 시 AI가 부여. 같은 후속조치 건의 로그들을 하나의 task_id_tag로 묶음.';
