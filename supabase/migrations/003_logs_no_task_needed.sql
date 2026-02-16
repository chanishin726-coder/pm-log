-- "ID 부여 안 함" 결정을 저장. 이후 할일/후속조치 조회 시 제외할 수 있음.
ALTER TABLE logs ADD COLUMN IF NOT EXISTS no_task_needed BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS logs_no_task_needed_idx ON logs(no_task_needed) WHERE no_task_needed = true;
COMMENT ON COLUMN logs.no_task_needed IS '일지 작성 시 AI가 ID 부여하지 않기로 한 로그. 할일 파악 등에서 조회 제외 대상.';
