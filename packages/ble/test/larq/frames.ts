import type { RequestName } from '../../src';
import { TYPE_URL_PREFIX } from '../../src';
import {
  concatBytes,
  encodeBytes,
  encodeFixed32,
  encodeFloat,
  encodeMessage,
  encodeString,
  encodeVarint,
} from '../../src/larq/wire';

export function responseFrame(
  requestId: number,
  request: RequestName,
  value: Uint8Array,
): Uint8Array {
  const name = `Response${request.slice('Request'.length)}`;
  return concatBytes(
    encodeFixed32(1, requestId),
    encodeVarint(2, 1),
    encodeMessage(
      3,
      concatBytes(encodeString(1, `${TYPE_URL_PREFIX}${name}`), encodeBytes(2, value)),
    ),
  );
}

export function codedFrame(requestId: number, code: number): Uint8Array {
  return concatBytes(encodeFixed32(1, requestId), encodeVarint(2, code));
}

export function emptySuccess(requestId: number): Uint8Array {
  return codedFrame(requestId, 1);
}

export function nested(...parts: readonly Uint8Array[]): Uint8Array {
  return encodeMessage(1, concatBytes(...parts));
}

export { concatBytes, encodeFixed32, encodeFloat, encodeMessage, encodeVarint };
