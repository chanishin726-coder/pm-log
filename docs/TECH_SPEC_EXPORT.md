# PM Log – Tech Spec Export (Source of Truth)

클로드(Claude)와 논의용. 앱의 핵심 로직·코드·프롬프트·아키텍처를 원문으로 포함한 기술 명세.

- **스택**: Next.js 14 (App Router), React 18, TypeScript, Supabase, TanStack Query, Gemini AI
- **목적**: PM 업무 로그·할일·일지 관리 (로그 입력 → AI 파싱 → 할일/일지 생성)
- **Export 일시**: 문서 생성 시점 기준

---

## 1. 아키텍처 요약

- **할일**: DB에 `tasks` 테이블이 있으나, UI는 **logs** 테이블만 사용. `task_id_tag` / `task_state` / `no_task_needed` 있는 로그를 Task 형태로 변환해 표시.
- **task_id_tag**: 로그별 고유 할일 ID. **이미 값이 있으면 자동 덮어쓰기 금지** (수동 수정만). 일지 생성·sync 시 `.is('task_id_tag', null)` 조건으로 null인 로그에만 부여.
- **인증**: `getEffectiveUserId(supabase)`. 옵션 `NEXT_PUBLIC_AUTH_BYPASS` + `AUTH_BYPASS_USER_ID`.

---

## 2. 데이터 모델 (logs 핵심)

| 컬럼 | 설명 |
|------|------|
| log_date | 로그 날짜 (수정 가능) |
| raw_input, content | 원문 / 정리 본문 |
| log_type | F/T/W/I. W=실행(완료 기록|계획/할일), I=정보(정보 메모|이슈) |
| source | F/T=연락 상대(발신/대상), W=관련 당사자, I=정보 출처(없을 수 있음) |
| task_id_tag | 할일 고유 ID (#포함). 수동 지정 보존 |
| task_state | high/medium/low/review/done |
| no_task_needed | null=미분류, true=할일 아님, false=할일로 봄 |

---

## 3. 소스 코드 원문

### 3.1 `src/types/database.ts`

```typescript
export type LogType = 'F' | 'T' | 'W' | 'I';
export type TaskState = 'high' | 'medium' | 'low' | 'review' | 'done';
export type ProjectStatus = 'active' | 'completed' | 'hold';

export interface Category {
  id: number;
  code: string;
  name: string;
  parent_group: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  code: string;
  description: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

export interface Log {
  id: string;
  user_id: string;
  project_id: string | null;
  log_date: string;
  raw_input: string;
  content: string;
  log_type: LogType;
  category_code: string | null;
  keywords: string[] | null;
  task_id_tag: string | null;
  no_task_needed: boolean | null;
  source: string | null;
  task_state: TaskState | null;
  created_at: string;
  updated_at: string;
  project?: { id: string; name: string; code: string } | null;
}

export interface Task {
  id: string;
  user_id: string;
  log_id: string | null;
  project_id: string;
  task_id_tag: string;
  description: string;
  task_state: TaskState | null;
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
  ai_recommended: boolean;
  ai_reason: string | null;
  sort_order: number;
  project?: { id: string; name: string; code: string } | null;
  source?: string | null;
}

export interface DailyReport {
  id: string;
  user_id: string;
  report_date: string;
  content: string;
  total_logs: number | null;
  f_count: number | null;
  t_count: number | null;
  w_count: number | null;
  i_count: number | null;
  created_at: string;
  updated_at: string;
}
```

---

### 3.2 `src/lib/utils.ts`

```typescript
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export const NO_PROJECT_LABEL = '기타'
export const NO_PROJECT_FILTER_VALUE = '__none__'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const END_TAG_REGEX = /\s*#([A-Za-z0-9가-힣_]+)\s*$/

export function parseLogContent(fullContent: string): {
  source: string | null
  content: string
  task_id_tag: string | null
} {
  let rest = fullContent.trim()
  if (!rest) return { source: null, content: '', task_id_tag: null }

  let task_id_tag: string | null = null
  const tagMatch = rest.match(END_TAG_REGEX)
  if (tagMatch) {
    task_id_tag = '#' + tagMatch[1]
    rest = rest.slice(0, tagMatch.index).trim()
  }

  let source: string | null = null
  const colonMatch = rest.match(/^([^:]+):\s*(.*)$/s)
  if (colonMatch) {
    source = colonMatch[1].trim()
    rest = colonMatch[2].trim()
  }

  return { source, content: rest, task_id_tag }
}

export function extractProjectCodeFromRaw(
  rawInput: string,
  projectCodes: string[]
): string | null {
  if (!rawInput?.trim() || projectCodes.length === 0) return null
  const text = rawInput.trim()
  const { task_id_tag } = parseLogContent(text)
  if (task_id_tag) {
    const tagBody = task_id_tag.slice(1)
    const byLength = [...projectCodes].sort((a, b) => b.length - a.length)
    for (const code of byLength) {
      if (tagBody === code || tagBody.startsWith(code)) return code
    }
  }
  const byLength = [...projectCodes].sort((a, b) => b.length - a.length)
  for (const code of byLength) {
    if (text.includes(code)) return code
  }
  return null
}
```

---

### 3.3 `src/lib/auth.ts`

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const AUTH_BYPASS = process.env.NEXT_PUBLIC_AUTH_BYPASS === 'true';
const AUTH_BYPASS_USER_ID = process.env.AUTH_BYPASS_USER_ID ?? null;

export function getAuthBypassConfigError(): NextResponse | null {
  if (AUTH_BYPASS && !AUTH_BYPASS_USER_ID) {
    return NextResponse.json(
      { error: 'AUTH_BYPASS_USER_ID를 .env에 설정해 주세요. ...' },
      { status: 503 }
    );
  }
  return null;
}

export async function getEffectiveUserId(supabase: SupabaseClient): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return user.id;
  if (AUTH_BYPASS && AUTH_BYPASS_USER_ID) return AUTH_BYPASS_USER_ID;
  return null;
}
```

---

### 3.4 `src/lib/task-state.ts`

```typescript
export type TaskState = 'high' | 'medium' | 'low' | 'review' | 'done';

