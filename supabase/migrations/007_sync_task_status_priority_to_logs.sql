-- 기존 tasks 테이블의 status, priority를 해당 log에 반영
UPDATE logs l
SET status = t.status, priority = t.priority
FROM tasks t
WHERE t.log_id = l.id;
