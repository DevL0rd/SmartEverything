import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';

export const ROOT = dirname(dirname(import.meta.dirname));
export const GIT_MS = 10_000;
export const ESLINT_MS = 100_000;
export const SMALL_TOOL_MS = 30_000;
export const PROJECT_TSC_MS = 100_000;
export const WORKSPACE_TSC_MS = 270_000;
export const INSTALL_LOCK = '/tmp/smarteverything-install.lock';
export const INSTALL_TURNSTILE = '/tmp/smarteverything-install.turnstile';
const TESTS_LOCK = '/tmp/smarteverything-tests.lock';
export const TESTS_MS = 20_000;
export const TESTS_LOCK_WAIT_MS = 40_000;
const LOCK_BUSY = 75;
const TIMEOUT_EXITS = new Set([124, 137]);

export interface Run {
  readonly code: number | null;
  readonly timedOut: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly detail: string;
}

function bin(name: string): string {
  return join(ROOT, 'node_modules', '.bin', name);
}

export function run(file: string, args: readonly string[], timeoutMs: number): Promise<Run> {
  const options = { cwd: ROOT, timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024 };
  return new Promise((done) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      const code = error === null ? 0 : typeof error.code === 'number' ? error.code : null;
      const detail = error === null ? '' : error.message;
      done({ code, timedOut: error?.killed === true, stdout, stderr, detail });
    });
  });
}

export async function runTool(
  name: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<Run> {
  const deadline = Date.now() + timeoutMs;
  const turnstile = await run('flock', ['-x', INSTALL_TURNSTILE, 'true'], timeoutMs);
  if (turnstile.code !== 0) return turnstile;
  const left = deadline - Date.now();
  if (left <= 0) return { ...turnstile, code: null, timedOut: true, detail: 'install lock wait' };
  return run('flock', ['-s', INSTALL_LOCK, bin(name), ...args], left);
}

export function workspaceTsc(): Promise<Run> {
  return runTool('tsc', ['-b', '--pretty', 'false'], WORKSPACE_TSC_MS);
}

export function nonEmptyLines(output: string): string[] {
  return output.split('\n').filter((line) => line.trim() !== '');
}

export interface VitestRun extends Run {
  readonly outcome: 'finished' | 'timed-out' | 'lock-busy';
}

function finished(result: Run): VitestRun {
  const slow = result.timedOut || (result.code !== null && TIMEOUT_EXITS.has(result.code));
  if (result.code === LOCK_BUSY) return { ...result, outcome: 'lock-busy' };
  return { ...result, outcome: slow ? 'timed-out' : 'finished' };
}

export async function runVitest(
  args: readonly string[],
  env: readonly string[] = [],
): Promise<VitestRun> {
  const waitMs = TESTS_LOCK_WAIT_MS;
  const turnstile = await run(
    'flock',
    ['-w', String(waitMs / 1000), '-x', INSTALL_TURNSTILE, 'true'],
    waitMs + 5000,
  );
  if (turnstile.code !== 0) return { ...turnstile, outcome: 'lock-busy' };
  const wait = ['-w', String(waitMs / 1000), '-E', String(LOCK_BUSY)];
  const limit = ['-k', '3', String(TESTS_MS / 1000)];
  const tests = ['env', ...env, bin('vitest'), ...args];
  const installed = ['flock', ...wait, '-s', INSTALL_LOCK, 'timeout', ...limit, ...tests];
  const full = [...wait, '-x', TESTS_LOCK, ...installed];
  return finished(await run('flock', full, waitMs * 2 + TESTS_MS + 10_000));
}
