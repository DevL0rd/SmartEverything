import type { EventEmitter } from 'node:events';
import WebSocket from 'ws';

export function pingWhenOpen(socket: WebSocket, sent?: (cause?: Error) => void): boolean {
  if (socket.readyState !== WebSocket.OPEN) return false;
  socket.ping(undefined, undefined, sent);
  return true;
}

export function reportErrors(emitter: EventEmitter, report: (cause: Error) => void): () => void {
  const listener = (cause: unknown): void => {
    report(cause instanceof Error ? cause : new Error(String(cause)));
  };
  emitter.on('error', listener);
  return (): void => {
    emitter.off('error', listener);
  };
}

export function afterPendingInput(verdict: () => void): void {
  setImmediate(verdict);
}
