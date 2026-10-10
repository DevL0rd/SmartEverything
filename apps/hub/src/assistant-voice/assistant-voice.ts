import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { AssistantVoiceClientMessage, ClientRow } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { VoiceResponder } from '../assistant/voice-link';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { PriceBook } from '../ledger/gemini-live';
import type { SecretStore } from '../secrets/store';
import type { Store } from '../store/store';
import { Announcer, type AnnounceRequest, type Announcement } from './announcer';
import { CallDesk } from './call-desk';
import type { VoiceEndpoint } from './call-link';
import { Gemini, type VoiceProvider } from './gemini';
import { GeminiKeys } from './gemini-key';
import { VoiceSockets } from './voice-sockets';
import type { HostedCall, HostedCallRequest, OutreachDesk } from './outreach';
import type { VideoSource } from './video';

export interface AssistantVoiceOptions {
  readonly store: Store;
  readonly secrets: SecretStore;
  readonly responder: VoiceResponder;
  readonly tools: ToolHub;
  readonly prices: PriceBook;
  readonly fetch: typeof fetch;
  readonly now: () => Date;
  readonly log: Logger;
  readonly provider?: VoiceProvider;
}

export class AssistantVoice {
  readonly keys: GeminiKeys;
  private readonly desk: CallDesk;
  private readonly announcer: Announcer;
  private readonly sockets: VoiceSockets;

  constructor(private readonly options: AssistantVoiceOptions) {
    const { store, log } = options;
    this.keys = new GeminiKeys(options.secrets, options.fetch);
    const provider = options.provider ?? new Gemini(() => this.keys.current());
    this.announcer = new Announcer({ store, provider, prices: options.prices, log });
    this.desk = new CallDesk({
      store,
      provider,
      responder: options.responder,
      tools: options.tools,
      prices: options.prices,
      now: options.now,
      log,
    });
    this.sockets = new VoiceSockets(
      store,
      {
        connected: (endpoint): void => {
          this.connected(endpoint);
        },
        message: (endpoint, client, message): void => {
          this.message(endpoint, client, message);
        },
        audio: (endpoint, packet): void => {
          this.desk.audio(endpoint.id, packet);
        },
        disconnected: (endpoint): void => {
          void this.desk.hangUp(endpoint.id, null, 'disconnected');
        },
      },
      log,
    );
  }

  attachOutreach(desk: OutreachDesk): void {
    this.desk.attachOutreach(desk);
  }

  host(request: HostedCallRequest): Promise<HostedCall> {
    return this.desk.host(request);
  }

  announce(request: AnnounceRequest): Promise<Announcement> {
    return this.announcer.say(request);
  }

  attachVideo(callId: string, source: VideoSource): () => void {
    return this.desk.attachVideo(callId, source);
  }

  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.sockets.upgrade(request, socket, head);
  }

  result(eventId: string, text: string, progress: boolean): boolean {
    return progress ? false : this.desk.result(eventId, text);
  }

  async stop(): Promise<void> {
    await this.desk.stop();
    this.sockets.stop();
  }

  private connected(endpoint: VoiceEndpoint): void {
    const available = this.keys.current() !== null;
    endpoint.send({
      type: 'ready',
      clientId: endpoint.clientId,
      available,
      reason: available ? null : 'Add a Gemini key in Settings › AI assistant › Voice.',
    });
  }

  private message(
    endpoint: VoiceEndpoint,
    client: ClientRow,
    message: AssistantVoiceClientMessage,
  ): void {
    if (message.type === 'call_start') {
      this.desk.start(endpoint, client, message).catch((cause: unknown) => {
        this.options.log.error('voice.call_crashed', cause);
      });
    } else if (message.type === 'call_end') {
      void this.desk.hangUp(endpoint.id, message.callId, 'hung_up');
    } else if (message.type === 'mute') {
      this.desk.mute(endpoint.id, message.callId, message.muted);
    } else if (!this.desk.activity(endpoint.id, message.callId, message.speaking)) {
      this.options.log.warn('voice.activity_refused', { callId: message.callId });
    }
  }
}
