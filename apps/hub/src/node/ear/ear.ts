import type { Model } from '@ricky0123/vad-web/dist/models/common.js';
import {
  BARGE_IN_LEVEL,
  Preroll,
  type PauseChoiceMs,
  type WakeSensitivity,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { concat } from '../../assistant-voice/audio';
import { SpeechGate } from '../../assistant-voice/speech-gate';
import type { Clock } from '../../clock';
import type { SpeechSegment } from '../../listening/speech-segment';
import type { OnSuperseded, WakeClaimant, WakeClaims } from '../../wake-name/wake-claims';
import { isWasmAbort, type EarRuntimeLost } from './runtime-lost';
import { EarWatch, type EarState, type NearMiss } from './ear-watch';
import { MediaClock } from './media-clock';
import type { KeywordListening } from './keyword-spotter';
import { CLIP_MS, type WakeDiagnostics } from './wake-diagnostics';
import { WakeHandoff } from './wake-handoff';

const SAMPLES_PER_MS = 16;
const SHORTEST_SEGMENT_MS = 400;
const LONGEST_SEGMENT_MS = 60_000;
const RECHECK_MS = 1000;
const SNIPPET_MS = 1000;

export interface EarOptions {
  readonly claim: WakeClaimant;
  readonly fields: Readonly<Record<string, string>>;
  readonly sensitivity: () => WakeSensitivity;
  readonly resting: () => boolean;
  readonly wakes?: () => boolean;
  readonly wake:
    ((phrase: string, words: () => Int16Array, onSuperseded: OnSuperseded) => void) | null;
  readonly near?: (phrase: string) => void;
  readonly speech: ((segment: SpeechSegment) => void) | null;
}

export interface EarSpotter {
  readonly lines: string;
  readonly keyOf: (sensitivity: WakeSensitivity) => string;
  readonly listen: (sensitivity: WakeSensitivity) => KeywordListening | null;
  readonly near: (sensitivity: WakeSensitivity) => KeywordListening | null;
}

export interface EarDeps {
  readonly claims: Pick<WakeClaims, 'request'>;
  readonly spotter: EarSpotter;
  readonly model: () => Promise<Model>;
  readonly pauseMs: () => PauseChoiceMs;
  readonly diagnostics?: WakeDiagnostics | null;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
  readonly lost?: EarRuntimeLost;
}

interface Collecting {
  readonly firstSample: number;
  readonly chunks: Int16Array[];
  samples: number;
}

export class Ear {
  private gate: SpeechGate | null = null;
  private listening: KeywordListening | null = null;
  private nearListening: KeywordListening | null = null;
  private readonly watch: EarWatch;
  private readonly clip: Preroll<Int16Array> | null;
  private readonly detach: (() => void) | null;
  private collecting: Collecting | null = null;
  private readonly clock = new MediaClock();
  private readonly handoff = new WakeHandoff();
  private closing: Promise<void> | null = null;
  private pause: PauseChoiceMs;
  private sensitivity: WakeSensitivity | null = null;
  private checkedAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly deps: EarDeps,
    private readonly options: EarOptions,
  ) {
    this.pause = deps.pauseMs();
    const diagnostics = deps.diagnostics ?? null;
    this.clip = diagnostics === null ? null : new Preroll<Int16Array>(CLIP_MS);
    const ear = {
      fields: options.fields,
      keywords: (): string => deps.spotter.lines,
      recent: (): Int16Array => concat(this.clip?.peek() ?? []),
    };
    this.detach = diagnostics?.attach(ear) ?? null;
    this.watch = new EarWatch({
      fields: options.fields,
      log: deps.log,
      missed: (miss: NearMiss): void => {
        diagnostics?.missed(ear, {
          sensitivity: miss.sensitivity,
          heardAt: new Date(miss.heardAt).toISOString(),
        });
      },
    });
  }

  async open(): Promise<void> {
    if ((this.options.speech === null && this.options.wake === null) || this.gate !== null) {
      return;
    }
    this.gate = new SpeechGate(
      await this.deps.model(),
      {
        start: (firstSample): void => {
          this.handoff.sentenceBegan(firstSample);
          if (this.options.speech !== null) {
            this.collecting = { firstSample, chunks: [], samples: 0 };
          }
        },
        audio: (pcm): void => {
          this.collect(pcm);
        },
        end: (): void => {
          this.handoff.sentenceEnded();
          this.endSegment(true);
        },
        failed: (reason): void => {
          this.deps.log.warn('wake.detection_failed', { ...this.options.fields, reason });
          if (isWasmAbort(reason)) {
            this.deps.lost?.(reason);
          }
        },
      },
      {
        bargeInLevel: BARGE_IN_LEVEL.raw,
        assistantAudible: (): boolean => false,
        now: (): number => this.now(),
        pauseMs: this.pause,
      },
    );
  }

  hear(pcm: Int16Array): void {
    if (this.closing !== null) {
      return;
    }
    this.followPause();
    this.handoff.keep(pcm);
    this.clip?.push(pcm, pcm.length / SAMPLES_PER_MS);
    if (this.gate !== null) {
      this.clock.hear(pcm.length, this.now());
    }
    const resting = this.options.resting();
    this.watch.heard(pcm, this.now(), this.state(resting), this.sensitivity);
    if (resting) {
      this.gate?.skip(pcm.length);
      this.rest();
      return;
    }
    this.spot(pcm);
    this.gate?.hear(pcm);
  }

  flush(): void {
    if (this.closing === null) {
      this.gate?.flush();
    }
  }

  private followPause(): void {
    const wanted = this.deps.pauseMs();
    if (wanted === this.pause) {
      return;
    }
    this.pause = wanted;
    this.gate?.pause(wanted);
  }

  private state(resting: boolean): EarState {
    if (resting) {
      return 'resting';
    }
    if (this.options.wake === null || this.options.wakes?.() === false) {
      return 'wake_off';
    }
    return this.listening === null && this.checkedAt > Number.NEGATIVE_INFINITY
      ? 'no_phrase'
      : 'listening';
  }

  close(): Promise<void> {
    this.closing ??= this.release();
    return this.closing;
  }

  private async release(): Promise<void> {
    this.detach?.();
    await this.gate?.release();
    this.rest();
  }

  private rest(): void {
    this.listening?.free();
    this.listening = null;
    this.nearListening?.free();
    this.nearListening = null;
    this.checkedAt = Number.NEGATIVE_INFINITY;
    if (this.collecting !== null) {
      this.endSegment(false);
      this.gate?.reset();
    }
  }

  private spot(pcm: Int16Array): void {
    if (this.options.wake === null || this.options.wakes?.() === false) {
      return;
    }
    const listening = this.current();
    const startedAt = performance.now();
    const phrase = listening?.hear(pcm) ?? null;
    const spotterMs = performance.now() - startedAt;
    const near = this.nearListening?.hear(pcm) ?? null;
    if (phrase !== null) {
      this.found(phrase, spotterMs, pcm.length / SAMPLES_PER_MS);
    } else if (near !== null) {
      this.nearly(near);
    }
  }

  private nearly(phrase: string): void {
    if (this.sensitivity === null) {
      return;
    }
    const accepted = this.watch.near({
      phrase,
      heardAt: this.now(),
      snippetDbfs: Math.round(this.handoff.level(SNIPPET_MS) * 10) / 10,
      sensitivity: this.sensitivity,
    });
    if (accepted) {
      this.options.near?.(phrase);
    }
  }

  private current(): KeywordListening | null {
    if (this.now() - this.checkedAt < RECHECK_MS) {
      return this.listening;
    }
    this.checkedAt = this.now();
    const sensitivity = this.options.sensitivity();
    if (this.listening?.key !== this.deps.spotter.keyOf(sensitivity)) {
      this.listening?.free();
      this.nearListening?.free();
      this.listening = this.deps.spotter.listen(sensitivity);
      this.nearListening = this.deps.spotter.near(sensitivity);
    }
    this.sensitivity = sensitivity;
    return this.listening;
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
      this.collecting = {
        firstSample: collecting.firstSample + collecting.samples,
        chunks: [],
        samples: 0,
      };
    }
  }

  private deliver(collecting: Collecting): void {
    if (collecting.samples / SAMPLES_PER_MS < SHORTEST_SEGMENT_MS) {
      return;
    }
    this.options.speech?.({
      startedAt: this.clock.wallAt(collecting.firstSample),
      endedAt: this.clock.wallAt(collecting.firstSample + collecting.samples),
      pcm: concat(collecting.chunks),
    });
  }

  private endSegment(finished: boolean): void {
    const collecting = this.collecting;
    this.collecting = null;
    if (collecting !== null && finished) {
      this.deliver(collecting);
    }
  }

  private found(phrase: string, spotterMs: number, chunkMs: number): void {
    const wake = this.options.wake;
    if (wake === null) {
      return;
    }
    const snippetDbfs = this.handoff.level(SNIPPET_MS);
    this.watch.woke(this.now());
    const grant = this.deps.claims.request({ ...this.options.claim, snippetDbfs });
    this.deps.log.info('wake.spotted', {
      ...this.options.fields,
      phrase,
      sensitivity: this.sensitivity,
      granted: grant.granted,
      snippetDbfs: Math.round(snippetDbfs * 10) / 10,
      chunkMs,
      spotterMs: Math.round(spotterMs * 10) / 10,
    });
    if (grant.granted) {
      wake(phrase, this.handoff.begin(), grant.onSuperseded);
    }
  }

  private now(): number {
    return this.deps.clock.now().getTime();
  }
}
