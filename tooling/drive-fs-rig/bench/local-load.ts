import { readdir, readFile } from 'node:fs/promises';
import { childrenOf } from '../processes.ts';
import { isMissing } from '../errors.ts';

const TICKS_PER_SECOND = 100;

export interface Load {
  readonly busyTicks: number;
  readonly totalTicks: number;
  readonly load1: number;
  readonly ioSome10: number;
  readonly memorySome10: number;
  readonly client: ReadonlyMap<number, number>;
  readonly server: ReadonlyMap<number, number>;
  readonly threads: ReadonlyMap<string, number>;
}

async function descendants(pid: number): Promise<readonly number[]> {
  const found = [pid];
  const queue = [pid];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    const children = await childrenOf(next);
    found.push(...children);
    queue.push(...children);
  }
  return found;
}

async function ticksOf(pid: number): Promise<number> {
  try {
    const stat = await readFile(`/proc/${String(pid)}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return Number(fields[11]) + Number(fields[12]);
  } catch (cause) {
    if (isMissing(cause)) return 0;
    throw cause;
  }
}

async function threadTicks(pid: number | undefined): Promise<Map<string, number>> {
  const byName = new Map<string, number>();
  if (pid === undefined) return byName;
  let tasks: string[];
  try {
    tasks = await readdir(`/proc/${String(pid)}/task`);
  } catch (cause) {
    if (isMissing(cause)) return byName;
    throw cause;
  }
  for (const task of tasks) {
    try {
      const stat = await readFile(`/proc/${String(pid)}/task/${task}/stat`, 'utf8');
      const name = stat.slice(stat.indexOf('(') + 1, stat.lastIndexOf(')')).replace(/[0-9]+$/u, '');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      byName.set(name, (byName.get(name) ?? 0) + Number(fields[11]) + Number(fields[12]));
    } catch (cause) {
      if (!isMissing(cause)) throw cause;
    }
  }
  return byName;
}

async function pressure(name: string): Promise<number> {
  const text = await readFile(`/proc/pressure/${name}`, 'utf8');
  const some = text.split('\n').find((line) => line.startsWith('some'));
  const match = /avg10=([0-9.]+)/u.exec(some ?? '');
  return Number(match?.[1] ?? 0);
}

async function ticksFor(roots: readonly number[]): Promise<Map<number, number>> {
  const ticks = new Map<number, number>();
  for (const root of roots)
    for (const pid of await descendants(root)) ticks.set(pid, await ticksOf(pid));
  return ticks;
}

export async function sample(roles: {
  readonly client: readonly number[];
  readonly server: readonly number[];
}): Promise<Load> {
  const cpu = (await readFile('/proc/stat', 'utf8')).split('\n')[0] ?? '';
  const values = cpu.split(/\s+/u).slice(1).map(Number);
  const total = values.reduce((sum, value) => sum + value, 0);
  const idle = (values[3] ?? 0) + (values[4] ?? 0);
  return {
    busyTicks: total - idle,
    totalTicks: total,
    load1: Number((await readFile('/proc/loadavg', 'utf8')).split(' ')[0]),
    ioSome10: await pressure('io'),
    memorySome10: await pressure('memory'),
    client: await ticksFor(roles.client),
    server: await ticksFor(roles.server),
    threads: await threadTicks(roles.server[0]),
  };
}

export interface LoadDelta {
  readonly hostBusyPercent: number;
  readonly load1Start: number;
  readonly load1End: number;
  readonly ioPressureEnd: number;
  readonly memoryPressureEnd: number;
  readonly clientCpuSeconds: number;
  readonly serverCpuSeconds: number;
  readonly serverThreadSeconds: Readonly<Record<string, number>>;
}

export function delta(before: Load, after: Load): LoadDelta {
  const total = after.totalTicks - before.totalTicks;
  const spent = (from: ReadonlyMap<number, number>, to: ReadonlyMap<number, number>): number => {
    let ticks = 0;
    for (const [pid, value] of to) ticks += value - (from.get(pid) ?? 0);
    return ticks / TICKS_PER_SECOND;
  };
  return {
    hostBusyPercent: total === 0 ? 0 : ((after.busyTicks - before.busyTicks) / total) * 100,
    load1Start: before.load1,
    load1End: after.load1,
    ioPressureEnd: after.ioSome10,
    memoryPressureEnd: after.memorySome10,
    clientCpuSeconds: spent(before.client, after.client),
    serverCpuSeconds: spent(before.server, after.server),
    serverThreadSeconds: Object.fromEntries(
      [...after.threads]
        .map(([name, ticks]): [string, number] => [
          name,
          (ticks - (before.threads.get(name) ?? 0)) / TICKS_PER_SECOND,
        ])
        .filter(([, seconds]) => seconds >= 0.05),
    ),
  };
}
