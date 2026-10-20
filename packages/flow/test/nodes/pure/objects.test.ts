import { describe, expect, it } from 'vitest';
import { bad, good } from './support';

const EVENT = { data: { detection: 'person', boxes: [{ x: 1 }, { x: 2 }] }, room: 'Hall' };

describe('object.make', () => {
  it('builds a record and refuses unsafe field names', () => {
    expect(good('object.make', { fields: { room: 'Hall', level: 3 } })).toEqual({
      record: { room: 'Hall', level: 3 },
    });
    bad('object.make', { fields: Object.fromEntries([['constructor', 1]]) }, 'Invalid');
  });
});

describe('object.get', () => {
  it('reads dotted and indexed paths', () => {
    expect(good('object.get', { source: EVENT, path: 'data.detection' })).toEqual({
      value: 'person',
    });
    expect(good('object.get', { source: EVENT, path: 'data.boxes[1].x' })).toEqual({ value: 2 });
    expect(good('object.get', { source: [[5]], path: '[0][0]' })).toEqual({ value: 5 });
    expect(good('object.get', { source: { a: null }, path: 'a' })).toEqual({ value: null });
  });

  it('fails on a missing path unless there is a default', () => {
    expect(bad('object.get', { source: EVENT, path: 'data.zone' }, 'NotFound')).toContain(
      'data.zone',
    );
    bad('object.get', { source: EVENT, path: 'room.name' }, 'NotFound');
    bad('object.get', { source: EVENT, path: 'data.boxes[9]' }, 'NotFound');
    bad('object.get', { source: EVENT, path: 'toString' }, 'NotFound');
    expect(good('object.get', { source: EVENT, path: 'data.zone', default: 'none' })).toEqual({
      value: 'none',
    });
  });

  it('refuses a malformed path', () => {
    bad('object.get', { source: EVENT, path: '' }, 'Invalid');
    bad('object.get', { source: EVENT, path: 'a..b' }, 'Invalid');
    bad('object.get', { source: EVENT, path: 'a[x]' }, 'Invalid');
  });
});

describe('object.set', () => {
  it('sets without changing the original', () => {
    const source = { a: { b: 1 }, list: [1, 2] };
    expect(good('object.set', { source, path: 'a.b', value: 2 })).toEqual({
      record: { a: { b: 2 }, list: [1, 2] },
    });
    expect(source.a.b).toBe(1);
    expect(good('object.set', { source, path: 'list[1]', value: 9 })).toEqual({
      record: { a: { b: 1 }, list: [1, 9] },
    });
    expect(good('object.set', { source, path: 'list[2]', value: 3 })).toEqual({
      record: { a: { b: 1 }, list: [1, 2, 3] },
    });
  });

  it('creates missing parts unless told not to', () => {
    expect(good('object.set', { source: {}, path: 'a.b[0].c', value: 1 })).toEqual({
      record: { a: { b: [{ c: 1 }] } },
    });
    bad('object.set', { source: {}, path: 'a.b', value: 1, create: false }, 'NotFound');
    expect(good('object.set', { source: { a: {} }, path: 'a.b', value: 1, create: false })).toEqual(
      {
        record: { a: { b: 1 } },
      },
    );
  });

  it('refuses unsafe keys and wrong container types', () => {
    bad('object.set', { source: {}, path: '__proto__.x', value: 1 }, 'Invalid');
    bad('object.set', { source: {}, path: 'constructor', value: 1 }, 'Invalid');
    bad('object.set', { source: { a: 1 }, path: 'a.b', value: 1 }, 'TypeError');
    bad('object.set', { source: { a: {} }, path: 'a[0]', value: 1 }, 'TypeError');
    bad('object.set', { source: { a: [] }, path: 'a[3]', value: 1 }, 'Invalid');
  });
});

describe('object.parse_json and object.to_json', () => {
  it('parses an HTTP body', () => {
    expect(good('object.parse_json', { text: '{"a":[1,2]}' })).toEqual({
      json: { a: [1, 2] },
      ok: true,
    });
  });

  it('checks the shape when given', () => {
    const shape = 'level:number, name:text, on:boolean, tags:list, meta:record, any';
    const text = '{"level":1,"name":"x","on":true,"tags":[],"meta":{},"any":0}';
    expect(good('object.parse_json', { text, shape })).toMatchObject({ ok: true });
    expect(
      bad('object.parse_json', { text: '{"level":"1"}', shape: 'level:number' }, 'Invalid'),
    ).toContain('level');
    bad('object.parse_json', { text: '{}', shape: 'level:colour' }, 'Invalid');
  });

  it('fails on text that is not JSON', () => {
    bad('object.parse_json', { text: '{nope' }, 'Invalid');
  });

  it('writes JSON compactly or prettily', () => {
    expect(good('object.to_json', { value: { a: 1 } })).toEqual({ text: '{"a":1}' });
    expect(good('object.to_json', { value: { a: 1 }, pretty: true })).toEqual({
      text: '{\n  "a": 1\n}',
    });
  });
});
