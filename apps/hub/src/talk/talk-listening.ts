import {
  DEFAULT_WAKE_SENSITIVITY,
  type TalkChannelRow,
  type TalkSpeaker,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { concat } from '../assistant-voice/audio';
import { OpusSpeech } from '../reach/voice-pacing';
import type { Store } from '../store/store';
import type { ListeningBudget } from '../transcripts/listening-budget';
import { ownerProfileOf } from '../transcripts/owner';
import type { Transcriber } from '../transcripts/transcriber';
import type { Ear, EarOptions } from '../wake-name/ear';
import type { PacketSink } from './transmission';

export const TRANSCRIPT_CHARACTERS_MAX = 4000;
export const CONTEXT_WINDOW_MS = 120_000;
export const CONTEXT_LINES = 3;
const SAMPLES_PER_MS = 16;
const SHORTEST_MESSAGE_MS = 400;
const SILENCE_PAD_SAMPLES = 16_000;

export interface TalkHeard {
  readonly channel: TalkChannelRow;
  readonly messageId: string;
  readonly speaker: TalkSpeaker;
  readonly phrase: string;
  readonly transcript: string | null;
}

export type Listener = Pick<Ear, 'hear' | 'close'>;

export interface TalkEars {
  readonly make: (options: EarOptions) => Promise<Listener>;
}

export interface TalkListeningOptions {
  readonly store: Pick<Store, 'talk' | 'clients' | 'profiles'>;
  readonly ears: TalkEars;
  readonly transcriber: Pick<Transcriber, 'transcribe'>;
  readonly budget: Pick<ListeningBudget, 'capReached'>;
  readonly names: () => readonly string[];
  readonly keyPresent: () => boolean;
  readonly now: () => Date;
  readonly heard: (heard: TalkHeard) => void;
  readonly log: Logger;
}

interface Message {
  readonly channel: TalkChannelRow;
  readonly messageId: string;
  readonly speaker: TalkSpeaker;
}

class MessageListener implements PacketSink {
  private readonly speech: OpusSpeech;
  private readonly chunks: Int16Array[] = [];
  private readonly ear: Promise<Listener | null>;
  private phrase: string | null = null;

  constructor(
    private readonly options: TalkListeningOptions,
    private readonly message: Message,
  ) {
    const { channel } = message;
    this.speech = new OpusSpeech((pcm) => {
      this.chunks.push(pcm);
      this.hear(pcm);
    });
    this.ear = options.ears
      .make({
        claim: { source: 'talk', key: channel.id },
        fields: { channelId: channel.id },
        sensitivity: () => DEFAULT_WAKE_SENSITIVITY,
        resting: () => false,
        wake: (phrase): void => {
          this.phrase ??= phrase;
        },
        speech: null,
      })
      .catch((cause: unknown) => {
        options.log.error('talk.ear_failed', cause, { channelId: channel.id });
        return null;
      });
  }

  packet(packet: Uint8Array): void {
    this.speech.packet(packet);
  }

  end(): void {
    this.speech.free();
    this.finish().catch((cause: unknown) => {
      this.options.log.error('talk.listening_failed', cause, { messageId: this.message.messageId });
    });
  }

  private hear(pcm: Int16Array): void {
    void this.ear.then((ear) => {
      ear?.hear(pcm);
    });
  }

  private async finish(): Promise<void> {
    const ear = await this.ear;
    if (ear !== null) {
      ear.hear(new Int16Array(SILENCE_PAD_SAMPLES));
      await ear.close();
    }
    const transcript = await this.transcribe(concat(this.chunks));
    if (transcript !== null) {
      this.options.store.talk.setTranscript(this.message.messageId, transcript);
    }
    if (this.phrase !== null) {
      this.options.heard({ ...this.message, phrase: this.phrase, transcript });
    }
  }

  private async transcribe(pcm: Int16Array): Promise<string | null> {
    const { messageId, channel } = this.message;
    const skipped = this.skipReason(pcm);
    if (skipped !== null) {
      this.options.log.info('talk.transcript_skipped', { messageId, reason: skipped });
      return null;
    }
    const { store, now } = this.options;
    const since = new Date(now().getTime() - CONTEXT_WINDOW_MS).toISOString();
    const text = await this.options.transcriber
      .transcribe({
        pcm16k: pcm,
        profileId: ownerProfileOf(store),
        pluginId: null,
        names: this.options.names(),
        recent: store.talk
          .recentTranscripts(channel.id, since, CONTEXT_LINES)
          .flatMap((row) => (row.transcript === null ? [] : [row.transcript])),
        meta: { listening: 'talk', channel_id: channel.id, message_id: messageId },
      })
      .catch((cause: unknown) => {
        this.options.log.error('talk.transcript_failed', cause, { messageId });
        return null;
      });
    return text === null ? null : text.slice(0, TRANSCRIPT_CHARACTERS_MAX);
  }

  private skipReason(pcm: Int16Array): string | null {
    if (pcm.length / SAMPLES_PER_MS < SHORTEST_MESSAGE_MS) {
      return 'too_short';
    }
    if (!this.options.keyPresent()) {
      return 'no_gemini_key';
    }
    return this.options.budget.capReached() ? 'cap_reached' : null;
  }
}

export class TalkListening {
  constructor(private readonly options: TalkListeningOptions) {}

  open(channel: TalkChannelRow, messageId: string, speaker: TalkSpeaker): PacketSink {
    return new MessageListener(this.options, { channel, messageId, speaker });
  }
}
