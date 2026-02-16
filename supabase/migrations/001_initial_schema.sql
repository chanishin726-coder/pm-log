-- 4.1 확장 활성화
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 4.2 카테고리 테이블
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  parent_group TEXT NOT NULL
);

INSERT INTO categories (code, name, parent_group) VALUES
  ('H1', '건축허가', '인허가'),
  ('H2', '용도변경', '인허가'),
  ('H3', '소방검사', '인허가'),
  ('H4', '구조안전', '인허가'),
  ('H5', '전기안전', '인허가'),
  ('H6', '설비검사', '인허가'),
  ('H7', '사용승인', '인허가'),
  ('H8', '등기', '인허가'),
  ('H9', '기타인허가', '인허가'),
  ('D1', '건축설계', '설계'),
  ('D2', '인테리어설계', '설계'),
  ('D3', 'MEP설계', '설계'),
  ('D4', '구조설계', '설계'),
  ('D5', '토목설계', '설계'),
  ('D9', '기타설계', '설계'),
  ('C1', '토목/골조', '시공'),
  ('C2', '건축마감', '시공'),
  ('C3', '기계설비', '시공'),
  ('C4', '전기/통신', '시공'),
  ('C5', '소방', '시공'),
  ('C6', '조경', '시공'),
  ('C9', '기타시공', '시공'),
  ('K1', '매매계약', '계약'),
  ('K2', '공사계약', '계약'),
  ('K3', '용역계약', '계약'),
  ('K4', '임대차계약', '계약'),
  ('K9', '기타계약', '계약'),
  ('E1', '회의', '기타'),
  ('E2', '보고', '기타'),
  ('E3', '검토', '기타'),
  ('E4', '현장방문', '기타'),
  ('E9', '기타', '기타');

CREATE INDEX categories_code_idx ON categories(code);
CREATE INDEX categories_group_idx ON categories(parent_group);

-- 4.3 프로젝트 테이블
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL CHECK (char_length(code) BETWEEN 2 AND 4),
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'hold')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, code)
);

CREATE INDEX projects_user_idx ON projects(user_id);
CREATE INDEX projects_status_idx ON projects(status);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own projects" ON projects
  FOR ALL USING (auth.uid() = user_id);

-- 4.4 로그 테이블
CREATE TABLE logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  raw_input TEXT NOT NULL,
  content TEXT NOT NULL,
  log_type CHAR(1) CHECK (log_type IN ('F','T','W','I')) NOT NULL,
  category_code TEXT REFERENCES categories(code),
  is_follow_up BOOLEAN DEFAULT FALSE,
  keywords TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX logs_user_date_idx ON logs(user_id, log_date DESC);
CREATE INDEX logs_type_idx ON logs(log_type);
CREATE INDEX logs_project_idx ON logs(project_id);
CREATE INDEX logs_keywords_idx ON logs USING GIN(keywords);
CREATE INDEX logs_follow_up_idx ON logs(is_follow_up) WHERE is_follow_up = true;

ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own logs" ON logs
  FOR ALL USING (auth.uid() = user_id);

-- 4.5 할일 테이블
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_id UUID REFERENCES logs(id) ON DELETE SET NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id_tag TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('review', 'pending', 'done', 'ignored')),
  priority TEXT CHECK (priority IN ('high', 'medium', 'low')),
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  ai_recommended BOOLEAN DEFAULT FALSE,
  ai_reason TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX tasks_user_status_idx ON tasks(user_id, status);
CREATE INDEX tasks_project_status_idx ON tasks(project_id, status);
CREATE INDEX tasks_tag_idx ON tasks(task_id_tag);
CREATE INDEX tasks_priority_idx ON tasks(priority) WHERE status = 'pending';
CREATE INDEX tasks_ai_recommended_idx ON tasks(ai_recommended) WHERE ai_recommended = true;

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own tasks" ON tasks
  FOR ALL USING (auth.uid() = user_id);

-- 4.6 로그 임베딩 테이블
CREATE TABLE log_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  log_id UUID NOT NULL REFERENCES logs(id) ON DELETE CASCADE,
  embedding vector(768),
  content_chunk TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX log_embeddings_log_id_idx ON log_embeddings(log_id);
CREATE INDEX log_embeddings_embedding_idx ON log_embeddings
  USING hnsw (embedding vector_cosine_ops);

ALTER TABLE log_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own embeddings" ON log_embeddings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM logs
      WHERE logs.id = log_embeddings.log_id
      AND logs.user_id = auth.uid()
    )
  );

-- 4.7 일지 테이블
CREATE TABLE daily_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  content TEXT NOT NULL,
  total_logs INTEGER,
  f_count INTEGER,
  t_count INTEGER,
  w_count INTEGER,
  i_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, report_date)
);

CREATE INDEX daily_reports_user_date_idx ON daily_reports(user_id, report_date DESC);

ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own reports" ON daily_reports
  FOR ALL USING (auth.uid() = user_id);

-- 4.8 ID 시퀀스 테이블
CREATE TABLE task_id_sequences (
  project_code TEXT,
  date DATE,
  last_seq INTEGER DEFAULT 0,
  PRIMARY KEY (project_code, date)
);

-- 4.9 ID 생성 함수
CREATE OR REPLACE FUNCTION generate_task_id(
  p_project_code TEXT,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  yymmdd TEXT;
  seq INTEGER;
  new_id TEXT;
BEGIN
  yymmdd := to_char(p_date, 'YYMMDD');
  INSERT INTO task_id_sequences (project_code, date, last_seq)
  VALUES (p_project_code, p_date, 1)
  ON CONFLICT (project_code, date)
  DO UPDATE SET last_seq = task_id_sequences.last_seq + 1
  RETURNING last_seq INTO seq;
  new_id := '#' || p_project_code || yymmdd || '-' || LPAD(seq::TEXT, 2, '0');
  RETURN new_id;
END;
$$;

-- 4.10 벡터 검색 함수
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

-- 4.11 트리거 (updated_at)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_logs_updated_at BEFORE UPDATE ON logs
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_daily_reports_updated_at BEFORE UPDATE ON daily_reports
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
