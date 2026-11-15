import { Decoder, Encoder } from 'cbor-x';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ERROR_CODES,
  FRAME_TYPES,
  META_KEYS,
  MessageError,
  PUSH_META,
  PUSH_OP_NAMES,
  REQUEST_META,
  REQUEST_OP_NAMES,
  XATTR_SIZE_MAX_BYTES,
  decodeFrame,
  decodeMessage,
  decodeMeta,
  encodeFrame,
  encodeMessage,
  encodeMeta,
  type MessageInput,
} from '../../../src/drive/mount';
import { inputOf, sampleMessages } from './samples';

const GOLDEN = join(import.meta.dirname, 'golden');

const raw = new Decoder({ useRecords: false, mapsAsObjects: false });

const rawEncoder = new Encoder({ useRecords: false, mapsAsObjects: false, variableMapSize: false });

const PREFIX = 'Invalid drive mount message (';

function fault(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof MessageError)
      return error.message.slice(PREFIX.length).replace('): ', ': ');
    throw error;
  }
  throw new Error('no fault');
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

function sample(name: string): MessageInput {
  const message = sampleMessages().get(name);
  if (message === undefined) throw new Error(`no sample ${name}`);
  return message;
}

function frameOf(message: MessageInput): ReturnType<typeof decodeFrame> {
  return decodeFrame(encodeMessage(message));
}

function metaFrame(op: number, meta: Uint8Array, type: 'request' | 'push' = 'request'): Uint8Array {
  return encodeFrame({
    type,
    op,
    requestId: type === 'push' ? 0n : 1n,
    more: false,
    meta,
    payload: null,
  });
}

function rawMeta(entries: readonly (readonly [unknown, unknown])[]): Uint8Array {
  return new Uint8Array(rawEncoder.encode(new Map(entries)));
}

function collectKeys(value: unknown, used: Set<number>): void {
  if (value instanceof Map) {
    for (const [key, member] of value) {
      if (typeof key === 'number') used.add(key);
      collectKeys(member, used);
    }
  } else if (Array.isArray(value)) {
    for (const member of value) collectKeys(member, used);
  }
}

describe('sample messages', () => {
  it('round trip and re-encode to the same bytes', () => {
    for (const [name, message] of sampleMessages()) {
      const bytes = encodeMessage(message);
      const decoded = decodeMessage(bytes);
      expect(decoded.type, name).toBe(message.type);
      expect(decoded.op, name).toBe(message.op);
      expect(decoded.requestId, name).toBe(message.requestId);
      expect(hex(encodeMessage(inputOf(decoded))), name).toBe(hex(bytes));
    }
  });

  it('decode to the values that went in', () => {
    expect(decodeMessage(encodeMessage(sample('lookup-reply')))).toMatchObject({
      meta: { ino: 42, attr: { mtimeNs: 1_763_100_001_000_000_000n, uid: null, gid: 1000 } },
    });
    expect(decodeMessage(encodeMessage(sample('hello-request')))).toMatchObject({
      meta: { locks: [{ owner: 0xdead_beef_cafe_f00dn }] },
    });
    expect(decodeMessage(encodeMessage(sample('setattr-request')))).toMatchObject({
      meta: { uid: null, atime: 'now', mtime: 1_763_100_001_000_000_000n },
    });
  });

  it('use every wire key and nothing else', () => {
    const used = new Set<number>();
    for (const [, message] of sampleMessages()) {
      collectKeys(raw.decode(frameOf(message).meta), used);
    }
    expect([...used].sort((a, b) => a - b)).toEqual(Object.values(META_KEYS).sort((a, b) => a - b));
  });

  it('match the golden frames on disk, one file per sample', () => {
    const files = readdirSync(GOLDEN)
      .filter((file) => file.endsWith('.bin'))
      .sort();
    const expected = [...sampleMessages().keys()].map((name) => `${name}.bin`).sort();
    expect(files).toEqual(expected);
    for (const [name, message] of sampleMessages()) {
      expect(hex(readFileSync(join(GOLDEN, `${name}.bin`))), name).toBe(
        hex(encodeMessage(message)),
      );
    }
  });

  it('cover every request op as request and reply, every push, and both error shapes', () => {
    const names = [...sampleMessages().keys()];
    for (const op of REQUEST_OP_NAMES) {
      expect(names, op).toContain(`${op.toLowerCase()}-request`);
      expect(names, op).toContain(`${op.toLowerCase()}-reply`);
    }
    for (const op of PUSH_OP_NAMES) {
      expect(names, op).toContain(`push-${op.toLowerCase().replace('_', '-')}`);
    }
    expect(names).toContain('error-plain');
    expect(names).toContain('error-stale');
    expect(names).toContain('readdir-reply-more');
  });
});

