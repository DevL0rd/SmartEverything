import type { Logger } from '@smarteverything/logging';
import type { LoggedConnection } from './live-log';

export const CLOSINGS = {
  withdrawn: { code: 4001, reason: 'token_withdrawn' },
  access_changed: { code: 4002, reason: 'access_changed' },
} as const;

export type Closing = keyof typeof CLOSINGS;

export function closeClientSockets(
  connections: Iterable<LoggedConnection>,
  log: Logger,
  clientId: string,
  closing: Closing,
): void {
  const { code, reason } = CLOSINGS[closing];
  let sockets = 0;
  for (const connection of connections) {
    if (connection.client.id === clientId) {
      connection.stats.closedBy(`hub:${reason}`);
      connection.socket.close(code, reason.replaceAll('_', ' '));
      sockets += 1;
    }
  }
  log.info('live.client_closing', { clientId, sockets, closeCode: code, reason });
}
