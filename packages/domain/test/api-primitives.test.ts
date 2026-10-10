import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { CLIENT_PLATFORMS, DONE, HTTPS_URL, ICE_SERVER, ROLES, WEBRTC_CANDIDATE } from '../src';
import {
  CLIENT_PLATFORM,
  COUNT,
  DAY,
  FLAG,
  ID,
  JSON_LIST,
  JSON_OBJECT,
  MOMENT,
  NOTHING,
  POSITION,
  QUERY_FLAG,
  QUERY_IDS,
  QUERY_NAMES,
  ROLE,
  TIME_WINDOW,
  boundedText,
  queryLimit,
  queryList,
  somethingToChange,
} from '../src/api/primitives';

const FIRST = '00000000-0000-4000-8000-000000000001';
const SECOND = '00000000-0000-4000-8000-000000000002';

function accepts(schema: z.ZodType, value: unknown): boolean {
  return schema.safeParse(value).success;
}

function messageOf(schema: z.ZodType, value: unknown): string | undefined {
  return schema.safeParse(value).error?.issues[0]?.message;
}

describe('api scalar primitives', () => {
  it('ID accepts a UUID and refuses anything else', () => {
    expect(ID.parse(FIRST)).toBe(FIRST);
    expect(accepts(ID, 'not-a-uuid')).toBe(false);
  });

  it('MOMENT accepts ISO date-times in UTC or with an offset and refuses bare dates', () => {
    expect(MOMENT.parse('2026-10-08T07:00:00Z')).toBe('2026-10-08T07:00:00Z');
    expect(MOMENT.parse('2026-10-08T07:00:00+02:00')).toBe('2026-10-08T07:00:00+02:00');
    expect(accepts(MOMENT, '2026-10-08')).toBe(false);
  });

  it('DAY accepts a calendar date and refuses an impossible one', () => {
    expect(DAY.parse('2026-10-08')).toBe('2026-10-08');
    expect(accepts(DAY, '2026-13-01')).toBe(false);
  });

  it('FLAG accepts only booleans', () => {
    expect(FLAG.parse(false)).toBe(false);
    expect(accepts(FLAG, 'true')).toBe(false);
  });

  it('JSON_OBJECT and JSON_LIST keep nested JSON as given', () => {
    const object = { a: [1, 'two', { b: null }], c: true };
    expect(JSON_OBJECT.parse(object)).toStrictEqual(object);
    expect(accepts(JSON_OBJECT, [1])).toBe(false);
    expect(JSON_LIST.parse([1, { a: 'b' }])).toStrictEqual([1, { a: 'b' }]);
    expect(accepts(JSON_LIST, { a: 1 })).toBe(false);
  });

  it('POSITION accepts whole numbers from 0 to 1,000,000 only', () => {
    expect(POSITION.parse(0)).toBe(0);
    expect(POSITION.parse(500)).toBe(500);
    expect(POSITION.parse(1_000_000)).toBe(1_000_000);
    expect(accepts(POSITION, -1)).toBe(false);
    expect(accepts(POSITION, 1_000_001)).toBe(false);
    expect(accepts(POSITION, 1.5)).toBe(false);
  });

  it('COUNT accepts non-negative whole numbers only', () => {
    expect(COUNT.parse(0)).toBe(0);
    expect(COUNT.parse(42)).toBe(42);
    expect(accepts(COUNT, -1)).toBe(false);
    expect(accepts(COUNT, 0.5)).toBe(false);
  });

  it('ROLE lists exactly owner and member', () => {
    expect(ROLES).toStrictEqual(['owner', 'member']);
    expect(ROLE.parse('owner')).toBe('owner');
    expect(ROLE.parse('member')).toBe('member');
    expect(accepts(ROLE, 'admin')).toBe(false);
  });

  it('CLIENT_PLATFORM lists exactly desktop, android and web', () => {
    expect(CLIENT_PLATFORMS).toStrictEqual(['desktop', 'android', 'web']);
    expect(CLIENT_PLATFORMS.map((platform) => CLIENT_PLATFORM.parse(platform))).toStrictEqual([
      'desktop',
      'android',
      'web',
    ]);
    expect(accepts(CLIENT_PLATFORM, 'ios')).toBe(false);
  });
});