export interface TaskLike {
  task_state?: TaskState | null;
  status?: string | null;
  priority?: string | null;
}

const STATE_VALUES: TaskState[] = ['high', 'medium', 'low', 'review', 'done'];

export function getTaskState(task: TaskLike): TaskState | null {
  const ts = task.task_state;
  if (ts && STATE_VALUES.includes(ts as TaskState)) return ts as TaskState;
  const s = task.status;
  const p = task.priority;
  if (s === 'done') return 'done';
  if (s === 'review') return 'review';
  if (s === 'pending') {
    if (p === 'high') return 'high';
    if (p === 'medium') return 'medium';
    if (p === 'low') return 'low';
  }
  return null;
}

const STATE_LABELS: Record<TaskState, string> = {
  high: 'A 우선',
  medium: 'B 후순위',
  low: 'C 대기',
  review: 'D AI추천',
  done: 'X 완료',
};

export function getTaskStateLabel(state: TaskState | null): string {
  return state === null ? '미분류' : STATE_LABELS[state];
}
```

---

### 3.5 `src/lib/ai/prompts.ts` (AI 프롬프트 원문)

- PARSE_LOG_PROMPT(projects): 함수. 아래 텍스트 끝에 `\n\n## 현재 등록된 프로젝트\n${projects.map((p) => \`- ${p.code}: ${p.name}\`).join('\n')}` 붙여 사용.
- 나머지는 상수 문자열 그대로 사용.

**PARSE_LOG_PROMPT 본문 (projects 제외):**
```
당신은 부동산 PM 업무 로그를 파싱하는 전문가입니다.

## 입력 형식
"[프로젝트코드] [F/T/W/I] [카테고리코드?] [내용]"

예시:
- "서센 F H7 문장근 부장 사용승인 서류 제출함" → content에 "문장근 부장: 사용승인 서류 제출", categoryCode "H7"
- "파고다 T 견적서 재검토 요청했음"
- "부센 W C2 현장 마감공사 점검"
- "서센 I D2 인테리어 디자인 변경 결정"

## 현재 등록된 프로젝트
(동적: projects.map)

## 로그 타입
- F: 수신, T: 발신, W: 실행, I: 정보

## 카테고리 코드
- H1~H9: 인허가, D1~D9: 설계, C1~C9: 시공, K1~K9: 계약, E1~E9: 기타

## 내용 정리 규칙
1. 직함·카테고리코드 유지 2. 존댓말만 정리 3. F는 "발신자 직함: 내용" 4. T는 "수신자 직함: 내용" 5. 인명·직함 생략 금지 6. 최대 80자

## 키워드 추출
검색 유용 명사·고유명사 최대 5개

## 응답 형식 (JSON만)
{ "projectCode", "logType", "categoryCode", "content", "extractedKeywords" }
프로젝트 코드 없으면 null. H1~E9 있으면 categoryCode 반드시.
```

**TASK_CLASSIFY_PROMPT:** 로그 목록에 대해 할일 여부만 판단. results: [{ logId, isTask }]. 우선순위·상태·ID 형식 판단 금지.

**GENERATE_DAILY_PROMPT:** 당일 로그 → 후속조치 여부만 판단. [ASSIGNMENTS] 블록만 출력. logAssignments: [{ logId, taskIdTag }], newTasks: [{ description, projectCode, priority, logIds }]. taskIdTag는 기존 할일 ID만 사용하거나 newTasks는 logIds로만 연결(새 ID는 서버 부여). ID 형식 #프로젝트코드YMMDDNN.

**EXECUTIVE_SUMMARY_PROMPT:** 일지 250자 내외 불릿 요약. 항목 30자 내외, 프로젝트명 정식 명칭, • 사용.

**RELATE_LOGS_PROMPT:** 로그1/로그2 (project, type, date, content). isRelated, confidence, reason, suggestedTag, relationshipType (follow_up/same_issue/related/unrelated).

