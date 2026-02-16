-- 1) raw_input 끝의 #태그 추출 (공백 없이 붙어도 매칭). task_id_tag가 null인 행만.
-- 2) content에서도 동일 정규식으로 재추출 (아직 null인 경우).
-- 3) 기존 task_id_tag가 # 없이 저장된 경우 # 붙여 정규화.

-- 1. raw_input에서 끝의 #태그 추출 (공백 선택: \s*)
UPDATE logs
SET task_id_tag = '#' || (regexp_match(trim(raw_input), '\s*#([^#\s]+)\s*$'))[1]
WHERE task_id_tag IS NULL
  AND raw_input IS NOT NULL
  AND trim(raw_input) ~ '\s*#[^#\s]+\s*$';

-- 2. content에서 끝의 #태그 추출 (아직 null인 경우)
UPDATE logs
SET task_id_tag = '#' || (regexp_match(trim(content), '\s*#([^#\s]+)\s*$'))[1]
WHERE task_id_tag IS NULL
  AND content IS NOT NULL
  AND trim(content) ~ '\s*#[^#\s]+\s*$';

-- 3. # 없이 저장된 task_id_tag에 # 붙이기
UPDATE logs
SET task_id_tag = '#' || task_id_tag
WHERE task_id_tag IS NOT NULL
  AND task_id_tag NOT LIKE '#%';
