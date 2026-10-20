import type { TranscriptPauseReason, TranscriptSession } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';
import type { Store } from '../store/store';
import { sameWords, silenceHallucination } from '../transcripts/heard-text';
import type { ListeningBudget } from '../transcripts/listening-budget';
import { ownerProfileOf } from '../transcripts/owner';
import type { Transcriber } from '../transcripts/transcriber';
import type { Transcripts } from '../transcripts/transcript-service';
import { Utterances } from '../transcripts/utterances';
import type { SpeechSegment } from './speech-segment';
import { personOfDevice } from './listening-rows';

const CONTEXT_LINES = 3;
const CONTEXT_WINDOW_MS = 120_000;
const SAMPLES_PER_MS = 16;
const REPEAT_WINDOW_MS = 30_000;

type SpeakingDevice = 'phone' | 'computer';

export interface DeviceSpeechOptions {
  readonly source: SpeakingDevice;
  readonly store: Pick<
    Store,
    'devices' | 'clients' | 'profiles' | 'personAccess' | 'settings' | 'computerNodes'
  >;
  readonly transcripts: Pick<Transcripts, 'open' | 'add' | 'close' | 'find' | 'recent'>;
  readonly transcriber: Pick<Transcriber, 'transcribe'>;
  readonly budget: Pick<ListeningBudget, 'capReached'>;
  readonly keyPresent: () => boolean;
  readonly names: () => readonly string[];
  readonly paused: (deviceId: string, reason: TranscriptPauseReason | null) => void;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
}

interface Said {
  readonly text: string;
  readonly at: number;
}

interface Open {
  readonly sessionId: string;
  readonly day: string;
}

export class DeviceSpeech {
  private readonly open = new Map<string, Open>();
  private readonly chains = new Map<string, Promise<void>>();
  private readonly reasons = new Map<string, TranscriptPauseReason>();
  private readonly utterances = new Map<string, Utterances>();
  private readonly said = new Map<string, Said>();

  constructor(private readonly options: DeviceSpeechOptions) {}

  segment(deviceId: string, segment: SpeechSegment): void {
    this.utterancesOf(deviceId).add(segment);
  }

  finish(deviceId: string): void {
    this.utterances.get(deviceId)?.finish();
  }

  private utterancesOf(deviceId: string): Utterances {
    let utterances = this.utterances.get(deviceId);
    if (utterances === undefined) {
      utterances = new Utterances(this.options.clock, {
        heard: (utterance): void => {
          this.queue(deviceId, utterance);
        },
        skipped: (reason, ms): void => {
          this.options.log.debug('transcripts.utterance_skipped', {
            deviceId,
            reason,
            ms: Math.round(ms),
          });
        },
      });
      this.utterances.set(deviceId, utterances);
    }
    return utterances;
  }

  private queue(deviceId: string, segment: SpeechSegment): void {
    const chain = (this.chains.get(deviceId) ?? Promise.resolve())
      .then(() => this.handle(deviceId, segment))
      .catch((cause: unknown) => {
        this.options.log.error('transcripts.segment_failed', cause, { deviceId });
      });
    this.chains.set(deviceId, chain);
  }

  private pauseOf(): TranscriptPauseReason | null {
    if (!this.options.keyPresent()) {
      return 'no_openrouter_key';
    }
    return this.options.budget.capReached() ? 'cap_reached' : null;
  }

  private async handle(deviceId: string, segment: SpeechSegment): Promise<void> {
    const reason = this.pauseOf();
    this.noteReason(deviceId, reason);
    if (reason !== null) {
      return;
    }
    const text = await this.options.transcriber.transcribe({
      pcm16k: segment.pcm,
      profileId: this.profileOf(deviceId),
      pluginId: null,
      names: this.options.names(),
      recent: this.recentLines(deviceId),
      meta: { listening: this.options.source, device_id: deviceId },
    });
    if (text === null || this.unheard(deviceId, text, segment.startedAt)) {
      return;
    }
    this.options.transcripts.add(this.sessionOf(deviceId).id, {
      at: new Date(segment.startedAt).toISOString(),
      ended_at: new Date(segment.endedAt).toISOString(),
      timing: 'wall_clock',
      speaker_id: null,
      speaker: this.nameOf(deviceId),
      text,
      bot: false,
    });
    this.options.log.info('transcripts.heard', {
      deviceId,
      source: this.options.source,
      ms: Math.round(segment.pcm.length / SAMPLES_PER_MS),
      characters: text.length,
    });
  }

  private unheard(deviceId: string, text: string, at: number): boolean {
    const before = this.said.get(deviceId);
    this.said.set(deviceId, { text, at });
    const repeated =
      before !== undefined && at - before.at < REPEAT_WINDOW_MS && sameWords(before.text, text);
    const reason = silenceHallucination(text) ? 'hallucination' : repeated ? 'repeat' : null;
    if (reason !== null) {
      this.options.log.debug('transcripts.line_dropped', { deviceId, reason });
    }
    return reason !== null;
  }

  private noteReason(deviceId: string, reason: TranscriptPauseReason | null): void {
    if ((this.reasons.get(deviceId) ?? null) === reason) {
      return;
    }
    if (reason === null) {
      this.reasons.delete(deviceId);
    } else {
      this.reasons.set(deviceId, reason);
    }
    this.options.log.info(
      reason === null ? 'transcripts.listening_resumed' : 'transcripts.listening_paused',
      { deviceId, ...(reason === null ? {} : { reason }) },
    );
    this.options.paused(deviceId, reason);
  }

  private recentLines(deviceId: string): string[] {
    const open = this.open.get(deviceId);
    if (open === undefined || this.options.transcripts.find(open.sessionId) === undefined) {
      return [];
    }
    return this.options.transcripts
      .recent(open.sessionId, CONTEXT_WINDOW_MS, CONTEXT_LINES)
      .map((line) => line.text);
  }

  private sessionOf(deviceId: string): TranscriptSession {
    const day = this.dayOf();
    const held = this.open.get(deviceId);
    const session = held === undefined ? undefined : this.options.transcripts.find(held.sessionId);
    if (held?.day === day && session?.ended_at === null) {
      return session;
    }
    if (session !== undefined) {
      this.options.transcripts.close(session.id);
    }
    const opened = this.options.transcripts.open({
      source: this.options.source,
      sourceId: deviceId,
      pluginId: null,
      title: `${this.nameOf(deviceId)} · ${day}`,
      retentionDays: null,
    });
    this.open.set(deviceId, { sessionId: opened.id, day });
    return opened;
  }

  private profileOf(deviceId: string): string {
    const device = this.options.store.devices.find(deviceId);
    const person = device === undefined ? null : personOfDevice(this.options.store, device);
    return person ?? ownerProfileOf(this.options.store);
  }

  private nameOf(deviceId: string): string {
    const device = this.options.store.devices.find(deviceId);
    return device === undefined ? 'Device' : (device.display_name ?? device.name);
  }

  private dayOf(): string {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: this.options.store.settings.read().time_zone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(this.options.clock.now());
  }
}