describe('frame type and flags', () => {
  it('uses the frame type of the message', () => {
    expect(frameOf(sample('lookup-request')).type).toBe('request');
    expect(frameOf(sample('lookup-reply')).type).toBe('reply');
    expect(frameOf(sample('error-plain')).type).toBe('error');
    expect(frameOf(sample('push-changed')).type).toBe('push');
    expect(encodeMessage(sample('push-reset'))[0]).toBe(FRAME_TYPES.push);
  });

  it('sets the more flag only on a reply that asks for it', () => {
    expect(frameOf(sample('readdir-reply-more')).more).toBe(true);
    expect(frameOf(sample('readdir-reply')).more).toBe(false);
    expect(decodeMessage(encodeMessage(sample('readdir-reply-more')))).toMatchObject({
      more: true,
    });
    expect(decodeMessage(encodeMessage(sample('readdir-reply')))).toMatchObject({ more: false });
    const request = decodeMessage(encodeMessage(sample('lookup-request')));
    expect(request).not.toHaveProperty('more');
  });

  it('answers an error with the hub revision when one is given', () => {
    expect(decodeMessage(encodeMessage(sample('error-stale')))).toMatchObject({
      type: 'error',
      meta: { code: ERROR_CODES.ESTALE, rev: 9 },
    });
    expect(decodeMessage(encodeMessage(sample('error-plain')))).toMatchObject({
      meta: { code: ERROR_CODES.ENOENT, message: 'no such file' },
    });
  });
});

