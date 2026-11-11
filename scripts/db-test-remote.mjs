// Runs the pgTAP files in supabase/tests against the linked Supabase project
// without Docker (`supabase test db` needs Docker for pg_prove).
//
// Each file must start a transaction and end with `select * from finish(); rollback;`.
// The ending is swapped for a block that raises an error carrying the pgTAP
// summary, so the whole run is always rolled back and nothing is left behind.
//
// Only reports the failure count and pgTAP diagnostics, not each test line.
// Use `pnpm db:test` (Docker) or CI for full TAP output.
//
//   pnpm db:test:remote
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEST_DIR = process.env.DB_TEST_DIR ?? 'supabase/tests';
const ENDING = /select \* from finish\(\);\s*rollback;\s*$/;
const REPORT = `
reset role;
do $report$
declare r text;
begin
  select 'TAPRESULT failed=' || num_failed() || ' | ' ||
         coalesce((select string_agg(f, ' | ') from finish() f), 'complete')
    into r;
  raise exception '%', r;
end
$report$;
`;

const files = readdirSync(TEST_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();
const work = mkdtempSync(join(tmpdir(), 'mp-dbtest-'));
let failed = false;

try {
  for (const file of files) {
    const sql = readFileSync(join(TEST_DIR, file), 'utf8');
    if (!/^\s*(--[^\n]*\n\s*)*begin;/i.test(sql) || !ENDING.test(sql)) {
      console.error(`${file}: must start with "begin;" and end with finish() + rollback`);
      failed = true;
      continue;
    }
    const target = join(work, file);
    writeFileSync(target, sql.replace(ENDING, '') + REPORT);

    let output = '';
    try {
      output = execFileSync('supabase', ['db', 'query', '--remote', '--yes', '-f', target], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      });
    } catch (error) {
      output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    }

    const match = output.match(/TAPRESULT failed=(\d+) \| (.*?)(\\\\n|\\n|\n|$)/);
    if (!match) {
      failed = true;
      console.error(`${file}: did not finish\n${output.trim()}`);
    } else if (match[1] !== '0' || match[2] !== 'complete') {
      failed = true;
      console.error(`${file}: FAILED (${match[1]} failing) ${match[2]}`);
    } else {
      console.log(`${file}: ok`);
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
