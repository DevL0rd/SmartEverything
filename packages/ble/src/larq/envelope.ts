import { z } from 'zod';
import { LarqFrameError, LarqRefusedError, LarqResponseError } from './errors';
import {
  NEVER_SENT_REQUESTS,
  REQUEST_PREFIX,
  isAllowedRequest,
  responseNameOf,
  type RequestName,
} from './names';
import {
  EMPTY,
  concatBytes,
  encodeBytes,
  encodeFixed32,
  encodeMessage,
  encodeString,
  fieldsOf,
  readBytes,
  readFixed32,
  readMessage,
  readVarint,
} from './wire';

export const TYPE_URL_PREFIX = 'type.googleapis.com/';

const MAX_FRAME_BYTES = 182;

export const RESPONSE_CODES = ['fail', 'success', 'not_supported'] as const;

export type ResponseCode = (typeof RESPONSE_CODES)[number];

export const CAP_RESPONSE = z.strictObject({
  requestId: z.number().int().positive(),
  code: z.enum(RESPONSE_CODES),
  typeName: z.string().nullable(),
  value: z.instanceof(Uint8Array),
});

export type CapResponse = z.infer<typeof CAP_RESPONSE>;

export function encodeRequest(
  requestId: number,
  name: string,
  value: Uint8Array = EMPTY,
): Uint8Array {
  if (!isAllowedRequest(name)) {
    const never = NEVER_SENT_REQUESTS.some((candidate) => candidate === name);
    throw new LarqRefusedError(
      never
        ? `Refusing to send ${name}: it can brick the cap or switch off its UV safety limits.`
        : `Refusing to send ${name}: it is not one of the requests this app uses on a LARQ cap.`,
    );
  }
  if (!Number.isInteger(requestId) || requestId < 1 || requestId > 0xffffffff) {
    throw new LarqFrameError(
      `A request id must be between 1 and 4294967295, not ${String(requestId)}.`,
    );
  }
  const frame = concatBytes(
    encodeFixed32(1, requestId),
    encodeMessage(
      2,
      concatBytes(encodeString(1, `${TYPE_URL_PREFIX}${name}`), encodeBytes(2, value)),
    ),
  );
  if (frame.length > MAX_FRAME_BYTES) {
    throw new LarqFrameError(
      `${name} would be ${String(frame.length)} bytes; the cap accepts ${String(MAX_FRAME_BYTES)} at most.`,
    );
  }
  return frame;
}

export function requestIdOf(frame: Uint8Array): number {
  const id = readFixed32(fieldsOf(frame), 1);
  if (id === 0) {
    throw new LarqFrameError('The request carries no id.');
  }
  return id;
}

function typeNameOf(url: string): string {
  if (!url.startsWith(TYPE_URL_PREFIX)) {
    throw new LarqFrameError(
      `The cap answered with type ${url}, which does not start with ${TYPE_URL_PREFIX}.`,
    );
  }
  return url.slice(TYPE_URL_PREFIX.length);
}

export function decodeResponse(frame: Uint8Array): CapResponse {
  const fields = fieldsOf(frame);
  const code = RESPONSE_CODES[readVarint(fields, 2)];
  if (code === undefined) {
    throw new LarqFrameError(
      `The cap answered with response code ${String(readVarint(fields, 2))}, which is not fail, success or not supported.`,
    );
  }
  const any = readMessage(fields, 3);
  const url = new TextDecoder().decode(readBytes(any, 1));
  return CAP_RESPONSE.parse({
    requestId: readFixed32(fields, 1),
    code,
    typeName: url === '' ? null : typeNameOf(url),
    value: readBytes(any, 2),
  });
}

export function expectBody(response: CapResponse, request: RequestName): Uint8Array {
  if (response.code !== 'success') {
    throw new LarqResponseError(
      `${request} was answered ${response.code.replace('_', ' ')}${response.code === 'fail' ? '' : ' by this cap'}.`,
    );
  }
  const expected = responseNameOf(request);
  if (response.typeName !== expected) {
    throw new LarqResponseError(
      `${request} expects ${expected} but the cap answered ${response.typeName ?? 'nothing'}.`,
    );
  }
  return response.value;
}

export function expectAcknowledged(response: CapResponse, request: RequestName): void {
  if (response.code !== 'success') {
    throw new LarqResponseError(
      `${request} was answered ${response.code.replace('_', ' ')}; the setting did not change.`,
    );
  }
}

export function requestNameOfFrame(frame: Uint8Array): string {
  const any = readMessage(fieldsOf(frame), 2);
  const url = new TextDecoder().decode(readBytes(any, 1));
  const name = typeNameOf(url);
  if (!name.startsWith(REQUEST_PREFIX)) {
    throw new LarqFrameError(`${name} is not a request.`);
  }
  return name;
}
