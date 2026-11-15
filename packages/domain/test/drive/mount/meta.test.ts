import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  ERROR_META,
  INODE_TYPES,
  NAME_MAX_BYTES,
  NS,
  PATH_MAX_BYTES,
  PUSH_META,
  REPLY_META,
  REQUEST_META,
  SETATTR_VALID,
  U64,
  XATTR_LIST_MAX_BYTES,
  XATTR_NAME_MAX_BYTES,
  MAX_PAYLOAD_BYTES,
  REQUEST_OP_NAMES,
  PUSH_OP_NAMES,
} from '../../../src/drive/mount';
import { PUSH_SAMPLES, REPLY_SAMPLES, REQUEST_SAMPLES } from './samples';

const KEY = new Uint8Array(16);

function accepts(schema: z.ZodType, value: unknown): boolean {
  return schema.safeParse(value).success;
}

describe('request and reply schemas', () => {
  it('accept their sample and refuse an unknown field', () => {
    for (const name of REQUEST_OP_NAMES) {
      const sample = REQUEST_SAMPLES[name];
      const schema = REQUEST_META[name];
      expect(accepts(schema, sample), name).toBe(true);
      expect(accepts(schema, { ...sample, extra: 1 }), name).toBe(false);
    }
    for (const name of REQUEST_OP_NAMES) {
      const sample = REPLY_SAMPLES[name];
      const schema = REPLY_META[name];
      expect(accepts(schema, sample), name).toBe(true);
      expect(accepts(schema, { ...sample, extra: 1 }), name).toBe(false);
    }
    for (const name of PUSH_OP_NAMES) {
      const sample = PUSH_SAMPLES[name];
      const schema = PUSH_META[name];
      expect(accepts(schema, sample), name).toBe(true);
      expect(accepts(schema, { ...sample, extra: 1 }), name).toBe(false);
    }
  });

  it('refuse a missing field', () => {
    for (const name of REQUEST_OP_NAMES) {
      const sample = REQUEST_SAMPLES[name];
      const schema = REQUEST_META[name];
      for (const field of Object.keys(sample)) {
        const rest = Object.fromEntries(Object.entries(sample).filter(([key]) => key !== field));
        expect(accepts(schema, rest), `${name} without ${field}`).toBe(false);
      }
    }
  });
});

describe('names', () => {
  const lookup = (name: string): boolean => accepts(REQUEST_META.LOOKUP, { parent: 1, name });

  it('leave the length to the Hub, which answers ENAMETOOLONG past 255 bytes', () => {
    expect(lookup('a'.repeat(NAME_MAX_BYTES))).toBe(true);
    expect(lookup('a'.repeat(NAME_MAX_BYTES + 1))).toBe(true);
    expect(lookup('é'.repeat(128))).toBe(true);
  });

  it('refuse empty, dot, slash, NUL and unpaired surrogates', () => {
    for (const name of ['', '.', '..', 'a/b', 'a\0b', '\ud800'])
      expect(lookup(name), name).toBe(false);
    expect(lookup('...')).toBe(true);
  });

  it('bound a link target at PATH_MAX bytes and refuse NUL', () => {
    const symlink = (target: string): boolean => accepts(REPLY_META.READLINK, { target });
    expect(symlink('a'.repeat(PATH_MAX_BYTES))).toBe(true);
    expect(symlink('a'.repeat(PATH_MAX_BYTES + 1))).toBe(false);
    expect(symlink('a\0')).toBe(false);
    expect(symlink('\ud800')).toBe(false);
    expect(symlink('')).toBe(false);
  });

  it('bound an xattr name at 255 bytes and refuse NUL', () => {
    const get = (name: string): boolean => accepts(REQUEST_META.GETXATTR, { ino: 1, name });
    expect(get('u'.repeat(XATTR_NAME_MAX_BYTES))).toBe(true);
    expect(get('u'.repeat(XATTR_NAME_MAX_BYTES + 1))).toBe(false);
    expect(get('u\0')).toBe(false);
    expect(get('\ud800')).toBe(false);
    expect(get('')).toBe(false);
  });

  it('bound the xattr name list at 65536 bytes with one terminator per name', () => {
    const list = (names: readonly string[]): boolean => accepts(REPLY_META.LISTXATTR, { names });
    const name = 'n'.repeat(255);
    const fits = Math.floor(XATTR_LIST_MAX_BYTES / 256);
    expect(list(Array.from({ length: fits }, () => name))).toBe(true);
    expect(list(Array.from({ length: fits + 1 }, () => name))).toBe(false);
  });
});

