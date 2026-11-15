import {
  FRAME_FLAGS,
  FRAME_TYPES,
  HEADER_BYTES,
  MAX_META_BYTES,
  MAX_PAYLOAD_BYTES,
  type FrameTypeName,
} from './ops';

export type FrameFault =
  'short' | 'type' | 'op' | 'flags' | 'request-id' | 'meta-length' | 'payload';

export class FrameError extends Error {
  readonly fault: FrameFault;

  constructor(fault: FrameFault, detail: string) {
    super(`Invalid drive mount frame (${fault}): ${detail}`);
    this.name = 'FrameError';
    this.fault = fault;
  }
}

export interface Frame {
  readonly type: FrameTypeName;
  readonly op: number;
  readonly requestId: bigint;
  readonly more: boolean;
  readonly meta: Uint8Array;
  readonly payload: Uint8Array | null;
}

const U64_MAX = 0xffff_ffff_ffff_ffffn;

const TYPE_NAMES = new Map<number, FrameTypeName>([
  [FRAME_TYPES.request, 'request'],
  [FRAME_TYPES.reply, 'reply'],
  [FRAME_TYPES.error, 'error'],
  [FRAME_TYPES.push, 'push'],
]);

const KNOWN_FLAGS = FRAME_FLAGS.payload | FRAME_FLAGS.more;

function checkHeader(frame: Frame): void {
  if (!Number.isInteger(frame.op) || frame.op < 0 || frame.op > 0xff) {
    throw new FrameError('op', `${String(frame.op)} is not one byte`);
  }
  if (frame.requestId < 0n || frame.requestId > U64_MAX) {
    throw new FrameError('request-id', 'out of the unsigned 64 bit range');
  }
  if (frame.type === 'push' && frame.requestId !== 0n) {
    throw new FrameError('request-id', 'a push carries request id 0');
  }
  if (frame.more && frame.type !== 'reply') {
    throw new FrameError('flags', 'only a reply can be followed by more replies');
  }
}

function checkBody(frame: Frame): void {
  if (frame.meta.length > MAX_META_BYTES) {
    throw new FrameError('meta-length', `${String(frame.meta.length)} bytes exceed the limit`);
  }
  if (frame.payload !== null && frame.payload.length > MAX_PAYLOAD_BYTES) {
    throw new FrameError('payload', `${String(frame.payload.length)} bytes exceed the limit`);
  }
}

function check(frame: Frame): void {
  checkHeader(frame);
  checkBody(frame);
}

export function encodeFrame(frame: Frame): Uint8Array {
  check(frame);
  const payloadLength = frame.payload?.length ?? 0;
  const out = new Uint8Array(HEADER_BYTES + frame.meta.length + payloadLength);
  const view = new DataView(out.buffer);
  view.setUint8(0, FRAME_TYPES[frame.type]);
  view.setUint8(1, frame.op);
  view.setUint16(
    2,
    (frame.payload === null ? 0 : FRAME_FLAGS.payload) | (frame.more ? FRAME_FLAGS.more : 0),
    true,
  );
  view.setBigUint64(4, frame.requestId, true);
  view.setUint32(12, frame.meta.length, true);
  out.set(frame.meta, HEADER_BYTES);
  if (frame.payload !== null) out.set(frame.payload, HEADER_BYTES + frame.meta.length);
  return out;
}

export function decodeFrame(bytes: Uint8Array): Frame {
  if (bytes.length < HEADER_BYTES) {
    throw new FrameError('short', `${String(bytes.length)} bytes hold no header`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  const type = TYPE_NAMES.get(view.getUint8(0));
  if (type === undefined) throw new FrameError('type', `${String(view.getUint8(0))} is unknown`);
  const flags = view.getUint16(2, true);
  if ((flags & ~KNOWN_FLAGS) !== 0) {
    throw new FrameError('flags', `${String(flags)} sets reserved bits`);
  }
  const metaLength = view.getUint32(12, true);
  const metaEnd = HEADER_BYTES + metaLength;
  if (metaEnd > bytes.length) {
    throw new FrameError('meta-length', `${String(metaLength)} does not fit the frame`);
  }
  const hasPayload = (flags & FRAME_FLAGS.payload) !== 0;
  if (!hasPayload && metaEnd !== bytes.length) {
    throw new FrameError('payload', 'bytes follow the meta without the payload flag');
  }
  const frame: Frame = {
    type,
    op: view.getUint8(1),
    requestId: view.getBigUint64(4, true),
    more: (flags & FRAME_FLAGS.more) !== 0,
    meta: bytes.subarray(HEADER_BYTES, metaEnd),
    payload: hasPayload ? bytes.subarray(metaEnd) : null,
  };
  check(frame);
  return frame;
}
