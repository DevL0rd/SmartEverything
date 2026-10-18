import { ApiError, type LiveSubscribeMessage } from '@smarteverything/domain';
import type { PreviewLeases } from '../preview/leases';
import type { Connection } from './live-visibility';
import { messageOf } from '@smarteverything/logging';
export class LivePreviewOwners {
  private leases: PreviewLeases | null = null;
  private readonly stops = new Map<Connection, () => void>();
  attach(leases: PreviewLeases): void {
    if (this.leases !== null)
      throw new ApiError('conflict', 'Preview ownership is already attached.');
    this.leases = leases;
  }
  receive(connection: Connection, message: LiveSubscribeMessage): boolean {
    if (message.previewOwner === undefined) return true;
    try {
      if (this.stops.has(connection) || this.leases === null)
        throw new ApiError('conflict', 'This live connection cannot claim another preview.');
      const { chatId, lease } = message.previewOwner;
      this.stops.set(
        connection,
        this.leases.own({ kind: 'client', client: connection.client }, chatId, lease, (): void => {
          connection.socket.close(1001, 'Preview owner retired');
        }),
      );
      return true;
    } catch (cause) {
      connection.socket.send(
        JSON.stringify({
          type: 'refused',
          error: {
            code: 'forbidden',
            message: messageOf(cause),
          },
        }),
      );
      connection.socket.close(1008, 'Preview owner refused');
      return false;
    }
  }
  close(connection: Connection): void {
    const stop = this.stops.get(connection);
    this.stops.delete(connection);
    stop?.();
  }
}
