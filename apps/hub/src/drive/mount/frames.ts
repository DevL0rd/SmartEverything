import {
  ERROR_CODES,
  ERROR_META,
  OPS,
  PUSH_META,
  REPLY_META,
  encodeFrame,
  encodeMeta,
  type DriveMountErrorName,
  type PushMetaInput,
  type PushName,
  type ReplyMetaInput,
  type RequestOpName,
} from '@smarteverything/domain/drive-mount';

export function replyFrame<Name extends RequestOpName>(
  name: Name,
  requestId: bigint,
  meta: ReplyMetaInput<Name>,
  payload: Uint8Array | null,
): Uint8Array {
  return encodedReplyFrame(name, requestId, encodeMeta(REPLY_META[name], meta), payload);
}

export function encodedReplyFrame(
  name: RequestOpName,
  requestId: bigint,
  meta: Uint8Array,
  payload: Uint8Array | null,
): Uint8Array {
  return encodeFrame({
    type: 'reply',
    op: OPS[name].code,
    requestId,
    more: false,
    meta,
    payload,
  });
}

export function errorFrame(
  op: number,
  requestId: bigint,
  failure: { readonly code: DriveMountErrorName; readonly message: string; readonly rev?: number },
): Uint8Array {
  const rev = failure.rev === undefined ? {} : { rev: failure.rev };
  return encodeFrame({
    type: 'error',
    op,
    requestId,
    more: false,
    meta: encodeMeta(ERROR_META, {
      code: ERROR_CODES[failure.code],
      message: failure.message,
      ...rev,
    }),
    payload: null,
  });
}

export function pushFrame<Name extends PushName>(
  name: Name,
  meta: PushMetaInput<Name>,
): Uint8Array {
  return encodeFrame({
    type: 'push',
    op: OPS[name].code,
    requestId: 0n,
    more: false,
    meta: encodeMeta(PUSH_META[name], meta),
    payload: null,
  });
}
