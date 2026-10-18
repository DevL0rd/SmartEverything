import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ACCESS_LEVELS,
  HTTP_METHODS,
  NO_BODY,
  PathParameterError,
  buildPath,
  encodeQuery,
  endpoint,
  matchPath,
} from '../src';

describe('endpoint vocabulary', () => {
  it('HTTP_METHODS lists exactly the five methods the API uses', () => {
    expect(HTTP_METHODS).toStrictEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
  });

  it('ACCESS_LEVELS lists exactly public, member and owner', () => {
    expect(ACCESS_LEVELS).toStrictEqual(['public', 'member', 'owner']);
  });

  it('NO_BODY accepts only an absent body', () => {
    expect(NO_BODY.safeParse(undefined)).toStrictEqual({ success: true, data: undefined });
    expect(NO_BODY.safeParse({}).success).toBe(false);
    expect(NO_BODY.safeParse(null).success).toBe(false);
  });

  it('endpoint returns the definition it was given', () => {
    const definition = {
      method: 'GET',
      path: '/x',
      access: 'public',
      summary: 'X',
      params: z.strictObject({}),
      query: z.strictObject({}),
      body: NO_BODY,
      response: z.null(),
    } as const;
    expect(endpoint(definition)).toBe(definition);
  });
});

describe('matching paths', () => {
  it('matchPath returns the decoded parameters of a matching path', () => {
    expect(matchPath('/api/clients/:clientId', '/api/clients/a%20b')).toStrictEqual({
      clientId: 'a b',
    });
    expect(
      matchPath('/api/events/:eventId/acknowledge', '/api/events/e1/acknowledge'),
    ).toStrictEqual({ eventId: 'e1' });
  });

  it('matchPath returns no parameters for a matching path without placeholders', () => {
    expect(matchPath('/api/rooms', '/api/rooms')).toStrictEqual({});
    expect(matchPath('/', '/')).toStrictEqual({});
  });

  it('matchPath ignores empty segments from doubled and trailing slashes', () => {
    expect(matchPath('/api/rooms/:roomId', '/api//rooms/r1/')).toStrictEqual({ roomId: 'r1' });
  });

  it('matchPath refuses a path with a different literal segment', () => {
    expect(matchPath('/api/rooms/:roomId', '/api/scenes/r1')).toBeNull();
    expect(matchPath('/api/rooms', '/api/scenes')).toBeNull();
  });

  it('matchPath refuses a path with more or fewer segments', () => {
    expect(matchPath('/api/rooms', '/api/rooms/r1')).toBeNull();
    expect(matchPath('/api/rooms/:roomId', '/api/rooms')).toBeNull();
  });
});

describe('building paths', () => {
  it('buildPath fills and encodes every placeholder', () => {
    expect(buildPath('/api/clients/:clientId', { clientId: 'a b/c' })).toBe(
      '/api/clients/a%20b%2Fc',
    );
    expect(buildPath('/api/events/:eventId/acknowledge', { eventId: 'e1', unused: 'x' })).toBe(
      '/api/events/e1/acknowledge',
    );
  });

  it('buildPath keeps a path without placeholders and normalises slashes', () => {
    expect(buildPath('/api/rooms', {})).toBe('/api/rooms');
    expect(buildPath('api//rooms/', {})).toBe('/api/rooms');
    expect(buildPath('/', {})).toBe('/');
  });

  it('buildPath throws a PathParameterError naming the missing parameter', () => {
    expect(() => buildPath('/api/rooms/:roomId', {})).toThrow(
      new PathParameterError('/api/rooms/:roomId', 'roomId'),
    );
    const error = new PathParameterError('/api/rooms/:roomId', 'roomId');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PathParameterError');
    expect(error.pattern).toBe('/api/rooms/:roomId');
    expect(error.parameter).toBe('roomId');
    expect(error.message).toBe(
      'The path /api/rooms/:roomId needs a value for :roomId, but none was given.',
    );
  });

  it('buildPath and matchPath round-trip any non-empty parameter values', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), (first, second) => {
        const pattern = '/api/:first/items/:second';
        const params = { first, second };
        expect(matchPath(pattern, buildPath(pattern, params))).toStrictEqual(params);
      }),
    );
  });
});

describe('encoding queries', () => {
  it('encodeQuery returns nothing for no values', () => {
    expect(encodeQuery({})).toBe('');
    expect(encodeQuery({ from: undefined })).toBe('');
  });

  it('encodeQuery writes text, numbers, booleans and comma-joined lists', () => {
    expect(encodeQuery({ q: 'a b', limit: 5, lowest: false, ids: ['x', 'y'], to: undefined })).toBe(
      '?q=a+b&limit=5&lowest=false&ids=x%2Cy',
    );
  });

  it('encodeQuery round-trips through URLSearchParams', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1 }), fc.oneof(fc.string(), fc.integer())),
        (values) => {
          const text = encodeQuery(values);
          const decoded = Object.fromEntries(new URLSearchParams(text.slice(1)));
          const expected = Object.fromEntries(
            Object.entries(values).map(([key, value]) => [key, String(value)]),
          );
          expect(decoded).toStrictEqual(expected);
          expect(text === '' || text.startsWith('?')).toBe(true);
        },
      ),
    );
  });
});
