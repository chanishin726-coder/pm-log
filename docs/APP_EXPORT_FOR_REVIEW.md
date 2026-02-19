# PM Log – 앱 로직·코딩 상태 Export (Claude 논의용)

> 이 문서는 PM Log 앱의 구조, 데이터 모델, 주요 플로우, task_id_tag 규칙을 정리한 것입니다. Claude와 논의할 때 참고용으로 사용하세요.

---

## 1. 프로젝트 개요

- **이름**: pm-log
- **스택**: Next.js 14 (App Router), React 18, TypeScript, Supabase (DB + Auth), TanStack Query, Tailwind, Google Gemini AI
- **목적**: PM(프로젝트 매니저)용 일지·할일 관리. 로그 입력 → AI 파싱 → 할일/일지/리포트 생성

---

## 2. 디렉터리 구조 (핵심만)

```
src/
├── app/
│   ├── (auth)/           # 로그인, callback
│   ├── (dashboard)/      # 인증 후 메인
│   │   ├── page.tsx      # 대시보드(할일 미리보기)
│   │   ├── logs/         # 로그 목록, 로그 상세(수정 가능: 날짜/프로젝트/타입/발신/내용/task_id_tag/상태)
│   │   ├── tasks/        # 할일 관리(TaskBoard, 탭: 전체/A/B/C/D/X)
│   │   ├── projects/     # 프로젝트 CRUD
│   │   ├── query/        # RAG 검색
│   │   └── reports/      # 일일 리포트, 경영 요약
│   └── api/
│       ├── logs/         # GET(목록·필터), POST(신규 로그·AI 파싱), PUT/DELETE [id]
│       ├── tasks/        # GET(할일=로그 기반), POST(할일용 로그 1건 생성)
│       ├── projects/
│       ├── ai/           # task-plan(할일 파악), generate-daily(일지 생성), summarize 등
│       ├── embeddings/   # 로그 벡터 저장, sync
│       └── search, query, reports/daily
├── components/
│   ├── tasks/            # TaskBoard, TaskCard(소스·본문 전체폭·클릭 시 로그 상세)
│   ├── logs/             # QuickInput
│   ├── dashboard/        # SyncButton
│   └── ui/               # shadcn 스타일
├── lib/
│   ├── supabase/         # server, client
│   ├── auth.ts           # getEffectiveUserId, AUTH_BYPASS
│   ├── utils.ts          # parseLogContent, extractProjectCodeFromRaw
│   ├── task-state.ts     # getTaskState, 라벨
│   └── ai/               # gemini.ts, prompts.ts
└── types/
    └── database.ts       # Log, Task, Project, DailyReport 등
```

---

## 3. 데이터 모델

