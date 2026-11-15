import { spawn } from 'node:child_process';
import { execPath } from 'node:process';
import { join } from 'node:path';
import { z } from 'zod';
import { ENTRY, type Entry } from '../manifest.ts';
import { REPO, RIG, type ComputerState } from '../paths.ts';
import { alive } from '../processes.ts';

export interface Outcome {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface Running {
  readonly pid: number;
  readonly done: Promise<Outcome>;
}

export function inside(
  computer: ComputerState,
  command: readonly string[],
  options: { readonly cwd?: string } = {},
): Running {
  const pid = computer.helperPid;
  if (pid === null || !alive(pid))
    throw new Error('The helper is not running, so there is no namespace to enter.');
  const child = spawn(
    'nsenter',
    [
      '--target',
      String(pid),
      '--user',
      '--mount',
      '--pid',
      ...(options.cwd === undefined ? [] : [`--wd=${options.cwd}`]),
      '--',
      ...command,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (child.pid === undefined) throw new Error('nsenter did not start');
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString('utf8');
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });
  const done = new Promise<Outcome>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      resolve({ code: code ?? (signal === null ? 1 : 128), stdout, stderr });
    });
  });
  return { pid: child.pid, done };
}

export function describeFailure(what: string, outcome: Outcome): string {
  return `${what} exited ${String(outcome.code)}: ${outcome.stderr.trim()}`;
}

export async function mustSucceed(what: string, running: Running): Promise<Outcome> {
  const outcome = await running.done;
  if (outcome.code !== 0) throw new Error(describeFailure(what, outcome));
  return outcome;
}

export async function walkMounted(
  computer: ComputerState,
  folder: string,
): Promise<readonly Entry[]> {
  const outcome = await mustSucceed(
    `walking ${folder} through the mount`,
    inside(computer, [execPath, '--import', 'tsx', join(RIG, 'rig.ts'), 'walk', folder], {
      cwd: REPO,
    }),
  );
  return z.array(ENTRY).parse(JSON.parse(outcome.stdout));
}

export async function withTimeout<T>(what: string, work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timed out after ${String(ms)} ms waiting for ${what}.`));
    }, ms);
  });
  try {
    return await Promise.race([work, expired]);
  } finally {
    clearTimeout(timer);
  }
}
