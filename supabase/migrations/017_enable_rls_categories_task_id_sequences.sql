-- categories: 공용 코드 테이블. 인증된 사용자 읽기만 허용
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated"
  ON categories FOR SELECT
  TO authenticated
  USING (true);

-- task_id_sequences: generate_task_id (SECURITY DEFINER)만 접근. 클라이언트 직접 접근 차단
ALTER TABLE task_id_sequences ENABLE ROW LEVEL SECURITY;
