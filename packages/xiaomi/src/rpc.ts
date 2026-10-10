import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import { MiioDeviceError, MiioPacketError } from './errors';

const LAST_MESSAGE_ID = 2_147_483_647;

export interface RpcRequest {
  readonly id: number;
  readonly method: string;
  readonly params: JsonValue;
}

const RPC_RESPONSE = z.union([
  z.object({ id: z.number().int(), result: JSON_VALUE }),
  z.object({
    id: z.number().int(),
    error: z.object({ code: z.number().int(), message: z.string() }),
  }),
]);

export function nextMessageId(previous: number): number {
  return previous >= LAST_MESSAGE_ID ? 1 : previous + 1;
}

export function encodeRequest(request: RpcRequest): string {
  return JSON.stringify({ id: request.id, method: request.method, params: request.params });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new MiioPacketError('a JSON body', `${text} (${String(cause)})`);
  }
}

export function responseId(text: string): number | null {
  const parsed = z.object({ id: z.number().int() }).safeParse(parseJson(text));
  return parsed.success ? parsed.data.id : null;
}

export function parseResponse(request: RpcRequest, text: string): JsonValue {
  const parsed = RPC_RESPONSE.safeParse(parseJson(text));
  if (!parsed.success) {
    throw new MiioPacketError('an RPC result or error', text);
  }
  if (parsed.data.id !== request.id) {
    throw new MiioPacketError(`message id ${String(request.id)}`, String(parsed.data.id));
  }
  if ('error' in parsed.data) {
    throw new MiioDeviceError(request.method, parsed.data.error.code, parsed.data.error.message);
  }
  return parsed.data.result;
}