describe('integers', () => {
  it('normalise nanoseconds and unsigned 64 bit values to bigint', () => {
    expect(NS.parse(5)).toBe(5n);
    expect(NS.parse(-5n)).toBe(-5n);
    expect(U64.parse(7)).toBe(7n);
    expect(U64.parse(0xffff_ffff_ffff_ffffn)).toBe(0xffff_ffff_ffff_ffffn);
  });

  it('refuse values outside the 64 bit ranges', () => {
    expect(accepts(U64, -1)).toBe(false);
    expect(accepts(U64, 1n << 64n)).toBe(false);
    expect(accepts(NS, 1n << 63n)).toBe(false);
    expect(accepts(NS, -(1n << 63n) - 1n)).toBe(false);
    expect(accepts(NS, 1.5)).toBe(false);
  });

  it('refuse a read longer than one frame payload and an empty one', () => {
    const read = (length: number): boolean =>
      accepts(REQUEST_META.READ, { handle: 1, offset: 0, length });
    expect(read(MAX_PAYLOAD_BYTES)).toBe(true);
    expect(read(MAX_PAYLOAD_BYTES + 1)).toBe(false);
    expect(read(0)).toBe(false);
  });
});

describe('setattr', () => {
  const sample = REQUEST_SAMPLES.SETATTR;

  it('needs a field exactly when its valid bit is set', () => {
    expect(accepts(REQUEST_META.SETATTR, { ino: 1, valid: 0, opKey: KEY })).toBe(true);
    expect(accepts(REQUEST_META.SETATTR, { ino: 1, valid: SETATTR_VALID.mode, opKey: KEY })).toBe(
      false,
    );
    expect(accepts(REQUEST_META.SETATTR, { ino: 1, valid: 0, mode: 0o644, opKey: KEY })).toBe(
      false,
    );
    expect(
      accepts(REQUEST_META.SETATTR, { ...sample, valid: sample.valid | SETATTR_VALID.gid }),
    ).toBe(false);
  });

  it('takes a null owner as the person and a time as nanoseconds or now', () => {
    const valid = SETATTR_VALID.uid | SETATTR_VALID.gid | SETATTR_VALID.atime | SETATTR_VALID.mtime;
    const value = { ino: 1, valid, uid: null, gid: 5, atime: 'now', mtime: 0, opKey: KEY };
    expect(accepts(REQUEST_META.SETATTR, value)).toBe(true);
    expect(accepts(REQUEST_META.SETATTR, { ...value, mtime: 'later' })).toBe(false);
  });
});

describe('inodes, locks and entries', () => {
  it('require an entry ino to match its attr', () => {
    const attr = REPLY_SAMPLES.LOOKUP.attr;
    expect(accepts(REPLY_META.LOOKUP, { ino: attr.ino + 1, attr })).toBe(false);
    expect(accepts(REPLY_META.READDIR, { entries: [['a', attr.ino + 1, attr]], next: null })).toBe(
      false,
    );
    expect(accepts(REPLY_META.ATTACH, { ...REPLY_SAMPLES.ATTACH, ino: 99 })).toBe(false);
  });

  it('refuse a special type that is not special and an unknown inode type', () => {
    const mknod = (type: number): boolean =>
      accepts(REQUEST_META.MKNOD, { ...REQUEST_SAMPLES.MKNOD, type });
    expect(mknod(INODE_TYPES.char)).toBe(true);
    expect(mknod(INODE_TYPES.file)).toBe(false);
    expect(accepts(REPLY_META.GETATTR, { attr: { ...REPLY_SAMPLES.GETATTR.attr, type: 9 } })).toBe(
      false,
    );
  });

  it('refuse a lock whose start follows its end', () => {
    const lock = { type: 1, start: 10n, end: 5n, pid: 1 };
    expect(accepts(REPLY_META.GETLK, { lock })).toBe(false);
    expect(accepts(REQUEST_META.GETLK, { ino: 1, owner: 1n, ...lock })).toBe(false);
    expect(
      accepts(REQUEST_META.SETLK, { ino: 1, owner: 1n, ...lock, wait: false, flock: false }),
    ).toBe(false);
    expect(
      accepts(REQUEST_META.HELLO, {
        ...REQUEST_SAMPLES.HELLO,
        locks: [{ ino: 1, owner: 1n, ...lock }],
      }),
    ).toBe(false);
    expect(accepts(REPLY_META.GETLK, { lock: null })).toBe(true);
  });

  it('refuse an empty range and an op key of the wrong length', () => {
    expect(accepts(REPLY_META.BEGIN, { commit: 1, ranges: [[0, 0]] })).toBe(false);
    expect(accepts(REQUEST_META.UNLINK, { parent: 1, name: 'a', opKey: new Uint8Array(15) })).toBe(
      false,
    );
    expect(
      accepts(REQUEST_META.HELLO, { ...REQUEST_SAMPLES.HELLO, session: new Uint8Array(3) }),
    ).toBe(false);
    expect(accepts(REQUEST_META.HELLO, { ...REQUEST_SAMPLES.HELLO, session: null })).toBe(true);
  });

  it('refuse a frame limit other than the one this build speaks', () => {
    expect(accepts(REPLY_META.HELLO, { ...REPLY_SAMPLES.HELLO, frameLimit: 10 })).toBe(false);
  });
});

