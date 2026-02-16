import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  PARSE_LOG_PROMPT,
  TASK_CLASSIFY_PROMPT,
  GENERATE_DAILY_PROMPT,
  EXECUTIVE_SUMMARY_PROMPT,
  RELATE_LOGS_PROMPT,
  RAG_QUERY_PROMPT,
} from './prompts';
import type { Project } from '@/types/database';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/** AI가 반환한 JSON이 끝 쉼표·빈 요소·마크다운 등으로 깨진 경우 복구 후 파싱 */
function safeParseJson<T>(raw: string): T {
  let s = raw.trim();
  // 마크다운 코드 블록 제거
  const codeMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeMatch) s = codeMatch[1].trim();
  try {
    return JSON.parse(s) as T;
  } catch {
    // 끝 쉼표 제거: ,] ,}
    s = s.replace(/,(\s*[}\]])/g, '$1');
  }
  try {
    return JSON.parse(s) as T;
  } catch {
    // 빈 배열 요소 제거: , , → ,
    s = s.replace(/,(\s*,)+/g, ',');
  }
  try {
    return JSON.parse(s) as T;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`JSON 파싱 실패. AI 응답이 잘렸거나 형식이 잘못되었을 수 있습니다. (${msg.slice(0, 120)})`);
  }
}

// Gemini 모델 ID (Google AI 스튜디오). Gemini 2.5 Flash Lite 사용
const MODEL_FLASH = process.env.GEMINI_MODEL_FLASH || 'gemini-2.5-flash-lite';
const MODEL_PRO = process.env.GEMINI_MODEL_PRO || 'gemini-2.5-flash-lite';

export interface ParsedLog {
  projectCode: string | null;
  logType: 'F' | 'T' | 'W' | 'I';
  categoryCode: string | null;
  content: string;
  extractedKeywords: string[];
}

export async function parseLog(
  rawInput: string,
  projects: Project[]
): Promise<ParsedLog> {
  const model = genAI.getGenerativeModel({ model: MODEL_FLASH });
  const prompt = PARSE_LOG_PROMPT(projects) + `\n\n입력: ${rawInput}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse AI response');
  }

  const parsed = safeParseJson<ParsedLog>(jsonMatch[0]);
  return parsed;
}

export interface TaskClassifyResult {
  results: Array<{ logId: string; isTask: boolean }>;
}

/** 로그 목록에 대해 "할일로 볼 것인지"만 판단. 우선순위·상태는 판단하지 않음. */
export async function classifyLogsAsTask(data: {
  logs: Array<{
    id: string;
    log_date: string;
    log_type: string;
    content: string;
    project?: { name: string } | null;
  }>;
}): Promise<TaskClassifyResult> {
  const model = genAI.getGenerativeModel({ model: MODEL_FLASH });

  const prompt = `${TASK_CLASSIFY_PROMPT}

## 아래 로그 목록 (각 줄의 id가 로그 uuid)
${data.logs.map((l) => `id: ${l.id} | [${l.log_date}] [${l.log_type}] ${l.project?.name || '기타'}: ${l.content}`).join('\n')}

위 목록의 각 로그에 대해 할일 여부(isTask)만 판단하여 JSON으로 응답하세요.
`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse task classify response');
  }

  return safeParseJson<TaskClassifyResult>(jsonMatch[0]);
}

export interface DailyReportResult {
  logAssignments: Array<{ logId: string; taskIdTag: string | null }>;
  newTasks: Array<{ description: string; projectCode: string; priority: string; logIds: string[] }>;
}

export async function generateDailyReport(data: {
  logs: Array<{
    id: string;
    log_date?: string;
    log_type: string;
    content: string;
    category_code?: string | null;
    source?: string | null;
    created_at?: string;
    project?: { name: string; code: string } | null;
  }>;
  recentLogs?: Array<{
    id: string;
    log_date: string;
    log_type: string;
    content: string;
    category_code?: string | null;
    source?: string | null;
    task_id_tag?: string | null;
    created_at?: string;
    project?: { name: string; code: string } | null;
  }>;
  tasks: Array<{
    task_id_tag: string;
    description: string;
    task_state?: string | null;
    priority?: string | null;
    due_date: string | null;
    project?: { name: string; code: string } | null;
  }>;
  previousReport?: string;
  targetDate: string;
}): Promise<DailyReportResult> {
  const model = genAI.getGenerativeModel({ model: MODEL_PRO });

  const logsText = data.logs
    .map((l) => {
      const cat = l.category_code ? ` ${l.category_code}` : '';
      const src = l.source?.trim() ? ` source=${JSON.stringify(l.source)}` : '';
      return `id: ${l.id} | [${l.log_type}]${cat} ${l.project?.name || '기타'}${src}: ${l.content}`;
    })
    .join('\n');

  const recentLogsText =
    data.recentLogs && data.recentLogs.length > 0
      ? data.recentLogs
          .map((l) => {
            const cat = l.category_code ? ` ${l.category_code}` : '';
            const tag = l.task_id_tag ? ` (기존ID: ${l.task_id_tag})` : '';
            const src = l.source?.trim() ? ` source=${JSON.stringify(l.source)}` : '';
            return `${l.log_date} | id: ${l.id} | [${l.log_type}]${cat} ${l.project?.name || '기타'}${src}: ${l.content}${tag}`;
          })
          .join('\n')
      : '';

  const state = (t: (typeof data.tasks)[0]) => t.task_state ?? t.priority ?? null;
  const tasksByPriority = {
    A: data.tasks.filter((t) => state(t) === 'high'),
    B: data.tasks.filter((t) => state(t) === 'medium'),
    C: data.tasks.filter((t) => state(t) === 'low' || state(t) === 'review' || !state(t)),
  };
  const tasksText = `
A. 우선순위: ${tasksByPriority.A.length ? tasksByPriority.A.map((t) => `- [ ] ${t.task_id_tag} ${t.description}${t.due_date ? ` (마감: ${t.due_date})` : ''}`).join('\n') : '없음'}
B. 후순위: ${tasksByPriority.B.length ? tasksByPriority.B.map((t) => `- [ ] ${t.task_id_tag} ${t.description}${t.due_date ? ` (마감: ${t.due_date})` : ''}`).join('\n') : '없음'}
C. 대기사항: ${tasksByPriority.C.length ? tasksByPriority.C.map((t) => `- [ ] ${t.task_id_tag} ${t.description}`).join('\n') : '없음'}
`.trim();

  const prompt = `${GENERATE_DAILY_PROMPT}

## 오늘 날짜
${data.targetDate}

## 할일 목록 (기존 task_id_tag 참고)
${tasksText}

${recentLogsText ? `## 로그가 기록된 최근 5일치 로그 (같은 건 후속/처리 여부 참고)
${recentLogsText}

` : ''}## 당일 로그 (logAssignments에 위 id만 사용)
${logsText}

${data.previousReport ? `## 전일 일지 (참고용)\n${data.previousReport}\n` : ''}

[ASSIGNMENTS] 블록만 출력하세요.
`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  const assignmentsMatch = text.match(/\[ASSIGNMENTS\]\s*([\s\S]*?)\s*\[\/ASSIGNMENTS\]/);
  let logAssignments: DailyReportResult['logAssignments'] = [];
  let newTasks: DailyReportResult['newTasks'] = [];

  if (assignmentsMatch) {
    try {
      const jsonStr = assignmentsMatch[1].replace(/\s*\/\/.*$/gm, '').trim();
      const parsed = safeParseJson<{
        logAssignments?: Array<{ logId: string; taskIdTag: string | null }>;
        newTasks?: Array<{ description: string; projectCode: string; priority: string; logIds: string[] }>;
      }>(jsonStr);
      if (Array.isArray(parsed.logAssignments)) logAssignments = parsed.logAssignments;
      if (Array.isArray(parsed.newTasks)) newTasks = parsed.newTasks;
    } catch {
      // JSON 파싱 실패 시 빈 배열
    }
  }

  return { logAssignments, newTasks };
}

// 임베딩: 문장을 숫자 벡터로 바꾸는 전용 모델. 자연어 질의 시 "비슷한 로그" 검색에 사용.
// 채팅용 Gemini(2.5 Flash Lite)와 별도이며, Google AI Studio에서는 gemini-embedding-001 사용.
const EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';

export async function generateEmbedding(text: string): Promise<number[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');

  // DB log_embeddings.embedding은 vector(768). gemini-embedding-001 기본은 3072이므로 768로 요청.
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: {
          parts: [{ text }],
        },
        outputDimensionality: 768,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding API error: ${err}`);
  }

  const data = (await res.json()) as { embedding: { values: number[] } };
  return data.embedding.values;
}

