import type { ProcessWindow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  PortableProcesses,
  type ProcessSource,
  type RawProcess,
} from '../../../src/node/controls/portable/portable-processes';

function raw(overrides: Partial<RawProcess>): RawProcess {
  return {
    pid: 10,
    ppid: 1,
    name: 'app',
    command: 'app --run',
    user: 'dev',
    start: 1000,
    memoryBytes: 1_000_000,
    threads: 4,
    cpuSeconds: null,
    cpuPercentOfOneCore: null,
    ...overrides,
  };
}

interface Rig {
  readonly processes: PortableProcesses;
  readonly clock: { now: number };
  readonly sweeps: { rows: readonly RawProcess[] };
  readonly failures: unknown[];
}

function rig(rows: readonly RawProcess[]): Rig {
  const clock = { now: 10_000 };
  const sweeps = { rows };
  const failures: unknown[] = [];
  const source: ProcessSource = { sweep: () => Promise.resolve(sweeps.rows) };
  const processes = new PortableProcesses({
    machine: 'Windows',
    source,
    signals: { end: 'SIGTERM', force: 'SIGKILL', stop: null, continue: null },
    ownUser: 'Dev',
    ownPid: process.pid,
    now: (): number => clock.now,
    failed: (cause): void => {
      failures.push(cause);
    },
  });
  return { processes, clock, sweeps, failures };
}

const QUERY = { sort: 'pid', limit: 50, cursor: 0 } as const;

describe('listing programs on a computer without a process table', () => {
  it('lists every program once with its name, owner and memory', async () => {
    const { processes } = rig([raw({ pid: 5 }), raw({ pid: 3, name: 'svc', user: 'SYSTEM' })]);
    const list = await processes.list({ ...QUERY, order: 'ascending' });
    expect(list.total).toBe(2);
    expect(list.processes.map((row) => [row.pid, row.name, row.own])).toStrictEqual([
      [3, 'svc', false],
      [5, 'app', true],
    ]);
    expect(list.processes[1]?.memoryBytes).toBe(983_040);
  });

  it('finds the person’s own programs without caring about letter case', async () => {
    const { processes } = rig([raw({ user: 'dev' })]);
    expect((await processes.list(QUERY)).processes[0]?.own).toBe(true);
  });

  it('works out the share of the whole computer from cumulative CPU time', async () => {
    const { processes, clock, sweeps } = rig([raw({ cpuSeconds: 10 })]);
    await processes.list(QUERY);
    clock.now += 2000;
    sweeps.rows = [raw({ cpuSeconds: 11 })];
    const list = await processes.list(QUERY);
    const cores = (await import('node:os')).cpus().length;
    expect(list.processes[0]?.cpu).toBeCloseTo(Math.round((1 / 2 / cores) * 1000) / 10, 1);
  });

  it('shows no CPU for the very first look instead of a made up figure', async () => {
    const { processes } = rig([raw({ cpuSeconds: 500 })]);
    expect((await processes.list(QUERY)).processes[0]?.cpu).toBe(0);
  });

  it('uses the percentage the system already gives, spread over the cores', async () => {
    const { processes } = rig([raw({ cpuPercentOfOneCore: 50 })]);
    const cores = (await import('node:os')).cpus().length;
    expect((await processes.list(QUERY)).processes[0]?.cpu).toBeCloseTo(50 / cores, 0);
  });

  it('pages the list and says where the next page starts', async () => {
    const { processes } = rig([raw({ pid: 1 }), raw({ pid: 2 }), raw({ pid: 3 })]);
    const list = await processes.list({ sort: 'pid', order: 'ascending', limit: 2, cursor: 0 });
    expect(list.processes.map((row) => row.pid)).toStrictEqual([1, 2]);
    expect(list.next).toBe(2);
  });

  it('reuses a reading younger than a second', async () => {
    const { processes, sweeps } = rig([raw({ pid: 1 })]);
    await processes.list(QUERY);
    sweeps.rows = [raw({ pid: 1 }), raw({ pid: 2 })];
    expect((await processes.list(QUERY)).total).toBe(1);
  });
});

describe('watching the program list', () => {
  const WINDOW: ProcessWindow = {
    sort: 'pid',
    order: 'ascending',
    tree: false,
    gpu: false,
    offset: 0,
    limit: 10,
  };

  it('sends nothing while nobody watches', () => {
    const { processes } = rig([raw({})]);
    expect(processes.read({ at: 0, key: true })).toBeNull();
  });

  it('sends the visible rows once the first reading arrived', async () => {
    const { processes } = rig([raw({ pid: 7 })]);
    processes.watch(WINDOW);
    expect(processes.read({ at: 0, key: true })).toBeNull();
    await new Promise((resolve) => setImmediate(resolve));
    const update = processes.read({ at: 1000, key: true });
    expect(update?.total).toBe(1);
    expect(update?.rows[0]?.pid).toBe(7);
  });

  it('stops sending after the watch is dropped', async () => {
    const { processes } = rig([raw({ pid: 7 })]);
    processes.watch(WINDOW);
    await new Promise((resolve) => setImmediate(resolve));
    processes.watch(null);
    expect(processes.read({ at: 1000, key: true })).toBeNull();
  });
});

describe('ending programs', () => {
  it('refuses to pause a program where the system cannot', () => {
    const { processes } = rig([]);
    expect(() => {
      processes.signal(4321, 'stop');
    }).toThrow(/cannot pause/u);
    expect(() => {
      processes.signal(4321, 'continue');
    }).toThrow(/cannot resume/u);
  });

  it('never ends SmartEverything itself', () => {
    const { processes } = rig([]);
    expect(() => {
      processes.signal(process.pid, 'end');
    }).toThrow(/cannot end itself/u);
  });

  it('says a program that has closed already is gone', () => {
    const { processes } = rig([]);
    expect(() => {
      processes.signal(2_147_483_000, 'end');
    }).toThrow(/already closed/u);
  });
});
