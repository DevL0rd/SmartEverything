import type { Model } from '@ricky0123/vad-web/dist/models/common.js';
import { BARGE_IN_LEVEL, levelOf, type WakeSensitivity } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { concat } from '../assistant-voice/audio';
import { sileroModel } from '../assistant-voice/silero-vad';
import { SpeechGate } from '../assistant-voice/speech-gate';
import type { Clock } from '../clock';
import { KeywordSpotter, type KeywordListening } from './keyword-spotter';
import type { WakeClaim, WakeClaims } from './wake-claims';
import { SegmentNotes } from './segment-notes';
import { WakeHandoff } from './wake-handoff';

const WAKE_COOLDOWN_MS = 20_000;

const PCM_FULL_SCALE = 32_768;
const SAMPLES_PER_MS = 16;
const SHORTEST_SEGMENT_MS = 400;
const LONGEST_SEGMENT_MS = 60_000;

export interface SpeechSegment {
  readonly startedAt: number;
  readonly endedAt: number;
  readonly pcm: Int16Array;
}

export interface EarOptions {
  readonly claim: WakeClaim;
  readonly fields: Readonly<Record<string, string>>;
  readonly sensitivity: () => WakeSensitivity;
  readonly resting: () => boolean;
  readonly names?: () => readonly string[];
  readonly wake: ((phrase: string, words: () => Int16Array) => void) | null;
  readonly speech: ((segment: SpeechSegment) => void) | null;
}

export interface EarDeps {
  readonly claims: Pick<WakeClaims, 'request'>;
  readonly spotter: KeywordSpotter;
  readonly model: () => Promise<Model>;
  readonly names: () => readonly string[];
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
}

interface Collecting {
  readonly startedAt: number;
  readonly chunks: Int16Array[];
  samples: number;
}

export class Ear {
  private gate: SpeechGate | null = null;
  private listening: KeywordListening | null = null;
  private collecting: Collecting | null = null;
  private readonly notes: SegmentNotes;
  private readonly handoff = new WakeHandoff();
  private quietUntil = 0;
  private closing: Promise<void> | null = null;

  constructor(
    private readonly deps: EarDeps,
    private readonly options: EarOptions,
  ) {
    this.notes = new SegmentNotes(options.fields, deps.log);
  }

  async open(): Promise<void> {
    this.gate ??= new SpeechGate(
      await this.deps.model(),
      {
        start: (): void => {
          this.startSegment();
        },
        audio: (pcm): void => {
          this.segmentAudio(pcm);
        },
        end: (): void => {
          this.endSegment(true);
        },
        failed: (reason): void => {
          this.deps.log.warn('wake.detection_failed', { ...this.options.fields, reason });
        },
      },
      {
        bargeInLevel: BARGE_IN_LEVEL.raw,
        assistantAudible: (): boolean => false,
        now: (): number => this.now(),
      },
    );
  }

  hear(pcm: Int16Array): void {
    this.handoff.keep(pcm);
    if (!this.resting()) {
      this.gate?.hear(pcm);
    }
  }

  close(): Promise<void> {
    this.closing ??= this.release();
    return this.closing;
  }

  private async release(): Promise<void> {
    this.endSegment(false);
    await this.gate?.release();
  }

  private startSegment(): void {
    const sensitivity = this.options.sensitivity();
    this.notes.started(this.now(), sensitivity);
    if (this.options.speech !== null) {
      this.collecting = { startedAt: this.now(), chunks: [], samples: 0 };
    }
    this.listening =
      this.options.wake === null
        ? null
        : this.deps.spotter.listen(
            [...this.deps.names(), ...(this.options.names?.() ?? [])],
            sensitivity,
          );
  }

  private segmentAudio(pcm: Int16Array): void {
    this.notes.level(levelOf(pcm, PCM_FULL_SCALE));
    this.collect(pcm);
    this.found(this.listening?.hear(pcm) ?? null);
  }

  private collect(pcm: Int16Array): void {
    const collecting = this.collecting;
    if (collecting === null) {
      return;
    }
    collecting.chunks.push(pcm);
    collecting.samples += pcm.length;
    if (collecting.samples / SAMPLES_PER_MS >= LONGEST_SEGMENT_MS) {
      this.deliver(collecting);
      this.collecting = { startedAt: this.now(), chunks: [], samples: 0 };
    }
  }

  private deliver(collecting: Collecting): void {
    if (collecting.samples / SAMPLES_PER_MS < SHORTEST_SEGMENT_MS) {
      return;
    }
    this.options.speech?.({
      startedAt: collecting.startedAt,
      endedAt: this.now(),
      pcm: concat(collecting.chunks),
    });
  }

  private resting(): boolean {
    const resting = this.now() < this.quietUntil || this.options.resting();
    if (resting && (this.listening !== null || this.collecting !== null)) {
      this.endSegment(false);
      this.gate?.reset();
    }
    return resting;
  }

  private endSegment(finished: boolean): void {
    const collecting = this.collecting;
    this.collecting = null;
    if (collecting !== null && finished) {
      this.deliver(collecting);
    }
    const listening = this.listening;
    this.listening = null;
    if (listening === null) {
      return;
    }
    const result = listening.finish();
    if (finished) {
      this.found(result.heard);
    }
    this.notes.ended(this.now(), result);
  }

  private found(phrase: string | null): void {
    if (phrase === null || this.options.wake === null) {
      return;
    }
    this.notes.heard(phrase);
    if (this.now() < this.quietUntil) {
      return;
    }
    this.quietUntil = this.now() + WAKE_COOLDOWN_MS;
    this.notes.wakeStarted();
    const words = this.handoff.begin();
    const { wake, claim } = this.options;
    this.deps.claims.request(claim).then(
      (granted) => {
        if (granted) {
          wake(phrase, words);
        }
      },
      (cause: unknown) => {
        this.deps.log.error('wake.claim_failed', cause, { ...this.options.fields });
      },
    );
  }

  private now(): number {
    return this.deps.clock.now().getTime();
  }
}

export interface EarsOptions {
  readonly claims: Pick<WakeClaims, 'request'>;
  readonly names: () => readonly string[];
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
}

export class Ears {
  private shared: KeywordSpotter | null = null;

  constructor(private readonly options: EarsOptions) {}

  spotter(): KeywordSpotter {
    this.shared ??= new KeywordSpotter();
    return this.shared;
  }

  async make(options: EarOptions): Promise<Ear> {
    const ear = new Ear(
      {
        claims: this.options.claims,
        spotter: this.spotter(),
        model: sileroModel,
        names: this.options.names,
        clock: this.options.clock,
        log: this.options.log,
      },
      options,
    );
    await ear.open();
    return ear;
  }

  free(): void {
    this.shared?.free();
  }
}
