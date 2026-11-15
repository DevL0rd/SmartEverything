import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  ERROR_NAMES,
  FRAME_FLAGS,
  FRAME_TYPES,
  HEADER_BYTES,
  MAX_FRAME_BYTES,
  MAX_META_BYTES,
  MAX_PAYLOAD_BYTES,
  OPS,
  OP_NAMES,
  PUSH_OP_NAMES,
  REQUEST_META,
  REQUEST_OP_NAMES,
  REPLY_META,
  PUSH_META,
  META_KEYS,
  errorNameOf,
  hasKey,
  isPushName,
  isRequestName,
  isWellFormed,
  opNameOf,
} from '../../../src/drive/mount';
import { REQUEST_SAMPLES } from './samples';

describe('op table', () => {
  it('gives every op one distinct code that fits a byte', () => {
    const codes = OP_NAMES.map((name) => OPS[name].code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toBeGreaterThan(0);
    for (const code of codes) expect(code).toBeLessThanOrEqual(0xff);
  });

  it('keeps pushes above the request codes', () => {
    const highest = Math.max(...REQUEST_OP_NAMES.map((name) => OPS[name].code));
    for (const name of PUSH_OP_NAMES) expect(OPS[name].code).toBeGreaterThan(highest);
  });

  it('resolves a code to its op and an unknown code to nothing', () => {
    for (const name of OP_NAMES) expect(opNameOf(OPS[name].code)).toBe(name);
    expect(opNameOf(0)).toBeUndefined();
    expect(opNameOf(0xff)).toBeUndefined();
  });

  it('has a request schema and a reply schema for every request op and a schema for every push', () => {
    expect(Object.keys(REQUEST_META).sort()).toEqual([...REQUEST_OP_NAMES].sort());
    expect(Object.keys(REPLY_META).sort()).toEqual([...REQUEST_OP_NAMES].sort());
    expect(Object.keys(PUSH_META).sort()).toEqual([...PUSH_OP_NAMES].sort());
  });

  it('puts every op that carries an op key in the ordered mutation lane', () => {
    for (const name of REQUEST_OP_NAMES) {
      const definition = OPS[name];
      if (definition.push) throw new Error('a request op is a push');
      if ('opKey' in REQUEST_SAMPLES[name]) expect(definition.lane).toBe('mutation');
    }
  });

  it('puts exactly the plan mutations in the mutation lane', () => {
    const lane = REQUEST_OP_NAMES.filter((name) => {
      const definition = OPS[name];
      return !definition.push && definition.lane === 'mutation';
    });
    expect(lane.sort()).toEqual(
      [
        'SETATTR',
        'MKDIR',
        'CREATE',
        'MKNOD',
        'SYMLINK',
        'LINK',
        'UNLINK',
        'RMDIR',
        'RENAME',
        'TMPFILE',
        'SETXATTR',
        'REMOVEXATTR',
        'BEGIN',
        'END',
        'PUT',
        'FSYNC',
      ].sort(),
    );
  });

  it('marks the payload carrying ops', () => {
    const request = REQUEST_OP_NAMES.filter((name) => {
      const definition = OPS[name];
      return !definition.push && definition.requestPayload;
    });
    const reply = REQUEST_OP_NAMES.filter((name) => {
      const definition = OPS[name];
      return !definition.push && definition.replyPayload;
    });
    expect(request.sort()).toEqual(['PUT', 'SETXATTR', 'WRITE']);
    expect(reply.sort()).toEqual(['GETXATTR', 'READ']);
  });
});

describe('frame constants', () => {
  it('lays out the header the plan fixes', () => {
    expect(HEADER_BYTES).toBe(16);
    expect(FRAME_TYPES).toEqual({ request: 1, reply: 2, error: 3, push: 4 });
    expect(FRAME_FLAGS).toEqual({ payload: 1, more: 2 });
  });

  it('carries a full write payload and a full meta in one frame', () => {
    expect(MAX_PAYLOAD_BYTES).toBe(1024 * 1024);
    expect(MAX_FRAME_BYTES).toBe(HEADER_BYTES + MAX_META_BYTES + MAX_PAYLOAD_BYTES);
  });
});

describe('error codes', () => {
  it('lists the plan enum in order with codes from one', () => {
    expect(ERROR_NAMES).toHaveLength(26);
    expect(ERROR_NAMES[0]).toBe('ENOENT');
    expect(ERROR_NAMES.at(-1)).toBe('EFBIG');
    ERROR_NAMES.forEach((name, index) => {
      expect(ERROR_CODES[name]).toBe(index + 1);
      expect(errorNameOf(index + 1)).toBe(name);
    });
  });

  it('knows no error for an unassigned code', () => {
    expect(errorNameOf(0)).toBeUndefined();
    expect(errorNameOf(ERROR_NAMES.length + 1)).toBeUndefined();
  });
});

describe('name guards', () => {
  it('tell pushes from request ops', () => {
    for (const name of PUSH_OP_NAMES) {
      expect(isPushName(name)).toBe(true);
      expect(isRequestName(name)).toBe(false);
    }
    for (const name of REQUEST_OP_NAMES) {
      expect(isPushName(name)).toBe(false);
      expect(isRequestName(name)).toBe(true);
    }
  });

  it('tell an own key from an inherited one', () => {
    class Table {
      own = 2;
      inherited(): number {
        return 1;
      }
    }
    const table = new Table();
    expect(hasKey(table, 'own')).toBe(true);
    expect(hasKey(table, 'inherited')).toBe(false);
    expect(hasKey(table, 'missing')).toBe(false);
  });
});

describe('text and keys', () => {
  it('numbers the wire keys from zero without gaps or repeats', () => {
    const values = Object.values(META_KEYS);
    expect(values).toEqual(values.map((_, index) => index));
  });

  it('tells well formed text from unpaired surrogates', () => {
    expect(isWellFormed('abc')).toBe(true);
    expect(isWellFormed('\u{1F600}')).toBe(true);
    expect(isWellFormed('\ufffd')).toBe(true);
    expect(isWellFormed('\ud800')).toBe(false);
    expect(isWellFormed('a\udc00b')).toBe(false);
  });
});
