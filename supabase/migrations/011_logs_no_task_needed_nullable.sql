-- no_task_needed: null = 미분류, true = 할일 아님, false = 할일로 봄 (AI 분류 또는 사용자 판단)
ALTER TABLE logs ALTER COLUMN no_task_needed DROP NOT NULL;
ALTER TABLE logs ALTER COLUMN no_task_needed DROP DEFAULT;
COMMENT ON COLUMN logs.no_task_needed IS 'null=미분류, true=할일 아님, false=할일로 봄. AI 할일 파악은 null인 로그만 판단.';
