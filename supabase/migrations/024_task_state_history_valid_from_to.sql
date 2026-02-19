-- valid_from/valid_to 도입: 상태별 유효 구간 관리 (일지 날짜 시점 상태 조회용)
-- valid_from: 해당 상태가 시작된 시점, valid_to: 다음 상태로 바뀐 시점 (null = 현재 유효)

ALTER TABLE task_state_history
  ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS valid_to TIMESTAMPTZ;

UPDATE task_state_history
SET valid_from = changed_at;

UPDATE task_state_history t
SET valid_to = (
  SELECT MIN(t2.changed_at)
  FROM task_state_history t2
  WHERE t2.log_id = t.log_id AND t2.changed_at > t.changed_at
);

ALTER TABLE task_state_history
  ALTER COLUMN valid_from SET NOT NULL,
  ALTER COLUMN valid_from SET DEFAULT NOW();

DROP INDEX IF EXISTS task_state_history_log_changed_idx;
ALTER TABLE task_state_history DROP COLUMN IF EXISTS changed_at;

CREATE INDEX task_state_history_log_valid_idx ON task_state_history(log_id, valid_from);

COMMENT ON COLUMN task_state_history.valid_from IS '해당 task_state가 유효하기 시작한 시점';
COMMENT ON COLUMN task_state_history.valid_to IS '다음 상태로 바뀐 시점. null이면 현재 유효';

-- valid_to 업데이트를 위해 UPDATE 정책 추가
CREATE POLICY "Users can update own log task_state_history"
  ON task_state_history FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM logs WHERE logs.id = task_state_history.log_id AND logs.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM logs WHERE logs.id = task_state_history.log_id AND logs.user_id = auth.uid())
  );
