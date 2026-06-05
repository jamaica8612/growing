import { createWriteStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const logPath = join(tmpdir(), 'growing-verify-quiet.log');
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
writeFileSync(logPath, '', 'utf8');
const log = createWriteStream(logPath, { flags: 'w' });
let activeChild = null;

function tailLog(maxLines = 80) {
  if (!existsSync(logPath)) return '';
  return readFileSync(logPath, 'utf8').split(/\r?\n/).slice(-maxLines).join('\n');
}

function stopActiveChild() {
  if (!activeChild || activeChild.killed) return;
  if (process.platform === 'win32' && activeChild.pid) {
    spawn('taskkill', ['/PID', String(activeChild.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }
  activeChild.kill('SIGTERM');
  setTimeout(() => {
    if (activeChild && !activeChild.killed) activeChild.kill('SIGKILL');
  }, 1500).unref();
}

process.on('SIGINT', () => {
  stopActiveChild();
  process.exit(130);
});

process.on('SIGTERM', () => {
  stopActiveChild();
  process.exit(143);
});

function runScript(name) {
  return new Promise((resolve, reject) => {
    log.write(`\n> npm run ${name}\n\n`);
    const child = process.platform === 'win32'
      ? spawn('cmd.exe', ['/d', '/s', '/c', `${npmBin} run ${name} --silent`], {
        env: { ...process.env, FORCE_COLOR: '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
      : spawn(npmBin, ['run', name, '--silent'], {
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    activeChild = child;
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on('error', reject);
    child.on('close', code => {
      activeChild = null;
      if (code === 0) resolve();
      else reject(new Error(`${name} failed with exit code ${code}`));
    });
  });
}

try {
  await runScript('lint');
  await runScript('build');
  log.end();
  console.log('verify:ok');
} catch (error) {
  log.end();
  console.error('verify:failed');
  console.error(error instanceof Error ? error.message : String(error));
  const tail = tailLog();
  if (tail) console.error(tail);
  process.exit(1);
}
