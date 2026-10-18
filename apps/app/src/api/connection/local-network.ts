import { connectionState } from './connection';
import { routeFor } from './active-route';

export function onLocalNetwork(): boolean {
  const connection = connectionState.get();
  if (connection.status !== 'paired') return false;
  return routeFor(connection.connection).state.get().endpoint?.kind === 'lan';
}

export function watchLocalNetwork(listener: () => void): () => void {
  let release = (): void => undefined;
  let last = onLocalNetwork();
  const check = (): void => {
    const now = onLocalNetwork();
    if (now !== last) {
      last = now;
      listener();
    }
  };
  const attach = (): void => {
    release();
    const connection = connectionState.get();
    release =
      connection.status === 'paired'
        ? routeFor(connection.connection).state.subscribe(check)
        : (): void => undefined;
    check();
  };
  const stopConnection = connectionState.subscribe(attach);
  attach();
  return (): void => {
    stopConnection();
    release();
  };
}
