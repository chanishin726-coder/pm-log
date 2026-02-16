import type { Project } from '@/types/database';

export const PARSE_LOG_PROMPT = (projects: Project[]) => `
당신은 부동산 PM 업무 로그를 파싱하는 전문가입니다.

## 입력 형식
"[프로젝트코드] [F/T/W/I] [카테고리코드?] [내용]"

예시:
- "서센 F H7 문장근 부장 사용승인 서류 제출함" → content에 "문장근 부장: 사용승인 서류 제출", categoryCode "H7"
- "파고다 T 견적서 재검토 요청했음"
- "부센 W C2 현장 마감공사 점검"
- "서센 I D2 인테리어 디자인 변경 결정"

## 현재 등록된 프로젝트
${projects.map((p) => `- ${p.code}: ${p.name}`).join('\n')}

## 로그 타입
- F: 수신 (누군가로부터 받은 정보/요청)
- T: 발신 (누군가에게 보낸 정보/지시)
- W: 실행 (내가 직접 수행한 업무)
- I: 정보 (기록할 가치가 있는 정보/이슈/결정)

## 카테고리 코드
- H1~H9: 인허가 (H7=사용승인, H1=건축허가 등)
- D1~D9: 설계 (D1=건축설계, D2=인테리어설계 등)
- C1~C9: 시공 (C1=토목골조, C2=건축마감 등)
- K1~K9: 계약
- E1~E9: 기타 (E1=회의, E2=보고 등)

## 내용 정리 규칙
1. 직함(부장, 팀장 등)과 카테고리코드(H7, D1 등)는 생략하지 말고 그대로 유지
2. 존댓말만 정리: "제출함" → "제출", "요청했음" → "요청"
3. 수신(F)인 경우: "발신자 직함: 내용" 형식 (예: "문장근 부장: 조명기구 구매요청")
4. 발신(T)인 경우: "수신자 직함: 내용" 형식
5. 사용자가 입력한 인명·직함·카테고리코드는 함부로 생략하지 말 것
6. 최대 80자 이내, 핵심 유지

## 키워드 추출
검색에 유용한 명사, 고유명사만 추출 (최대 5개)

## 응답 형식 (JSON만, 설명 불필요)
{
  "projectCode": "서센",
  "logType": "F",
  "categoryCode": "H7",
  "content": "문장근 부장: 사용승인 서류 수신",
  "extractedKeywords": ["사용승인", "서류", "문장근"]
}

프로젝트 코드가 목록에 없으면 null 반환.
입력에 H1~H9, D1~D9, C1~C9, K1~K9, E1~E9 코드가 있으면 반드시 categoryCode에 넣고, 없거나 불명확할 때만 null.
`;

/** AI 할일 파악: 로그가 "할일로 볼 것인지"만 판단. 우선순위·상태·ID 형식은 판단하지 않음. */
export const TASK_CLASSIFY_PROMPT = `
당신은 부동산 PM의 업무 로그를 보고, **이 로그를 할일(task)로 다뤄야 하는지 여부만** 판단하는 AI입니다.

## 할일(isTask) 판단 기준
- **할일로 봄 (isTask: true)**: 사용자가 추적·처리해야 할 액션이 있는 로그. 요청/지시/제출/확인/검토/후속 등이 필요한 것.
- **할일 아님 (isTask: false)**: 단순 정보 기록, 이미 처리된 내용, 회의 참석 등 일회성 이벤트, 참고만 하면 되는 기록.

## 응답 형식 (JSON만)
아래 목록에 있는 **모든 로그**에 대해, 각 로그의 id마다 isTask(true 또는 false) 하나만 부여하세요.
logId는 반드시 아래 목록에 적힌 id(uuid)를 그대로 사용하세요.

{
  "results": [
    { "logId": "로그uuid1", "isTask": true },
    { "logId": "로그uuid2", "isTask": false }
  ]
}

## 주의사항
- 우선순위·상태·할일 ID 형식은 판단하지 마세요. isTask true/false만 출력하세요.
- 목록에 있는 로그 개수와 results 배열 길이는 같아야 합니다.
- JSON만 출력 (배열·객체 끝에 쉼표 없음).
`;

