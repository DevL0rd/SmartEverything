import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { Logger } from '@smarteverything/logging';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import type { Go2rtcSocket } from '../cameras/go2rtc-client';

export class CameraSockets {
  private readonly server = new WebSocketServer({ noServer: true });

  constructor(private readonly log: Logger) {}

  relay(request: IncomingMessage, socket: Duplex, head: Buffer, upstream: Go2rtcSocket): void {
    this.server.handleUpgrade(request, socket, head, (client) => {
      const go2rtc = new WebSocket(upstream.url, {
        headers: { authorization: upstream.authorization },
      });
      const pending: RawData[] = [];
      const forward =
        (target: WebSocket) =>
        (data: RawData, binary: boolean): void => {
          if (target.readyState === WebSocket.OPEN) {
            target.send(data, { binary });
          } else if (target === go2rtc) {
            pending.push(data);
          }
        };
      client.on('message', forward(go2rtc));
      go2rtc.on('message', forward(client));
      go2rtc.once('open', () => {
        for (const data of pending.splice(0)) {
          go2rtc.send(data);
        }
      });
      const closeBoth = (): void => {
        client.close();
        go2rtc.close();
      };
      client.once('close', closeBoth);
      go2rtc.once('close', closeBoth);
      go2rtc.on('error', (cause) => {
        this.log.warn('stream.relay_failed', { reason: cause.message });
        client.close(1011, 'camera stream failed');
      });
      client.on('error', (cause) => {
        this.log.warn('stream.client_failed', { reason: cause.message });
        go2rtc.close();
      });
    });
  }

  stop(): void {
    for (const client of this.server.clients) {
      client.terminate();
    }
    this.server.close();
  }
}
