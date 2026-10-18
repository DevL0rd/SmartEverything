import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import {
  DEFAULT_COMPUTER_SCOPES,
  NODE_FRAME,
  SAMPLE_TOPICS,
  STATE_TOPICS,
  type HubFrame,
  type NodeDemandTopics,
  type NodeFrame,
  type ProcessWindow,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';

const seconds = Number(process.argv[3] ?? 30);
const scenario = process.argv[2] ?? 'idle';
const warmup = Number(process.argv[4] ?? 5);
const TICKS_PER_SECOND = 100;
const SCENARIOS = [
  'idle',
  'watched',
  'processes',
  'processes-gpu',
  'states',
  'states-events',
] as const;

const spawned = new Map<string, number>();

function counted<Args extends unknown[], Result>(
  original: (...args: Args) => Result,
): (...args: Args) => Result {
  return (...args) => {
    const [file, rest] = args;
    const first = Array.isArray(rest) ? String(rest[0] ?? '') : '';
    const label = `${String(file)} ${first}`.trim().slice(0, 60);
    spawned.set(label, (spawned.get(label) ?? 0) + 1);
    return original(...args);
  };
}

Object.assign(childProcess, {
  spawn: counted(childProcess.spawn.bind(childProcess)),
  execFile: counted(childProcess.execFile.bind(childProcess)),
});
syncBuiltinESMExports();

const benchLog = new Logger('hub.sampler-bench');

function procText(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch (cause) {
    benchLog.warn('bench.proc_gone', { path, cause: String(cause) });
    return '';
  }
}

function statFields(pid: number): string[] | null {
  const text = procText(`/proc/${String(pid)}/stat`);
  return text === '' ? null : text.slice(text.lastIndexOf(')') + 2).split(' ');
}

function ticksOf(pid: number): number {
  const fields = statFields(pid);
  return fields === null ? 0 : Number(fields[11]) + Number(fields[12]);
}

function waitedChildTicks(): number {
  const fields = statFields(process.pid);
  return fields === null ? 0 : Number(fields[13]) + Number(fields[14]);
}

function childrenOf(pid: number): number[] {
  return readdirSync(`/proc/${String(pid)}/task`).flatMap((tid) =>
    procText(`/proc/${String(pid)}/task/${tid}/children`)
      .split(' ')
      .filter((value) => value !== '')
      .map(Number),
  );
}

function wakeupsOf(pid: number): number {
  return readdirSync(`/proc/${String(pid)}/task`).reduce((sum, tid) => {
    const status = procText(`/proc/${String(pid)}/task/${tid}/status`);
    return sum + Number(/^voluntary_ctxt_switches:\s+(\d+)/m.exec(status)?.[1] ?? 0);
  }, 0);
}

function residentKiB(pid: number): number {
  return Number(/^VmRSS:\s+(\d+)/m.exec(procText(`/proc/${String(pid)}/status`))?.[1] ?? 0);
}

function topicsFor(name: string): NodeDemandTopics {
  const all: NodeDemandTopics = {};
  for (const topic of SAMPLE_TOPICS) {
    if (topic !== 'processes') all[topic] = 1000;
  }
  if (name === 'idle') return {};
  if (name === 'watched') return all;
  if (name.startsWith('states')) {
    const states: NodeDemandTopics = {};
    for (const topic of STATE_TOPICS) states[topic] = 1000;
    return { summary: 10_000, ...states };
  }
  return { ...all, processes: 1000 };
}

function windowFor(name: string): ProcessWindow {
  return {
    sort: 'cpu',
    order: 'descending',
    tree: false,
    gpu: name === 'processes-gpu',
    offset: 0,
    limit: 60,
  };
}

async function churnAudio(stop: () => boolean): Promise<number> {
  let events = 0;
  while (!stop()) {
    await new Promise<void>((resolve) => {
      childProcess.execFile(
        'pactl',
        ['load-module', 'module-null-sink', 'sink_name=sebench'],
        (error, stdout) => {
          if (error !== null) {
            resolve();
            return;
          }
          childProcess.execFile('pactl', ['unload-module', stdout.trim()], () => {
            events += 2;
            resolve();
          });
        },
      );
    });
    await delay(2000);
  }
  return events;
}

const { collectorFor } = await import('../../src/node/collectors/collector');
const { controlsFor } = await import('../../src/node/controls/controls');
const { ComputerNode } = await import('../../src/node/computer-node');
const { NodeFailureError } = await import('../../src/node/node-failure');
const { localLinks } = await import('../support/local-links');

if (!SCENARIOS.some((known) => known === scenario)) {
  throw new Error(`scenario must be one of ${SCENARIOS.join(', ')}`);
}

const log = new Logger('hub.node');
const now = (): Date => new Date();
const links = localLinks();
let bytes = 0;
let frames = 0;
const kinds = new Map<string, number>();
links.hub.onFrame((frame) => {
  const parsed: NodeFrame = NODE_FRAME.parse(frame);
  const size = JSON.stringify(frame).length;
  bytes += size;
  frames += 1;
  kinds.set(parsed.type, (kinds.get(parsed.type) ?? 0) + 1);
});
const real = controlsFor('linux', { now, log });
const node = new ComputerNode({
  collector: collectorFor('linux', { log, machineId: '0'.repeat(32), now: Date.now }),
  controls: {
    ...real,
    session: {
      start: (): Promise<void> =>
        Promise.reject(new NodeFailureError('no_session', 'bench has no session')),
      stop: (): Promise<void> => Promise.resolve(),
      setVolume: (): Promise<void> => Promise.resolve(),
      setMuted: (): Promise<void> => Promise.resolve(),
      playback: (): Promise<void> => Promise.resolve(),
    },
  },
  link: links.node,
  now,
  log,
});
node.start();
const hubFrame = (frame: HubFrame): void => {
  links.hub.send(frame);
};
await delay(1500);
hubFrame({ type: 'scopes', scopes: DEFAULT_COMPUTER_SCOPES });
const demand = topicsFor(scenario);
hubFrame({
  type: 'demand',
  demand: scenario.startsWith('processes')
    ? { topics: demand, processes: windowFor(scenario) }
    : { topics: demand },
});
await delay(warmup * 1000);
bytes = 0;
frames = 0;
kinds.clear();
spawned.clear();
const children = childrenOf(process.pid);
const childStart = children.map(ticksOf);
const waitedStart = waitedChildTicks();
const wakeStart = wakeupsOf(process.pid);
const childWakeStart = children.map(wakeupsOf);
const own = process.cpuUsage();
const started = Date.now();
let finished = false;
const churn = scenario === 'states-events' ? churnAudio(() => finished) : Promise.resolve(0);
await delay(seconds * 1000);
finished = true;
const wall = (Date.now() - started) / 1000;
const used = process.cpuUsage(own);
const childTicks =
  children.reduce((sum, pid, index) => sum + ticksOf(pid) - (childStart[index] ?? 0), 0) +
  (waitedChildTicks() - waitedStart);
const wakeups =
  wakeupsOf(process.pid) -
  wakeStart +
  children.reduce((sum, pid, index) => sum + wakeupsOf(pid) - (childWakeStart[index] ?? 0), 0);
const rss = residentKiB(process.pid);
const ownCpu = ((used.user + used.system) / 1e6 / wall) * 100;
const childCpu = (childTicks / TICKS_PER_SECOND / wall) * 100;
const events = await churn;
const spawnTotal = [...spawned.values()].reduce((sum, count) => sum + count, 0);
process.stdout.write(
  `${JSON.stringify({
    scenario,
    seconds: Number(wall.toFixed(1)),
    ownCpuPercentOfCore: Number(ownCpu.toFixed(3)),
    childCpuPercentOfCore: Number(childCpu.toFixed(3)),
    totalCpuPercentOfCore: Number((ownCpu + childCpu).toFixed(3)),
    wakeupsPerSecond: Math.round(wakeups / wall),
    framesPerSecond: Number((frames / wall).toFixed(2)),
    bytesPerSecond: Math.round(bytes / wall),
    frameKinds: Object.fromEntries(kinds),
    rssKiB: rss,
    spawnsPerMinute: Number(((spawnTotal / wall) * 60).toFixed(1)),
    spawnedBy: Object.fromEntries(spawned),
    eventsGenerated: events,
  })}\n`,
);
node.stop();
await delay(500);
process.exit(0);
