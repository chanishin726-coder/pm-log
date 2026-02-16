-- ID 형식: #프로젝트코드YMMDDNN (연도 1자리, 예: #서센6020905)
CREATE OR REPLACE FUNCTION generate_task_id(
  p_project_code TEXT,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  ymmdd TEXT;  -- Y(연도 1자리) + MM + DD
  seq INTEGER;
  new_id TEXT;
BEGIN
  ymmdd := right(to_char(p_date, 'YY'), 1) || to_char(p_date, 'MMDD');
  INSERT INTO task_id_sequences (project_code, date, last_seq)
  VALUES (p_project_code, p_date, 1)
  ON CONFLICT (project_code, date)
  DO UPDATE SET last_seq = task_id_sequences.last_seq + 1
  RETURNING last_seq INTO seq;
  new_id := '#' || p_project_code || ymmdd || LPAD(seq::TEXT, 2, '0');
  RETURN new_id;
END;
$$;
