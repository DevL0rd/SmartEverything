import { describe, expect, it } from 'vitest';
import type { ProcessRow } from '@smarteverything/domain';
import { defaultOpen, depthsOf, flatLines, treeLines } from './process-lines';

function row(pid: number, ppid: number, name: string, cpu = 0): ProcessRow {
  return {
    pid,
    start: 1,
    ppid,
    name,
    command: name,
    user: 'dana',
    state: 'running',
    cpu,
    memoryBytes: 0,
    gpu: null,
    diskRate: 0,
    threads: 1,
    descendants: 0,
    own: true,
  };
}

const ROWS = [
  row(1, 0, 'systemd'),
  row(100, 1, 'firefox', 9),
  row(101, 100, 'Web Content', 4),
  row(102, 101, 'Isolated', 1),
  row(103, 100, 'RDD', 1),
  row(200, 1, 'kwin', 2),
  row(300, 1, 'code', 6),
  row(301, 300, 'ptyHost', 1),
];

describe('depthsOf', () => {
  it('nests children under their parent and treats systemd children as roots', () => {
    expect(depthsOf(ROWS)).toEqual([0, 0, 1, 2, 1, 0, 0, 1]);
  });

  it('only flattens the systemd that init started', () => {
    const rows = [
      row(1, 0, 'init'),
      row(40, 1, 'bash'),
      row(41, 40, 'systemd'),
      row(42, 41, 'tool'),
    ];
    expect(depthsOf(rows)).toEqual([0, 0, 1, 2]);
  });

  it('starts a new root when the parent is not in the list', () => {
    expect(depthsOf([row(5, 99, 'a'), row(6, 5, 'b'), row(7, 98, 'c')])).toEqual([0, 1, 0]);
  });
});

describe('treeLines', () => {
  it('hides the children of a closed parent and marks leaves', () => {
    const lines = treeLines(ROWS, (key) => key === '100:1');
    expect(lines.map((line) => line.row.pid)).toEqual([1, 100, 101, 103, 200, 300]);
    expect(lines.map((line) => line.open)).toEqual([null, true, false, null, null, false]);
    expect(lines.map((line) => line.depth)).toEqual([0, 0, 1, 1, 0, 0]);
  });

  it('shows everything when everything is open', () => {
    expect(treeLines(ROWS, () => true)).toHaveLength(ROWS.length);
  });

  it('shows only the roots when everything is closed', () => {
    expect(treeLines(ROWS, () => false).map((line) => line.row.pid)).toEqual([1, 100, 200, 300]);
  });
});

describe('flatLines', () => {
  it('lists the matching rows flat', () => {
    const flat = flatLines(
      ROWS.map((item) => (item.pid === 200 ? { ...item, own: false } : item)),
      'mine',
    );
    expect(flat.map((line) => line.row.pid)).not.toContain(200);
    expect(flat.every((line) => line.depth === 0 && line.open === null)).toBe(true);
  });
});

describe('defaultOpen', () => {
  it('opens the busiest parents only', () => {
    expect([...defaultOpen(ROWS)].sort()).toEqual(['100:1', '300:1']);
  });
});
