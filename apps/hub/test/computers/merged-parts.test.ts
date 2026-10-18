import type { ProcessRow, ProcessRowUpdate } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { MergedParts } from '../../src/computers/computer-view';

const AT = '2026-10-18T10:00:00.000Z';

function row(pid: number, cpu: number): ProcessRow {
  return {
    pid,
    start: 1,
    ppid: 1,
    name: `p${String(pid)}`,
    command: `/bin/p${String(pid)}`,
    user: 'me',
    state: 'sleeping',
    cpu,
    memoryBytes: 1,
    gpu: null,
    diskRate: 0,
    threads: 1,
    descendants: 0,
    own: true,
  };
}

function moving(pid: number, cpu: number): ProcessRowUpdate {
  return {
    pid,
    start: 1,
    state: 'sleeping',
    cpu,
    memoryBytes: 1,
    gpu: null,
    diskRate: 0,
    threads: 1,
    descendants: 0,
    own: true,
  };
}

describe('MergedParts processes', () => {
  it('completes the rows of a change from the rows it already holds', () => {
    const merged = new MergedParts();
    merged.merge(AT, {
      processes: { total: 2, offset: 0, order: ['1:1', '2:1'], rows: [row(1, 1), row(2, 2)] },
    });
    merged.merge(AT, {
      processes: { total: 2, offset: 0, order: ['2:1', '1:1'], rows: [moving(2, 7)] },
    });
    expect(merged.latest.processes?.rows).toEqual([row(2, 7), row(1, 1)]);
  });

  it('leaves out a changed row whose fixed fields it never received', () => {
    const merged = new MergedParts();
    merged.merge(AT, {
      processes: { total: 1, offset: 0, order: ['9:1'], rows: [moving(9, 3)] },
    });
    expect(merged.latest.processes?.rows).toEqual([]);
  });
});
