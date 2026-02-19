-- 기존 로그의 log_date를 created_at 기준 한국 시간(KST) 날짜로 일괄 보정
-- 새 로그는 이미 getTodayKST()로 저장되므로, 과거 데이터만 KST 날짜로 통일

UPDATE logs
SET log_date = (created_at AT TIME ZONE 'Asia/Seoul')::date
WHERE created_at IS NOT NULL;