describe('bounded text', () => {
  const name = boundedText(5);

  it('trims both ends before checking the length', () => {
    expect(name.parse('  ab  ')).toBe('ab');
    expect(name.parse('\tabcde\n')).toBe('abcde');
  });

  it('accepts one to the longest number of characters', () => {
    expect(name.parse('a')).toBe('a');
    expect(name.parse('ab')).toBe('ab');
    expect(name.parse('abcde')).toBe('abcde');
  });

  it('refuses empty, blank and over-long text', () => {
    expect(accepts(name, '')).toBe(false);
    expect(accepts(name, '   ')).toBe(false);
    expect(accepts(name, 'abcdef')).toBe(false);
  });
});

describe('ICE servers', () => {
  it('accept stun, turn and turns URLs with optional credentials', () => {
    const server = {
      urls: ['stun:stun.example.com:3478', 'turn:turn.example.com', 'turns:turn.example.com:443'],
      username: 'ab',
      credential: 'cd',
    };
    expect(ICE_SERVER.parse(server)).toStrictEqual(server);
    expect(ICE_SERVER.parse({ urls: ['stun:a'] })).toStrictEqual({ urls: ['stun:a'] });
  });

  it('refuse other schemes, blanks and missing hosts with the published message', () => {
    for (const url of ['http://a', '1stun:a', 'stun:a b', 'stun:', `turn${'s'.repeat(2)}:a`]) {
      expect(messageOf(ICE_SERVER, { urls: [url] })).toBe('a stun:, turn: or turns: URL');
    }
  });

  it('refuse an empty URL list, empty credentials and unknown keys', () => {
    expect(accepts(ICE_SERVER, { urls: [] })).toBe(false);
    expect(accepts(ICE_SERVER, { urls: ['stun:a'], username: '' })).toBe(false);
    expect(accepts(ICE_SERVER, { urls: ['stun:a'], credential: '' })).toBe(false);
    expect(accepts(ICE_SERVER, { urls: ['stun:a'], realm: 'x' })).toBe(false);
  });
});

describe('WebRTC candidates', () => {
  it('accept a host or address with an optional port of one to five digits', () => {
    for (const candidate of ['home', '192.168.1.2', 'h:1', 'h:8555', 'h:65535', 'a-b.c_d']) {
      expect(WEBRTC_CANDIDATE.parse(candidate)).toBe(candidate);
    }
  });

  it('refuse blanks, empty ports, long ports and extra colons with the published message', () => {
    for (const candidate of [
      '',
      ' h',
      'h ',
      'a b',
      'h:',
      'h:123456',
      'h:1a',
      ':80',
      'a:b',
      'a:b:1',
    ]) {
      expect(messageOf(WEBRTC_CANDIDATE, candidate)).toBe('a host, an address or host:port');
    }
  });
});

describe('HTTPS URLs', () => {
  it('accept an https URL with or without a path', () => {
    expect(HTTPS_URL.parse('https://home.example.com')).toBe('https://home.example.com');
    expect(HTTPS_URL.parse('https://home.example.com/se')).toBe('https://home.example.com/se');
  });

  it('refuse other protocols', () => {
    for (const url of ['http://home.example.com', 'xhttps://a.example', 'https2://a.example']) {
      expect(accepts(HTTPS_URL, url)).toBe(false);
    }
  });

  it('refuse a query with the published message', () => {
    expect(messageOf(HTTPS_URL, 'https://home.example.com/?a=1')).toBe('must not carry a query');
  });
});

