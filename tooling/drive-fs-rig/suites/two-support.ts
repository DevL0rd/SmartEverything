import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isMissing } from '../errors.ts';
import { netcutCommand } from '../helper.ts';
import type { ComputerName, RigState } from '../paths.ts';
import { inside, withTimeout, type Running } from './recovery-inside.ts';
import type { Context } from './recovery-runner.ts';
import { ensureMounted } from './recovery-standin.ts';
import { conflictPair } from './two-checks.ts';
import {
  CACHE,
  awaitHub,
  awaitView,
  entryOf,
  hubPath,
  mountPath,
  mustRun,
  pollUntil,
  removeAndConfirm,
  sha256Of,
} from './workloads-shared.ts';

export const SCRIPT_LIMIT_MS = 300_000;
const SIGNAL_LIMIT_MS = 120_000;
export const VISIBLE_LIMIT_MS = 120_000;
export const HUB_LIMIT_MS = 180_000;
export const OFFLINE_SETTLE_MS = 3000;
export const HOLD_CHECK_MS = 3000;
export const ROWS_PER_COMPUTER = 200;
export const PEERS: readonly ComputerName[] = ['A', 'B'];

export interface Setup {
  readonly state: RigState;
  readonly relative: string;
  readonly signals: string;
}

export async function ensureBoth(): Promise<RigState> {
  await ensureMounted('A');
  return ensureMounted('B');
}

export async function setup(context: Context, suffix: string): Promise<Setup> {
  const state = await ensureBoth();
  const relative = join('two', `${context.token}-${suffix}`);
  const signals = join(CACHE, 'two', `${context.token}-${suffix}`);
  await mkdir(signals, { recursive: true });
  await mustRun(state.computers.A, `creating ${relative}`, [
    'mkdir',
    '-p',
    mountPath('A', relative),
  ]);
  await pollUntil(
    `B to see ${relative}`,
    async () =>
      (await inside(state.computers.B, ['test', '-d', mountPath('B', relative)]).done).code === 0,
    VISIBLE_LIMIT_MS,
  );
  return { state, relative, signals };
}

export async function teardown(prepared: Setup): Promise<void> {
  await removeAndConfirm(prepared.state, 'A', prepared.relative);
  await rm(prepared.signals, { recursive: true, force: true });
}

export async function source(
  prepared: Setup,
  name: string,
  content: Buffer | string,
): Promise<string> {
  const path = join(prepared.signals, name);
  await writeFile(path, content);
  return path;
}

export async function touch(path: string): Promise<void> {
  await writeFile(path, '');
}

export async function waitFile(path: string): Promise<void> {
  await pollUntil(`${path} to appear`, () => Promise.resolve(existsSync(path)), SIGNAL_LIMIT_MS);
}

export function script(
  state: RigState,
  name: ComputerName,
  program: string,
  args: readonly string[],
): Running {
  return inside(state.computers[name], ['python3', '-I', '-c', program, ...args]);
}

export async function finished(what: string, running: Running): Promise<string> {
  const outcome = await withTimeout(what, running.done, SCRIPT_LIMIT_MS);
  if (outcome.code !== 0)
    throw new Error(`${what} exited ${String(outcome.code)}: ${outcome.stderr.trim()}`);
  return outcome.stdout;
}

async function matches(
  state: RigState,
  name: ComputerName,
  file: string,
  reference: string,
): Promise<boolean> {
  return (await inside(state.computers[name], ['cmp', '-s', reference, file]).done).code === 0;
}

export async function sees(
  state: RigState,
  name: ComputerName,
  file: string,
  reference: string,
): Promise<number> {
  return pollUntil(
    `${name} to show ${file} with the written content`,
    () => matches(state, name, file, reference),
    VISIBLE_LIMIT_MS,
  );
}

export async function hubHas(file: string, content: Buffer): Promise<boolean> {
  try {
    return sha256Of(await readFile(file)) === sha256Of(content);
  } catch (cause) {
    if (isMissing(cause)) return false;
    throw cause;
  }
}

export async function seedShared(
  prepared: Setup,
  fileName: string,
  content: Buffer,
): Promise<void> {
  const reference = await source(prepared, `seed-${fileName}`, content);
  await mustRun(prepared.state.computers.A, `seeding ${fileName}`, [
    'cp',
    reference,
    mountPath('A', prepared.relative, fileName),
  ]);
  await sees(prepared.state, 'B', mountPath('B', prepared.relative, fileName), reference);
}

export async function netcut(command: string): Promise<void> {
  const reply = await netcutCommand(command);
  if (!reply.startsWith('ok')) throw new Error(`netcut answered "${reply}" to "${command}"`);
}

export async function expectConflict(
  prepared: Setup,
  fileName: string,
  winner: Buffer,
  loser: Buffer,
): Promise<void> {
  const directory = hubPath(prepared.state, prepared.relative);
  await pollUntil(
    `the Hub to hold ${fileName} and a conflict copy`,
    async () => (await readdir(directory)).length >= 2,
    HUB_LIMIT_MS,
  );
  const pair = conflictPair(await readdir(directory), fileName);
  await pollUntil(
    'the Hub to settle on the winner and the conflict copy',
    async () =>
      (await hubHas(join(directory, pair.original), winner)) &&
      (await hubHas(join(directory, pair.conflict), loser)),
    HUB_LIMIT_MS,
  );
  const expected = [entryOf(pair.original, winner), entryOf(pair.conflict, loser)];
  await awaitHub(prepared.state, prepared.relative, expected);
  for (const name of PEERS) await awaitView(prepared.state, name, prepared.relative, expected);
}
