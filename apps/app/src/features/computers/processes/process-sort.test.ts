import { describe, expect, it } from 'vitest';
import type { ProcessRow } from '@smarteverything/domain';
import {
  DEFAULT_ORDERING,
  EVERY_PROCESS,
  defaultOrder,
  endTitle,
  forceTitle,
  orderingAfter,
  passesFilter,
  windowOf,
} from './process-sort';

function row(over: Partial<ProcessRow>): ProcessRow {
  return {
    pid: 10,
    start: 1,
    ppid: 1,
    name: 'node',
    command: 'node',
    user: 'dana',
    state: 'running',
    cpu: 0,
    memoryBytes: 0,
    gpu: null,
    diskRate: 0,
    threads: 1,
    descendants: 0,
    own: true,
    ...over,
  };
}

describe('ordering', () => {
  it('starts with the busiest processor user first', () => {
    expect(DEFAULT_ORDERING).toEqual({ sort: 'cpu', order: 'descending' });
  });

  it('sorts text and numbers the way people read them', () => {
    expect(defaultOrder('name')).toBe('ascending');
    expect(defaultOrder('user')).toBe('ascending');
    expect(defaultOrder('pid')).toBe('ascending');
    expect(defaultOrder('memory')).toBe('descending');
  });

  it('flips the order on the same column and resets it on another', () => {
    const flipped = orderingAfter(DEFAULT_ORDERING, 'cpu');
    expect(flipped).toEqual({ sort: 'cpu', order: 'ascending' });
    expect(orderingAfter(flipped, 'name')).toEqual({ sort: 'name', order: 'ascending' });
  });
});

describe('windowOf', () => {
  it('asks for every process and drops an empty search', () => {
    const window = windowOf(DEFAULT_ORDERING, '  ', true, false);
    expect(window).toEqual({
      sort: 'cpu',
      order: 'descending',
      tree: true,
      gpu: false,
      offset: 0,
      limit: EVERY_PROCESS,
    });
  });

  it('turns the tree off while searching', () => {
    const window = windowOf(DEFAULT_ORDERING, ' node ', true, true);
    expect(window.search).toBe('node');
    expect(window.tree).toBe(false);
    expect(window.gpu).toBe(true);
  });
});

describe('passesFilter', () => {
  it('keeps your own programs, GPU users and busy disks', () => {
    expect(passesFilter('mine', row({ own: false }))).toBe(false);
    expect(passesFilter('gpu', row({ gpu: 0.2 }))).toBe(false);
    expect(passesFilter('gpu', row({ gpu: 4 }))).toBe(true);
    expect(passesFilter('disk', row({ diskRate: 0 }))).toBe(false);
    expect(passesFilter('disk', row({ diskRate: 10 }))).toBe(true);
    expect(passesFilter('all', row({ own: false }))).toBe(true);
  });
});

describe('titles', () => {
  it('shorten long names', () => {
    expect(endTitle('firefox')).toBe('End firefox?');
    expect(forceTitle('x'.repeat(40))).toBe(`Force quit ${'x'.repeat(26)}…?`);
  });
});