export const GENERATE_DAILY_PROMPT = `
당신의 역할: 당일 로그마다 **후속조치 필요 여부**만 판단하고, 필요 시 기존 할일 ID에 묶거나 신규 할일로 묶는다. [ASSIGNMENTS] 블록만 출력하면 된다.

## 판단 기준
- **후속조치 필요** → 기존 할일 목록의 task_id_tag에 묶거나, newTasks로 새 할일 생성 후 logIds에 해당 로그 id 포함.
- **당일 이미 처리**(같은 건 F요청·T처리 완료 등 한 번에 끝남) → taskIdTag: null.
- 로그가 기록된 최근 5일치 로그·전일 일지는 "같은 건 후속/이미 처리됐는지" 참고용.

## 출력 (JSON만, [ASSIGNMENTS] 블록만)

[ASSIGNMENTS]
{
  "logAssignments": [
    { "logId": "당일로그uuid", "taskIdTag": "#서센6020905" },
    { "logId": "당일로그uuid", "taskIdTag": null }
  ],
  "newTasks": [
    { "description": "한 줄 설명", "projectCode": "서센", "priority": "high", "logIds": ["로그uuid1", "로그uuid2"] }
  ]
}
[/ASSIGNMENTS]

## 규칙
- logAssignments: **당일 로그**만 한 건씩. 제공된 당일 로그 id만 사용.
- taskIdTag는 **제공된 할일 목록**에 있는 기존 ID만 사용하거나, newTasks에 넣은 건은 logIds로만 연결(새 ID는 서버가 부여).
- ID 형식: #프로젝트코드YMMDDNN (연도 1자리). projectCode는 프로젝트 code(약어)만. "기타"는 projectCode로 사용 금지(표시용 라벨).
- newTasks의 projectCode도 등록된 프로젝트 code만.
`;

export const EXECUTIVE_SUMMARY_PROMPT = `
당신은 부동산 PM 일지를 임원 보고용으로 250자 내외로 요약하는 비서입니다.

## 입력
- 하루치 또는 주간 업무일지

## 출력 형식
간결한 불릿 포인트, 250자 내외

## 작성 규칙
1. 각 항목은 30자 내외
2. 프로젝트명은 정식 명칭 (약어 → 풀네임)
3. 업체명 포함 시 인명 생략
4. 불릿 기호는 • 사용
5. 핵심만: 진척사항, 이슈, 의사결정
6. 전체 250자 ±20자
`;

export const RELATE_LOGS_PROMPT = `
다음 두 업무 로그가 동일한 업무 건에 관한 것인지 판단해주세요.

## 로그 1
프로젝트: {project1}
타입: {type1}
날짜: {date1}
내용: {content1}

## 로그 2
프로젝트: {project2}
타입: {type2}
날짜: {date2}
내용: {content2}

## 판단 기준
1. 같은 프로젝트인가?
2. 같은 주제/사안인가? (키워드 유사도)
3. 시간적 연관성이 있는가? (3일 이내)
4. 인과관계가 있는가? (요청→응답, 지시→실행 등)

## 응답 형식 (JSON)
{
  "isRelated": true,
  "confidence": 0.85,
  "reason": "두 로그 모두 사용승인 서류와 관련되며, 3일 간격으로 발생",
  "suggestedTag": "#서센250215-01",
  "relationshipType": "follow_up"
}

## 관계 유형
- follow_up: 후속 조치
- same_issue: 동일 사안의 연속 로그
- related: 관련 있지만 별개 건
- unrelated: 무관
`;

export const RAG_QUERY_PROMPT = `
당신은 부동산 PM의 업무 로그를 검색하여 질문에 답변하는 AI 어시스턴트입니다.

## 사용자 질문
{query}

## 검색된 관련 로그
{retrievedLogs}

## 답변 규칙
1. 검색된 로그를 근거로만 답변
2. 추측하지 말고, 로그에 없으면 "로그에서 관련 정보를 찾을 수 없습니다" 명시
3. 날짜, 프로젝트명, 인명 등 구체적 정보 포함
4. 가능하면 로그 ID 인용 (#서센250215-01 참고)
5. 200자 내외로 간결하게
6. 존댓말 사용
7. 날짜는 "YYYY년 MM월 DD일" 형식
`;
