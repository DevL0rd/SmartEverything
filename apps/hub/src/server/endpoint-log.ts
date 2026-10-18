import type { Logger } from '@smarteverything/logging';
import type { SocketStats } from './live-stats';

interface EndpointConnection {
  readonly id: number;
  readonly openedAt: number;
  readonly stats: SocketStats;
  readonly peer: { readonly client: { readonly id: string; readonly role: string } };
}

export interface EndpointClose {
  readonly code: number;
  readonly reason: Buffer;
  readonly remaining: number;
}

export class EndpointLog {
  constructor(
    private readonly log: Logger,
    private readonly name: string,
  ) {}

  connected(connection: EndpointConnection, remote: string, sockets: number): void {
    this.log.info(`${this.name}.connected`, {
      socketId: connection.id,
      clientId: connection.peer.client.id,
      role: connection.peer.client.role,
      remote,
      sockets,
    });
  }

  closing(connection: EndpointConnection, code: number, reason: string): void {
    connection.stats.closedBy(`hub:${reason.slice(0, 60)}`);
    this.log.info(`${this.name}.closing`, {
      socketId: connection.id,
      clientId: connection.peer.client.id,
      closeCode: code,
      reason,
    });
  }

  closed(connection: EndpointConnection, close: EndpointClose): void {
    const { stats } = connection;
    this.log.info(`${this.name}.closed`, {
      socketId: connection.id,
      clientId: connection.peer.client.id,
      closeCode: close.code,
      reason: close.reason.toString('utf8').slice(0, 120),
      closedBy: stats.closer ?? 'client_or_network',
      openMs: Math.round(performance.now() - connection.openedAt),
      messages: stats.messages,
      frames: stats.frames,
      frameBytes: stats.frameBytes,
      remaining: close.remaining,
    });
  }

  failed(connection: EndpointConnection, cause: Error & { code?: string }): void {
    this.log.warn(`${this.name}.socket_failed`, {
      socketId: connection.id,
      clientId: connection.peer.client.id,
      reason: cause.message,
      errorCode: cause.code ?? null,
    });
  }
}
