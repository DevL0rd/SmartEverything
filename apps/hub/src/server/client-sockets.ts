import { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import { CLOSINGS, type Closing } from './live-closing';

const log = new Logger('hub.client-sockets');

export interface ClosableSocket {
  readonly close: (code: number, reason: string) => void;
  readonly once: (event: 'close', listener: () => void) => unknown;
}

export class ClientSockets {
  private readonly open = new Map<string, Set<ClosableSocket>>();

  constructor(store: Store) {
    store.feed.subscribe((change) => {
      if (
        change.table === 'clients' &&
        change.operation === 'DELETE' &&
        change.oldRecord !== null
      ) {
        this.close(change.oldRecord.id, 'withdrawn');
      }
    });
  }

  track(clientId: string, socket: ClosableSocket): void {
    const sockets = this.open.get(clientId) ?? new Set<ClosableSocket>();
    sockets.add(socket);
    this.open.set(clientId, sockets);
    socket.once('close', () => {
      sockets.delete(socket);
      if (sockets.size === 0) this.open.delete(clientId);
    });
  }

  close(clientId: string, closing: Closing): void {
    const { code, reason } = CLOSINGS[closing];
    const sockets = [...(this.open.get(clientId) ?? [])];
    for (const socket of sockets) {
      socket.close(code, reason.replaceAll('_', ' '));
    }
    if (sockets.length > 0) {
      log.info('sockets.client_closing', {
        clientId,
        sockets: sockets.length,
        closeCode: code,
        reason,
      });
    }
  }
}

const registries = new WeakMap<Store, ClientSockets>();

export function clientSocketsOf(store: Store): ClientSockets {
  const existing = registries.get(store);
  if (existing !== undefined) return existing;
  const created = new ClientSockets(store);
  registries.set(store, created);
  return created;
}
