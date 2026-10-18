import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { Logger } from '@smarteverything/logging';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import type { Go2rtcSocket } from '../cameras/go2rtc-client';
import { RelayLog } from './camera-relay-log';

export class CameraSockets {
  private readonly server = new WebSocketServer({ noServer: true });

  constructor(private readonly log: Logger) {}

  relay(request: IncomingMessage, socket: Duplex, head: Buffer, upstream: Go2rtcSocket): void {
    this.server.handleUpgrade(request, socket, head, (client) => {
      const events = new RelayLog(this.log);
      events.opened(client.protocol);
      const go2rtc = new WebSocket(upstream.url, {
        headers: { authorization: upstream.authorization },
      });
      const pending: { readonly data: RawData; readonly binary: boolean }[] = [];
      const forward =
        (target: WebSocket) =>
        (data: RawData, binary: boolean): void => {
          const queued = target === go2rtc && target.readyState !== WebSocket.OPEN;
          events.forwarded(target === go2rtc, data, queued);
          if (target.readyState === WebSocket.OPEN) {
            target.send(data, { binary });
          } else if (target === go2rtc) {
            pending.push({ data, binary });
          }
        };
      client.on('message', forward(go2rtc));
      go2rtc.on('message', forward(client));
      go2rtc.once('open', () => {
        events.upstreamOpen(pending.length);
        for (const { data, binary } of pending.splice(0)) {
          go2rtc.send(data, { binary });
        }
      });
      const closeBoth = (): void => {
        client.close();
        go2rtc.close();
      };
      const closed =
        (side: string) =>
        (code: number, reason: Buffer): void => {
          events.closed(side, code, reason);
          closeBoth();
        };
      client.once('close', closed('client'));
      go2rtc.once('close', closed('upstream'));
      go2rtc.on('error', (cause) => {
        events.failed('stream.relay_failed', cause);
        client.close(1011, 'camera stream failed');
      });
      client.on('error', (cause) => {
        events.failed('stream.client_failed', cause);
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
