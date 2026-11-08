import { createHash, randomUUID } from 'node:crypto';

export function operationIdOfCall(namespace: string, callId: string): string {
  const hex = createHash('sha256').update(`${namespace}:${callId}`).digest('hex');
  const variant = ((Number.parseInt(hex.slice(16, 17), 16) % 4) + 8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

export function newOperationId(namespace: string, callId: string | undefined): string {
  return callId === undefined ? randomUUID() : operationIdOfCall(namespace, callId);
}
