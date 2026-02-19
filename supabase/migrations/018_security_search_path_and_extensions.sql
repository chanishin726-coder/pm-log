-- 1. vector 확장을 extensions 스키마로 이동 (Extension in Public 경고 해소)
-- 먼저 이동한 뒤 함수 재정의해야 vector 타입 참조가 맞음.
-- Supabase 호스트에서 권한 오류 나면 대시보드에서 확장 비활성화 후 extensions 스키마에 재활성화하거나 이 블록만 제외하고 적용.
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION vector SET SCHEMA extensions;

-- 2. Function search_path 고정 (mutable search_path 보안 경고 해소)
-- generate_task_id (최신 정의는 004 기준)
CREATE OR REPLACE FUNCTION generate_task_id(
  p_project_code TEXT,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ymmdd TEXT;
  seq INTEGER;
  new_id TEXT;
BEGIN
  ymmdd := right(to_char(p_date, 'YY'), 1) || to_char(p_date, 'MMDD');
  INSERT INTO task_id_sequences (project_code, date, last_seq)
  VALUES (p_project_code, p_date, 1)
  ON CONFLICT (project_code, date)
  DO UPDATE SET last_seq = task_id_sequences.last_seq + 1
  RETURNING last_seq INTO seq;
  new_id := '#' || p_project_code || yymmdd || LPAD(seq::TEXT, 2, '0');
  RETURN new_id;
END;
$$;

-- update_updated_at_column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- match_logs (vector 타입 사용 → extensions 스키마 포함)
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
  JOIN logs ON logs.id = log_embeddings.log_id
  LEFT JOIN projects ON projects.id = logs.project_id
  WHERE logs.user_id = p_user_id
    AND (1 - (log_embeddings.embedding <=> query_embedding)) > match_threshold
  ORDER BY log_embeddings.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 3. task_id_sequences: RLS 정책 명시 (직접 접근 불가, 함수만 사용)
-- "RLS Enabled No Policy" 제안 해소용. 모든 역할에 대해 행 접근 불가.
CREATE POLICY "No direct access - use generate_task_id only"
  ON task_id_sequences FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "No direct access - use generate_task_id only (anon)"
  ON task_id_sequences FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);
