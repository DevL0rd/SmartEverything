import { describe, expect, it } from 'vitest';
import { HOME, bad, good } from './support';

describe('text.case', () => {
  const tidy = (text: string, mode: string): unknown => good('text.case', { text, mode })['text'];

  it('trims, lowers and uppers', () => {
    expect(tidy('  hi there ', 'trim')).toBe('hi there');
    expect(tidy('Hi There', 'lower')).toBe('hi there');
    expect(tidy('Hi There', 'upper')).toBe('HI THERE');
  });

  it('writes title and sentence case', () => {
    expect(tidy('the QUICK brown-fox', 'title')).toBe('The Quick Brown-Fox');
    expect(tidy('HELLO there. how ARE you?', 'sentence')).toBe('Hello there. How are you?');
  });

  it('makes a slug without accents or edge dashes', () => {
    expect(tidy('  Café du  Monde! ', 'slug')).toBe('cafe-du-monde');
    expect(tidy('---', 'slug')).toBe('');
  });

  it('trims by default and refuses an unknown mode', () => {
    expect(good('text.case', { text: ' a ' })['text']).toBe('a');
    bad('text.case', { text: 'a', mode: 'shout' }, 'Invalid');
  });
});

describe('text.slice', () => {
  it('takes a run from a start, counting from the end when negative', () => {
    expect(good('text.slice', { text: 'hello world', from: 6 })).toEqual({
      text: 'world',
      length: 5,
    });
    expect(good('text.slice', { text: 'hello world', from: -5, count: 3 })['text']).toBe('wor');
    expect(good('text.slice', { text: 'hello', from: -50 })['text']).toBe('hello');
    expect(good('text.slice', { text: 'hello', count: 0 })['text']).toBe('');
  });

  it('counts characters, not code units', () => {
    expect(good('text.slice', { text: 'a😀b', from: 1, count: 1 })).toEqual({
      text: '😀',
      length: 1,
    });
  });

  it('shortens with an ellipsis and pads to a length', () => {
    expect(good('text.slice', { text: 'hello world', shortenTo: 8 })).toEqual({
      text: 'hello w…',
      length: 8,
    });
    expect(good('text.slice', { text: 'short', shortenTo: 8 })['text']).toBe('short');
    expect(good('text.slice', { text: 'ab', padTo: 5, padWith: '0', padAt: 'start' })['text']).toBe(
      '000ab',
    );
    expect(good('text.slice', { text: 'ab', padTo: 5 })['text']).toBe('ab   ');
  });

  it('refuses counts and fillers it cannot use', () => {
    bad('text.slice', { text: 'a', count: -1 }, 'Invalid');
    bad('text.slice', { text: 'a', from: 0.5 }, 'Invalid');
    bad('text.slice', { text: 'a', shortenTo: 0 }, 'Invalid');
    bad('text.slice', { text: 'a', padTo: 3, padWith: 'xx' }, 'Invalid');
  });
});

describe('text.speakable', () => {
  const say = (value: number, kind: string, extra: Record<string, string> = {}): unknown =>
    good('text.speakable', { value, kind, ...extra })['text'];

  it('says whole numbers, negatives and decimals in words', () => {
    expect(say(0, 'number')).toBe('zero');
    expect(say(23, 'number')).toBe('twenty-three');
    expect(say(105, 'number')).toBe('one hundred and five');
    expect(say(1234, 'number')).toBe('one thousand two hundred and thirty-four');
    expect(say(2_000_000, 'number')).toBe('two million');
    expect(say(-4, 'number')).toBe('minus four');
    expect(say(23.5, 'number', { unit: 'degrees' })).toBe('twenty-three point five degrees');
    expect(say(0.05, 'number')).toBe('zero point zero five');
  });

  it('refuses numbers it cannot say', () => {
    bad('text.speakable', { value: 1e21, kind: 'number' }, 'Invalid');
    bad('text.speakable', { value: 'x', kind: 'number' }, 'TypeError');
  });

  it('says durations with singular and plural units', () => {
    expect(say(3_900_000, 'duration')).toBe('1 hour and 5 minutes');
    expect(say(0, 'duration')).toBe('0 seconds');
    expect(say(1000, 'duration')).toBe('1 second');
    expect(say(90_061_000, 'duration')).toBe('1 day, 1 hour, 1 minute and 1 second');
    expect(say(7_200_000, 'duration')).toBe('2 hours');
    bad('text.speakable', { value: -1, kind: 'duration' }, 'Invalid');
  });

  it('says a moment in the home time zone', () => {
    const text = good('text.speakable', {
      value: '2026-10-18T07:32:00.000Z',
      kind: 'moment',
    })['text'];
    expect(text).toMatch(/Sunday.*18 October.*2:32\s?pm/i);
    expect(HOME.timeZone).toBe('Asia/Bangkok');
    bad('text.speakable', { value: 'soon', kind: 'moment' }, 'TypeError');
    bad(
      'text.speakable',
      { value: '2026-10-18T07:32:00.000Z', kind: 'moment', locale: 'not a locale' },
      'Invalid',
    );
  });
});

