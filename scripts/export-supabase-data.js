/**
 * Supabase에 저장된 데이터를 한 번에 JSON으로 export합니다.
 * 사용: node scripts/export-supabase-data.js
 * 결과: supabase-export/ 에 테이블별 .json 및 all.json
 */

const fs = require('fs');
const path = require('path');

// .env.local 로드
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('.env.local이 없습니다. 프로젝트 루트에 .env.local을 두고 실행하세요.');
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

const TABLES = [
  'categories',
  'projects',
  'logs',
  'tasks',
  'log_embeddings',
  'daily_reports',
  'task_id_sequences',
];

async function fetchTable(table) {
  const { data, error } = await supabase.from(table).select('*');
  if (error) {
    console.warn(`  ${table}: ${error.message}`);
    return [];
  }
  return data || [];
}

async function main() {
  const outDir = path.join(__dirname, '..', 'supabase-export');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const all = {};
  const exportedAt = new Date().toISOString();

  for (const table of TABLES) {
    process.stdout.write(`Exporting ${table}... `);
    const rows = await fetchTable(table);
    all[table] = rows;
    const jsonPath = path.join(outDir, `${table}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2), 'utf8');
    console.log(`${rows.length} rows → ${table}.json`);
  }

  all._meta = { exportedAt, tables: TABLES };
  fs.writeFileSync(
    path.join(outDir, 'all.json'),
    JSON.stringify(all, null, 2),
    'utf8'
  );
  console.log(`\n전체 통합본: supabase-export/all.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
