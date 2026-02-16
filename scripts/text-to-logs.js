/**
 * 업무일지 등 텍스트 파일을 PM Log 로그 형식으로 변환합니다.
 * PDF는 먼저 텍스트로 복사해 .txt로 저장하거나, 아래 사용법 참고.
 *
 * 사용: node scripts/text-to-logs.js <텍스트파일경로>
 * 예:   node scripts/text-to-logs.js "C:\Users\SCH\Downloads\업무일지.txt"
 * 결과: supabase-export/logs-import.json → 이후 npm run import:supabase -- --append-logs
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

const userId = process.env.AUTH_BYPASS_USER_ID || null;

// 한 줄 형식: YYYY-MM-DD 프로젝트코드 F|T|W|I 내용 [ #task_id_tag ]
// 예: 2026-02-09 서센 T 남민호 부장(대혜): 사용승인 서류 제출...
const LINE_FORMAT = /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\S+)\s+([FTWI])\s+(.*?)(?:\s+#([#\w\-]+))?$/;
// 날짜만 있는 줄(구 형식) fallback
const DATE_LINE = /^(\d{4})[-.\/년]?\s*(\d{1,2})[-.\/월]?\s*(\d{1,2})일?\s*(.*)$/;

function parseTextToEntries(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const entries = [];

  for (const line of lines) {
    const m = line.match(LINE_FORMAT);
    if (m) {
      const [, y, mo, d, projectCode, logType, content, taskIdTag] = m;
      entries.push({
        log_date: `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`,
        project_code: projectCode,
        log_type: logType,
        content: content.trim(),
        task_id_tag: taskIdTag || null,
      });
      continue;
    }
    const dm = line.match(DATE_LINE);
    if (dm) {
      const y = dm[1];
      const mo = dm[2].padStart(2, '0');
      const d = dm[3].padStart(2, '0');
      const rest = (dm[4] || '').trim();
      if (rest) {
        entries.push({
          log_date: `${y}-${mo}-${d}`,
          project_code: null,
          log_type: 'E9',
          content: rest,
          task_id_tag: null,
        });
      }
    }
  }
  return entries;
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('사용법: node scripts/text-to-logs.js <텍스트파일경로>');
    console.error('  PDF는 브라우저/뷰어에서 텍스트 복사 후 .txt로 붙여넣어 저장하세요.');
    process.exit(1);
  }
  const absPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  if (!fs.existsSync(absPath)) {
    console.error('파일을 찾을 수 없습니다:', absPath);
    process.exit(1);
  }
  const text = fs.readFileSync(absPath, 'utf8');
  const entries = parseTextToEntries(text);
  if (entries.length === 0) {
    console.error('날짜/내용으로 나눌 수 있는 항목이 없습니다. 한 줄에 "YYYY-MM-DD 내용" 형태로 정리해 보세요.');
    process.exit(1);
  }
  const outDir = path.join(__dirname, '..', 'supabase-export');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  if (!userId) {
    console.error('.env.local 에 AUTH_BYPASS_USER_ID 를 설정하세요.');
    process.exit(1);
  }
  const logRows = entries.map((e) => ({
    id: crypto.randomUUID(),
    user_id: userId,
    project_id: null,
    project_code: e.project_code || null,
    log_date: e.log_date,
    raw_input: e.content,
    content: e.content,
    log_type: e.log_type || 'E9',
    category_code: null,
    is_follow_up: false,
    keywords: null,
    task_id_tag: e.task_id_tag || null,
    no_task_needed: false,
  }));
  const outPath = path.join(outDir, 'logs-import.json');
  fs.writeFileSync(outPath, JSON.stringify(logRows, null, 2), 'utf8');
  console.log(`${entries.length}건 → ${outPath}`);
  console.log('이제 다음으로 Supabase에 반영하세요:');
  console.log('  npm run import:supabase -- --append-logs');
}

main();
