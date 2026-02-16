-- 로그에 source, status, priority 추가 (task와 통합 관리)
ALTER TABLE logs ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('review', 'pending', 'done', 'ignored'));
ALTER TABLE logs ADD COLUMN IF NOT EXISTS priority TEXT CHECK (priority IN ('high', 'medium', 'low'));

CREATE INDEX IF NOT EXISTS logs_status_idx ON logs(status) WHERE status IS NOT NULL;
CREATE INDEX IF NOT EXISTS logs_priority_idx ON logs(priority) WHERE priority IS NOT NULL;

COMMENT ON COLUMN logs.source IS '발신/대상 (예: GDA 김연희 과장). content에서 "X: 본문" 앞부분';
COMMENT ON COLUMN logs.status IS '할일 상태. null이면 할일 미부여';
COMMENT ON COLUMN logs.priority IS '할일 우선순위. null이면 미부여';
