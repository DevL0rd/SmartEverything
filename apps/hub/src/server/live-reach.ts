import type { WebSocket } from 'ws';

export const LIVENESS_PROBE_MS = 3000;

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
      if (failure !== undefined) {
        finish(false);
      }
    });
  });
}
