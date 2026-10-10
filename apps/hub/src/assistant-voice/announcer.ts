import type { CallEnding } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { recordLiveTurn, type PriceBook } from '../ledger/gemini-live';
import type { Store } from '../store/store';
import type { CallLink } from './call-link';
import { Conversation } from './conversation';
import type { ConversationHooks } from './conversation-hooks';
import type { VoiceProvider } from './gemini';
import { SAY_INSTRUCTIONS } from './instructions';
import { failedAnswer } from './tool-answer';

export interface AnnounceSink {
  readonly audio: (packet: Uint8Array) => void;
  readonly said: () => void;
  readonly ended: (reason: CallEnding, detail: string | null) => void;
}

export interface AnnounceRequest {
  readonly id: string;
  readonly profileId: string;
  readonly clientId: string | null;
  readonly text: string;
  readonly sink: AnnounceSink;
}

export interface Announcement {
  readonly end: (reason: CallEnding) => Promise<void>;
}

export interface AnnouncerOptions {
  readonly store: Store;
  readonly provider: VoiceProvider;
  readonly prices: PriceBook;
  readonly log: Logger;
}

class NoToolsError extends Error {
  override readonly name = 'NoToolsError';
}

function linkOf(sink: AnnounceSink): CallLink {
  let spoke = false;
  return {
    audio: (frames): void => {
      frames.forEach((frame) => {
        sink.audio(frame);
      });
    },
    cut: (): void => undefined,
    playing: () => false,
    state: (state): void => {
      if (state === 'speaking') {
        spoke = true;
      } else if (spoke && state === 'listening') {
        spoke = false;
        sink.said();
      }
    },
    caption: (): void => undefined,
  };
}

export class Announcer {
  constructor(private readonly options: AnnouncerOptions) {}

  async say(request: AnnounceRequest): Promise<Announcement> {
    const conversation = new Conversation(
      this.options.provider,
      linkOf(request.sink),
      this.hooks(request),
    );
    await conversation.start(request.text);
    this.options.log.info('voice.announced', { id: request.id });
    return { end: (reason) => conversation.end(reason) };
  }

  private hooks(request: AnnounceRequest): ConversationHooks {
    const { store, prices, log } = this.options;
    return {
      speech: 'gated-client',
      settings: () => store.assistantChat.settings().voice,
      system: () => SAY_INSTRUCTIONS,
      tools: () => [],
      window: () => null,
      record: (): void => undefined,
      task: (): string => {
        throw new NoToolsError('An announcement has no tools.');
      },
      run: () => Promise.resolve(failedAnswer(new NoToolsError('An announcement has no tools.'))),
      ended: (reason, detail): void => {
        request.sink.ended(reason, detail);
      },
      usage: (usage, model): void => {
        try {
          recordLiveTurn(store.ledger, prices, {
            profileId: request.profileId,
            clientId: request.clientId,
            callId: request.id,
            chatId: null,
            messageId: null,
            model,
            usage,
          });
        } catch (cause) {
          log.error('voice.usage_unrecorded', cause, { callId: request.id });
        }
      },
      stalled: (step): void => {
        log.info('voice.no_reply', { id: request.id, step });
      },
    };
  }
}
