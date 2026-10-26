import { timingSafeEqual } from 'node:crypto';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createPmLogMcpServer } from '@/lib/mcp/server';

/**
 * claude.ai 커넥터용 MCP 엔드포인트.
 * URL: /api/mcp/<MCP_SECRET>
 * - 비밀 경로 값이 MCP_SECRET 과 같을 때만 응답 (다르면 404로 존재 자체를 숨김)
 * - 데이터는 MCP_USER_ID 사용자 것만 다룸
 * - 서버리스 환경이라 세션 없이(stateless) 요청마다 새로 처리
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function secretMatches(given: string): boolean {
  const expected = process.env.MCP_SECRET;
  if (!expected || expected.length < 24) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request, params: { secret: string }) {
  if (!secretMatches(params.secret)) {
    return new Response('Not found', { status: 404 });
  }
  const userId = process.env.MCP_USER_ID;
  if (!userId) {
    return Response.json({ error: 'MCP_USER_ID가 설정되지 않았습니다.' }, { status: 503 });
  }

  const server = createPmLogMcpServer(userId);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // JSON 응답 모드에서는 handleRequest가 끝나면 응답이 완성되어 있음
    void server.close();
  }
}

type Ctx = { params: { secret: string } };

export async function POST(req: Request, { params }: Ctx) {
  return handle(req, params);
}

export async function GET(req: Request, { params }: Ctx) {
  return handle(req, params);
}

export async function DELETE(req: Request, { params }: Ctx) {
  return handle(req, params);
}
