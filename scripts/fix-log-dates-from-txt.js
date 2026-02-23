/**
 * txt 파일의 날짜를 기준으로, 이미 DB에 들어간 로그의 log_date만 수정합니다.
 * task_state, task_id_tag 등은 그대로 둡니다.
 * 사용: node scripts/fix-log-dates-from-txt.js [잘못된_log_date] [user_id]
 *       경로는 scripts/fix-log-dates-path.txt 또는 첫 인자로 전달.
 *       user_id 생략 시 AUTH_BYPASS_USER_ID 사용. 로그가 다른 user_id로 옮겨진 경우 env FIX_LOG_DATES_USER_ID 또는 세 번째 인자로 지정.
 * 예:   node scripts/fix-log-dates-from-txt.js 2026-02-15
 *       node scripts/fix-log-dates-from-txt.js 2026-02-15 <실제_로그소유_user_id>
 */

const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('.env.local이 없습니다.');
    process.exit(1);
  }
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('.env.local에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
  process.exit(1);
}

const LINE_FORMAT = /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\S+)\s+([FTWI])\s+(.*?)(?:\s+#([#\w\-]+))?$/;
const DATE_LINE = /^(\d{4})[-.\/년]?\s*(\d{1,2})[-.\/월]?\s*(\d{1,2})일?\s*(.*)$/;

function parseTxtToEntries(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const entries = [];
  for (const line of lines) {
    const m = line.match(LINE_FORMAT);
    if (m) {
      const [, y, mo, d, , logType, content] = m;
      entries.push({
        log_date: `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`,
        log_type: logType,
        content: content.trim(),
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
          log_type: 'E9',
          content: rest,
        });
      }
    }
  }
  return entries;
}

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(url, serviceKey);

async function main() {
  const pathFile = path.join(__dirname, 'fix-log-dates-path.txt');
  let filePath = process.argv[2];
  let wrongDate = process.argv[3] || '2026-02-15';
  if (fs.existsSync(pathFile) && (!filePath || /^\d{4}-\d{2}-\d{2}$/.test(filePath))) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(filePath)) wrongDate = filePath;
    filePath = fs.readFileSync(pathFile, 'utf8').trim();
  }
  const targetUserId = process.env.FIX_LOG_DATES_USER_ID || process.argv[3] || process.argv[4] || process.env.AUTH_BYPASS_USER_ID;
  if (!targetUserId) {
    console.error('대상 user_id가 없습니다. .env.local의 AUTH_BYPASS_USER_ID, 또는 FIX_LOG_DATES_USER_ID, 또는 인자로 user_id를 지정하세요.');
    process.exit(1);
  }
  if (!filePath) {
    console.error('사용법: node scripts/fix-log-dates-from-txt.js [잘못된_log_date] [user_id]');
    console.error('  scripts/fix-log-dates-path.txt 에 txt 경로 한 줄 작성');
    process.exit(1);
  }
  const absPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  if (!fs.existsSync(absPath)) {
    console.error('파일 없음:', absPath);
    process.exit(1);
  }

  const text = fs.readFileSync(absPath, 'utf8');
  const entries = parseTxtToEntries(text);
  if (entries.length === 0) {
    console.error('파싱된 항목이 없습니다.');
    process.exit(1);
  }

  console.log(`대상 user_id: ${targetUserId}`);
  console.log(`txt에서 ${entries.length}건 파싱. log_date=${wrongDate} 인 로그 조회 중...`);

  const { data: existingLogs, error: fetchError } = await supabase
    .from('logs')
    .select('id, content, raw_input, log_type, log_date')
    .eq('user_id', targetUserId)
    .eq('log_date', wrongDate);

  if (fetchError) {
    console.error('로그 조회 실패:', fetchError.message);
    process.exit(1);
  }

  const nLogs = (existingLogs || []).length;
  console.log(`DB에서 log_date=${wrongDate} 인 로그 ${nLogs}건 조회됨.`);
  if (nLogs === 0) {
    console.log('수정할 로그가 없습니다. 잘못된 날짜가 맞는지 확인하세요.');
    return;
  }
  if (nLogs > 0 && entries.length > 0) {
    const sample = existingLogs[0];
    console.log('샘플 DB키:', `${sample.log_type || ''}|${((sample.content || '').trim()).slice(0, 40)}...`);
    console.log('샘플 txt키:', `${entries[0].log_type}|${entries[0].content.slice(0, 40)}...`);
  }

  const norm = (s) => (s || '').trim().replace(/\s+/g, ' ');
  const byContentKey = {};
  const byRawKey = {};
  (existingLogs || []).forEach((log) => {
    const c = norm(log.content);
    const r = norm(log.raw_input);
    const kc = `${log.log_type}|${c}`;
    const kr = `${log.log_type}|${r}`;
    if (!byContentKey[kc]) byContentKey[kc] = [];
    byContentKey[kc].push(log);
    if (r && kr !== kc) {
      if (!byRawKey[kr]) byRawKey[kr] = [];
      byRawKey[kr].push(log);
    }
  });

  const usedIds = new Set();
  let updated = 0;
  let skipped = 0;
  for (const e of entries) {
    const k = `${e.log_type}|${norm(e.content)}`;
    let candidates = (byContentKey[k] || []).filter((l) => !usedIds.has(l.id));
    if (candidates.length === 0) candidates = (byRawKey[k] || []).filter((l) => !usedIds.has(l.id));
    if (candidates.length === 0) {
      skipped++;
      continue;
    }
    const log = candidates[0];
    usedIds.add(log.id);
    if (log.log_date === e.log_date) continue;
    const { error } = await supabase
      .from('logs')
      .update({ log_date: e.log_date })
      .eq('id', log.id);
    if (error) {
      console.error('업데이트 실패', log.id, error.message);
      usedIds.delete(log.id);
      continue;
    }
    updated++;
  }

  console.log(`완료: ${updated}건 log_date 수정, ${skipped}건 매칭 없음(무시).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
