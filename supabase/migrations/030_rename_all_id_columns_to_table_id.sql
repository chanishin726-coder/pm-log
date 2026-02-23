-- 모든 테이블의 id PK 컬럼을 테이블별 고유명(테이블명_id)으로 변경하여 용어 혼선 제거

-- 1. categories (id SERIAL → categories_id)
ALTER TABLE categories RENAME COLUMN id TO categories_id;
COMMENT ON COLUMN categories.categories_id IS '카테고리 고유 식별자(SERIAL).';

-- 2. projects (id UUID → projects_id)
ALTER TABLE projects RENAME COLUMN id TO projects_id;
COMMENT ON COLUMN projects.projects_id IS '프로젝트 고유 식별자(UUID).';

-- 3. tasks (id UUID → tasks_id) — 테이블이 존재할 경우
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tasks') THEN
    EXECUTE 'ALTER TABLE tasks RENAME COLUMN id TO tasks_id';
    EXECUTE 'COMMENT ON COLUMN tasks.tasks_id IS ''할일 행 고유 식별자(UUID).''';
  END IF;
END $$;

-- 4. log_embeddings (id UUID → log_embeddings_id)
ALTER TABLE log_embeddings RENAME COLUMN id TO log_embeddings_id;
COMMENT ON COLUMN log_embeddings.log_embeddings_id IS '로그 임베딩 행 고유 식별자(UUID).';

-- 5. daily_reports (id UUID → daily_reports_id)
ALTER TABLE daily_reports RENAME COLUMN id TO daily_reports_id;
COMMENT ON COLUMN daily_reports.daily_reports_id IS '일지 고유 식별자(UUID).';

-- 6. task_state_history (id UUID → task_state_history_id)
ALTER TABLE task_state_history RENAME COLUMN id TO task_state_history_id;
COMMENT ON COLUMN task_state_history.task_state_history_id IS 'task_state_history 행 고유 식별자(UUID).';

-- 7. match_logs 함수: projects.id → projects.projects_id
CREATE OR REPLACE FUNCTION match_logs(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS TABLE (
  log_id UUID,
  content TEXT,
  similarity float,
  log_date DATE,
  project_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    log_embeddings.log_id,
    logs.content,
    (1 - (log_embeddings.embedding <=> query_embedding))::float AS similarity,
    logs.log_date,
    projects.name AS project_name
  FROM log_embeddings
  JOIN logs ON logs.log_id = log_embeddings.log_id
  LEFT JOIN projects ON projects.projects_id = logs.project_id
  WHERE logs.user_id = p_user_id
    AND (1 - (log_embeddings.embedding <=> query_embedding)) > match_threshold
  ORDER BY log_embeddings.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