export async function detectRelation(
  log1: { project?: { name: string } | null; log_type: string; log_date: string; content: string },
  log2: { project?: { name: string } | null; log_type: string; log_date: string; content: string }
): Promise<{
  isRelated: boolean;
  confidence: number;
  reason: string;
  suggestedTag?: string;
  relationshipType?: string;
}> {
  const model = genAI.getGenerativeModel({ model: MODEL_FLASH });

  const prompt = RELATE_LOGS_PROMPT.replace('{project1}', log1.project?.name || '기타')
    .replace('{type1}', log1.log_type)
    .replace('{date1}', log1.log_date)
    .replace('{content1}', log1.content)
    .replace('{project2}', log2.project?.name || '기타')
    .replace('{type2}', log2.log_type)
    .replace('{date2}', log2.log_date)
    .replace('{content2}', log2.content);

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { isRelated: false, confidence: 0, reason: 'Failed to parse' };
  }

  return safeParseJson(jsonMatch[0]);
}

export async function answerQuery(data: {
  query: string;
  logs: Array<{
    log_date: string;
    project_name: string | null;
    content: string;
    similarity?: number;
  }>;
  tasks: unknown[];
}): Promise<string> {
  const model = genAI.getGenerativeModel({ model: MODEL_PRO });

  const logsText = data.logs
    .map(
      (l) =>
        `[${l.log_date}] ${l.project_name || '기타'}: ${l.content}${l.similarity != null ? ` (유사도: ${(l.similarity * 100).toFixed(0)}%)` : ''}`
    )
    .join('\n');

  const prompt = RAG_QUERY_PROMPT.replace('{query}', data.query).replace(
    '{retrievedLogs}',
    logsText
  );

  const result = await model.generateContent(prompt);
  return result.response.text();
}

export async function summarizeForExecutive(dailyReport: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: MODEL_FLASH });

  const prompt = `${EXECUTIVE_SUMMARY_PROMPT}\n\n## 입력\n${dailyReport}`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}
