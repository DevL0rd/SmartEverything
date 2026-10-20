import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { env as processEnv } from 'node:process';

export const ROOT = dirname(dirname(import.meta.dirname));
export const GIT_MS = 10_000;
export const ESLINT_MS = 100_000;
export const SMALL_TOOL_MS = 30_000;
export const PROJECT_TSC_MS = 100_000;
export const WORKSPACE_TSC_MS = 240_000;
export const TESTS_MS = 240_000;
export const GATE_WAIT_MS = 30_000;
export const HEAP_MB = 6144;
export const VITEST_WORKERS = 4;
export const INSTALL_LOCK = '/tmp/smarteverything-install.lock';
export const INSTALL_TURNSTILE = '/tmp/smarteverything-install.turnstile';
const LOW_PRIORITY = ['-n', '19', 'ionice', '-c3'] as const;
const BUSY_EXIT = 200;
const COALESCED_EXIT = 201;
const KILL_GRACE_MS = 3000;
const BACKSTOP_MS = 5000;
const TIMEOUT_EXITS = new Set([124, 137]);
const SIGNALS = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 };
const GATED = new Set(['tsc', 'vitest', 'eslint']);
const HEAP_CAPPED = new Set(['tsc', 'eslint']);

export interface Run {
  readonly code: number | null;
  readonly timedOut: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly detail: string;
  readonly skipped?: string;
}

const live = new Set<ChildProcess>();
let guarded = false;

function bin(name: string): string {
  return join(ROOT, 'node_modules', '.bin', name);
}

export function gateDir(): string {
  const dir = processEnv['HOOK_GATE_DIR'] ?? `/tmp/claude-${String(process.getuid?.() ?? 0)}`;
  mkdirSync(dir, { recursive: true });
  return dir;
}

function killGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') throw error;
  }
}

function guardExit(): void {
  if (guarded) return;
  guarded = true;
  for (const [signal, number] of Object.entries(SIGNALS)) {
    process.once(signal, () => {
      for (const child of live) killGroup(child, 'SIGKILL');
      process.exit(128 + number);
    });
  }
}

export function run(
  file: string,
  args: readonly string[],
  timeoutMs: number,
  env: NodeJS.ProcessEnv = processEnv,
): Promise<Run> {
  guardExit();
  return new Promise((done) => {
    const child = spawn(file, args, { cwd: ROOT, env, detached: true });
    live.add(child);
    let stdout = '';
    let stderr = '';
    let slow = false;
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    let hardKill: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => {
      slow = true;
      killGroup(child, 'SIGTERM');
      hardKill = setTimeout(() => {
        killGroup(child, 'SIGKILL');
      }, KILL_GRACE_MS);
    }, timeoutMs);
    const finish = (code: number | null, detail: string): void => {
      clearTimeout(timer);
      clearTimeout(hardKill);
      if (slow) killGroup(child, 'SIGKILL');
      live.delete(child);
      const exited = code !== null && TIMEOUT_EXITS.has(code);
      done({ code, timedOut: slow || exited, stdout, stderr, detail });
    };
    child.once('error', (error) => {
      finish(null, error.message);
    });
    child.once('close', (code, signal) => {
      finish(code, signal === null ? '' : `signal ${signal}`);
    });
  });
}

function lowPriority(
  file: string,
  args: readonly string[],
  timeoutMs: number,
  env: NodeJS.ProcessEnv,
): Promise<Run> {
  return run('nice', [...LOW_PRIORITY, file, ...args], timeoutMs, env);
}

function toolEnv(name: string): NodeJS.ProcessEnv {
  if (!HEAP_CAPPED.has(name)) return processEnv;
  const heap = `--max-old-space-size=${String(HEAP_MB)}`;
  return { ...processEnv, NODE_OPTIONS: [processEnv['NODE_OPTIONS'], heap].join(' ').trim() };
}

function queueLock(name: string, args: readonly string[]): string {
  const digest = createHash('sha1')
    .update(JSON.stringify([name, args]))
    .digest('hex');
  return join(gateDir(), `hook-queue-${name}-${digest.slice(0, 12)}.lock`);
}

export interface Gated {
  readonly name: string;
  readonly binary: string;
  readonly args: readonly string[];
  readonly timeoutMs: number;
  readonly backstopMs: number;
  readonly waitMs?: number;
}

function gatedCommand(spec: Gated, waitMs: number): string[] {
  const { name, binary, args, timeoutMs } = spec;
  const limit = ['timeout', '-k', '3', String(Math.ceil(timeoutMs / 1000)), binary, ...args];
  const lock = join(gateDir(), `${name}.lock`);
  const gate = ['flock', '-x', '-w', String(waitMs / 1000), '-E', String(BUSY_EXIT), lock];
  const queue = ['-n', '-E', String(COALESCED_EXIT), queueLock(name, args)];
  return [...queue, 'flock', '-s', INSTALL_LOCK, ...gate, ...limit];
}

function skip(name: string, result: Run, waitMs: number): Run {
  if (result.code === COALESCED_EXIT) {
    const why = `an identical ${name} check is already queued or running`;
    return { ...result, code: null, skipped: why };
  }
  if (result.code === BUSY_EXIT) {
    const why = `another ${name} check is running and the gate stayed busy for ${String(waitMs / 1000)} s`;
    return { ...result, code: null, skipped: why };
  }
  return result;
}

export async function runGated(spec: Gated): Promise<Run> {
  const waitMs = spec.waitMs ?? GATE_WAIT_MS;
  const command = gatedCommand(spec, waitMs);
  const result = await lowPriority('flock', command, spec.backstopMs, toolEnv(spec.name));
  return skip(spec.name, result, waitMs);
}

export async function runTool(
  name: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<Run> {
  const gated = GATED.has(name);
  const budget = timeoutMs + (gated ? GATE_WAIT_MS : 0) + BACKSTOP_MS;
  const deadline = Date.now() + budget;
  const turnstile = await run('flock', ['-x', INSTALL_TURNSTILE, 'true'], budget);
  if (turnstile.code !== 0) return turnstile;
  const left = deadline - Date.now();
  if (left <= 0) return { ...turnstile, code: null, timedOut: true, detail: 'install lock wait' };
  if (gated) return runGated({ name, binary: bin(name), args, timeoutMs, backstopMs: left });
  const limit = ['-k', '3', String(Math.ceil(left / 1000))];
  const command = ['-s', INSTALL_LOCK, 'timeout', ...limit, bin(name), ...args];
  return lowPriority('flock', command, left + 5000, processEnv);
}

export function projectsTsc(projects: readonly string[]): Promise<Run> {
  return runTool('tsc', ['-b', ...projects, '--pretty', 'false'], WORKSPACE_TSC_MS);
}

export function workspaceTsc(): Promise<Run> {
  return projectsTsc([]);
}

export function nonEmptyLines(output: string): string[] {
  return output.split('\n').filter((line) => line.trim() !== '');
}
