/**
 * supabase-export/ 의 JSON 데이터를 Supabase에 import합니다.
 * 사용: node scripts/import-supabase-data.js
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
  console.error('NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY가 .env.local에 있어야 합니다.');
  process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(url, serviceKey);

const EXPORT_DIR = path.join(__dirname, '..', 'supabase-export');
const BATCH_SIZE = 100;

// FK 순서: categories → projects → logs → tasks → log_embeddings, daily_reports, task_id_sequences
const TABLES = [
  'categories',
  'projects',
  'logs',
  'tasks',
  'log_embeddings',
  'daily_reports',
  'task_id_sequences',
];

function loadData() {
  const allPath = path.join(EXPORT_DIR, 'all.json');
  if (fs.existsSync(allPath)) {
    const raw = JSON.parse(fs.readFileSync(allPath, 'utf8'));
    const out = {};
    for (const table of TABLES) {
      if (Array.isArray(raw[table])) out[table] = raw[table];
      else out[table] = [];
    }
    return out;
  }
  const out = {};
  for (const table of TABLES) {
    const p = path.join(EXPORT_DIR, `${table}.json`);
    out[table] = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
    if (!Array.isArray(out[table])) out[table] = [];
  }
  return out;
}

async function upsertTable(table, rows) {
  if (rows.length === 0) return;
  const conflictKey = table === 'task_id_sequences' ? 'project_code,date' : 'id';
  const stripLogsExtra = (r) => {
    const { project_name, project_code, category_name, ...rest } = r;
    return rest;
  };
  const prepared = table === 'logs' ? rows.map(stripLogsExtra) : rows;

  for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
    const chunk = prepared.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).upsert(chunk, {
      onConflict: conflictKey,
    });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function appendLogsOnly() {
  const p = path.join(EXPORT_DIR, 'logs-import.json');
  if (!fs.existsSync(p)) {
    console.error('supabase-export/logs-import.json 이 없습니다. 먼저 scripts/text-to-logs.js 로 생성하세요.');
    process.exit(1);
  }
  let rows = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(rows) || rows.length === 0) {
    console.error('logs-import.json 에 로그가 없습니다.');
    process.exit(1);
  }
  const userId = rows[0]?.user_id;
  const codes = [...new Set(rows.map((r) => r.project_code).filter(Boolean))];
  let codeToId = {};
  if (userId && codes.length > 0) {
    const { data: projects } = await supabase
      .from('projects')
      .select('id, code')
      .eq('user_id', userId)
      .in('code', codes);
    (projects || []).forEach((pr) => { codeToId[pr.code] = pr.id; });
  }
  const prepared = rows.map((r) => {
    const { project_code, ...rest } = r;
    return {
      ...rest,
      project_id: (project_code && codeToId[project_code]) || null,
    };
  });
  for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
    const chunk = prepared.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('logs').insert(chunk);
    if (error) throw new Error(`logs: ${error.message}`);
  }
  console.log(`logs ${prepared.length}건 추가 완료.`);
}

async function main() {
  const appendOnly = process.argv.includes('--append-logs');
  if (appendOnly) {
    if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });
    await appendLogsOnly();
    return;
  }

  if (!fs.existsSync(EXPORT_DIR)) {
    console.error('supabase-export/ 폴더가 없습니다. 먼저 npm run export:supabase 를 실행하세요.');
    process.exit(1);
  }

  const data = loadData();
  console.log('Import 대상: supabase-export/ (all.json 또는 테이블별 JSON)\n');

  for (const table of TABLES) {
    const rows = data[table] || [];
    if (rows.length === 0) {
      console.log(`  ${table}: 건너뜀 (데이터 없음)`);
      continue;
    }
    process.stdout.write(`  ${table}: ${rows.length}건 upsert... `);
    await upsertTable(table, rows);
    console.log('완료');
  }

  console.log('\nImport 완료.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
