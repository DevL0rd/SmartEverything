import { join } from 'node:path';
import { SCRATCH, type ComputerName, type RigState } from '../paths.ts';
import { sleep } from '../processes.ts';
import { buildBatch, buildBig, type Fixture } from './recovery-fixtures.ts';
import { inside, mustSucceed, type Running } from './recovery-inside.ts';
import { runSuite, type Context, type SuiteCase } from './recovery-runner.ts';
import {
  awaitHelperExit,
  crashHelper,
  ensureMounted,
  killStandin,
  restartKeepingJournal,
} from './recovery-standin.ts';
import {
  awaitHubComplete,
  awaitProgress,
  finishWriter,
  net,
  prepareDelivery,
  restoreNetwork,
  setRoute,
  startWriter,
  verifyDelivered,
  type Delivery,
} from './recovery-steps.ts';

const COMPUTER: ComputerName = 'A';
const LEASE_MS = 90_000;
const BEYOND_LEASE_SECONDS = LEASE_MS / 1000 + 10;
const REPLY_LOSS_HOLD_MS = 3000;
const OFFLINE_SETTLE_MS = 2000;

export type Workload = 'big' | 'batch';
export type Timing = 'plain' | 'switching';

export type Disturbance =
  | { readonly kind: 'kill-helper' }
  | { readonly kind: 'kill-desktop' }
  | { readonly kind: 'cut' | 'reset'; readonly seconds: number }
  | { readonly kind: 'reply-loss' }
  | { readonly kind: 'reboot-after-fsync' };

export interface CaseSpec {
  readonly name: string;
  readonly workload: Workload;
  readonly timing: Timing;
  readonly disturbance: Disturbance;
}

const WORKLOADS: readonly Workload[] = ['big', 'batch'];
const TIMINGS: readonly Timing[] = ['plain', 'switching'];

const DISTURBANCES: readonly Disturbance[] = [
  { kind: 'kill-helper' },
  { kind: 'kill-desktop' },
  { kind: 'cut', seconds: 5 },
  { kind: 'cut', seconds: 60 },
  { kind: 'cut', seconds: BEYOND_LEASE_SECONDS },
  { kind: 'reset', seconds: 5 },
  { kind: 'reset', seconds: 60 },
  { kind: 'reset', seconds: BEYOND_LEASE_SECONDS },
  { kind: 'reply-loss' },
];

export function disturbanceName(disturbance: Disturbance): string {
  if (disturbance.kind === 'cut' || disturbance.kind === 'reset')
    return `${disturbance.kind}-${String(disturbance.seconds)}s`;
  return disturbance.kind;
}

export function caseMatrix(): readonly CaseSpec[] {
  const specs: CaseSpec[] = [];
  for (const workload of WORKLOADS) {
    for (const disturbance of DISTURBANCES) {
      for (const timing of TIMINGS) {
        specs.push({
          name: `${workload}/${disturbanceName(disturbance)}/${timing}`,
          workload,
          timing,
          disturbance,
        });
      }
    }
    const reboot: Disturbance = { kind: 'reboot-after-fsync' };
    specs.push({
      name: `${workload}/${disturbanceName(reboot)}/plain`,
      workload,
      timing: 'plain',
      disturbance: reboot,
    });
  }
  return specs;
}

export function triggerFraction(workload: Workload, disturbance: Disturbance): number {
  if (disturbance.kind === 'reply-loss') return workload === 'big' ? 0.9 : 0.5;
  return workload === 'big' ? 0.3 : 0.1;
}

const sources = new Map<string, Promise<Fixture>>();

function fixtureFor(workload: Workload): Promise<Fixture> {
  const root = join(SCRATCH, 'suites');
  const known = sources.get(workload);
  if (known !== undefined) return known;
  const made = workload === 'big' ? buildBig(root) : buildBatch(root);
  sources.set(workload, made);
  return made;
}

function slug(spec: CaseSpec): string {
  return spec.name.replaceAll('/', '-');
}

function subject(timing: Timing): string {
  return timing === 'plain' ? `${COMPUTER}-lan` : COMPUTER;
}

async function beginSwitch(state: RigState, timing: Timing): Promise<void> {
  if (timing === 'switching') await setRoute(state, COMPUTER, 'public');
}

async function sync(state: RigState, delivery: Delivery): Promise<void> {
  const target =
    delivery.fixture.name === 'big'
      ? ['sync', join(delivery.mountDir, 'big.bin')]
      : ['find', delivery.mountDir, '-type', 'f', '-exec', 'sync', '{}', '+'];
  await mustSucceed('fsync of the written files', inside(state.computers[COMPUTER], target));
}

interface Scene {
  readonly context: Context;
  readonly spec: CaseSpec;
  readonly delivery: Delivery;
  readonly writer: Running;
}

async function interrupt(scene: Scene, state: RigState): Promise<RigState> {
  const { context, spec, delivery, writer } = scene;
  const { disturbance, timing } = spec;
  const hold = subject(timing);
  if (disturbance.kind === 'cut' || disturbance.kind === 'reset') {
    await net(`${disturbance.kind} ${hold}`);
    await beginSwitch(state, timing);
    await sleep(disturbance.seconds * 1000);
    await restoreNetwork(COMPUTER);
    return state;
  }
  if (disturbance.kind === 'reply-loss') {
    await net(`cutreply ${hold}`);
    await beginSwitch(state, timing);
    await awaitHubComplete(delivery);
    await sleep(REPLY_LOSS_HOLD_MS);
    await restoreNetwork(COMPUTER);
    return state;
  }
  await net(`stall ${hold}`);
  await finishWriter('the writer under a stalled network', writer);
  await beginSwitch(state, timing);
  if (disturbance.kind === 'kill-helper') await crashHelper(state, COMPUTER);
  else {
    await killStandin(state, COMPUTER);
    if (!(await awaitHelperExit(state, COMPUTER)))
      context.notes.push('the helper kept running 60 s after its Desktop stand-in died');
  }
  await restoreNetwork(COMPUTER);
  return restartKeepingJournal(state, COMPUTER, 'lan');
}

async function rebootAfterFsync(state: RigState, delivery: Delivery): Promise<RigState> {
  await setRoute(state, COMPUTER, 'none');
  await sleep(OFFLINE_SETTLE_MS);
  const writer = startWriter(state, delivery);
  await finishWriter('the writer while offline', writer);
  await sync(state, delivery);
  await crashHelper(state, COMPUTER);
  return restartKeepingJournal(state, COMPUTER, 'lan');
}

async function execute(context: Context, spec: CaseSpec): Promise<void> {
  const fixture = await fixtureFor(spec.workload);
  await net('restore all');
  let state = await ensureMounted(COMPUTER);
  await setRoute(state, COMPUTER, 'lan');
  await sleep(OFFLINE_SETTLE_MS);
  const delivery = await prepareDelivery(state, fixture, `${slug(spec)}-${context.token}`);
  if (spec.disturbance.kind === 'reboot-after-fsync') {
    state = await rebootAfterFsync(state, delivery);
    await verifyDelivered(state, delivery);
    return;
  }
  const writer = startWriter(state, delivery);
  await awaitProgress(delivery, triggerFraction(spec.workload, spec.disturbance));
  state = await interrupt({ context, spec, delivery, writer }, state);
  await verifyDelivered(state, delivery);
  await finishWriter('the writer', writer);
}

export const CASES: readonly SuiteCase[] = caseMatrix().map((spec) => ({
  name: spec.name,
  run: (context) => execute(context, spec),
}));

export function crash(args: readonly string[]): Promise<number> {
  return runSuite('crash', CASES, args);
}
