import { hasKey } from './keys';

export const FRAME_TYPES = { request: 1, reply: 2, error: 3, push: 4 } as const;

export type FrameTypeName = keyof typeof FRAME_TYPES;

export const FRAME_FLAGS = { payload: 0x1, more: 0x2 } as const;

export const HEADER_BYTES = 16;

export const MAX_PAYLOAD_BYTES = 1_048_576;

export const MAX_META_BYTES = 262_144;

export const MAX_FRAME_BYTES = HEADER_BYTES + MAX_META_BYTES + MAX_PAYLOAD_BYTES;

export const MOUNT_SUBPROTOCOL = 'smarteverything-drive-mount.v1';

export const LEASE_MS = 90_000;

export const PING_INTERVAL_MS = 10_000;

export const PONG_TIMEOUT_MS = 30_000;

export const SESSION_BYTES = 16;

export const OP_KEY_BYTES = 16;

export type Lane = 'session' | 'mutation' | 'concurrent';

export interface RequestOp {
  readonly code: number;
  readonly push: false;
  readonly lane: Lane;
  readonly requestPayload: boolean;
  readonly replyPayload: boolean;
}

export interface PushOp {
  readonly code: number;
  readonly push: true;
}

export type OpDefinition = RequestOp | PushOp;

function request(
  code: number,
  lane: Lane,
  requestPayload = false,
  replyPayload = false,
): RequestOp {
  return { code, push: false, lane, requestPayload, replyPayload };
}

function push(code: number): PushOp {
  return { code, push: true };
}

export const REQUEST_OP_NAMES = [
  'HELLO',
  'ATTACH',
  'LOOKUP',
  'GETATTR',
  'READDIR',
  'SETATTR',
  'STATFS',
  'READLINK',
  'MKDIR',
  'CREATE',
  'MKNOD',
  'SYMLINK',
  'LINK',
  'UNLINK',
  'RMDIR',
  'RENAME',
  'TMPFILE',
  'GETXATTR',
  'SETXATTR',
  'LISTXATTR',
  'REMOVEXATTR',
  'OPEN',
  'READ',
  'RELEASE',
  'SEEK',
  'COPY',
  'ACCESS',
  'BEGIN',
  'WRITE',
  'ALLOCATE',
  'STATE',
  'END',
  'PUT',
  'ABORT',
  'FORGET',
  'FSYNC',
  'GETLK',
  'SETLK',
  'UNLOCK',
  'CANCEL',
] as const;

export const PUSH_OP_NAMES = ['CHANGED', 'RESET', 'LOCK_LOST'] as const;

export type RequestOpName = (typeof REQUEST_OP_NAMES)[number];

export type PushName = (typeof PUSH_OP_NAMES)[number];

export const REQUEST_OPS = {
  HELLO: request(0x01, 'session'),
  ATTACH: request(0x02, 'session'),
  LOOKUP: request(0x10, 'concurrent'),
  GETATTR: request(0x11, 'concurrent'),
  READDIR: request(0x12, 'concurrent'),
  SETATTR: request(0x13, 'mutation'),
  STATFS: request(0x14, 'concurrent'),
  READLINK: request(0x15, 'concurrent'),
  MKDIR: request(0x20, 'mutation'),
  CREATE: request(0x21, 'mutation'),
  MKNOD: request(0x22, 'mutation'),
  SYMLINK: request(0x23, 'mutation'),
  LINK: request(0x24, 'mutation'),
  UNLINK: request(0x25, 'mutation'),
  RMDIR: request(0x26, 'mutation'),
  RENAME: request(0x27, 'mutation'),
  TMPFILE: request(0x28, 'mutation'),
  GETXATTR: request(0x30, 'concurrent', false, true),
  SETXATTR: request(0x31, 'mutation', true),
  LISTXATTR: request(0x32, 'concurrent'),
  REMOVEXATTR: request(0x33, 'mutation'),
  OPEN: request(0x40, 'concurrent'),
  READ: request(0x41, 'concurrent', false, true),
  RELEASE: request(0x42, 'concurrent'),
  SEEK: request(0x43, 'concurrent'),
  COPY: request(0x44, 'concurrent'),
  ACCESS: request(0x45, 'concurrent'),
  BEGIN: request(0x50, 'mutation'),
  WRITE: request(0x51, 'concurrent', true),
  ALLOCATE: request(0x52, 'concurrent'),
  STATE: request(0x53, 'concurrent'),
  END: request(0x54, 'mutation'),
  PUT: request(0x55, 'mutation', true),
  ABORT: request(0x56, 'concurrent'),
  FORGET: request(0x57, 'concurrent'),
  FSYNC: request(0x58, 'mutation'),
  GETLK: request(0x60, 'concurrent'),
  SETLK: request(0x61, 'concurrent'),
  UNLOCK: request(0x62, 'concurrent'),
  CANCEL: request(0x70, 'concurrent'),
} as const satisfies Record<RequestOpName, RequestOp>;

export const PUSH_OPS = {
  CHANGED: push(0x80),
  RESET: push(0x81),
  LOCK_LOST: push(0x82),
} as const satisfies Record<PushName, PushOp>;

export type OpName = RequestOpName | PushName;

export const OP_NAMES: readonly OpName[] = [...REQUEST_OP_NAMES, ...PUSH_OP_NAMES];

export const OPS: Readonly<Record<OpName, OpDefinition>> = { ...REQUEST_OPS, ...PUSH_OPS };

const OP_BY_CODE = new Map<number, OpName>(OP_NAMES.map((name) => [OPS[name].code, name]));

export function opNameOf(code: number): OpName | undefined {
  return OP_BY_CODE.get(code);
}

export function isPushName(name: OpName): name is PushName {
  return hasKey(PUSH_OPS, name);
}

export function isRequestName(name: OpName): name is RequestOpName {
  return hasKey(REQUEST_OPS, name);
}
