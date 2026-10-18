import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  ASSISTANT_VOICE_CLIENT_MESSAGE,
  ASSISTANT_VOICE_HEARTBEAT_MS,
  ASSISTANT_VOICE_PATH,
  ASSISTANT_VOICE_PROTOCOL,
  frameKindOf,
  packetOfFrame,
  sightOfFrame,
  type AssistantVoiceClientMessage,
  type ClientRow,
  type SightFrame,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { SocketEndpoint, type SocketPeer, type SocketSession } from '../server/socket-endpoint';
import type { Store } from '../store/store';
import type { VoiceEndpoint } from './call-link';

export interface VoiceSocketHandlers {
  readonly connected: (endpoint: VoiceEndpoint) => void;
  readonly message: (
    endpoint: VoiceEndpoint,
    client: ClientRow,
    message: AssistantVoiceClientMessage,
  ) => void;
  readonly audio: (endpoint: VoiceEndpoint, packet: Uint8Array) => void;
  readonly sight: (endpoint: VoiceEndpoint, frame: SightFrame) => void;
  readonly disconnected: (endpoint: VoiceEndpoint) => void;
}

export class VoiceSockets {
  private readonly socketEndpoint: SocketEndpoint<AssistantVoiceClientMessage>;
  private readonly open = new Set<VoiceEndpoint>();

  constructor(
    store: Store,
    private readonly handlers: VoiceSocketHandlers,
    log: Logger,
  ) {
    this.socketEndpoint = new SocketEndpoint({
      name: 'voice',
      store,
      protocol: ASSISTANT_VOICE_PROTOCOL,
      path: ASSISTANT_VOICE_PATH,
      heartbeatMs: ASSISTANT_VOICE_HEARTBEAT_MS,
      schema: ASSISTANT_VOICE_CLIENT_MESSAGE,
      log,
      open: (peer): SocketSession<AssistantVoiceClientMessage> => this.accept(peer),
    });
  }

  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.socketEndpoint.upgrade(request, socket, head);
  }

  endpoints(): VoiceEndpoint[] {
    return [...this.open];
  }

  stop(): void {
    this.socketEndpoint.stop();
  }

  private accept(peer: SocketPeer): SocketSession<AssistantVoiceClientMessage> {
    const endpoint: VoiceEndpoint = {
      id: randomUUID(),
      clientId: peer.client.id,
      send: peer.text,
      audio: peer.frame,
    };
    const { handlers } = this;
    this.open.add(endpoint);
    handlers.connected(endpoint);
    return {
      message: (message): void => {
        handlers.message(endpoint, peer.client, message);
      },
      frame: (frame): void => {
        if (frameKindOf(frame) === 'audio') {
          handlers.audio(endpoint, packetOfFrame(frame));
        } else {
          handlers.sight(endpoint, sightOfFrame(frame));
        }
      },
      closed: (): void => {
        this.open.delete(endpoint);
        handlers.disconnected(endpoint);
      },
    };
  }
}
