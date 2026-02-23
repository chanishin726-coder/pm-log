-- 027 적용 후 실행. 세부항목(code) 표시/검색은 parent_group 기준으로만.
-- 로그당 복수 카테고리 코드 부여 가능 (AI: 두 개 이상 해당 시 둘 다 부여).

-- 1) 새 컬럼 추가 및 기존 category_code 이전 (027 미적용 DB면 값 있는 행만 복사)
ALTER TABLE logs ADD COLUMN IF NOT EXISTS category_codes TEXT[] DEFAULT '{}';
UPDATE logs SET category_codes = ARRAY[category_code]
WHERE category_code IS NOT NULL AND category_code <> '';

-- 2) 구 컬럼·인덱스 제거
DROP INDEX IF EXISTS logs_category_code_idx;
ALTER TABLE logs DROP COLUMN IF EXISTS category_code;

-- 3) 배열 검색/필터용 GIN 인덱스
CREATE INDEX IF NOT EXISTS logs_category_codes_idx ON logs USING GIN(category_codes);

COMMENT ON COLUMN logs.category_codes IS '업무영역 세부 코드 배열 (P01, D18 등). 표시/검색은 categories.parent_group 기준.';
