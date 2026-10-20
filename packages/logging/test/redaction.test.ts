import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DENIED_FIELDS, REDACTED, isDeniedField, redact, redactText } from '../src/redaction';

describe('redaction', () => {
  it('denies exactly the fields it says it denies, in one list nobody has to remember', () => {
    expect([...DENIED_FIELDS]).toEqual([
      'accessToken',
      'address',
      'apiKey',
      'api_key',
      'authorization',
      'clientSecret',
      'code',
      'deliveryAddress',
      'deviceToken',
      'email',
      'geminiKey',
      'idToken',
      'localKey',
      'local_key',
      'oneTimeCode',
      'passToken',
      'password',
      'phone',
      'refreshToken',
      'secret',
      'secretKey',
      'serviceRoleKey',
      'serviceToken',
      'sessionId',
      'shippingAddress',
      'ssecurity',
      'token',
    ]);
  });

  it('marks what it removed, rather than dropping the field silently', () => {
    expect(REDACTED).toBe('[redacted]');
  });

  it('keeps a payload nested right up to the depth it allows', () => {
    const atTheLimit = { a: { b: { c: { d: { e: { f: { g: { h: 'deep' } } } } } } } };
    expect(redact(atTheLimit)).toEqual(atTheLimit);
  });

  it('stops descending one level further, rather than following a structure forever', () => {
    const pastTheLimit = { a: { b: { c: { d: { e: { f: { g: { h: { i: 'deep' } } } } } } } } };
    expect(redact(pastTheLimit)).toEqual({
      a: { b: { c: { d: { e: { f: { g: { h: { i: REDACTED } } } } } } } },
    });
  });

  it('counts an array as a level, so a deep list cannot slip past the limit', () => {
    const throughArrays = {
      a: [{ b: [{ c: [{ d: [{ e: [{ f: 'deep' }] }] }] }] }],
    };
    expect(JSON.stringify(redact(throughArrays))).toContain(REDACTED);
    expect(JSON.stringify(redact(throughArrays))).not.toContain('deep');
  });

  it('removes every field on the deny list, wherever it sits', () => {
    for (const field of DENIED_FIELDS) {
      expect(redact({ [field]: 'sensitive' })).toEqual({ [field]: REDACTED });
    }
  });

  it('matches a denied field whatever its casing', () => {
    expect(redact({ Email: 'a@b.test' })).toEqual({ Email: REDACTED });
    expect(redact({ ACCESSTOKEN: 'abc' })).toEqual({ ACCESSTOKEN: REDACTED });
  });

  it('keeps identifiers, because they are how anything is traced', () => {
    expect(redact({ actorId: 'abc', deviceId: 'def' })).toEqual({
      actorId: 'abc',
      deviceId: 'def',
    });
  });

  it('reaches into nested objects', () => {
    expect(redact({ user: { id: 'abc', email: 'a@b.test' } })).toEqual({
      user: { id: 'abc', email: REDACTED },
    });
  });

  it('reaches into arrays of objects', () => {
    expect(redact({ people: [{ id: '1', phone: '555' }] })).toEqual({
      people: [{ id: '1', phone: REDACTED }],
    });
  });

  it('renders a date rather than leaving an object nobody can read', () => {
    expect(redact({ at: new Date('2026-03-01T12:00:00.000Z') })).toEqual({
      at: '2026-03-01T12:00:00.000Z',
    });
  });

  it('leaves null and primitives alone', () => {
    expect(redact({ nothing: null, count: 3, ok: true })).toEqual({
      nothing: null,
      count: 3,
      ok: true,
    });
  });

  it('stops descending rather than following a structure that never ends', () => {
    const looping: Record<string, unknown> = {};
    looping['self'] = looping;
    expect(() => redact(looping)).not.toThrow();
    expect(JSON.stringify(redact(looping))).toContain(REDACTED);
  });

  it('knows a denied field from an allowed one', () => {
    expect(isDeniedField('password')).toBe(true);
    expect(isDeniedField('sceneId')).toBe(false);
  });

  it('never lets a denied field survive at any depth', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...DENIED_FIELDS),
        fc.integer({ min: 0, max: 6 }),
        (field, depth) => {
          let payload: Record<string, unknown> = { [field]: 'sensitive' };
          for (let level = 0; level < depth; level += 1) {
            payload = { nested: payload };
          }
          expect(JSON.stringify(redact(payload))).not.toContain('sensitive');
        },
      ),
    );
  });
});

describe('redacting free text', () => {
  it('hides addresses, links, e-mail and long tokens but keeps ids', () => {
    const uuid = '123e4567-e89b-12d3-a456-426614174000';
    const text = `see https://a.example/x?k=1 mail me@a.example at 192.168.1.5 key ${'k'.repeat(30)} id ${uuid}`;
    expect(redactText(text, 500)).toBe(
      `see ${REDACTED} mail ${REDACTED} at ${REDACTED} key ${REDACTED} id ${uuid}`,
    );
  });

  it('cuts the result to the limit', () => {
    expect(redactText('abcdef', 3)).toBe('abc');
  });
});