describe('list.sort', () => {
  it('orders numbers and texts both ways without touching the input', () => {
    const input = [3, 1, 2];
    expect(good('list.sort', { list: input })).toEqual({ list: [1, 2, 3] });
    expect(good('list.sort', { list: input, direction: 'descending' })).toEqual({
      list: [3, 2, 1],
    });
    expect(input).toEqual([3, 1, 2]);
    expect(good('list.sort', { list: ['b', 'a', 'c'] })['list']).toEqual(['a', 'b', 'c']);
  });

  it('orders numbers inside text naturally only when asked', () => {
    const rooms = ['room 10', 'room 2', 'room 1'];
    expect(good('list.sort', { list: rooms })['list']).toEqual(['room 1', 'room 10', 'room 2']);
    expect(good('list.sort', { list: rooms, natural: true })['list']).toEqual([
      'room 1',
      'room 2',
      'room 10',
    ]);
  });

  it('sorts records by a field and keeps equal items in their order', () => {
    const items = [
      { k: 1, id: 'a' },
      { k: 0, id: 'b' },
      { k: 1, id: 'c' },
    ];
    const sorted = good('list.sort', { list: items, field: 'k' })['list'];
    expect(sorted).toEqual([items[1], items[0], items[2]]);
    const downward = good('list.sort', {
      list: items,
      field: 'k',
      direction: 'descending',
    });
    expect(downward['list']).toEqual([items[0], items[2], items[1]]);
    bad('list.sort', { list: [{ k: 1 }, {}], field: 'k' }, 'NotFound');
  });

  it('refuses mixed kinds', () => {
    bad('list.sort', { list: [1, 'a'] }, 'TypeError');
    bad('list.sort', { list: [true, false] }, 'TypeError');
  });
});

describe('list.unique, list.slice', () => {
  it('keeps the first of equal items and counts what it dropped', () => {
    expect(good('list.unique', { list: [1, 2, 1, 3, 2] })).toEqual({ list: [1, 2, 3], removed: 2 });
    expect(good('list.unique', { list: [{ a: 1 }, { a: 1 }, { a: 2 }] })['removed']).toBe(1);
    const rooms = [
      { r: 'x', n: 1 },
      { r: 'y', n: 2 },
      { r: 'x', n: 3 },
    ];
    expect(good('list.unique', { list: rooms, field: 'r' })['list']).toEqual([rooms[0], rooms[1]]);
  });

  it('takes a run, the first items or the last items', () => {
    const list = [1, 2, 3, 4];
    expect(good('list.slice', { list, from: 1, count: 2 })['list']).toEqual([2, 3]);
    expect(good('list.slice', { list, from: -2 })['list']).toEqual([3, 4]);
    expect(good('list.slice', { list, take: 'first', count: 2 })['list']).toEqual([1, 2]);
    expect(good('list.slice', { list, take: 'last', count: 2 })['list']).toEqual([3, 4]);
    expect(good('list.slice', { list, take: 'last', count: 0 })['list']).toEqual([]);
    expect(good('list.slice', { list, take: 'first', count: 9 })['list']).toEqual(list);
    bad('list.slice', { list, take: 'first' }, 'Invalid');
    bad('list.slice', { list, take: 'middle', count: 1 }, 'Invalid');
    bad('list.slice', { list, from: 0.5 }, 'Invalid');
  });
});

describe('list.combine, list.reshape', () => {
  it('combines lists four ways', () => {
    const lists = [
      [1, 2],
      [2, 3],
    ];
    expect(good('list.combine', { lists })['list']).toEqual([1, 2, 2, 3]);
    expect(good('list.combine', { lists, mode: 'union' })['list']).toEqual([1, 2, 3]);
    expect(
      good('list.combine', {
        lists: [
          [1, 2, 3],
          [2, 3, 4],
          [3, 2],
        ],
        mode: 'intersect',
      })['list'],
    ).toEqual([2, 3]);
    expect(
      good('list.combine', { lists: [[1, 2, 3, 1], [2]], mode: 'difference' })['list'],
    ).toEqual([1, 3]);
    expect(good('list.combine', { lists: [], mode: 'union' })['list']).toEqual([]);
    bad('list.combine', { lists: [[1], 2] }, 'TypeError');
    bad('list.combine', { lists, mode: 'xor' }, 'Invalid');
  });

  it('reverses, flattens one level, chunks and pairs', () => {
    expect(good('list.reshape', { list: [1, 2, 3] })['list']).toEqual([3, 2, 1]);
    expect(good('list.reshape', { list: [[1], [2, [3]], 4], op: 'flatten' })['list']).toEqual([
      1,
      2,
      [3],
      4,
    ]);
    expect(good('list.reshape', { list: [1, 2, 3, 4, 5], op: 'chunk', size: 2 })['list']).toEqual([
      [1, 2],
      [3, 4],
      [5],
    ]);
    expect(good('list.reshape', { list: [1, 2, 3], op: 'zip', other: ['a', 'b'] })['list']).toEqual(
      [
        [1, 'a'],
        [2, 'b'],
      ],
    );
    bad('list.reshape', { list: [1], op: 'chunk', size: 0 }, 'Invalid');
    bad('list.reshape', { list: [1], op: 'zip' }, 'Invalid');
    bad('list.reshape', { list: [1], op: 'spin' }, 'Invalid');
  });
});

describe('list.range', () => {
  it('counts up and down, both ends included', () => {
    expect(good('list.range', { from: 1, to: 5 })['list']).toEqual([1, 2, 3, 4, 5]);
    expect(good('list.range', { from: 10, to: 0, step: 5 })['list']).toEqual([10, 5, 0]);
    expect(good('list.range', { from: 0, to: 1, step: 0.1 })['list']).toHaveLength(11);
    expect(good('list.range', { from: 3, to: 3 })['list']).toEqual([3]);
    bad('list.range', { from: 0, to: 1, step: 0 }, 'Invalid');
    bad('list.range', { from: 0, to: 200_000 }, 'LimitExceeded');
  });
});
