# Supabase 테이블 생성 (public.logs 오류 해결)

`Could not find the table 'public.logs' in the schema cache` 오류는 **마이그레이션이 Supabase에 적용되지 않았을 때** 발생합니다.

## 방법 1: Supabase 대시보드에서 SQL 실행 (권장)

1. **Supabase 대시보드** 접속  
   https://supabase.com/dashboard → 프로젝트 선택

2. **확장(Extensions) 활성화**  
   - 왼쪽 메뉴 **Database** → **Extensions**  
   - `vector` 검색 → **Enable**  
   - `uuid-ossp` 검색 → **Enable** (없으면 건너뛰어도 됨, 기본 포함일 수 있음)

3. **마이그레이션 SQL 실행**  
   - 왼쪽 메뉴 **SQL Editor** → **New query**  
   - `supabase/migrations/001_initial_schema.sql` 파일 내용 **전체 복사** 후 붙여넣기 → **Run**  
   - 이어서 `002_logs_task_id_tag.sql`, `003_logs_no_task_needed.sql`, `004_task_id_format_no_hyphen.sql` 순서로 실행  
   - **로그·할일 통합**: `005_logs_source_status_priority.sql` (source, status, priority 컬럼 추가) → **Run**  
   - **기존 content 파싱**: `006_parse_log_content_source_tag.sql` (SOURCE/본문/#태그 분리) → **Run**  
   - **기존 tasks → logs 반영**: `007_sync_task_status_priority_to_logs.sql` → **Run**

4. 완료 후 앱에서 로그 저장·일지 생성 등을 다시 시도하세요.

## 방법 2: Supabase CLI 사용

```bash
npx supabase link --project-ref <프로젝트-ref>
npx supabase db push
```

프로젝트 ref는 대시보드 URL의 `https://supabase.com/dashboard/project/여기` 값입니다.

---

## 이전 로그가 안 보일 때 (user_id 불일치)

코드 변경이 아니라 **어떤 사용자(user_id)로 조회하느냐** 때문에 이전 로그가 안 보일 수 있습니다.

- **원인**  
  로그·할일·프로젝트는 모두 `user_id`로 소유자가 구분됩니다.  
  지금 앱이 사용하는 사용자 ID(`AUTH_BYPASS_USER_ID` 또는 로그인한 계정)와 **이전에 로그를 저장할 때 쓰던 사용자 ID가 다르면** 그때 저장한 데이터는 목록에 안 나옵니다.

- **해결 1: 기존 사용자 ID로 보기 (권장)**  
  1. Supabase 대시보드 → **Table Editor** → **logs**  
  2. `user_id` 컬럼에 어떤 UUID들이 있는지 확인  
  3. **이전에 로그 쓸 때 쓰던 계정**의 UUID를 복사  
  4. `.env.local`에서 `AUTH_BYPASS_USER_ID=복사한_UUID` 로 설정 후 서버 재시작  

  (Authentication → Users에서 기존 계정 UUID를 확인해도 됩니다.)

- **해결 2: 이전 로그를 지금 사용자 ID로 옮기기**  
  지금 쓰는 `AUTH_BYPASS_USER_ID`(또는 새로 만든 테스트 계정)로 이전 로그를 모두 넘기고 싶다면, Supabase **SQL Editor**에서 아래처럼 실행할 수 있습니다.  
  **실행 전에 반드시 백업 권장.**

  ```sql
  -- 이전에 쓰던 사용자 UUID (예시)
  -- 새로 쓰는 사용자 UUID = .env의 AUTH_BYPASS_USER_ID
  UPDATE logs   SET user_id = '새로_쓸_사용자_UUID' WHERE user_id = '이전_사용자_UUID';
  UPDATE tasks SET user_id = '새로_쓸_사용자_UUID' WHERE user_id = '이전_사용자_UUID';
  UPDATE projects SET user_id = '새로_쓸_사용자_UUID' WHERE user_id = '이전_사용자_UUID';
  UPDATE daily_reports SET user_id = '새로_쓸_사용자_UUID' WHERE user_id = '이전_사용자_UUID';
  ```

Supabase 테이블 구조(스키마)를 바꿀 필요는 없고, **위 둘 중 하나로 user_id만 맞추면** 이전 로그가 다시 보입니다.

---

## 예전 업무일지(PDF)를 로그로 반영하기

1. **PDF → 텍스트**  
   - PDF를 열고 내용 전체 복사 후, `업무일지.txt` 같은 이름으로 메모장 등에 붙여넣어 저장하세요.

2. **한 줄 형식 (권장)**  
   - `YYYY-MM-DD 프로젝트코드 F|T|W|I 내용`  
   - 예: `2026-02-09 서센 T 남민호 부장(대혜): 사용승인 서류 제출 관련 문장근 부장과 협의 지시`  
   - **프로젝트코드**: 앱에 등록된 프로젝트 code(서센, 부페, 대메 등). 없으면 비워두거나 구 형식 사용.  
   - **로그타입**: F(후속), T(지시/보고), W(대기), I(정보/결정).  
   - **할일 ID**를 붙이려면 줄 맨 끝에 ` #서센260209-01` 처럼 적으면 `task_id_tag`로 반영됩니다.

3. **구 형식**  
   - `YYYY-MM-DD 내용` 한 줄만 있어도 됩니다. (프로젝트/타입은 기본값 처리)

4. **로그 파일 생성**  
   ```bash
   node scripts/text-to-logs.js "C:\Users\SCH\Downloads\업무일지.txt"
   ```  
   - `supabase-export/logs-import.json` 이 생성됩니다.  
   - `.env.local` 에 `AUTH_BYPASS_USER_ID` 가 있어야 합니다.  
   - **프로젝트코드**는 import 시 앱의 프로젝트(code)와 매칭해 `project_id`로 넣습니다. 미리 프로젝트(서센, 부페 등)를 등록해 두어야 합니다.

5. **Supabase에 반영**  
   ```bash
   npm run import:supabase -- --append-logs
   ```  
   - 기존 로그는 그대로 두고, `logs-import.json` 항목만 **추가**됩니다.

6. **수정이 필요하면**  
   - `supabase-export/logs-import.json` 을 열어 날짜·내용·task_id_tag 등을 고친 뒤, 5번만 다시 실행하면 됩니다.
