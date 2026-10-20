import type { Logger } from '@smarteverything/logging';
import type { WebSocket } from 'ws';
import type { LoggedConnection } from './live-log';

export const LIVENESS_PROBE_MS = 3000;

export async function answering<C extends LoggedConnection>(
  connections: readonly C[],
  log: Logger,
  noticeType: string,
): Promise<readonly C[]> {
  const alive = await Promise.all(
    connections.map(async (connection): Promise<boolean> => {
      if (await answersPing(connection.socket, LIVENESS_PROBE_MS)) {
        return true;
      }
      connection.stats.closedBy('hub:probe_unanswered');
      log.warn('live.connection_unresponsive', {
        clientId: connection.client.id,
        socketId: connection.id,
        probeMs: LIVENESS_PROBE_MS,
        openMs: Math.round(performance.now() - connection.openedAt),
        noticeType,
      });
      return false;
    }),
  );
  return connections.filter((_connection, index) => alive[index] === true);
}

export function answersPing(socket: WebSocket, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (alive: boolean): void => {
      clearTimeout(timer);
      socket.off('pong', onPong);
      socket.off('close', onClose);
      resolve(alive);
    };
    const onPong = (): void => {
      finish(true);
    };
    const onClose = (): void => {
      finish(false);
    };
    const timer = setTimeout(() => {
      socket.terminate();
      finish(false);
    }, timeoutMs);
    socket.once('pong', onPong);
    socket.once('close', onClose);
    socket.ping(undefined, undefined, (failure?: Error) => {
      if (failure instanceof Error) {
        finish(false);
      }
    });
  });
}
