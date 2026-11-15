import { join } from 'node:path';
import { netcutCommand, sendControl } from '../helper.ts';
import { compare, ok, summary } from '../manifest.ts';
import { routeLine } from '../mounting.ts';
import { files, type ComputerName, type RigState, type RouteChoice } from '../paths.ts';
import { sleep } from '../processes.ts';
import type { Fixture } from './recovery-fixtures.ts';
import { inside, walkMounted, withTimeout, type Outcome, type Running } from './recovery-inside.ts';
import { allocatedBytes, countFiles } from './recovery-probe.ts';
import { hubReport, hubSnapshot, settle } from './recovery-settle.ts';

export const POLL_MS = 50;
export const PROGRESS_IDLE_MS = 120_000;
export const SETTLE_IDLE_MS = 180_000;
export const SETTLE_GRACE_MS = 5000;
export const WRITER_LIMIT_MS = 600_000;

export interface Delivery {
  readonly fixture: Fixture;
  readonly folder: string;
  readonly mountDir: string;
  readonly hubDir: string;
  readonly baseline: number;
}

export async function net(command: string): Promise<void> {
  const reply = await netcutCommand(command);
  if (!reply.startsWith('ok')) throw new Error(`netcut answered "${reply}" to "${command}"`);
}

export async function setRoute(
  state: RigState,
  name: ComputerName,
  target: RouteChoice,
): Promise<void> {
  await sendControl(name, routeLine(state, name, target));
}

export async function prepareDelivery(
  state: RigState,
  fixture: Fixture,
  folder: string,
): Promise<Delivery> {
  const mountDir = join(files.mountPoint('A'), folder);
  const made = await inside(state.computers.A, ['mkdir', '-p', mountDir]).done;
  if (made.code !== 0) throw new Error(`mkdir ${mountDir} failed: ${made.stderr.trim()}`);
  return {
    fixture,
    folder,
    mountDir,
    hubDir: join(state.driveFolders.test, folder),
    baseline: await allocatedBytes(files.data),
  };
}

export function startWriter(state: RigState, delivery: Delivery): Running {
  const { fixture, mountDir } = delivery;
  const command =
    fixture.name === 'big'
      ? ['cp', join(fixture.directory, 'big.bin'), join(mountDir, 'big.bin')]
      : ['cp', '-r', `${fixture.directory}/.`, `${mountDir}/`];
  return inside(state.computers.A, command);
}

async function progressNow(delivery: Delivery): Promise<number> {
  if (delivery.fixture.name === 'big')
    return (await allocatedBytes(files.data)) - delivery.baseline;
  return countFiles(delivery.hubDir);
}

export function progressTarget(delivery: Delivery, fraction: number): number {
  const total = delivery.fixture.name === 'big' ? delivery.fixture.bytes : delivery.fixture.files;
  return Math.ceil(total * fraction);
}

export async function awaitProgress(delivery: Delivery, fraction: number): Promise<void> {
  const target = progressTarget(delivery, fraction);
  let best = -1;
  let changedAt = Date.now();
  for (;;) {
    const now = await progressNow(delivery);
    if (now >= target) break;
    if (now !== best) {
      best = now;
      changedAt = Date.now();
    }
    if (Date.now() - changedAt > PROGRESS_IDLE_MS)
      throw new Error(
        `The upload made no progress for ${String(PROGRESS_IDLE_MS)} ms at ${String(now)} of ${String(target)}.`,
      );
    await sleep(POLL_MS);
  }
  const snapshot = await hubSnapshot(delivery.hubDir, delivery.fixture.entries);
  if (snapshot.complete)
    throw new Error('The upload finished before the disturbance, so the case did not exercise it.');
}

export async function awaitHubComplete(delivery: Delivery): Promise<void> {
  let best = -1;
  let changedAt = Date.now();
  for (;;) {
    const snapshot = await hubSnapshot(delivery.hubDir, delivery.fixture.entries);
    if (snapshot.complete) return;
    if (snapshot.bytes !== best) {
      best = snapshot.bytes;
      changedAt = Date.now();
    }
    if (Date.now() - changedAt > PROGRESS_IDLE_MS)
      throw new Error('The Hub did not receive the whole upload while replies were lost.');
    await sleep(POLL_MS);
  }
}

export async function finishWriter(what: string, writer: Running): Promise<Outcome> {
  const outcome = await withTimeout(what, writer.done, WRITER_LIMIT_MS);
  if (outcome.code !== 0)
    throw new Error(`${what} exited ${String(outcome.code)}: ${outcome.stderr.trim()}`);
  return outcome;
}

export async function verifyDelivered(state: RigState, delivery: Delivery): Promise<void> {
  const { fixture, hubDir, mountDir } = delivery;
  const report = await settle(
    {
      snapshot: () => hubSnapshot(hubDir, fixture.entries),
      verify: () => hubReport(hubDir, fixture.entries),
      sleep,
      now: Date.now,
    },
    { idleMs: SETTLE_IDLE_MS, graceMs: SETTLE_GRACE_MS, pollMs: 500 },
  );
  if (!ok(report)) throw new Error(`The Hub holds a different tree:\n${summary(report)}`);
  const viewed = compare(fixture.entries, await walkMounted(state.computers.A, mountDir), {
    modes: false,
  });
  if (!ok(viewed)) throw new Error(`The mount shows a different tree:\n${summary(viewed)}`);
}

export async function restoreNetwork(name: ComputerName): Promise<void> {
  await net(`restore ${name}`);
}
