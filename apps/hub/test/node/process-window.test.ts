import type { ProcessRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { arrange, defaultOrder, differs, WindowDiff } from '../../src/node/controls/process-window';

function row(pid: number, over: Partial<ProcessRow> = {}): ProcessRow {
  return {
    pid,
    start: pid * 10,
    ppid: 1,
    name: `proc${String(pid)}`,
    command: `/bin/proc${String(pid)} --flag`,
    user: 'alice',
    state: 'sleeping',
    cpu: 0,
    memoryBytes: 1_000_000,
    gpu: null,
    diskRate: 0,
    threads: 1,
    descendants: 0,
    own: true,
    ...over,
  };
}

const FLAT = { sort: 'cpu', order: 'descending', tree: false } as const;

describe('arrange', () => {
  const rows = [
    row(10, { cpu: 5, name: 'zeta', user: 'bob', memoryBytes: 300 }),
    row(11, { cpu: 50, name: 'Alpha', user: 'alice', memoryBytes: 100, gpu: 3 }),
    row(12, { cpu: 5, name: 'mid', user: 'carol', memoryBytes: 200 }),
  ];

  it('sorts numbers in the asked direction and breaks ties by pid', () => {
    expect(arrange(rows, FLAT).map((item) => item.pid)).toEqual([11, 10, 12]);
    expect(arrange(rows, { ...FLAT, order: 'ascending' }).map((item) => item.pid)).toEqual([
      10, 12, 11,
    ]);
    expect(arrange(rows, { ...FLAT, sort: 'memory' }).map((item) => item.pid)).toEqual([
      10, 12, 11,
    ]);
  });

  it('sorts text without regard to case', () => {
    expect(
      arrange(rows, { sort: 'name', order: 'ascending', tree: false }).map((item) => item.name),
    ).toEqual(['Alpha', 'mid', 'zeta']);
    expect(
      arrange(rows, { sort: 'user', order: 'descending', tree: false }).map((item) => item.user),
    ).toEqual(['carol', 'bob', 'alice']);
  });

  it('puts programs without gpu use last when sorting by gpu', () => {
    expect(arrange(rows, { ...FLAT, sort: 'gpu' })[0]?.pid).toBe(11);
  });

  it('keeps rows matching a name, command or pid and ignores the tree', () => {
    expect(arrange(rows, { ...FLAT, search: 'ALPHA', tree: true }).map((item) => item.pid)).toEqual(
      [11],
    );
    expect(arrange(rows, { ...FLAT, search: '12' }).map((item) => item.pid)).toEqual([12]);
    expect(arrange(rows, { ...FLAT, search: '--flag' })).toHaveLength(3);
    expect(arrange(rows, { ...FLAT, search: 'nothing' })).toEqual([]);
  });

  it('chooses the natural direction per column', () => {
    expect(defaultOrder('cpu')).toBe('descending');
    expect(defaultOrder('name')).toBe('ascending');
  });
});

describe('arrange as a tree', () => {
  const rows = [
    row(100, { ppid: 1, name: 'launcher', cpu: 1, memoryBytes: 10, threads: 2 }),
    row(101, { ppid: 100, name: 'child-a', cpu: 30, memoryBytes: 20, gpu: 10, threads: 3 }),
    row(102, { ppid: 100, name: 'child-b', cpu: 5, memoryBytes: 30, threads: 4 }),
    row(103, { ppid: 101, name: 'grandchild', cpu: 2, memoryBytes: 40, gpu: 5, threads: 5 }),
    row(200, { ppid: 99999, name: 'orphan', cpu: 40 }),
    row(1, { ppid: 0, name: 'systemd', cpu: 0 }),
    row(300, { ppid: 1, name: 'session-app', cpu: 7 }),
  ];
  const tree = arrange(rows, { ...FLAT, tree: true });

  it('lists a program, then its children busiest first, then the next program', () => {
    expect(tree.map((item) => item.pid)).toEqual([200, 100, 101, 103, 102, 300, 1]);
  });

  it('shows the totals of everything below on each parent', () => {
    const parent = tree.find((item) => item.pid === 100);
    expect(parent).toMatchObject({
      cpu: 38,
      memoryBytes: 100,
      gpu: 15,
      threads: 14,
      descendants: 3,
    });
    expect(tree.find((item) => item.pid === 101)).toMatchObject({ cpu: 32, descendants: 1 });
    expect(tree.find((item) => item.pid === 103)).toMatchObject({ cpu: 2, descendants: 0 });
  });

  it('treats a program started by the system manager as a top level one', () => {
    expect(tree.find((item) => item.pid === 300)?.descendants).toBe(0);
  });
});

describe('WindowDiff', () => {
  const shape = { total: 3, offset: 0 };

  it('sends every row of the first window and nothing when nothing moved', () => {
    const diff = new WindowDiff();
    const rows = [row(1), row(2)];
    expect(diff.next(rows, shape, false)).toEqual({
      total: 3,
      offset: 0,
      order: ['1:10', '2:20'],
      rows,
    });
    expect(diff.next(rows, shape, false)).toBeNull();
  });

  it('sends only the rows that changed visibly', () => {
    const diff = new WindowDiff();
    diff.next([row(1), row(2)], shape, false);
    const part = diff.next([row(1, { cpu: 0.1 }), row(2, { cpu: 9 })], shape, false);
    expect(part?.rows.map((item) => item.pid)).toEqual([2]);
    expect(part?.order).toEqual(['1:10', '2:20']);
  });

  it('lets small drifts add up until they show', () => {
    const diff = new WindowDiff();
    diff.next([row(1)], shape, false);
    expect(diff.next([row(1, { cpu: 0.2 })], shape, false)).toBeNull();
    expect(diff.next([row(1, { cpu: 0.4 })], shape, false)?.rows).toHaveLength(1);
  });

  it('sends a new order without rows when programs only swapped places', () => {
    const diff = new WindowDiff();
    diff.next([row(1), row(2)], shape, false);
    expect(diff.next([row(2), row(1)], shape, false)).toEqual({
      total: 3,
      offset: 0,
      order: ['2:20', '1:10'],
      rows: [],
    });
  });

  it('sends rows that enter the window, and again after a key frame', () => {
    const diff = new WindowDiff();
    diff.next([row(1), row(2)], shape, false);
    expect(diff.next([row(2), row(3)], shape, false)?.rows.map((item) => item.pid)).toEqual([3]);
    expect(diff.next([row(2), row(3)], shape, true)?.rows).toHaveLength(2);
  });

  it('leaves out the fixed fields of a row the viewer already has', () => {
    const diff = new WindowDiff();
    diff.next([row(1), row(2)], shape, false);
    const part = diff.next([row(1, { cpu: 9 }), row(2)], shape, false);
    expect(part?.rows).toHaveLength(1);
    expect(part?.rows[0]).not.toHaveProperty('ppid');
    expect(part?.rows[0]).toMatchObject({ pid: 1, start: 10, cpu: 9 });
    expect(part?.rows[0]).not.toHaveProperty('command');
    expect(part?.rows[0]).not.toHaveProperty('name');
    expect(part?.rows[0]).not.toHaveProperty('user');
  });

  it('sends a fixed field again when it changed, and every field on a key frame or a new row', () => {
    const diff = new WindowDiff();
    diff.next([row(1)], shape, false);
    const moved = diff.next([row(1, { ppid: 7, cpu: 9 })], shape, false);
    expect(moved?.rows[0]).toMatchObject({ ppid: 7 });
    expect(moved?.rows[0]).not.toHaveProperty('command');
    const same = row(1, { ppid: 7, cpu: 9 });
    expect(diff.next([same, row(3)], shape, false)?.rows).toEqual([row(3)]);
    expect(diff.next([same], shape, true)?.rows).toEqual([same]);
  });

  it('reports a changed total or offset', () => {
    const diff = new WindowDiff();
    diff.next([row(1)], shape, false);
    expect(diff.next([row(1)], { total: 9, offset: 0 }, false)).toMatchObject({
      total: 9,
      rows: [],
    });
  });
});

describe('differs', () => {
  it('ignores a program flipping between running and sleeping but not stopping', () => {
    expect(differs(row(1, { state: 'running' }), row(1, { state: 'sleeping' }))).toBe(false);
    expect(differs(row(1), row(1, { state: 'stopped' }))).toBe(true);
  });

  it('notices thread, memory, gpu and disk movement beyond what is shown', () => {
    expect(differs(row(1), row(1, { threads: 2 }))).toBe(true);
    expect(differs(row(1), row(1, { memoryBytes: 3_000_000 }))).toBe(true);
    expect(differs(row(1), row(1, { memoryBytes: 1_200_000 }))).toBe(false);
    expect(differs(row(1), row(1, { gpu: 4 }))).toBe(true);
    expect(differs(row(1, { diskRate: 1_000_000 }), row(1, { diskRate: 1_050_000 }))).toBe(false);
    expect(differs(row(1, { diskRate: 1_000_000 }), row(1, { diskRate: 1_500_000 }))).toBe(true);
  });
});