**RAG_QUERY_PROMPT:** {query}, {retrievedLogs}. 검색 로그 근거만, 200자 내외, 존댓말, 날짜 YYYY년 MM월 DD일.

---

### 3.6 `src/lib/ai/gemini.ts` (핵심만)

- **parseLog**: PARSE_LOG_PROMPT + rawInput → Gemini → safeParseJson → ParsedLog.  
- **classifyLogsAsTask**: TASK_CLASSIFY_PROMPT + 로그 목록 → isTask per logId.  
- **generateDailyReport**: 당일 로그·최근 5일 로그·할일 목록·전일 일지 → GENERATE_DAILY_PROMPT 조합 → [ASSIGNMENTS] 블록 파싱 → logAssignments, newTasks 반환.  
- **safeParseJson**: 마크다운 제거, 끝 쉼표 제거, 빈 요소 제거 후 JSON.parse.  
- **generateEmbedding**, **detectRelation**, **answerQuery**, **summarizeForExecutive**: 각각 임베딩, 로그 연관, RAG 답변, 경영 요약.

(전체 함수 시그니처·프롬프트 조립 문자열은 원본 gemini.ts 참고.)

---

### 3.7 `src/app/api/logs/route.ts`

- **POST**: rawInput → parseLog (Gemini) → parseLogContent(parsed.content / rawInput) → source, content, task_id_tag 추출 → logs insert (project_id, raw_input, content, log_type, category_code, keywords, source, task_id_tag).  
- **GET**: projectId, logType, startDate, endDate, keyword 필터, 100건, project join.

---

### 3.8 `src/app/api/logs/[id]/route.ts`

- **GET**: id, user_id로 단건 조회, project join.  
- **PUT**: body (content, log_type, category_code, source, task_id_tag, task_state, project_id, **log_date**) → undefined가 아닌 필드만 update.  
- **DELETE**: id, user_id로 삭제.

---

### 3.9 `src/app/api/tasks/route.ts`

- **GET**: logs 조회 (project_id not null, task_state/task_id_tag/no_task_needed 조건), logToTaskShape로 Task[] 변환. withLogs=true면 같은 task_id_tag 로그 묶어서 relatedLogs 포함.  
- **POST**: project_id, description 필수. task_id_tag 없으면 generate_task_id RPC. logs insert (log_type 'E9', task_id_tag, task_state).

---

### 3.10 `src/app/api/ai/generate-daily/route.ts`

- 당일 로그 없으면 404.  
- 최근 5일 로그·할일 목록·전일 일지로 generateDailyReport 호출.  
- **newTasks**: taskIdTag 생성 후 firstLogId·nt.logIds에 대해 **.is('task_id_tag', null)** 조건으로만 update (기존 태그 보존).  
- **logAssignments**: a.taskIdTag != null일 때 **.is('task_id_tag', null)** 조건으로만 update.  
- 일지 본문 section12 + section3 → daily_reports upsert.

---

### 3.11 `src/app/api/logs/sync/route.ts`

- (1) project_id null 로그에 raw_input에서 프로젝트 코드 매칭해 project_id 채움.  
- (2) **task_id_tag null** 로그만 raw_input에서 parseLogContent로 #태그 추출해 task_id_tag 채움.  
- (3) 같은 task_id_tag끼리 task_state 통일 (null 아닌 값 우선, updated_at 최신 기준).

---

### 3.12 `src/components/tasks/TaskCard.tsx`

- 1행: task_id_tag, project.name, **source**, D-day, 상태 버튼(미분류/A/B/C/X). 버튼 영역 onClick stopPropagation.  
- 2행: description 전체 너비 (whitespace-pre-wrap break-words).  
- task.log_id 있으면 Link `/logs/${task.log_id}` 로 감싸서 카드 클릭 시 로그 상세 이동.

---

### 3.13 `src/components/tasks/TaskBoard.tsx`

- useQuery ['tasks'] → GET /api/tasks.  
- 탭: 전체 / A / B / C / D / X. filterByState(getTaskState(t)).  
- TabsContent별 TaskCard 렌더.

---

### 3.14 `src/app/(dashboard)/logs/[id]/page.tsx` (로그 상세)

- GET /api/logs/[id], GET /api/projects.  
- 수정 시: editLogDate, editProjectId, editLogType, editCategoryCode, editSource, editContent, editTaskIdTag, editTaskState.  
- 저장: PUT /api/logs/[id] with log_date, source, content, task_id_tag, task_state, project_id, log_type, category_code.  
- 수정 폼: 날짜(type="date"), 프로젝트 select, 타입 F/T/W/I, 카테고리, source, content, task_id_tag, task_state.

---

## 4. 논의 시 참고

- 할일이 logs 기반인 이유와 tasks 테이블 활용 방안.  
- task_id_tag 형식·고유성 정책 (generate_task_id RPC).  
- no_task_needed vs task_state vs task_id_tag 우선순위.  
- API 검증(zod 등)·에러 형식 통일.  
- 일지 생성과 로그 수정(날짜 변경) 간 상호 영향.

— 끝 —
