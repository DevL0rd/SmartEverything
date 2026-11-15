import {
  REQUEST_META,
  decodeKeyed,
  type ReplyMetaInput,
  type RequestMeta,
  type RequestOpName,
} from '@smarteverything/domain/drive-mount';
import { encodedReplyFrame, replyFrame } from './frames';
import type { MountSession } from './session';

export interface RawCall {
  readonly session: MountSession;
  readonly requestId: bigint;
  readonly meta: Uint8Array;
  readonly payload: Uint8Array | null;
  readonly cancellable: (cancel: () => void) => void;
}

export interface Call<Name extends RequestOpName> {
  readonly session: MountSession;
  readonly requestId: bigint;
  readonly meta: RequestMeta<Name>;
  readonly payload: Uint8Array | null;
  readonly cancellable: (cancel: () => void) => void;
}

export type Executor = (call: RawCall) => Promise<Uint8Array>;

export type Executors = Readonly<Partial<Record<RequestOpName, Executor>>>;

export interface WithPayload<Name extends RequestOpName> {
  readonly meta: ReplyMetaInput<Name>;
  readonly payload: Uint8Array;
}

function decoded<Name extends RequestOpName>(name: Name, raw: RawCall): Call<Name> {
  return {
    session: raw.session,
    requestId: raw.requestId,
    meta: decodeKeyed(REQUEST_META, name, raw.meta),
    payload: raw.payload,
    cancellable: raw.cancellable,
  };
}

export function operation<Name extends RequestOpName>(
  name: Name,
  run: (call: Call<Name>) => Promise<ReplyMetaInput<Name>>,
): Executor {
  return async (raw) => replyFrame(name, raw.requestId, await run(decoded(name, raw)), null);
}

export function encodedOperation<Name extends RequestOpName>(
  name: Name,
  run: (call: Call<Name>) => Promise<Uint8Array>,
): Executor {
  return async (raw) =>
    encodedReplyFrame(name, raw.requestId, await run(decoded(name, raw)), null);
}

export function payloadOperation<Name extends RequestOpName>(
  name: Name,
  run: (call: Call<Name>) => Promise<WithPayload<Name>>,
): Executor {
  return async (raw) => {
    const reply = await run(decoded(name, raw));
    return replyFrame(name, raw.requestId, reply.meta, reply.payload);
  };
}