describe('payload rules', () => {
  const write = (payload: Uint8Array | null): MessageInput =>
    inputOf({
      type: 'request',
      op: 'WRITE',
      requestId: 1n,
      meta: { commit: 1, offset: 0 },
      payload,
    });

  it('refuses a missing payload where one is required and a payload where none is allowed', () => {
    expect(fault(() => encodeMessage(write(null)))).toBe('payload: WRITE needs a payload');
    expect(encodeMessage(write(new Uint8Array(0))).length).toBeGreaterThan(0);
    expect(
      fault(() =>
        encodeMessage(
          inputOf({
            type: 'request',
            op: 'LOOKUP',
            requestId: 1n,
            meta: { parent: 1, name: 'a' },
            payload: new Uint8Array(1),
          }),
        ),
      ),
    ).toBe('payload: LOOKUP takes no payload');
    expect(
      fault(() =>
        encodeMessage(
          inputOf({ type: 'reply', op: 'READ', requestId: 1n, meta: {}, payload: null }),
        ),
      ),
    ).toBe('payload: READ needs a payload');
    expect(
      fault(() =>
        encodeMessage(
          inputOf({
            type: 'error',
            op: 'READ',
            requestId: 1n,
            meta: { code: 1, message: '' },
            payload: new Uint8Array(1),
          }),
        ),
      ),
    ).toBe('payload: READ takes no payload');
    expect(
      fault(() =>
        encodeMessage(
          inputOf({
            type: 'push',
            op: 'RESET',
            requestId: 0n,
            meta: { root: '3f6f1a52-7c5b-4a77-9d5c-0a1f2d3e4b5c', seq: 1 },
            payload: new Uint8Array(1),
          }),
        ),
      ),
    ).toBe('payload: RESET takes no payload');
  });

  it('refuses a payload frame flag that disagrees with the op on decode', () => {
    const bytes = encodeFrame({
      type: 'request',
      op: 0x51,
      requestId: 1n,
      more: false,
      meta: encodeMeta(REQUEST_META.WRITE, { commit: 1, offset: 0 }),
      payload: null,
    });
    expect(fault(() => decodeMessage(bytes))).toBe('payload: WRITE needs a payload');
  });

  it('bounds an xattr value at the size limit in both directions', () => {
    const setxattr = (length: number): MessageInput =>
      inputOf({
        type: 'request',
        op: 'SETXATTR',
        requestId: 1n,
        meta: { ino: 1, name: 'user.a', flags: 0, opKey: new Uint8Array(16) },
        payload: new Uint8Array(length),
      });
    const getxattr = (length: number): MessageInput =>
      inputOf({
        type: 'reply',
        op: 'GETXATTR',
        requestId: 1n,
        meta: {},
        payload: new Uint8Array(length),
      });
    expect(encodeMessage(setxattr(XATTR_SIZE_MAX_BYTES)).length).toBeGreaterThan(
      XATTR_SIZE_MAX_BYTES,
    );
    expect(fault(() => encodeMessage(setxattr(XATTR_SIZE_MAX_BYTES + 1)))).toBe(
      'payload: an xattr value exceeds the size limit',
    );
    expect(encodeMessage(getxattr(XATTR_SIZE_MAX_BYTES)).length).toBeGreaterThan(
      XATTR_SIZE_MAX_BYTES,
    );
    expect(fault(() => encodeMessage(getxattr(XATTR_SIZE_MAX_BYTES + 1)))).toBe(
      'payload: an xattr value exceeds the size limit',
    );
  });

  it('allows a write payload larger than an xattr value', () => {
    expect(encodeMessage(write(new Uint8Array(XATTR_SIZE_MAX_BYTES + 1))).length).toBeGreaterThan(
      XATTR_SIZE_MAX_BYTES,
    );
  });

  it('requires a PUT size equal to its payload length', () => {
    const put = (size: number, length: number): MessageInput =>
      inputOf({
        type: 'request',
        op: 'PUT',
        requestId: 1n,
        meta: { ino: 1, baseRev: 0, size, mtimeNs: 1n, fsync: false, opKey: new Uint8Array(16) },
        payload: new Uint8Array(length),
      });
    expect(encodeMessage(put(3, 3)).length).toBeGreaterThan(0);
    expect(fault(() => encodeMessage(put(4, 3)))).toBe(
      'payload: PUT size differs from the payload length',
    );
    expect(fault(() => encodeMessage(put(2, 3)))).toBe(
      'payload: PUT size differs from the payload length',
    );
    const reply = inputOf({
      type: 'reply',
      op: 'PUT',
      requestId: 1n,
      meta: { attr: sampleReplyAttr(), rev: 1 },
    });
    expect(encodeMessage(reply).length).toBeGreaterThan(0);
  });

  it('checks the PUT size when decoding too', () => {
    const good = encodeMessage(sample('put-request'));
    const view = new DataView(good.buffer);
    const metaLength = view.getUint32(12, true);
    const shorter = good.slice(0, good.length - 1);
    expect(metaLength).toBeGreaterThan(0);
    expect(fault(() => decodeMessage(shorter))).toBe(
      'payload: PUT size differs from the payload length',
    );
  });
});

function sampleReplyAttr(): object {
  const reply = decodeMessage(encodeMessage(sample('getattr-reply')));
  if (reply.type !== 'reply' || reply.op !== 'GETATTR') throw new Error('unexpected sample');
  return reply.meta.attr;
}

