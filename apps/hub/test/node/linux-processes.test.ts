import type * as Os from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { cpuShare, LinuxProcesses } from '../../src/node/controls/linux/linux-processes';

const WINDOW = {
  sort: 'cpu',
  order: 'descending',
  tree: false,
  gpu: false,
  offset: 0,
  limit: 40,
} as const;

const processorCounts = vi.hoisted(() => ({ asked: 0 }));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof Os>();
  return {
    ...actual,
    cpus: (): ReturnType<typeof actual.cpus> => {
      processorCounts.asked += 1;
      return actual.cpus();
    },
  };
});

describe('cpuShare', () => {
  it('is the process share of all processor time that passed', () => {
    expect(cpuShare({ ticks: 150, start: 7 }, { ticks: 100, start: 7 }, 1000)).toBe(5);
    expect(cpuShare({ ticks: 1100, start: 7 }, { ticks: 100, start: 7 }, 1000)).toBe(100);
  });

  it('is zero without an earlier reading, for a reused pid, or without elapsed time', () => {
    expect(cpuShare({ ticks: 150, start: 7 }, undefined, 1000)).toBe(0);
    expect(cpuShare({ ticks: 150, start: 7 }, { ticks: 100, start: 8 }, 1000)).toBe(0);
    expect(cpuShare({ ticks: 150, start: 7 }, { ticks: 100, start: 7 }, 0)).toBe(0);
    expect(cpuShare({ ticks: 90, start: 7 }, { ticks: 100, start: 7 }, 1000)).toBe(0);
  });
});

describe('LinuxProcesses', () => {
  it('lists this very program once the first two sweeps are done, without asking for the cpu count per row', async () => {
    processorCounts.asked = 0;
    const processes = new LinuxProcesses();
    try {
      const list = await processes.list({ sort: 'memory', limit: 10_000, cursor: 0 });
      const self = list.processes.find((row) => row.pid === process.pid);
      expect(self).toMatchObject({ own: true, ppid: process.ppid });
      expect(self?.command).toContain('node');
      expect(list.total).toBeGreaterThan(10);
      expect(processorCounts.asked).toBe(0);
    } finally {
      processes.stop();
    }
  });

  it('pages and searches', async () => {
    const processes = new LinuxProcesses();
    try {
      const page = await processes.list({ sort: 'pid', order: 'ascending', limit: 3, cursor: 0 });
      expect(page.processes).toHaveLength(3);
      expect(page.next).toBe(3);
      expect(page.processes.map((row) => row.pid)).toEqual(
        [...page.processes.map((row) => row.pid)].sort((a, b) => a - b),
      );
      const found = await processes.list({
        sort: 'cpu',
        search: String(process.pid),
        limit: 50,
        cursor: 0,
      });
      expect(found.processes.map((row) => row.pid)).toContain(process.pid);
    } finally {
      processes.stop();
    }
  });

  it('serves a window per tick, then only what changed', async () => {
    const processes = new LinuxProcesses();
    try {
      expect(processes.read({ at: Date.now(), key: true })).toBeNull();
      processes.watch(WINDOW);
      const first = processes.read({ at: Date.now(), key: true });
      expect(first?.rows).toHaveLength(40);
      expect(first?.order).toHaveLength(40);
      expect(first?.total).toBeGreaterThan(40);
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const second = processes.read({ at: Date.now(), key: false });
      expect(second === null || second.rows.length < 40).toBe(true);
      processes.watch(null);
      expect(processes.read({ at: Date.now(), key: false })).toBeNull();
    } finally {
      processes.stop();
    }
  });

  it('refuses to end itself and reports a program that already closed', () => {
    const processes = new LinuxProcesses();
    expect(() => {
      processes.signal(process.pid, 'end');
    }).toThrow('cannot end itself');
    expect(() => {
      processes.signal(2 ** 22 - 3, 'end');
    }).toThrow('already closed');
  });
});
