import {
  DEFAULT_WAKE_SENSITIVITY,
  type TalkChannelRow,
  type TalkSpeaker,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';
import type { RemoteEar, RemoteEars } from '../listening/remote-ears-port';
import type { SpeechSegment } from '../listening/speech-segment';
import type { Store } from '../store/store';
import type { ListeningBudget } from '../transcripts/listening-budget';
import { ownerProfileOf } from '../transcripts/owner';
import type { Transcriber } from '../transcripts/transcriber';
import { Utterances } from '../transcripts/utterances';
import type { OnSuperseded, Superseded, WakeClaim } from '../wake-name/wake-claims';
import type { PacketSink } from './transmission';
import { background } from '@smarteverything/logging';

const CONTEXT_WINDOW_MS = 120_000;
const CONTEXT_LINES = 3;

export interface TalkHeard {
  readonly channel: TalkChannelRow;
  readonly messageId: string;
  readonly speaker: TalkSpeaker;
  readonly phrase: string;
  readonly transcript: string | null;
  readonly onSuperseded: OnSuperseded;
}

export interface TalkListeningOptions {
  readonly store: Pick<Store, 'talk' | 'clients' | 'profiles' | 'personAccess'>;
  readonly ears: Pick<RemoteEars, 'open'>;
  readonly transcriber: Pick<Transcriber, 'transcribe'>;
  readonly budget: Pick<ListeningBudget, 'capReached'>;
  readonly names: () => readonly string[];
  readonly keyPresent: () => boolean;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly heard: (heard: TalkHeard) => void;
  readonly log: Logger;
}

interface Message {
  readonly channel: TalkChannelRow;
  readonly messageId: string;
  readonly speaker: TalkSpeaker;
}

class MessageListener implements PacketSink {
  private readonly utterances: Utterances;
  private readonly texts: Promise<string | null>[] = [];
  private readonly ear: Promise<RemoteEar | null>;
  private readonly stops: Superseded[] = [];
  private phrase: string | null = null;
  private winner: WakeClaim | null = null;

  constructor(
    private readonly options: TalkListeningOptions,
    private readonly message: Message,
  ) {
    const { channel } = message;
    this.utterances = new Utterances(options.clock, {
      heard: (utterance): void => {
        this.texts.push(this.transcribe(utterance));
      },
      skipped: (reason, ms): void => {
        options.log.info('talk.utterance_skipped', {
          messageId: message.messageId,
          reason,
          ms,
        });
      },
    });
    this.ear = options.ears
      .open({
        source: { kind: 'talk', key: message.messageId },
        codec: 'opus_48k_mono',
        claim: { source: 'talk', key: channel.id },
        fields: { channelId: channel.id },
        sensitivity: () => DEFAULT_WAKE_SENSITIVITY,
        resting: () => false,
        wake: (phrase, _words, onSuperseded): void => {
          if (this.phrase === null) {
            this.phrase = phrase;
            onSuperseded((winner) => {
              this.supersede(winner);
            });
          }
        },
        speech: (segment): void => {
          this.utterances.add(segment);
        },
      })
      .catch((cause: unknown) => {
        options.log.error('talk.ear_failed', cause, { channelId: channel.id });
        return null;
      });
  }

  packet(packet: Uint8Array): void {
    background(
      this.ear.then((ear) => {
        ear?.packet(packet);
      }),
      'talk_listening.background_failed',
    );
  }

  end(): void {
    this.finish().catch((cause: unknown) => {
      this.options.log.error('talk.listening_failed', cause, { messageId: this.message.messageId });
    });
  }

  private supersede(winner: WakeClaim): void {
    this.winner = winner;
    this.options.log.info('talk.superseded', {
      messageId: this.message.messageId,
      winner: winner.source,
    });
    this.stops.splice(0).forEach((stop) => {
      stop(winner);
    });
  }

  private readonly onSuperseded: OnSuperseded = (stop) => {
    if (this.winner === null) {
      this.stops.push(stop);
    } else {
      stop(this.winner);
    }
  };

  private async finish(): Promise<void> {
    const ear = await this.ear;
    await ear?.close();
    this.utterances.finish();
    const texts = await Promise.all(this.texts);
    const joined = texts.flatMap((text) => (text === null ? [] : [text])).join(' ');
    const transcript = joined === '' ? null : joined;
    if (transcript !== null) {
      this.options.store.talk.setTranscript(this.message.messageId, transcript);
    }
    if (this.phrase !== null && this.winner === null) {
      this.options.heard({
        ...this.message,
        phrase: this.phrase,
        transcript,
        onSuperseded: this.onSuperseded,
      });
    }
  }

  private async transcribe(segment: SpeechSegment): Promise<string | null> {
    const { messageId, channel } = this.message;
    const skipped = this.skipReason();
    if (skipped !== null) {
      this.options.log.info('talk.transcript_skipped', { messageId, reason: skipped });
      return null;
    }
    const { store, clock } = this.options;
    const since = new Date(clock.now().getTime() - CONTEXT_WINDOW_MS).toISOString();
    const text = await this.options.transcriber
      .transcribe({
        pcm16k: segment.pcm,
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
    return text;
  }

  private skipReason(): string | null {
    if (!this.options.keyPresent()) {
      return 'no_openrouter_key';
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