describe('meta faults', () => {
  it('refuse a meta that fails its schema on encode and decode', () => {
    expect(
      fault(() =>
        encodeMessage(
          inputOf({ type: 'request', op: 'LOOKUP', requestId: 1n, meta: { parent: 0, name: 'a' } }),
        ),
      ),
    ).toMatch(/^meta: /);
    expect(fault(() => decodeMessage(metaFrame(0x10, rawMeta([[META_KEYS.parent, 0]]))))).toMatch(
      /^meta: /,
    );
  });

  it('refuse a field that has no wire key', () => {
    expect(fault(() => encodeMeta(z.record(z.string(), z.number()), { stray: 1 }))).toBe(
      'meta: field stray has no wire key',
    );
  });

  it('leave out a field whose value is undefined', () => {
    const schema = z.object({ parent: z.number().optional() });
    expect(hex(encodeMeta(schema, { parent: undefined }))).toBe('a0');
    expect(hex(encodeMeta(schema, { parent: 3 }))).toBe('a11003');
  });

  it('refuse a key that is unknown or not an integer', () => {
    expect(fault(() => decodeMessage(metaFrame(0x10, rawMeta([[999, 1]]))))).toBe(
      'meta: key 999 is unknown',
    );
    expect(fault(() => decodeMessage(metaFrame(0x10, rawMeta([['parent', 1]]))))).toBe(
      'meta: key parent is unknown',
    );
  });

  it('refuse bytes that are not CBOR and a meta that is not a map', () => {
    expect(fault(() => decodeMessage(metaFrame(0x10, Uint8Array.of(0xa3, 0x01))))).toBe(
      'meta: the meta is not valid CBOR',
    );
    expect(fault(() => decodeMessage(metaFrame(0x10, Uint8Array.of(0x05))))).toMatch(/^meta: /);
  });

  it('refuse an unknown op code and an op carried by the wrong frame type', () => {
    expect(fault(() => decodeMessage(metaFrame(0x77, Uint8Array.of(0xa0))))).toBe(
      'op: code 119 is unknown',
    );
    expect(fault(() => decodeMessage(metaFrame(0x80, Uint8Array.of(0xa0), 'request')))).toBe(
      'op: CHANGED cannot be carried by a request frame',
    );
    expect(fault(() => decodeMessage(metaFrame(0x10, Uint8Array.of(0xa0), 'push')))).toBe(
      'op: LOOKUP cannot be carried by a push frame',
    );
  });

  it('decode a push op carried by a push frame', () => {
    const meta = encodeMeta(PUSH_META.RESET, {
      root: '3f6f1a52-7c5b-4a77-9d5c-0a1f2d3e4b5c',
      seq: 3,
    });
    expect(decodeMessage(metaFrame(0x81, meta, 'push'))).toMatchObject({
      type: 'push',
      op: 'RESET',
    });
  });

  it('copy byte values out of the decode buffer', () => {
    const bytes = encodeMessage(sample('hello-request'));
    const decoded = decodeMessage(bytes);
    if (decoded.type !== 'request' || decoded.op !== 'HELLO') throw new Error('unexpected sample');
    const before = hex(decoded.meta.session ?? new Uint8Array(0));
    bytes.fill(0);
    expect(hex(decoded.meta.session ?? new Uint8Array(0))).toBe(before);
  });
});

describe('error objects', () => {
  it('name the error, keep the failure that caused it and carry the fault', () => {
    try {
      decodeMessage(metaFrame(0x10, Uint8Array.of(0xa3, 0x01)));
    } catch (error) {
      expect(error).toBeInstanceOf(MessageError);
      expect(error).toMatchObject({
        name: 'MessageError',
        fault: 'meta',
        message: 'Invalid drive mount message (meta): the meta is not valid CBOR',
      });
      expect(error).toHaveProperty('cause', expect.any(Error));
      return;
    }
    throw new Error('no fault');
  });
});

describe('request flags', () => {
  it('encode a request that carries a stray more flag as a plain request', () => {
    const request = inputOf({
      type: 'request',
      op: 'LOOKUP',
      requestId: 1n,
      meta: { parent: 1, name: 'a' },
      more: true,
    });
    expect(frameOf(request).more).toBe(false);
  });
});

