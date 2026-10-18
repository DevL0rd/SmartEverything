import { describe, expect, it } from 'vitest';
import {
  HealthSourceListError,
  clientSign,
  parseSourceList,
  rawNonceOf,
  sourceListData,
} from '../src';

const AUTH_KEY = '0123456789abcdef0123456789abcdef';

function wearable(detail: unknown, extra: Record<string, unknown> = {}): unknown {
  return { name: 'Band 8', model: 'xiaomi.watch.band8', sid: 55, detail, ...extra };
}

describe('the Mi Fitness request', () => {
  it('asks for the first fifty bound wearables', () => {
    expect(sourceListData()).toStrictEqual({ page_size: 50, status: 1 });
  });

  it('reads the nonce from a login reply whether it is quoted or not', () => {
    expect(rawNonceOf('{"nonce": 123456789012345678}')).toBe('123456789012345678');
    expect(rawNonceOf('{"nonce":"42"}')).toBe('42');
    expect(rawNonceOf('{"other":1}')).toBeNull();
  });

  it('signs the nonce and ssecurity with SHA-1 as the Mi Fitness app does', () => {
    expect(clientSign('123456', 'c2VjdXJpdHk=')).toBe('dHlrLsFH1nGTgJ1SPUoHQKUJMMc=');
  });
});

describe('the Mi Fitness wearable list', () => {
  it('lists wearables with an auth_key or an encrypt_key and an upper-case MAC', () => {
    const result = parseSourceList({
      list: [
        wearable({ mac: 'aa:bb:cc:dd:ee:ff', auth_key: `0x${AUTH_KEY.toUpperCase()}` }),
        wearable(JSON.stringify({ mac: '11:22:33:44:55:66', encrypt_key: AUTH_KEY }), {
          sid: null,
          model: null,
        }),
        wearable(
          { mac: '11:22:33:44:55:77', auth_key: AUTH_KEY },
          { sid: undefined, model: undefined },
        ),
      ],
    });
    expect(result.skipped).toStrictEqual([]);
    expect(result.wearables).toStrictEqual([
      {
        name: 'Band 8',
        model: 'xiaomi.watch.band8',
        did: '55',
        mac: 'AA:BB:CC:DD:EE:FF',
        authKey: AUTH_KEY,
        keyField: 'auth_key',
      },
      {
        name: 'Band 8',
        model: null,
        did: null,
        mac: '11:22:33:44:55:66',
        authKey: AUTH_KEY,
        keyField: 'encrypt_key',
      },
      {
        name: 'Band 8',
        model: null,
        did: null,
        mac: '11:22:33:44:55:77',
        authKey: AUTH_KEY,
        keyField: 'auth_key',
      },
    ]);
  });

  it('treats a missing list as no wearables', () => {
    expect(parseSourceList({})).toStrictEqual({ wearables: [], skipped: [] });
    expect(parseSourceList({ list: null })).toStrictEqual({ wearables: [], skipped: [] });
  });

  it('skips a source without a usable key and names its fields and the reason', () => {
    const result = parseSourceList({
      list: [wearable({ mac: 'aa:bb:cc:dd:ee:ff', auth_key: 'short' })],
    });
    expect(result.wearables).toStrictEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.fields).toBe('auth_key, mac');
    expect(result.skipped[0]?.reason).toContain('Invalid');
  });

  it('skips a source whose detail is text that is not JSON', () => {
    const result = parseSourceList({ list: [wearable('not json')] });
    expect(result.skipped[0]?.fields).toBe('detail, model, name, sid');
    expect(result.skipped[0]?.reason).toContain('at detail');
  });

  it('skips entries that are not objects and says what they were', () => {
    const result = parseSourceList({ list: ['x', 3] });
    expect(result.skipped.map((entry) => entry.fields)).toStrictEqual(['string', 'number']);
  });

  it('skips a source whose detail is JSON text of a non-object', () => {
    const result = parseSourceList({ list: [wearable('[1]')] });
    expect(result.skipped[0]?.fields).toBe('object');
  });

  it('refuses a reply whose list is not a list', () => {
    expect(() => parseSourceList({ list: 5 })).toThrow(HealthSourceListError);
    expect(() => parseSourceList('x')).toThrow(/without a list/);
  });
});