describe('error meta', () => {
  it('takes a known code, a message and an optional hub revision', () => {
    expect(accepts(ERROR_META, { code: 1, message: '' })).toBe(true);
    expect(accepts(ERROR_META, { code: 14, message: 'stale', rev: 3 })).toBe(true);
    expect(accepts(ERROR_META, { code: 0, message: '' })).toBe(false);
    expect(accepts(ERROR_META, { code: 27, message: '' })).toBe(false);
  });
});

describe('boundaries and messages', () => {
  const issues = (schema: z.ZodType, value: unknown): readonly string[] => {
    const result = schema.safeParse(value);
    return result.success ? [] : result.error.issues.map((issue) => issue.message);
  };

  it('accept a lock of one byte and the 64 bit limits', () => {
    const lock = { type: 1, start: 5n, end: 5n, pid: 1 };
    expect(accepts(REPLY_META.GETLK, { lock })).toBe(true);
    expect(accepts(NS, -(1n << 63n))).toBe(true);
    expect(accepts(NS, (1n << 63n) - 1n)).toBe(true);
    expect(accepts(U64, 0n)).toBe(true);
  });

  it('accept the three xattr flag values and no other', () => {
    const set = (flags: number): boolean =>
      accepts(REQUEST_META.SETXATTR, { ino: 1, name: 'user.a', flags, opKey: KEY });
    expect(set(0)).toBe(true);
    expect(set(1)).toBe(true);
    expect(set(2)).toBe(true);
    expect(set(3)).toBe(false);
  });

  it('say why a lock, an entry or a setattr is refused', () => {
    const lock = { type: 1, start: 10n, end: 5n, pid: 1 };
    expect(issues(REPLY_META.GETLK, { lock })).toEqual(['start must not exceed end']);
    expect(issues(REQUEST_META.GETLK, { ino: 1, owner: 1n, ...lock })).toEqual([
      'start must not exceed end',
    ]);
    expect(
      issues(REQUEST_META.HELLO, {
        ...REQUEST_SAMPLES.HELLO,
        locks: [{ ino: 1, owner: 1n, ...lock, flock: false }],
      }),
    ).toEqual(['start must not exceed end']);
    expect(
      issues(REQUEST_META.UNLOCK, { ino: 1, owner: 1n, start: 10n, end: 5n, flock: false }),
    ).toEqual(['start must not exceed end']);
    const attr = REPLY_SAMPLES.LOOKUP.attr;
    expect(issues(REPLY_META.LOOKUP, { ino: attr.ino + 1, attr })).toEqual([
      'ino must match attr.ino',
    ]);
    expect(
      issues(REPLY_META.READDIR, { entries: [['a', attr.ino + 1, attr]], next: null }),
    ).toEqual(['ino must match attr.ino']);
    expect(issues(REPLY_META.ATTACH, { ...REPLY_SAMPLES.ATTACH, ino: 99 })).toEqual([
      'ino must match attr.ino',
    ]);
    expect(issues(REQUEST_META.SETATTR, { ino: 1, valid: SETATTR_VALID.mode, opKey: KEY })).toEqual(
      ['a field must be present exactly when its valid bit is set'],
    );
    expect(
      issues(REPLY_META.LISTXATTR, { names: Array.from({ length: 257 }, () => 'n'.repeat(255)) }),
    ).toEqual(['the name list exceeds the xattr list limit']);
  });
});
