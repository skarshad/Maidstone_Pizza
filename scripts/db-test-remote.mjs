// Runs the pgTAP files in supabase/tests against the linked Supabase project
// without Docker (`supabase test db` needs Docker for pg_prove).
//
// Each file must start with `begin;` and end with `select * from finish(); rollback;`.
// The ending is swapped for a block that raises an error carrying the results,
// so the whole run is always rolled back and nothing is left behind.
//
//   pnpm db:test:remote              test the database as it is now
//   pnpm db:test:remote --pending    also apply not-yet-pushed migrations inside
//                                    the same rolled-back transaction, to check a
//                                    new migration before running pnpm db:push
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEST_DIR = process.env.DB_TEST_DIR ?? 'supabase/tests';
const MIGRATIONS_DIR = 'supabase/migrations';
const withPending = process.argv.includes('--pending');

const START = /^\s*(?:--[^\n]*\n\s*)*begin;/i;
const ENDING = /select \* from finish\(\);\s*rollback;\s*$/;
const ASSERTION = /^select (?=[a-z_]+\()(?!plan\()/gm;

const COLLECT = `
create temp table _tap (n serial, line text);
grant all on _tap to public;
grant all on sequence _tap_n_seq to public;
`;
const REPORT = `
reset role;
do $report$
declare r text;
begin
  select 'TAPRESULT ran=' || (select count(*) from _tap)
      || ' failed=' || num_failed()
      || ' :: ' || coalesce((select string_agg(f, ' / ') from finish() f), 'complete')
      || ' :: ' || coalesce(
           (select string_agg(replace(line, E'\\n', ' '), ' / ' order by n) from _tap where line like 'not ok%'),
           '')
    into r;
  raise exception '%', r;
end
$report$;
`;

function supabase(args) {
  try {
    return execFileSync('supabase', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
  } catch (error) {
    return `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
}

function pendingMigrations() {
  const out = supabase(['migration', 'list', '--remote', '--output-format', 'json']);
  const json = JSON.parse(out.slice(out.indexOf('{')));
  const pending = json.migrations.filter((m) => m.local && !m.remote).map((m) => m.local);
  const files = readdirSync(MIGRATIONS_DIR).sort();
  return pending.map((version) => {
    const file = files.find((f) => f.startsWith(version));
    if (!file) throw new Error(`No migration file for version ${version}`);
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    if (/^\s*(commit|begin)\s*;/im.test(sql)) {
      throw new Error(`${file} manages its own transaction; cannot dry-run it safely`);
    }
    return { file, sql };
  });
}

const pending = withPending ? pendingMigrations() : [];
if (withPending) {
  console.log(
    pending.length
      ? `Dry-running ${pending.map((p) => p.file).join(', ')} (rolled back afterwards)`
      : 'No pending migrations.',
  );
}

const files = readdirSync(TEST_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();
const work = mkdtempSync(join(tmpdir(), 'mp-dbtest-'));
let failed = false;

try {
  for (const file of files) {
    const sql = readFileSync(join(TEST_DIR, file), 'utf8');
    if (!START.test(sql) || !ENDING.test(sql)) {
      console.error(`${file}: must start with "begin;" and end with finish() + rollback`);
      failed = true;
      continue;
    }
    const planned = Number(/select plan\((\d+)\)/.exec(sql)?.[1]);
    const body = sql
      .replace(START, '')
      .replace(ENDING, '')
      .replace(ASSERTION, 'insert into _tap (line) select ');
    const target = join(work, file);
    writeFileSync(
      target,
      ['begin;', ...pending.map((p) => p.sql), COLLECT, body, REPORT].join('\n'),
    );

    const output = supabase(['db', 'query', '--remote', '--yes', '-f', target]);
    const match = output.match(
      /TAPRESULT ran=(\d+) failed=(\d+) :: (.*?) :: (.*?)(\\\\n|\\n|\n|$)/,
    );
    if (!match) {
      failed = true;
      console.error(`${file}: did not finish\n${output.trim().slice(0, 3000)}`);
      continue;
    }
    const [, ran, failures, summary, detail] = match;
    if (failures !== '0' || summary !== 'complete' || Number(ran) !== planned) {
      failed = true;
      console.error(`${file}: FAILED (${failures} failing, ran ${ran} of ${planned}) ${summary}`);
      for (const line of detail.split(' / ').filter(Boolean)) console.error(`  ${line}`);
    } else {
      console.log(`${file}: ok (${ran} tests)`);
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
