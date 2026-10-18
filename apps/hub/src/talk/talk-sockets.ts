import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  TALK_CLIENT_MESSAGE,
  TALK_HEARTBEAT_MS,
  TALK_PATH,
  TALK_PROTOCOL,
  packetOfFrame,
  type TalkClientMessage,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { SocketEndpoint, type SocketPeer, type SocketSession } from '../server/socket-endpoint';
import type { Store } from '../store/store';
import type { TalkRelay } from './relay';
import type { TalkEndpoint } from './transmission';

export interface TalkSocketsOptions {
  readonly store: Store;
  readonly relay: TalkRelay;
  readonly log: Logger;
}

export class TalkSockets {
  private readonly socketEndpoint: SocketEndpoint<TalkClientMessage>;

  constructor(private readonly options: TalkSocketsOptions) {
    this.socketEndpoint = new SocketEndpoint({
      name: 'talk',
      store: options.store,
      protocol: TALK_PROTOCOL,
      path: TALK_PATH,
      heartbeatMs: TALK_HEARTBEAT_MS,
      schema: TALK_CLIENT_MESSAGE,
      log: options.log,
      open: (peer): SocketSession<TalkClientMessage> => this.accept(peer),
    });
  }

  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.socketEndpoint.upgrade(request, socket, head);
  }

  stop(): void {
    this.socketEndpoint.stop();
  }

  private accept(peer: SocketPeer): SocketSession<TalkClientMessage> {
    const { relay, log } = this.options;
    const endpoint: TalkEndpoint = {
      id: randomUUID(),
      clientId: peer.client.id,
      send: peer.text,
      audio: peer.frame,
    };
    log.info('talk.connected', { clientId: peer.client.id });
    relay.connect(endpoint);
    return {
      message: (message): void => {
        if (message.type === 'press') {
          relay.press(endpoint, message.channelId);
        } else if (message.type === 'listen') {
          relay.listen(endpoint, message.channelId, message.cameraId);
        } else {
          relay.release(endpoint.id);
        }
      },
      frame: (frame): void => {
        relay.audio(endpoint.id, packetOfFrame(frame));
      },
      closed: (): void => {
        relay.disconnect(endpoint.id);
        log.info('talk.disconnected', { clientId: peer.client.id });
      },
    };
  }
}
