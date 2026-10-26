import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getSupabasePublicEnv } from '@/lib/env';
import { generateEmbedding } from '@/lib/ai/gemini';
import { createLogsFromRaw } from '@/lib/services/logs';
import { updateTaskState } from '@/lib/services/tasks';
import { normalizeProject } from '@/lib/task-from-log';
import { getTodayKST } from '@/lib/utils/date';

/**
 * PM Log MCP 서버.
 * claude.ai 커넥터에서 호출. 인증은 route(/api/mcp/[secret])에서 끝내고,
 * 여기서는 MCP_USER_ID 한 명의 데이터만 다룬다(모든 쿼리에 user_id 조건).
 */

const LOG_TYPE_GUIDE = 'F=수신(상대가 나에게 연락), T=발신(내가 연락), W=실행(완료 기록·계획), I=정보(메모·이슈)';
const TASK_STATE_GUIDE = 'high=A 우선, medium=B 후순위, low=C 대기, done=X 완료';

function getServiceClient(): SupabaseClient {
  const { url } = getSupabasePublicEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 1) }] };
}

function fail(message: string) {
  return { content: [{ type: 'text' as const, text: `오류: ${message}` }], isError: true };
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** ilike 패턴용 이스케이프 */
function likeEscape(s: string) {
  return s.replace(/[\\%_]/g, (m) => '\\' + m);
}

async function projectIdByCode(supabase: SupabaseClient, userId: string, code: string) {
  const { data } = await supabase
    .from('projects')
    .select('projects_id')
    .eq('user_id', userId)
    .eq('code', code)
    .maybeSingle();
  if (!data) throw new Error(`프로젝트 코드 '${code}'를 찾을 수 없습니다. list_projects로 코드를 확인하세요.`);
  return (data as { projects_id: string }).projects_id;
}

type LogRow = {
  log_id: string;
  log_date: string;
  log_type: string;
  content: string;
  source: string | null;
  task_id_tag: string | null;
  task_state: string | null;
  category_codes: string[] | null;
  project?: unknown;
};

function compactLog(row: LogRow) {
  const r = normalizeProject(row as LogRow & { project?: unknown });
  return {
    log_id: r.log_id,
    date: r.log_date,
    type: r.log_type,
    project: r.project?.code ?? null,
    source: r.source,
    content: r.content,
    tag: r.task_id_tag,
    state: r.task_state,
    categories: r.category_codes,
  };
}

const LOG_COLUMNS =
  'log_id, log_date, log_type, content, source, task_id_tag, task_state, category_codes, project:projects(projects_id, name, code)';

export function createPmLogMcpServer(userId: string) {
  const server = new McpServer({ name: 'pm-log', version: '1.0.0' });
  const supabase = getServiceClient();

  server.registerTool(
    'list_projects',
    {
      title: '프로젝트 목록',
      description: '등록된 프로젝트 코드와 이름을 반환합니다. 다른 도구의 project_code 값은 여기 나온 코드를 씁니다.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('code, name, status, description')
        .eq('user_id', userId)
        .order('code');
      if (error) return fail(error.message);
      return ok(data);
    }
  );

  server.registerTool(
    'search_logs',
    {
      title: '로그 조회',
      description: `조건으로 업무 로그를 조회합니다. 최신순. 로그 유형: ${LOG_TYPE_GUIDE}. 의미 기반 검색은 semantic_search를 쓰세요.`,
      inputSchema: {
        project_code: z.string().optional().describe('프로젝트 코드 (예: 서센, 수서)'),
        log_type: z.enum(['F', 'T', 'W', 'I']).optional(),
        start_date: z.string().optional().describe('YYYY-MM-DD 이후'),
        end_date: z.string().optional().describe('YYYY-MM-DD 이전'),
        text: z.string().optional().describe('본문에 포함된 단어'),
        source: z.string().optional().describe('연락 상대·출처에 포함된 단어'),
        task_tag: z.string().optional().describe('할일 태그 일부 (예: #서센6020905)'),
        limit: z.number().int().min(1).max(200).optional().describe('기본 50'),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        let q = supabase
          .from('logs')
          .select(LOG_COLUMNS)
          .eq('user_id', userId)
          .order('log_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(args.limit ?? 50);
        if (args.project_code) q = q.eq('project_id', await projectIdByCode(supabase, userId, args.project_code));
        if (args.log_type) q = q.eq('log_type', args.log_type);
        if (args.start_date) q = q.gte('log_date', args.start_date);
        if (args.end_date) q = q.lte('log_date', args.end_date);
        if (args.text?.trim()) q = q.ilike('content', `%${likeEscape(args.text.trim())}%`);
        if (args.source?.trim()) q = q.ilike('source', `%${likeEscape(args.source.trim())}%`);
        if (args.task_tag?.trim()) q = q.ilike('task_id_tag', `%${likeEscape(args.task_tag.trim())}%`);
        const { data, error } = await q;
        if (error) return fail(error.message);
        return ok({ count: data?.length ?? 0, logs: (data ?? []).map((r) => compactLog(r as LogRow)) });
      } catch (e) {
        return fail(errMsg(e));
      }
    }
  );

  server.registerTool(
    'semantic_search',
    {
      title: '의미 검색',
      description: '자연어 질문과 의미가 비슷한 로그를 찾습니다 (임베딩 검색). 정확한 단어를 모를 때 사용합니다.',
      inputSchema: {
        query: z.string().min(1).describe('찾고 싶은 내용 (예: 우수관 누수 조치 경과)'),
        limit: z.number().int().min(1).max(30).optional().describe('기본 10'),
        threshold: z.number().min(0).max(1).optional().describe('유사도 기준, 기본 0.6'),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        const embedding = await generateEmbedding(args.query);
        const { data, error } = await supabase.rpc('match_logs', {
          query_embedding: embedding,
          match_threshold: args.threshold ?? 0.6,
          match_count: args.limit ?? 10,
          p_user_id: userId,
        });
        if (error) return fail(error.message);
        return ok(data ?? []);
      } catch (e) {
        return fail(errMsg(e));
      }
    }
  );

  server.registerTool(
    'list_tasks',
    {
      title: '할일 목록',
      description: `할일(Task)로 분류된 로그를 조회합니다. 상태: ${TASK_STATE_GUIDE}, unclassified=미분류.`,
      inputSchema: {
        project_code: z.string().optional(),
        state: z.enum(['high', 'medium', 'low', 'done', 'unclassified', 'open']).optional()
          .describe('open = 완료 제외 전체'),
        limit: z.number().int().min(1).max(300).optional().describe('기본 100'),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        let q = supabase
          .from('logs')
          .select(LOG_COLUMNS)
          .eq('user_id', userId)
          .not('project_id', 'is', null)
          .or('task_state.not.is.null,task_id_tag.not.is.null,no_task_needed.eq.false')
          .order('created_at', { ascending: false })
          .limit(args.limit ?? 100);
        if (args.project_code) q = q.eq('project_id', await projectIdByCode(supabase, userId, args.project_code));
        if (args.state === 'unclassified') q = q.is('task_state', null);
        else if (args.state && args.state !== 'open') q = q.eq('task_state', args.state);
        const { data, error } = await q;
        if (error) return fail(error.message);
        // open = 완료 제외. or 필터를 두 번 걸 수 없어 조회 후 거른다.
        const rows = (data ?? []).filter(
          (r) => args.state !== 'open' || (r as LogRow).task_state !== 'done'
        );
        return ok({ count: rows.length, tasks: rows.map((r) => compactLog(r as LogRow)) });
      } catch (e) {
        return fail(errMsg(e));
      }
    }
  );

  server.registerTool(
    'add_log',
    {
      title: '로그 추가',
      description:
        '원문을 앱과 동일한 AI 분류(프로젝트·유형·카테고리·출처·태그)로 파싱해 저장합니다. 한 원문에서 여러 건이 생길 수 있습니다. ' +
        '앱 입력 형식 그대로 넣으세요 (예: "서센 김과장: 우수관 실리콘 임시조치 완료 #서센6020905"). 저장 전에 사용자에게 내용을 확인받으세요.',
      inputSchema: {
        raw_input: z.string().min(1).max(5000).describe('로그 원문'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args) => {
      try {
        const logs = await createLogsFromRaw(supabase, userId, args.raw_input);
        return ok({ created: logs.length, logs: logs.map((r) => compactLog(r as LogRow)) });
      } catch (e) {
        return fail(errMsg(e));
      }
    }
  );

  server.registerTool(
    'update_task_state',
    {
      title: '할일 상태 변경',
      description: `할일 상태를 바꾸고 상태 이력을 남깁니다. ${TASK_STATE_GUIDE}. log_id는 list_tasks/search_logs 결과의 log_id.`,
      inputSchema: {
        log_id: z.string().uuid(),
        state: z.enum(['high', 'medium', 'low', 'done']),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (args) => {
      try {
        const { data, previousState } = await updateTaskState(supabase, userId, args.log_id, args.state);
        return ok({ previous: previousState, current: args.state, log: compactLog(data as LogRow) });
      } catch (e) {
        return fail(errMsg(e));
      }
    }
  );

  server.registerTool(
    'get_daily_report',
    {
      title: '업무일지 조회',
      description: '저장된 업무일지를 날짜로 조회합니다. date를 비우면 최근 일지 날짜 목록을 반환합니다.',
      inputSchema: {
        date: z.string().optional().describe('YYYY-MM-DD'),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      if (!args.date) {
        const { data, error } = await supabase
          .from('daily_reports')
          .select('report_date')
          .eq('user_id', userId)
          .order('report_date', { ascending: false })
          .limit(30);
        if (error) return fail(error.message);
        return ok({ today: getTodayKST(), dates: (data ?? []).map((r) => r.report_date) });
      }
      const { data, error } = await supabase
        .from('daily_reports')
        .select('report_date, content, total_logs, f_count, t_count, w_count, i_count')
        .eq('user_id', userId)
        .eq('report_date', args.date)
        .maybeSingle();
      if (error) return fail(error.message);
      if (!data) return fail(`${args.date} 일지가 없습니다.`);
      return ok(data);
    }
  );

  return server;
}
