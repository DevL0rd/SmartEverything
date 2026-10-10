import { z } from 'zod';

export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'] as const;

const LATEST_VERSION = PROTOCOL_VERSIONS[0];

export const JSON_RPC_ERRORS = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  unauthorized: -32001,
} as const;

const REQUEST_ID = z.union([z.string(), z.number().int()]);

export type RequestId = z.infer<typeof REQUEST_ID>;

const PARAMS = z.record(z.string(), z.unknown());

export const INCOMING = z.union([
  z.strictObject({
    jsonrpc: z.literal('2.0'),
    id: REQUEST_ID,
    method: z.string().min(1),
    params: PARAMS.optional(),
  }),
  z.strictObject({
    jsonrpc: z.literal('2.0'),
    method: z.string().min(1),
    params: PARAMS.optional(),
  }),
  z.strictObject({
    jsonrpc: z.literal('2.0'),
    id: REQUEST_ID.nullable(),
    result: z.unknown().optional(),
    error: z.unknown().optional(),
  }),
]);

export type Incoming = z.infer<typeof INCOMING>;

export type RpcRequest = Extract<Incoming, { id: RequestId; method: string }>;

export function isRequest(message: Incoming): message is RpcRequest {
  return 'method' in message && 'id' in message;
}

export function negotiatedVersion(asked: unknown): string {
  return PROTOCOL_VERSIONS.find((version) => version === asked) ?? LATEST_VERSION;
}

export function isSupportedVersion(header: string | undefined): boolean {
  return header === undefined || PROTOCOL_VERSIONS.some((version) => version === header);
}

export function resultMessage(id: RequestId, result: unknown): unknown {
  return { jsonrpc: '2.0', id, result };
}

export function errorMessage(id: RequestId | null, code: number, message: string): unknown {
  return { jsonrpc: '2.0', id, error: { code, message } };
}
