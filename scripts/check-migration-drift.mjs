import { spawnSync } from 'node:child_process';

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(
  npx,
  ['supabase', 'migration', 'list', '--linked', '--output-format', 'json'],
  {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  },
);

if (result.error) {
  process.stderr.write(`Failed to run Supabase CLI: ${result.error.message}\n`);
  process.exit(1);
}

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'Failed to inspect linked migrations.\n');
  process.exit(result.status ?? 1);
}

let payload;
try {
  payload = JSON.parse(result.stdout);
} catch {
  process.stderr.write('Supabase CLI returned an unreadable migration list.\n');
  process.exit(1);
}

const migrations = Array.isArray(payload.migrations) ? payload.migrations : [];
const localOnly = migrations.filter(row => row.local && !row.remote);
const remoteOnly = migrations.filter(row => row.remote && !row.local);
const mismatched = migrations.filter(
  row => row.local && row.remote && row.local !== row.remote,
);

if (localOnly.length || remoteOnly.length || mismatched.length) {
  process.stderr.write(
    [
      'Migration drift detected. Do not run `supabase db push`.',
      `Local only: ${localOnly.length}`,
      `Remote only: ${remoteOnly.length}`,
      `Mismatched rows: ${mismatched.length}`,
      'Reconcile the linked production history before applying database changes.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

process.stdout.write(`Migration histories match (${migrations.length} rows).\n`);
