import WebSocket from 'ws';

export type Ping = (withinMs: number) => Promise<boolean>;

function socketOf(wire: object): WebSocket | null {
  const conn: unknown = Reflect.get(wire, 'conn');
  const socket: unknown =
    typeof conn === 'object' && conn !== null ? Reflect.get(conn, 'ws') : undefined;
  return socket instanceof WebSocket ? socket : null;
}

function pinged(socket: WebSocket, withinMs: number): Promise<boolean> {
  if (socket.readyState !== WebSocket.OPEN) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const done = (alive: boolean): void => {
      clearTimeout(timer);
      socket.off('pong', pong);
      resolve(alive);
    };
    const pong = (): void => {
      done(true);
    };
    const timer = setTimeout(() => {
      done(false);
    }, withinMs);
    timer.unref();
    socket.once('pong', pong);
    socket.ping();
  });
}

export function pingOf(wire: object): Ping {
  const socket = socketOf(wire);
  return (withinMs) => (socket === null ? Promise.resolve(false) : pinged(socket, withinMs));
}