describe('integers on the wire', () => {
  const lookup = (parent: number | bigint): Uint8Array =>
    metaFrame(
      0x10,
      rawMeta([
        [META_KEYS.parent, parent],
        [META_KEYS.name, 'a'],
      ]),
    );

  it('reads 64 bit unsigned integers as numbers up to the safe limit and refuses larger ones for counters', () => {
    expect(decodeMessage(lookup(Number.MAX_SAFE_INTEGER))).toMatchObject({
      meta: { parent: Number.MAX_SAFE_INTEGER },
    });
    expect(fault(() => decodeMessage(lookup(BigInt(Number.MAX_SAFE_INTEGER) + 1n)))).toMatch(
      /^meta: /,
    );
  });

  it('keeps a negative nanosecond time exact below the safe limit', () => {
    const setattr = (mtime: bigint): Uint8Array =>
      encodeMeta(REQUEST_META.SETATTR, { ino: 1, valid: 32, mtime, opKey: new Uint8Array(16) });
    for (const mtime of [
      -9_007_199_254_740_991n,
      -9_007_199_254_740_992n,
      -9_007_199_254_740_993n,
      -(1n << 63n),
    ]) {
      expect(decodeMeta(REQUEST_META.SETATTR, setattr(mtime))).toMatchObject({ mtime });
    }
  });

  it('writes a time at the 32 bit boundary in the shortest negative form', () => {
    const setattr = (mtime: bigint): string =>
      hex(
        encodeMeta(REQUEST_META.SETATTR, { ino: 1, valid: 32, mtime, opKey: new Uint8Array(16) }),
      );
    expect(setattr(-4_294_967_296n)).toContain('181b3affffffff');
    expect(setattr(-4_294_967_297n)).toContain('181b3b0000000100000000');
    expect(setattr(-1n)).toContain('181b20');
  });
});

describe('deterministic encoding', () => {
  it('orders map keys ascending whatever the input order', () => {
    const forward = encodeMeta(REQUEST_META.LOOKUP, { parent: 3, name: 'a' });
    const backward = encodeMeta(REQUEST_META.LOOKUP, { name: 'a', parent: 3 });
    expect(hex(forward)).toBe(hex(backward));
    expect(hex(forward)).toBe('a21003116161');
  });

  it('writes integers in their shortest form', () => {
    const cursor = (value: number): string =>
      hex(encodeMeta(REQUEST_META.READDIR, { ino: 1, cursor: value })).slice(6);
    expect(cursor(0)).toBe('1200');
    expect(cursor(23)).toBe('1217');
    expect(cursor(24)).toBe('121818');
    expect(cursor(255)).toBe('1218ff');
    expect(cursor(256)).toBe('12190100');
    expect(cursor(65_535)).toBe('1219ffff');
    expect(cursor(65_536)).toBe('121a00010000');
    expect(cursor(4_294_967_295)).toBe('121affffffff');
  });

  it('writes values above 32 bits as 64 bit integers and reads them back exactly', () => {
    const bytes = encodeMeta(REQUEST_META.GETLK, {
      ino: 1,
      owner: 0xdead_beef_cafe_f00dn,
      type: 1,
      start: 0n,
      end: 0xffff_ffff_ffff_ffffn,
      pid: 7,
    });
    expect(hex(bytes)).toContain('1bdeadbeefcafef00d');
    expect(decodeMeta(REQUEST_META.GETLK, bytes)).toMatchObject({
      owner: 0xdead_beef_cafe_f00dn,
      end: 0xffff_ffff_ffff_ffffn,
    });
  });

  it('writes a negative nanosecond time and a number above 2 to the 53 as exact integers', () => {
    const setattr = (mtime: bigint): Uint8Array =>
      encodeMeta(REQUEST_META.SETATTR, { ino: 1, valid: 32, mtime, opKey: new Uint8Array(16) });
    for (const mtime of [-1n, -4_294_967_296n, -4_294_967_297n, 9_007_199_254_740_993n]) {
      expect(decodeMeta(REQUEST_META.SETATTR, setattr(mtime))).toMatchObject({ mtime });
    }
    expect(hex(setattr(-1n))).toContain('181b20');
  });
});