### 3.1 로그 (logs)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| user_id | UUID | auth.users |
| project_id | UUID? | projects.id (null = 미지정) |
| log_date | DATE | 로그 날짜 (수정 가능) |
| raw_input | TEXT | 원문 |
| content | TEXT | 정리된 본문 |
| log_type | F/T/W/I | 수신/발신/실행(완료 기록|계획·할일)/정보(정보 메모|이슈) |
| category_code | TEXT? | H7, E9 등 |
| keywords | TEXT[]? | AI 추출 키워드 |
| **source** | TEXT? | F/T=연락 상대(발신/대상), W=관련 당사자, I=정보 출처(없을 수 있음) |
| **task_id_tag** | TEXT? | 할일 고유 ID (예: #서센26021615). **수동 지정 보존, null이 아닐 때 자동 덮어쓰기 금지** |
| **task_state** | TEXT? | high/medium/low/review/done (A/B/C/D/X) |
| **no_task_needed** | BOOLEAN? | null=미분류, true=할일 아님, false=할일로 봄 |

- 할일 목록: `project_id` 있음 + (`task_state` not null OR `task_id_tag` not null OR `no_task_needed = false`).

### 3.2 할일 (Task) – 뷰 개념

- **실제 저장**: `tasks` 테이블도 있으나, **할일 관리 UI는 logs 테이블만 사용**합니다.
- “할일” = 로그 중 `task_id_tag` 또는 `task_state` 있거나 `no_task_needed=false`인 행을 `Task` 형태로 변환해 표시.
- 변환: `api/tasks/route.ts`의 `logToTaskShape()` → `Task` 타입 (id=log.id, log_id=log.id, task_id_tag, description=content, task_state, project, source 등).

### 3.3 프로젝트 (projects)

- user_id, name, code(2~4자), status(active/completed/hold).

### 3.4 일일 리포트 (daily_reports)

- user_id, report_date, content(텍스트), total_logs, f_count 등.

---

## 4. task_id_tag 규칙 (중요)

- **의도**: 로그에 부여하는 **고유 ID**. 같은 후속조치 건을 하나의 태그로 묶음.
- **원칙**: **수동으로 지정한 값은 자동으로 덮어쓰지 않음.** 변경은 로그 상세에서만 수정 가능.

### 4.1 task_id_tag를 쓰는/채우는 경로

| 경로 | 동작 | 덮어쓰기 여부 |
|------|------|----------------|
| **로그 상세 PUT** (`api/logs/[id]`) | 사용자가 입력한 값으로 update | 사용자 의도대로 |
| **로그 POST** (신규) | `parseLogContent`로 본문/raw_input 끝 `#태그` 추출해 insert | 신규 행만 |
| **로그 sync** (`api/logs/sync`) | `task_id_tag`가 **null**인 로그만 raw_input에서 파싱해 채움 | null일 때만 |
| **일지 생성** (`api/ai/generate-daily`) | AI가 logAssignments/newTasks로 태그 부여 | **기존 태그 있으면 update 안 함** (`.is('task_id_tag', null)` 조건) |

### 4.2 parseLogContent (lib/utils.ts)

- `"SOURCE: 본문 #task_id_tag"` 형태를 `{ source, content, task_id_tag }`로 분리.
- 끝의 `#태그`만 추출; task_id_tag는 `#` 포함 반환(예: `#서센6020905`).

---

## 5. 주요 플로우

### 5.1 로그 추가 (QuickInput → POST /api/logs)

1. 사용자가 rawInput 입력.
2. `parseLog(rawInput)` (Gemini) → projectCode, logType, categoryCode, content, extractedKeywords.
3. `parseLogContent(parsed.content)` 또는 rawInput에서 source, content, task_id_tag 추출.
4. logs insert: project_id, raw_input, content, log_type, category_code, keywords, source, task_id_tag.

### 5.2 할일 목록 (GET /api/tasks, /tasks 페이지)

1. logs 조회: project_id not null, (task_state not null OR task_id_tag not null OR no_task_needed = false).
2. `logToTaskShape()`로 Task[] 변환 (log_id=log.id, source 포함).
3. TaskBoard가 탭(전체/A/B/C/D/X)별로 필터링해 TaskCard 렌더.
4. TaskCard: 1행=태그·프로젝트·source·D-day·상태 버튼, 2행=본문 전체 폭; 클릭 시 `/logs/[id]`.

### 5.3 할일 상태 변경 (PUT /api/tasks/[id]/state)

- 로그의 `task_state`만 update (task_id_tag는 건드리지 않음).

### 5.4 일지 생성 (POST /api/ai/generate-daily)

1. 당일 로그 + 최근 5일 로그, 기존 할일 목록으로 `generateDailyReport()` (Gemini) 호출.
2. 결과: `logAssignments` (당일 로그 → 기존 task_id_tag 매핑), `newTasks` (새 할일 + logIds).
3. newTasks: 새 task_id_tag 생성(RPC generate_task_id), **이미 task_id_tag가 있는 로그는 update 제외** (`.is('task_id_tag', null)`).
4. logAssignments: **이미 task_id_tag가 있는 로그는 update 제외** (동일 조건).
5. 일지 본문 생성 후 daily_reports upsert.

### 5.5 로그 sync (POST /api/logs/sync)

1. project_id null인 로그에 raw_input에서 프로젝트 코드 매칭해 project_id 채움.
2. **task_id_tag null**인 로그만 raw_input에서 `#태그` 파싱해 task_id_tag 채움.
3. 같은 task_id_tag끼리 task_state 통일(선택 로직 있음).

---

## 6. 인증

- `lib/auth.ts`: Supabase `auth.getUser()`. 옵션: `NEXT_PUBLIC_AUTH_BYPASS=true` + `AUTH_BYPASS_USER_ID`로 테스트용 고정 사용자.
- API는 `getAuthBypassConfigError()` → `getEffectiveUserId(supabase)` 후 user_id로 RLS/필터.

---

## 7. DB 마이그레이션 (로그 관련 요약)

- 001: logs 기본 (log_date, raw_input, content, log_type, category_code, keywords).
- 002: task_id_tag 추가.
- 003: no_task_needed 추가.
- 005: source, status, priority 추가.
- 006: content에서 source/task_id_tag 파싱해 반영 (기존 null일 때만).
- 008: raw_input 끝 #태그 → task_id_tag (null인 행만), # 접두사 정규화.
- 009: task_state로 status/priority 통합.
- 011: no_task_needed nullable.
- 013: is_follow_up 제거.
- 014: task_id_tag 전부 null 초기화 (선택 실행).

---

## 8. 코딩 상태 요약

- **타입**: `database.ts`에 Log, Task, Project, DailyReport 정의. Task는 log 기반 뷰에 맞춤.
- **API**: REST 스타일, Next.js Route Handlers. 에러 시 JSON `{ error }`, 401/404/500.
- **할일 UI**: TaskCard에서 source 표시, 본문 전체 폭, 카드 클릭 시 로그 상세 이동; 상태 버튼은 stopPropagation으로 링크 이동 방지.
- **task_id_tag 보존**: generate-daily에서만 `.is('task_id_tag', null)`로 기존 값 덮어쓰기 방지 적용됨.
- **로그 상세 수정**: 날짜(log_date), 프로젝트, 타입, 카테고리, source, content, task_id_tag, task_state 수정 가능.

---

## 9. 논의 시 참고할 만한 포인트

1. **할일이 logs 기반인 이유**: tasks 테이블과의 관계, 추후 “진짜” tasks 테이블로 옮길지 여부.
2. **task_id_tag 형식**: 현재 #코드YMMDDNN 등; 고유성·생성 정책(RPC generate_task_id).
3. **no_task_needed vs task_id_tag/task_state**: AI 할일 파악 시 null만 대상으로 하는지, 기존 값과의 우선순위.
4. **일지 생성과 로그 수정 동시 사용 시**: 날짜 변경 시 일지/할일 목록에 미치는 영향.
5. **에러 처리·검증**: API별 필수 필드, zod 등 스키마 검증 적용 여부.

— 끝 —
