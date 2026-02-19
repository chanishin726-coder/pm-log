-- tasks 테이블이 있는 환경에서만 RLS 정책을 (select auth.uid()) 형태로 갱신 (019와 동일한 성능 권장 방식)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tasks'
  ) THEN
    DROP POLICY IF EXISTS "Users can manage their own tasks" ON tasks;
    CREATE POLICY "Users can manage their own tasks" ON tasks
      FOR ALL USING ((select auth.uid()) = user_id);
  END IF;
END $$;
