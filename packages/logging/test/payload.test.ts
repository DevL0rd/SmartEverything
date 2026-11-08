import { describe, expect, it } from 'vitest';
import { clip, payloadOf } from '../src/payload';
import { shippedRecord } from '../src/shipment';

describe('payloads', () => {
  it('keeps a payload nested as deep as it is', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: { h: { i: 'deep' } } } } } } } } };
    expect(payloadOf(deep)).toEqual(deep);
  });

  it('keeps every value it is given, whatever the field is called', () => {
    const payload = { token: 'abc', password: 'def', email: 'a@b.test', phone: '555' };
    expect(payloadOf(payload)).toEqual(payload);
  });

  it('keeps arrays and their entries', () => {
    expect(payloadOf({ people: [{ id: '1', phone: '555' }] })).toEqual({
      people: [{ id: '1', phone: '555' }],
    });
  });

  it('renders a date rather than leaving an object nobody can read', () => {
    expect(payloadOf({ at: new Date('2026-03-01T12:00:00.000Z') })).toEqual({
      at: '2026-03-01T12:00:00.000Z',
    });
  });

  it('leaves null and primitives alone', () => {
    expect(payloadOf({ nothing: null, count: 3, ok: true })).toEqual({
      nothing: null,
      count: 3,
      ok: true,
    });
  });

  it('marks a loop rather than following it forever', () => {
    const looping: Record<string, unknown> = {};
    looping['self'] = looping;
    expect(JSON.stringify(payloadOf(looping))).toContain('[circular]');
  });

  it('keeps the same object twice when it is only shared, not a loop', () => {
    const shared = { id: 'a' };
    expect(payloadOf({ one: shared, two: shared })).toEqual({
      one: { id: 'a' },
      two: { id: 'a' },
    });
  });
});

describe('what leaves the app', () => {
  it('keeps every frame of a stack, with its file and its position', () => {
    const stack = [
      "TypeError: Cannot read properties of undefined (reading 'rows')",
      '    at rowsOf (http://localhost:8081/index.bundle?platform=web:1:2345)',
      '    at useDriveRoots (app://bundle/_expo/static/js/web/entry-9f2.js:88:12)',
    ].join('\n');
    const shipped = shippedRecord({
      timestamp: '2026-11-08T00:00:00.000Z',
      level: 'exception',
      runtime: 'app',
      platform: 'web',
      scope: 'app.crash-guard',
      event: 'error.uncaught',
      payload: { screen: 'drive' },
      failure: { name: 'TypeError', message: 'reading rows', stack },
      release: '0.1.4',
      bundle: 'web-77',
    });
    expect(shipped.failure?.stack).toBe(stack);
    expect(shipped.release).toBe('0.1.4');
    expect(shipped.bundle).toBe('web-77');
  });
});

describe('clip', () => {
  it('cuts text to the limit and leaves the rest', () => {
    expect(clip('abcdef', 3)).toBe('abc');
    expect(clip('abc', 10)).toBe('abc');
  });

  it('keeps a stack trace whole, positions and all', () => {
    const stack = 'Error: boom\n    at v (http://localhost:8081/index.bundle:1:2345)';
    expect(clip(stack, 8000)).toBe(stack);
  });
});
