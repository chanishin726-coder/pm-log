-- 기존 content에서 "SOURCE: 본문 #task_id_tag" 형태 파싱해 source, content, task_id_tag 분리
-- 1) 끝의 " #태그" 추출 → task_id_tag (기존 null일 때만)
-- 2) 앞의 "X: " 추출 → source
-- 3) 본문만 → content

UPDATE logs
SET
  task_id_tag = COALESCE(
    task_id_tag,
    (regexp_match(content, '\s+#(\S+)\s*$'))[1]
  ),
  source = CASE
    WHEN trim(regexp_replace(content, '\s+#\S+\s*$', '')) ~ '^[^:]+:\s*'
    THEN trim((regexp_match(trim(regexp_replace(content, '\s+#\S+\s*$', '')), '^([^:]+):'))[1])
    ELSE source
  END,
  content = CASE
    WHEN content ~ '\s+#\S+\s*$'
    THEN trim(regexp_replace(trim(regexp_replace(content, '\s+#\S+\s*$', '')), '^[^:]+:\s*', ''))
    WHEN trim(content) ~ '^[^:]+:\s*'
    THEN trim(regexp_replace(content, '^[^:]+:\s*', ''))
    ELSE content
  END
WHERE content IS NOT NULL AND content != '';
