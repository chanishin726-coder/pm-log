-- logs 테이블 PK 컬럼명을 id → log_id 로 변경 (용어 혼선 방지: log id = logs.log_id)
ALTER TABLE logs RENAME COLUMN id TO log_id;

COMMENT ON COLUMN logs.log_id IS '로그 고유 식별자(UUID). 다른 테이블/API에서 "log id"는 이 컬럼 값을 의미한다.';

-- RLS 정책: logs.id 참조를 logs.log_id 로 갱신
DROP POLICY IF EXISTS "Users can manage their own embeddings" ON log_embeddings;
CREATE POLICY "Users can manage their own embeddings" ON log_embeddings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM logs
      WHERE logs.log_id = log_embeddings.log_id
      AND logs.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can read own log task_state_history" ON task_state_history;
CREATE POLICY "Users can read own log task_state_history"
  ON task_state_history FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM logs WHERE logs.log_id = task_state_history.log_id AND logs.user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Users can insert own log task_state_history" ON task_state_history;
CREATE POLICY "Users can insert own log task_state_history"
  ON task_state_history FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM logs WHERE logs.log_id = task_state_history.log_id AND logs.user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Users can update own log task_state_history" ON task_state_history;
CREATE POLICY "Users can update own log task_state_history"
  ON task_state_history FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM logs WHERE logs.log_id = task_state_history.log_id AND logs.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM logs WHERE logs.log_id = task_state_history.log_id AND logs.user_id = auth.uid())
  );

-- match_logs 함수: JOIN 조건을 logs.log_id 로 변경
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
  LEFT JOIN projects ON projects.id = logs.project_id
  WHERE logs.user_id = p_user_id
    AND (1 - (log_embeddings.embedding <=> query_embedding)) > match_threshold
  ORDER BY log_embeddings.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
