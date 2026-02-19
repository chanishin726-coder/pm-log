-- task_state 변경 이력 (과거 일지 생성 시 당시 상태 복원용)
-- insert only, update/delete 없음

CREATE TABLE task_state_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  log_id UUID NOT NULL REFERENCES logs(id) ON DELETE CASCADE,
  task_state TEXT NOT NULL CHECK (task_state IN ('high', 'medium', 'low', 'review', 'done')),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by TEXT NOT NULL CHECK (changed_by IN ('manual', 'ai', 'sync'))
);

CREATE INDEX task_state_history_log_changed_idx ON task_state_history(log_id, changed_at DESC);

COMMENT ON TABLE task_state_history IS '로그 task_state 변경 이력. 일지 생성 시 report_date 기준 당시 상태 조회용.';
COMMENT ON COLUMN task_state_history.changed_by IS 'manual=사용자 수정, ai=일지 생성 시 AI 부여, sync=동기화';

ALTER TABLE task_state_history ENABLE ROW LEVEL SECURITY;

-- logs에 해당 로그가 본인 소유일 때만 select/insert (join으로 user_id 검증)
CREATE POLICY "Users can read own log task_state_history"
  ON task_state_history FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM logs WHERE logs.id = task_state_history.log_id AND logs.user_id = auth.uid())
  );

CREATE POLICY "Users can insert own log task_state_history"
  ON task_state_history FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM logs WHERE logs.id = task_state_history.log_id AND logs.user_id = auth.uid())
  );
