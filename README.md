# PM Log - 업무 로그 & 할일 관리

**한 줄 입력 → AI가 알아서 처리**하는 부동산 PM 업무 로그 시스템입니다. (Vercel 배포)

## 기능 요약

- **한 줄 로그 입력**: `서센 F H7 문장근부장 사용승인 서류 제출함` → AI(Gemini)가 프로젝트·타입·카테고리·내용 자동 분류
- **ID 기반 업무 추적**: `#프로젝트코드YYMMDD-NN` 형식
- **할일 우선순위**: A(우선) / B(후순위) / C(대기) / D(AI추천) / E(완료)
- **AI 할일 파악**: 최근 7일 로그 분석으로 할일 자동 추출
- **일지 자동 생성**: 하루 로그를 정리한 업무일지
- **임원 보고 요약**: 250자 내외 요약
- **RAG 질의**: 자연어로 로그 검색·질의

## 기술 스택

- **프론트**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **백엔드**: Supabase (PostgreSQL, Auth, Realtime, pgvector)
- **AI**: Google Gemini (gemini-1.5-flash, gemini-1.5-pro, text-embedding-004)

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수

`.env.example`을 복사해 `.env.local`을 만들고 값을 채웁니다.

```bash
cp .env.example .env.local
```

필수 변수:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `NEXT_PUBLIC_APP_URL` (로컬: `http://localhost:3000`)

### 3. Supabase 설정

1. [Supabase](https://supabase.com)에서 프로젝트 생성
2. SQL Editor에서 `supabase/migrations/001_initial_schema.sql` 내용을 순서대로 실행
3. Auth 설정 (이메일/비밀번호 등) 후 사용자 생성

### 4. 개발 서버

```bash
npm run dev
```

브라우저에서 `http://localhost:3000` 접속 후 로그인합니다.

## 프로젝트 구조 (요약)

- `src/app/(auth)/` - 로그인, 콜백
- `src/app/(dashboard)/` - 대시보드, 로그, 할일, 프로젝트, 일지, 임원보고, 질의
- `src/app/api/` - 로그/할일/프로젝트/일지 API, AI(task-plan, generate-daily, summarize), 검색/질의/임베딩
- `src/components/` - QuickInput, TaskBoard, TaskCard 등
- `src/lib/` - Supabase 클라이언트, AI(Gemini, 프롬프트), 유틸
- `supabase/migrations/` - DB 스키마 및 함수

## 로그 입력 형식

`[프로젝트코드] [F/T/W/I] [카테고리코드?] [내용]`

- **타입**: F(수신), T(발신), W(실행), I(정보)
- **카테고리**: H7(사용승인), D2(인테리어설계), C2(건축마감) 등

예: `서센 F H7 문장근부장 사용승인 서류 제출함`

## 배포

- **프론트**: Vercel 권장 (`vercel` 배포 후 환경 변수 설정)
- **백엔드**: Supabase Cloud
- 마이그레이션은 Supabase Dashboard SQL Editor 또는 `supabase db push`로 적용

## 라이선스

MIT
