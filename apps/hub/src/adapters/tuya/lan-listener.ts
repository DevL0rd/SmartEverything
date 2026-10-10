import type { Socket } from 'node:dgram';
import type { Logger } from '@smarteverything/logging';
import {
  LanAnnouncementError,
  readLanAnnouncement,
  type LanAnnouncement,
} from '@smarteverything/tuya';

export interface LanListenerOptions {
  readonly ports: readonly number[];
  readonly socket: () => Socket;
  readonly log: Logger;
  readonly announced: (announcement: LanAnnouncement) => void;
}

export class LanListener {
  private readonly sockets: Socket[] = [];

  constructor(private readonly options: LanListenerOptions) {}

  async start(): Promise<void> {
    await Promise.all(this.options.ports.map((port) => this.listen(port)));
  }

  stop(): void {
    for (const socket of this.sockets.splice(0)) {
      socket.close();
    }
  }

  private listen(port: number): Promise<void> {
    const socket = this.options.socket();
    this.sockets.push(socket);
    socket.on('message', (message) => {
      this.read(port, message);
    });
    return new Promise((resolve, reject) => {
      socket.once('error', reject);
      socket.once('listening', () => {
        socket.off('error', reject);
        socket.on('error', (error) => {
          this.options.log.error('tuya.lan_listener_failed', error, { port });
        });
        this.options.log.info('tuya.lan_listening', { port });
        resolve();
      });
      socket.bind(port);
    });
  }

  private read(port: number, message: Buffer): void {
    try {
      this.options.announced(readLanAnnouncement(new Uint8Array(message)));
    } catch (error) {
      if (!(error instanceof LanAnnouncementError)) {
        throw error;
      }
      this.options.log.debug('tuya.lan_broadcast_unreadable', { port, reason: error.reason });
    }
  }
}
