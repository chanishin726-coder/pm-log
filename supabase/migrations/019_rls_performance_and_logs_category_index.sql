-- RLS: auth.uid() → (select auth.uid()) 로 쿼리당 1회만 평가되게 변경 (Performance Advisor)
-- + logs.category_code FK 커버링 인덱스 추가

DROP POLICY IF EXISTS "Users can manage their own projects" ON projects;
CREATE POLICY "Users can manage their own projects" ON projects
  FOR ALL USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can manage their own logs" ON logs;
CREATE POLICY "Users can manage their own logs" ON logs
  FOR ALL USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can manage their own embeddings" ON log_embeddings;
CREATE POLICY "Users can manage their own embeddings" ON log_embeddings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM logs
      WHERE logs.id = log_embeddings.log_id
      AND logs.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can manage their own reports" ON daily_reports;
CREATE POLICY "Users can manage their own reports" ON daily_reports
  FOR ALL USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can read own log task_state_history" ON task_state_history;
CREATE POLICY "Users can read own log task_state_history"
  ON task_state_history FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM logs WHERE logs.id = task_state_history.log_id AND logs.user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Users can insert own log task_state_history" ON task_state_history;
CREATE POLICY "Users can insert own log task_state_history"
  ON task_state_history FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM logs WHERE logs.id = task_state_history.log_id AND logs.user_id = (select auth.uid()))
  );

-- logs.category_code FK 커버링 인덱스 (Unindexed foreign keys 해소)
CREATE INDEX IF NOT EXISTS logs_category_code_idx ON logs(category_code);
