import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { sleep } from '../processes.ts';
import type { ComputerName } from '../paths.ts';
import type { Context } from './recovery-runner.ts';
import { LOCK_TOOL } from './two-scripts.ts';
import {
  HOLD_CHECK_MS,
  finished,
  script,
  seedShared,
  setup,
  teardown,
  touch,
  waitFile,
  type Setup,
} from './two-support.ts';
import { capture, mountPath } from './workloads-shared.ts';

export type LockKind = 'posix' | 'flock';
type LockMode = 'ex' | 'sh';

interface Held {
  readonly prepared: Setup;
  readonly kind: LockKind;
  readonly file: (name: ComputerName) => string;
}

async function attempt(held: Held, name: ComputerName, wanted: LockMode): Promise<string> {
  const output = await capture(held.prepared.state.computers[name], `lock attempt on ${name}`, [
    'python3',
    '-I',
    '-c',
    LOCK_TOOL,
    'try',
    held.file(name),
    held.kind,
    wanted,
  ]);
  return output.trim();
}

async function expectAttempt(
  held: Held,
  wanted: LockMode,
  expected: string,
  because: string,
): Promise<void> {
  const result = await attempt(held, 'B', wanted);
  if (result !== expected) throw new Error(`B got ${result} ${because}, expected ${expected}.`);
}

async function exclusiveBlocks(
  held: Held,
  release: string,
  holder: ReturnType<typeof script>,
): Promise<void> {
  const { state, signals } = held.prepared;
  await expectAttempt(held, 'ex', 'EAGAIN', 'while A holds the exclusive lock');
  const waiting = join(signals, 'waiting');
  const acquired = join(signals, 'acquired');
  const waiter = script(state, 'B', LOCK_TOOL, [
    'wait',
    held.file('B'),
    held.kind,
    'ex',
    waiting,
    acquired,
  ]);
  await waitFile(waiting);
  await sleep(HOLD_CHECK_MS);
  if (existsSync(acquired)) throw new Error('B acquired the lock while A still held it.');
  await touch(release);
  await finished('the lock holder on A', holder);
  await waitFile(acquired);
  await finished('the lock waiter on B', waiter);
}

async function sharedCoexists(
  held: Held,
  release: string,
  holder: ReturnType<typeof script>,
): Promise<void> {
  await expectAttempt(held, 'sh', 'ACQUIRED', 'for a shared lock beside a shared lock');
  await expectAttempt(held, 'ex', 'EAGAIN', 'for an exclusive lock beside a shared lock');
  await touch(release);
  await finished('the lock holder on A', holder);
}

export async function lockCase(kind: LockKind, mode: LockMode, context: Context): Promise<void> {
  const prepared = await setup(context, `lock-${kind}-${mode}`);
  const { state, relative, signals } = prepared;
  await seedShared(prepared, 'lock.dat', Buffer.from('lock me\n'));
  const held: Held = {
    prepared,
    kind,
    file: (name) => mountPath(name, relative, 'lock.dat'),
  };
  const ready = join(signals, 'held');
  const release = join(signals, 'release');
  const holder = script(state, 'A', LOCK_TOOL, [
    'hold',
    held.file('A'),
    kind,
    mode,
    ready,
    release,
  ]);
  await waitFile(ready);
  if (mode === 'sh') await sharedCoexists(held, release, holder);
  else await exclusiveBlocks(held, release, holder);
  await teardown(prepared);
}
