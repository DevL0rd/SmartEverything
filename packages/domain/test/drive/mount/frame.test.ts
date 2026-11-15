import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  FrameError,
  HEADER_BYTES,
  MAX_META_BYTES,
  MAX_PAYLOAD_BYTES,
  decodeFrame,
  encodeFrame,
  type Frame,
} from '../../../src/drive/mount';

const base: Frame = {
  type: 'request',
  op: 0x10,
  requestId: 0x0102_0304_0506_0708n,
  more: false,
  meta: Uint8Array.of(0xa0),
  payload: null,
};

const PREFIX = 'Invalid drive mount frame (';

function fault(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof FrameError) return error.message.slice(PREFIX.length).replace('): ', ': ');
    throw error;
  }
  throw new Error('no fault');
}

describe('frame codec', () => {
  it('writes the header little endian', () => {
    const bytes = encodeFrame({ ...base, payload: Uint8Array.of(9, 8) });
    expect([...bytes.subarray(0, HEADER_BYTES)]).toEqual([
      1, 0x10, 1, 0, 8, 7, 6, 5, 4, 3, 2, 1, 1, 0, 0, 0,
    ]);
    expect([...bytes.subarray(HEADER_BYTES)]).toEqual([0xa0, 9, 8]);
  });

  it('keeps an empty payload apart from no payload', () => {
    const none = decodeFrame(encodeFrame(base));
    const empty = decodeFrame(encodeFrame({ ...base, payload: new Uint8Array(0) }));
    expect(none.payload).toBeNull();
    expect(empty.payload).toEqual(new Uint8Array(0));
  });

  it('carries the more flag on replies only', () => {
    const reply: Frame = { ...base, type: 'reply', more: true };
    expect(decodeFrame(encodeFrame(reply)).more).toBe(true);
    expect(fault(() => encodeFrame({ ...base, more: true }))).toBe(
      'flags: only a reply can be followed by more replies',
    );
  });

  it('round trips any frame', () => {
    const types: readonly Frame['type'][] = ['request', 'reply', 'error'];
    fc.assert(
      fc.property(
        fc.record({
          type: fc.constantFrom(...types),
          op: fc.integer({ min: 0, max: 255 }),
          requestId: fc.bigInt({ min: 0n, max: 0xffff_ffff_ffff_ffffn }),
          more: fc.constant(false),
          meta: fc.uint8Array({ maxLength: 64 }),
          payload: fc.option(fc.uint8Array({ maxLength: 64 }), { nil: null }),
        }),
        (frame) => {
          expect(decodeFrame(encodeFrame(frame))).toEqual(frame);
        },
      ),
    );
  });

  it('refuses an op that is not one byte or a request id that is not 64 bit', () => {
    expect(fault(() => encodeFrame({ ...base, op: 256 }))).toBe('op: 256 is not one byte');
    expect(fault(() => encodeFrame({ ...base, op: -1 }))).toBe('op: -1 is not one byte');
    expect(fault(() => encodeFrame({ ...base, op: 1.5 }))).toBe('op: 1.5 is not one byte');
    expect(fault(() => encodeFrame({ ...base, requestId: -1n }))).toBe(
      'request-id: out of the unsigned 64 bit range',
    );
    expect(fault(() => encodeFrame({ ...base, requestId: 1n << 64n }))).toBe(
      'request-id: out of the unsigned 64 bit range',
    );
  });

  it('refuses a push with a request id', () => {
    expect(fault(() => encodeFrame({ ...base, type: 'push', requestId: 1n }))).toBe(
      'request-id: a push carries request id 0',
    );
    expect(decodeFrame(encodeFrame({ ...base, type: 'push', requestId: 0n })).type).toBe('push');
  });

  it('refuses meta and payload over their limits and accepts them at the limit', () => {
    const meta = new Uint8Array(MAX_META_BYTES);
    const payload = new Uint8Array(MAX_PAYLOAD_BYTES);
    expect(decodeFrame(encodeFrame({ ...base, meta, payload })).payload?.length).toBe(
      MAX_PAYLOAD_BYTES,
    );
    expect(fault(() => encodeFrame({ ...base, meta: new Uint8Array(MAX_META_BYTES + 1) }))).toBe(
      'meta-length: 262145 bytes exceed the limit',
    );
    expect(
      fault(() => encodeFrame({ ...base, payload: new Uint8Array(MAX_PAYLOAD_BYTES + 1) })),
    ).toBe('payload: 1048577 bytes exceed the limit');
  });

  it('refuses a truncated header', () => {
    expect(fault(() => decodeFrame(new Uint8Array(HEADER_BYTES - 1)))).toBe(
      'short: 15 bytes hold no header',
    );
  });

  it('refuses an unknown frame type', () => {
    const bytes = encodeFrame(base);
    bytes[0] = 9;
    expect(fault(() => decodeFrame(bytes))).toBe('type: 9 is unknown');
  });

  it('refuses reserved flag bits', () => {
    const bytes = encodeFrame(base);
    bytes[3] = 0x80;
    expect(fault(() => decodeFrame(bytes))).toBe('flags: 32768 sets reserved bits');
  });

  it('refuses a meta length that overruns the frame or the limit', () => {
    const bytes = encodeFrame(base);
    new DataView(bytes.buffer).setUint32(12, 2, true);
    expect(fault(() => decodeFrame(bytes))).toBe('meta-length: 2 does not fit the frame');
    new DataView(bytes.buffer).setUint32(12, MAX_META_BYTES + 1, true);
    expect(fault(() => decodeFrame(bytes))).toBe('meta-length: 262145 does not fit the frame');
  });

  it('refuses trailing bytes without the payload flag', () => {
    const bytes = encodeFrame({ ...base, payload: Uint8Array.of(1) });
    bytes[2] = 0;
    expect(fault(() => decodeFrame(bytes))).toBe(
      'payload: bytes follow the meta without the payload flag',
    );
  });

  it('refuses an oversize meta that fits inside the frame', () => {
    const bytes = new Uint8Array(HEADER_BYTES + MAX_META_BYTES + 1);
    bytes[0] = 1;
    new DataView(bytes.buffer).setUint32(12, MAX_META_BYTES + 1, true);
    expect(fault(() => decodeFrame(bytes))).toBe('meta-length: 262145 bytes exceed the limit');
  });

  it('refuses an oversize payload when decoding', () => {
    const bytes = new Uint8Array(HEADER_BYTES + MAX_PAYLOAD_BYTES + 1);
    bytes[0] = 1;
    bytes[2] = 1;
    expect(fault(() => decodeFrame(bytes))).toBe('payload: 1048577 bytes exceed the limit');
  });

  it('applies the header rules when decoding', () => {
    const push = encodeFrame({ ...base, type: 'push', requestId: 0n });
    new DataView(push.buffer).setBigUint64(4, 5n, true);
    expect(fault(() => decodeFrame(push))).toBe('request-id: a push carries request id 0');
    const request = encodeFrame(base);
    request[2] = 2;
    expect(fault(() => decodeFrame(request))).toBe(
      'flags: only a reply can be followed by more replies',
    );
  });

  it('accepts the highest request id', () => {
    const requestId = 0xffff_ffff_ffff_ffffn;
    expect(decodeFrame(encodeFrame({ ...base, requestId })).requestId).toBe(requestId);
  });

  it('accepts the highest op code', () => {
    expect(decodeFrame(encodeFrame({ ...base, op: 255 })).op).toBe(255);
    expect(decodeFrame(encodeFrame({ ...base, op: 0 })).op).toBe(0);
  });

  it('names the error and the fault in the message', () => {
    try {
      decodeFrame(new Uint8Array(0));
    } catch (error) {
      expect(error).toBeInstanceOf(FrameError);
      expect(error).toMatchObject({
        name: 'FrameError',
        fault: 'short',
        message: 'Invalid drive mount frame (short): 0 bytes hold no header',
      });
      return;
    }
    throw new Error('no fault');
  });
});
