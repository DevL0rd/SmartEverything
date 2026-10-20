import { describe, expect, it } from 'vitest';
import { bad, good } from './support';

const STEPS = [1, 25, 50, 75, 100];

describe('list.make, list.length', () => {
  it('make and count', () => {
    expect(good('list.make', { items: STEPS })).toEqual({ list: STEPS });
    expect(good('list.length', { list: STEPS })).toEqual({ length: 5 });
    bad('list.length', { list: 'abc' }, 'TypeError');
  });
});

describe('list.get', () => {
  it('gets by index, first and last', () => {
    expect(good('list.get', { list: STEPS, index: 2 })).toEqual({ item: 50, length: 5 });
    expect(good('list.get', { list: STEPS, index: -1 })).toEqual({ item: 100, length: 5 });
    expect(good('list.get', { list: STEPS, position: 'first' })).toEqual({ item: 1, length: 5 });
    expect(good('list.get', { list: STEPS, position: 'last' })).toEqual({ item: 100, length: 5 });
  });

  it('fails out of range unless there is a default', () => {
    bad('list.get', { list: STEPS, index: 5 }, 'NotFound');
    bad('list.get', { list: [], position: 'first' }, 'NotFound');
    expect(good('list.get', { list: STEPS, index: 9, default: 0 })).toEqual({ item: 0, length: 5 });
    bad('list.get', { list: STEPS, index: 1.5 }, 'Invalid');
  });
});

describe('list.add', () => {
  it('adds at the end, start and an index', () => {
    expect(good('list.add', { list: [1, 2], item: 3 })).toEqual({ list: [1, 2, 3] });
    expect(good('list.add', { list: [1, 2], item: 0, at: 'start' })).toEqual({ list: [0, 1, 2] });
    expect(good('list.add', { list: [1, 3], item: 2, at: 'index', index: 1 })).toEqual({
      list: [1, 2, 3],
    });
    bad('list.add', { list: [1], item: 2, at: 'index', index: 5 }, 'Invalid');
    bad('list.add', { list: [1], item: 2, at: 'index', index: -1 }, 'Invalid');
  });

  it('leaves the original list alone', () => {
    const list = [1, 2];
    good('list.add', { list, item: 3 });
    expect(list).toEqual([1, 2]);
  });
});

describe('list.remove', () => {
  it('removes by index', () => {
    expect(good('list.remove', { list: [1, 2, 3], index: 1 })).toEqual({ list: [1, 3] });
    expect(good('list.remove', { list: [1, 2, 3], index: -1 })).toEqual({ list: [1, 2] });
    bad('list.remove', { list: [1], index: 4 }, 'NotFound');
  });

  it('removes the first or every match of a value', () => {
    expect(good('list.remove', { list: [1, 2, 1], by: 'first', value: 1 })).toEqual({
      list: [2, 1],
    });
    expect(good('list.remove', { list: [1, 2, 1], by: 'all', value: 1 })).toEqual({ list: [2] });
    expect(good('list.remove', { list: [1, 2], by: 'first', value: 9 })).toEqual({ list: [1, 2] });
    bad('list.remove', { list: [1], by: 'first' }, 'Invalid');
  });
});

describe('list.filter', () => {
  const lights = [10, 60, 90];
  const rooms = [
    { name: 'Hall', online: true },
    { name: 'Den', online: false },
  ];

  it('splits by a test of each item against a value', () => {
    expect(good('list.filter', { list: lights, test: 'gt', value: 50 })).toEqual({
      kept: [60, 90],
      rejected: [10],
      count: 2,
    });
    expect(good('list.filter', { list: [true, false, true] })).toEqual({
      kept: [true, true],
      rejected: [false],
      count: 2,
    });
  });

  it('tests a field of each record and leaves out records without it', () => {
    expect(good('list.filter', { list: rooms, field: 'online' })).toEqual({
      kept: [rooms[0]],
      rejected: [rooms[1]],
      count: 1,
    });
    expect(good('list.filter', { list: rooms, field: 'size', value: 1 })).toMatchObject({
      count: 0,
    });
  });

  it('refuses items of another kind than the value', () => {
    bad('list.filter', { list: ['a'], test: 'gt', value: 1 }, 'TypeError');
  });
});

describe('list.any and list.all', () => {
  it('tell whether some or every item passes', () => {
    expect(good('list.any', { list: [1, 5], test: 'gt', value: 4 })).toEqual({ result: true });
    expect(good('list.any', { list: [] })).toEqual({ result: false });
    expect(good('list.all', { list: [1, 5], test: 'gt', value: 4 })).toEqual({ result: false });
    expect(good('list.all', { list: [true, true] })).toEqual({ result: true });
    expect(good('list.all', { list: [] })).toEqual({ result: true });
  });
});

describe('list.field', () => {
  it('takes one field of every record', () => {
    expect(good('list.field', { list: [{ n: 1 }, { n: 2 }], field: 'n' })).toEqual({
      list: [1, 2],
    });
  });

  it('fails when a record has no such field', () => {
    expect(bad('list.field', { list: [{ n: 1 }, {}], field: 'n' }, 'NotFound')).toContain('item 2');
  });
});

describe('list.find', () => {
  it('finds the first item that passes the test', () => {
    expect(good('list.find', { list: [3, 8, 12], test: 'gt', value: 5 })).toEqual({
      found: true,
      item: 8,
      index: 1,
    });
    expect(good('list.find', { list: ['a', 'b'], value: 'b' })).toEqual({
      found: true,
      item: 'b',
      index: 1,
    });
    expect(good('list.find', { list: ['a'], value: 'z' })).toEqual({ found: false });
    expect(good('list.find', { list: [{ id: 'x' }], field: 'id', value: 'x' })).toMatchObject({
      found: true,
      index: 0,
    });
  });
});

describe('list.cycle', () => {
  it('cycles brightness steps and wraps', () => {
    expect(good('list.cycle', { list: STEPS, current: 25 })).toEqual({ next: 50, index: 2 });
    expect(good('list.cycle', { list: STEPS, current: 100 })).toEqual({ next: 1, index: 0 });
    expect(good('list.cycle', { list: STEPS, current: 1, direction: 'previous' })).toEqual({
      next: 100,
      index: 4,
    });
  });

  it('stops at the ends and starts from the first for an unknown current', () => {
    expect(good('list.cycle', { list: STEPS, current: 100, edge: 'stop' })).toEqual({
      next: 100,
      index: 4,
    });
    expect(
      good('list.cycle', { list: STEPS, current: 1, direction: 'previous', edge: 'stop' }),
    ).toEqual({
      next: 1,
      index: 0,
    });
    expect(good('list.cycle', { list: STEPS, current: 33 })).toEqual({ next: 1, index: 0 });
    bad('list.cycle', { list: [], current: 1 }, 'Invalid');
  });
});
