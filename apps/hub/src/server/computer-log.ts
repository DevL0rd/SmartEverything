import type { Logger } from '@smarteverything/logging';
import { messageOf } from '@smarteverything/logging';

const REASON_LIMIT = 500;

interface Logged {
  readonly id: number;
  readonly openedAt: number;
  readonly closer: string | null;
  readonly frames: number;
  readonly rejected: number;
}

export class ComputerLog {
  constructor(
    private readonly log: Logger,
    private readonly protocol: string,
  ) {}

  replacing(deviceId: string, previous: Logged): void {
    this.log.info('computer.replacing', {
      deviceId,
      previousSocketId: previous.id,
      previousOpenMs: Math.round(performance.now() - previous.openedAt),
    });
  }

  connected(connection: Logged, deviceId: string, remote: string, sockets: number): void {
    this.log.info('computer.connected', {
      protocol: this.protocol,
      socketId: connection.id,
      deviceId,
      remote,
      sockets,
    });
  }

  rejected(connection: Logged, deviceId: string, cause: unknown): void {
    this.log.warn('computer.frame_rejected', {
      socketId: connection.id,
      protocol: this.protocol,
      deviceId,
      errorName: cause instanceof Error ? cause.name : 'unknown',
      frames: connection.frames,
      reason: messageOf(cause).slice(0, REASON_LIMIT),
    });
  }

  failed(connection: Logged, deviceId: string, cause: Error): void {
    this.log.error('computer.socket_failed', cause, { socketId: connection.id, deviceId });
  }

  closed(
    connection: Logged,
    deviceId: string,
    close: { readonly code: number; readonly reason: Buffer; readonly current: boolean },
  ): void {
    this.log.info('computer.closed', {
      protocol: this.protocol,
      socketId: connection.id,
      deviceId,
      closeCode: close.code,
      reason: close.reason.toString('utf8').slice(0, 120),
      closedBy: connection.closer ?? 'computer_or_network',
      openMs: Math.round(performance.now() - connection.openedAt),
      frames: connection.frames,
      rejected: connection.rejected,
      current: close.current,
    });
  }
}