describe('query lists', () => {
  it('queryList splits on commas and validates every item', () => {
    const letters = queryList(boundedText(1));
    expect(letters.parse('a')).toStrictEqual(['a']);
    expect(letters.parse('a,b,c')).toStrictEqual(['a', 'b', 'c']);
    expect(accepts(letters, 'a,bc')).toBe(false);
  });

  it('QUERY_IDS accepts comma-separated UUIDs and refuses an empty or broken item', () => {
    expect(QUERY_IDS.parse(`${FIRST},${SECOND}`)).toStrictEqual([FIRST, SECOND]);
    expect(accepts(QUERY_IDS, '')).toBe(false);
    expect(accepts(QUERY_IDS, `${FIRST},x`)).toBe(false);
  });

  it('QUERY_NAMES accepts names of one to 120 characters', () => {
    const longest = 'n'.repeat(120);
    expect(QUERY_NAMES.parse(`a,ab,${longest}`)).toStrictEqual(['a', 'ab', longest]);
    expect(accepts(QUERY_NAMES, 'a,')).toBe(false);
    expect(accepts(QUERY_NAMES, 'n'.repeat(121))).toBe(false);
  });

  it('round-trips any list of comma-free names', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.string({ minLength: 1, maxLength: 120 }).filter((text) => !text.includes(',')),
          { minLength: 1 },
        ),
        (names) => {
          expect(QUERY_NAMES.parse(names.join(','))).toStrictEqual(names);
        },
      ),
    );
  });
});

describe('time windows', () => {
  const window = TIME_WINDOW;

  it('accept from, to and device ids as query text', () => {
    const query = { from: '2026-10-08T00:00:00Z', to: '2026-10-09T00:00:00Z' };
    expect(window.from.parse(query.from)).toBe(query.from);
    expect(window.to.parse(query.to)).toBe(query.to);
    expect(window.deviceIds.parse(`${FIRST},${SECOND}`)).toStrictEqual([FIRST, SECOND]);
  });

  it('leave every part optional', () => {
    expect(window.from.parse(undefined)).toBeUndefined();
    expect(window.to.parse(undefined)).toBeUndefined();
    expect(window.deviceIds.parse(undefined)).toBeUndefined();
    expect(Object.keys(window)).toStrictEqual(['from', 'to', 'deviceIds']);
  });
});

describe('patches', () => {
  const patch = somethingToChange({ name: boundedText(5), size: COUNT });

  it('somethingToChange accepts any non-empty subset of the fields', () => {
    expect(patch.parse({ name: 'ab' })).toStrictEqual({ name: 'ab' });
    expect(patch.parse({ size: 2 })).toStrictEqual({ size: 2 });
    expect(patch.parse({ name: 'ab', size: 2 })).toStrictEqual({ name: 'ab', size: 2 });
  });

  it('somethingToChange refuses an empty patch with the published message', () => {
    expect(messageOf(patch, {})).toBe('name at least one field to change');
  });

  it('somethingToChange refuses unknown keys and invalid fields', () => {
    expect(accepts(patch, { name: 'ab', colour: 'red' })).toBe(false);
    expect(accepts(patch, { name: '' })).toBe(false);
  });
});

describe('query limits', () => {
  const limit = queryLimit(5, 10);

  it('default to the standard limit when absent', () => {
    expect(limit.parse(undefined)).toBe(5);
  });

  it('coerce query text from one up to the largest limit', () => {
    expect(limit.parse('1')).toBe(1);
    expect(limit.parse('2')).toBe(2);
    expect(limit.parse('10')).toBe(10);
  });

  it('refuse zero, fractions, text and anything over the largest limit', () => {
    for (const text of ['0', '-1', '2.5', 'x', '11']) {
      expect(accepts(limit, text)).toBe(false);
    }
  });
});

describe('query flags and fixed bodies', () => {
  it('QUERY_FLAG turns true and false text into booleans and refuses anything else', () => {
    expect(QUERY_FLAG.parse('true')).toBe(true);
    expect(QUERY_FLAG.parse('false')).toBe(false);
    expect(accepts(QUERY_FLAG, 'yes')).toBe(false);
    expect(accepts(QUERY_FLAG, true)).toBe(false);
  });

  it('NOTHING accepts only an empty object', () => {
    expect(NOTHING.parse({})).toStrictEqual({});
    expect(accepts(NOTHING, { a: 1 })).toBe(false);
  });

  it('DONE accepts only ok true', () => {
    expect(DONE.parse({ ok: true })).toStrictEqual({ ok: true });
    expect(accepts(DONE, { ok: false })).toBe(false);
    expect(accepts(DONE, { ok: true, extra: 1 })).toBe(false);
  });
});
