-- created_at 기준 최근순 조회(할일/대시보드/로그 목록) 가속
CREATE INDEX IF NOT EXISTS logs_user_created_at_idx ON logs(user_id, created_at DESC);
