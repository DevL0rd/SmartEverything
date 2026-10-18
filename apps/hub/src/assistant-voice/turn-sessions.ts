import { randomUUID } from 'node:crypto';
import type { Logger } from '@smarteverything/logging';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { VoiceResponder } from '../assistant/voice-link';
import type { PriceBook } from '../ledger/gemini-live';
import type { Store } from '../store/store';
import type { VoiceProvider } from './gemini';
import type { HostedSpeaking } from './outreach';
import { hostedCallerOf, type HostedCaller } from './persona';
import { TurnSession, type TurnEvents, type TurnTool } from './turn-session';
import { SpeakingScope, type SpeakingAnchor, type SpeakingMedia } from '../reach/room-media';
import { messageOf } from '@smarteverything/logging';

export interface TurnRequest {
  readonly pluginId: string;
  readonly caller: HostedCaller;
  readonly chatId: string;
  readonly place: string | null;
  readonly at?: SpeakingAnchor;
  readonly speaking: HostedSpeaking;
  readonly tools: readonly TurnTool[];
  readonly opening: string | null;
  readonly events: TurnEvents;
  readonly bare?: boolean;
}

export interface TurnSessionsOptions {
  readonly store: Store;
  readonly provider: VoiceProvider;
  readonly responder: VoiceResponder;
  readonly tools: ToolHub;
  readonly prices: PriceBook;
  readonly now: () => Date;
  readonly roomMedia?: SpeakingMedia;
  readonly log: Logger;
}

function speakingEvents(scope: SpeakingScope, events: TurnEvents, left: () => void): TurnEvents {
  return {
    ...events,
    audio: (pcm): void => {
      scope.start();
      events.audio(pcm);
    },
    interrupted: (): void => {
      scope.stop();
      events.interrupted();
    },
    turnComplete: (): void => {
      scope.stop();
      events.turnComplete();
    },
    ended: (reason, detail): void => {
      scope.close();
      left();
      events.ended(reason, detail);
    },
  };
}

export class TurnSessions {
  private readonly sessions = new Set<TurnSession>();

  constructor(private readonly options: TurnSessionsOptions) {}

  async open(request: TurnRequest): Promise<TurnSession> {
    const { store, provider, responder, tools, prices, now, log } = this.options;
    const id = randomUUID();
    const session: TurnSession = new TurnSession({
      id,
      kit: { store, responder, tools, now, prices, log },
      provider,
      who: {
        caller: hostedCallerOf(store, request.caller),
        chatId: request.chatId,
        place: request.place,
        speaking: request.speaking,
        canSee: false,
      },
      pluginId: request.pluginId,
      tools: request.tools,
      ...(request.bare === undefined ? {} : { bare: request.bare }),
      events: speakingEvents(
        new SpeakingScope(this.options.roomMedia, {
          id,
          deviceId: null,
          clientId: null,
          ...request.at,
        }),
        request.events,
        () => {
          this.sessions.delete(session);
        },
      ),
    });
    this.sessions.add(session);
    try {
      await session.start(request.opening);
    } catch (cause) {
      session.end('failed', messageOf(cause));
      throw cause;
    }
    log.info('voice.turn_session_started', { sessionId: id, pluginId: request.pluginId });
    return session;
  }

  isOpen(callMessageId: string): boolean {
    return [...this.sessions].some((session) => session.owns(callMessageId));
  }

  result(eventId: string, text: string): boolean {
    return [...this.sessions].some((session) => session.taskUpdate(eventId, text));
  }

  stop(): void {
    [...this.sessions].forEach((session) => {
      session.end('disconnected');
    });
  }
}
