import type { IncomingMessage } from 'node:http';
import { join } from 'node:path';
import type { Duplex } from 'node:stream';
import {
  SIGHT_FRAME_LIMITS,
  SIGHT_SOURCES,
  VOICE_KEY_MISSING,
  type AssistantVoiceClientMessage,
  type ClientRow,
  type SightFrame,
  type CallVoice,
  type VoiceSample,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { VoiceResponder } from '../assistant/voice-link';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { PriceBook } from '../ledger/gemini-live';
import type { SecretStore } from '../secrets/store';
import type { Store } from '../store/store';
import { CallDesk } from './call-desk';
import type { VoiceEndpoint } from './call-link';
import type { SightBudget } from './call-parts';
import { isSightMessage } from './call-sight-desk';
import type { HomeCameras } from './home-cameras';
import { Gemini, type VoiceProvider } from './gemini';
import { GeminiSpeech } from '../speech/gemini-speech';
import {
  OneShotSpeech,
  type Saying,
  type SpeechProviders,
  type SpeechRequest,
} from '../speech/one-shot-speech';
import { GeminiKeys } from './gemini-key';
import { GeminiLivePreview, type VoiceSampleProvider } from './gemini-preview';
import { VoiceSamples } from './voice-samples';
import { TurnSessions, type TurnRequest } from './turn-sessions';
import type { TurnSession } from './turn-session';
import { VoiceSockets } from './voice-sockets';
import type { HostedCall, HostedCallRequest, OutreachDesk } from './outreach';
import type { VideoSource } from './video';
import type { SpeakingMedia } from '../reach/room-media';
import { sayWhileSpeaking } from '../speech/speaking-say';
import { background } from '@smarteverything/logging';

export interface AssistantVoiceOptions {
  readonly store: Store;
  readonly secrets: SecretStore;
  readonly responder: VoiceResponder;
  readonly tools: ToolHub;
  readonly prices: PriceBook;
  readonly fetch: typeof fetch;
  readonly now: () => Date;
  readonly cameras: HomeCameras;
  readonly roomMedia?: SpeakingMedia;
  readonly dataDirectory: string;
  readonly log: Logger;
  readonly provider?: VoiceProvider;
  readonly speech?: SpeechProviders;
  readonly previewProvider?: VoiceSampleProvider;
}

export class AssistantVoice {
  readonly keys: GeminiKeys;
  readonly samples: VoiceSamples;
  private readonly desk: CallDesk;
  private readonly turns: TurnSessions;
  private readonly speech: OneShotSpeech;
  private readonly sockets: VoiceSockets;

  get sightCalls(): CallDesk['sights'] {
    return this.desk.sights;
  }

  constructor(private readonly options: AssistantVoiceOptions) {
    const { store, log } = options;
    this.keys = new GeminiKeys(options.secrets, options.fetch);
    this.samples = this.createSamples();
    const provider = options.provider ?? new Gemini(() => this.keys.current());
    this.speech = new OneShotSpeech({
      store,
      providers: options.speech ?? { gemini: new GeminiSpeech(() => this.keys.current()) },
      prices: options.prices,
      log,
    });
    const calls = {
      store,
      provider,
      responder: options.responder,
      tools: options.tools,
      prices: options.prices,
      now: options.now,
      log,
      ...(options.roomMedia === undefined ? {} : { roomMedia: options.roomMedia }),
    };
    this.desk = new CallDesk({ ...calls, cameras: options.cameras });
    this.turns = new TurnSessions(calls);
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
        sight: (endpoint, frame: SightFrame): void => {
          this.desk.sightFrame(endpoint.id, frame);
        },
        disconnected: (endpoint): void => {
          this.desk.detach(endpoint.id);
        },
      },
      log,
    );
  }

  sample(
    client: ClientRow,
    profileId: string | undefined,
    voice: CallVoice,
    signal?: AbortSignal,
  ): Promise<VoiceSample> {
    return this.samples.sample(
      {
        clientId: client.id,
        profileId: profileId ?? this.options.store.profiles.activeOf(client.id).id,
      },
      voice,
      signal,
    );
  }

  attachOutreach(desk: OutreachDesk): void {
    this.desk.attachOutreach(desk);
  }

  attachBudget(budget: SightBudget): void {
    this.desk.attachBudget(budget);
    this.samples.attachBudget(() => budget.reason());
  }

  host(request: HostedCallRequest): Promise<HostedCall> {
    return this.desk.host(request);
  }

  turn(request: TurnRequest): Promise<TurnSession> {
    return this.turns.open(request);
  }

  say(request: SpeechRequest): Promise<Saying> {
    return sayWhileSpeaking(this.options.roomMedia, (spoken) => this.speech.say(spoken), request);
  }

  attachVideo(callId: string, source: VideoSource): () => void {
    return this.desk.attachVideo(callId, source);
  }

  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.sockets.upgrade(request, socket, head);
  }

  callOpen(callMessageId: string): boolean {
    return this.desk.isOpen(callMessageId) || this.turns.isOpen(callMessageId);
  }

  result(eventId: string, text: string, progress: boolean): boolean {
    return progress ? false : this.desk.result(eventId, text) || this.turns.result(eventId, text);
  }

  async stop(): Promise<void> {
    await this.desk.stop();
    this.turns.stop();
    this.sockets.stop();
  }

  private createSamples(): VoiceSamples {
    const { options } = this;
    return new VoiceSamples({
      provider: options.previewProvider ?? new GeminiLivePreview(() => this.keys.current()),
      store: options.store,
      prices: options.prices,
      log: options.log,
      key: (): string | null => this.keys.current(),
      directory: join(options.dataDirectory, 'voice-samples'),
    });
  }

  private connected(endpoint: VoiceEndpoint): void {
    const available = this.keys.current() !== null;
    endpoint.send({
      type: 'ready',
      clientId: endpoint.clientId,
      available,
      reason: available ? null : VOICE_KEY_MISSING,
    });
    endpoint.send({
      type: 'capabilities',
      sight: [...SIGHT_SOURCES],
      still: true,
      interrupt: true,
      resume: true,
      maxFrameBytes: SIGHT_FRAME_LIMITS.maxBytes,
      minFrameIntervalMs: SIGHT_FRAME_LIMITS.minIntervalMs,
    });
  }

  private message(
    endpoint: VoiceEndpoint,
    client: ClientRow,
    message: AssistantVoiceClientMessage,
  ): void {
    if (isSightMessage(message)) {
      this.desk.sight(endpoint.id, message);
      return;
    }
    switch (message.type) {
      case 'call_start':
        this.desk.start(endpoint, client, message).catch((cause: unknown) => {
          this.options.log.error('voice.call_crashed', cause);
        });
        break;
      case 'call_end':
        background(this.desk.hangUp(endpoint.id, message.callId, 'hung_up'), 'up.hang_failed');
        break;
      case 'mute':
        this.desk.mute(endpoint.id, message.callId, message.muted);
        break;
      case 'activity':
        if (!this.desk.activity(endpoint.id, message.callId, message.speaking)) {
          this.options.log.warn('voice.activity_refused', { callId: message.callId });
        }
        break;
      case 'interrupt':
        this.desk.interrupt(endpoint.id, message.callId);
        break;
      case 'call_resume':
        this.desk.resume(endpoint, client, message.callId);
        break;
    }
  }
}
