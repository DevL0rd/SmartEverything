import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import type WebSocket from 'ws';
import { z } from 'zod';

export const SHELLY_RPC_FRAME = z.object({
  id: z.int().nonnegative().optional(),
  src: z.string().min(1).max(100),
  dst: z.string().max(100).optional(),
  result: JSON_VALUE.optional(),
  error: z.object({ code: z.int(), message: z.string().max(4000) }).optional(),
  method: z.string().max(100).optional(),
  params: z.record(z.string().max(100), JSON_VALUE).optional(),
});
export type ShellyRpcFrame = z.output<typeof SHELLY_RPC_FRAME> & { readonly sequence?: number };
export type ShellyNotification = Pick<ShellyRpcFrame, 'src' | 'method' | 'params' | 'sequence'>;
export function rpcFrame(data: WebSocket.RawData): ShellyRpcFrame {
  const bytes = Array.isArray(data)
    ? Buffer.concat(data)
    : data instanceof ArrayBuffer
      ? Buffer.from(data)
      : data;
  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString('utf8'));
  } catch (cause) {
    throw new ShellyConnectionError(
      'decode',
      cause instanceof SyntaxError
        ? 'the device sent malformed JSON'
        : 'the device frame cannot be decoded',
    );
  }
  return SHELLY_RPC_FRAME.parse(raw);
}
export class ShellyRpcError extends Error {
  override readonly name = 'ShellyRpcError';
  constructor(
    readonly method: string,
    readonly code: number,
  ) {
    super(`Shelly refused ${method} with error ${String(code)}.`);
  }
}
export class ShellyConnectionError extends Error {
  override readonly name = 'ShellyConnectionError';
  constructor(
    readonly operation: string,
    readonly reason: string,
  ) {
    super(`Shelly ${operation} failed: ${reason}.`);
  }
}
export interface ShellyPending {
  readonly method: string;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly resolve: (value: ShellyRpcFrame) => void;
  readonly reject: (cause: unknown) => void;
}
export interface ShellyRpcCall {
  readonly method: string;
  readonly params: JsonValue;
  readonly auth: Readonly<Record<string, string | number>> | null;
}
