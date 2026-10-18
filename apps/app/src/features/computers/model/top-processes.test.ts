import { describe, expect, it } from 'vitest';
import type { ProcessRow } from '@smarteverything/domain';
import { TOP_COUNT, TOP_WINDOW, topEntries } from './top-processes';

function row(pid: number, name: string, cpu: number, descendants: number): ProcessRow {
  return {
    pid,
    start: 1,
    ppid: 0,
    name,
    command: name,
    user: 'dana',
    state: 'running',
    cpu,
    memoryBytes: 1,
    gpu: null,
    diskRate: 0,
    threads: 1,
    descendants,
    own: true,
  };
}

describe('topEntries', () => {
  it('shows the first five rows with their share of the busiest', () => {
    const rows = Array.from({ length: 8 }, (_, index) =>
      row(index + 1, `p${String(index)}`, 8 - index, 0),
    );
    const entries = topEntries(rows);
    expect(entries).toHaveLength(TOP_COUNT);
    expect(entries[0]?.share).toBe(1);
    expect(entries[1]?.share).toBeCloseTo(7 / 8);
  });

  it('names the helpers of a program and rounds the share to one decimal', () => {
    const [first] = topEntries([row(1, 'Firefox', 6.84, 11), row(2, 'Node.js', 1.3, 1)]);
    expect(first?.label).toBe('Firefox and 11 helpers');
    expect(first?.value).toBe('6.8 %');
    expect(first?.spoken).toBe('Firefox and 11 helpers, 6.8 percent');
    expect(topEntries([row(2, 'Node.js', 1.3, 1)])[0]?.label).toBe('Node.js and 1 helper');
  });

  it('asks the computer for the busiest five programs as a tree', () => {
    expect(TOP_WINDOW).toMatchObject({ sort: 'cpu', order: 'descending', tree: true, limit: 5 });
  });
});
