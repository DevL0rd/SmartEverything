import type { Model } from '@ricky0123/vad-web/dist/models/common.js';
import type { PauseChoiceMs, WakeSensitivity } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import type { CameraMicrophones, OpenMicrophone } from '../talk/camera-microphone';
import { OpusSpeech } from '../reach/voice-pacing';
import { Ear, type SpeechSegment } from './ear';
import type { KeywordSpotter } from './keyword-spotter';
import type { OnSuperseded, WakeClaims } from './wake-claims';
import type { WakeDiagnostics } from './wake-diagnostics';
import { background, messageOf } from '@smarteverything/logging';

const NO_AUDIO_MS = 15_000;
const REOPEN_AFTER_MS = [5_000, 30_000, 120_000] as const;

export interface EarDeps {
  readonly claims: Pick<WakeClaims, 'request'>;
  readonly microphones: Pick<CameraMicrophones, 'open'>;
  readonly spotter: KeywordSpotter;
  readonly model: () => Promise<Model>;
  readonly names: () => readonly string[];
  readonly pauseMs: () => PauseChoiceMs;
  readonly sensitivity: (cameraId: string) => WakeSensitivity;
  readonly busy: (cameraId: string) => boolean;
  readonly heard?: (
    cameraId: string,
    phrase: string,
    words: () => Int16Array,
    onSuperseded: OnSuperseded,
  ) => void;
  readonly speech?: (cameraId: string, segment: SpeechSegment) => void;
  readonly diagnostics?: WakeDiagnostics | null;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
}

export class CameraEar {
  private ear: Ear | null = null;
  private microphone: OpenMicrophone | null = null;
  private speech: OpusSpeech | null = null;
  private failures = 0;
  private timer: Cancel | null = null;
  private flowing = false;
  private arrivedAt = 0;
  private watchedAt = Number.NEGATIVE_INFINITY;
  private closed = false;

  constructor(
    readonly cameraId: string,
    private readonly deps: EarDeps,
  ) {}

  async open(): Promise<void> {
    const { deps, cameraId } = this;
    const { heard, speech } = deps;
    this.ear ??= new Ear(deps, {
      claim: { source: 'camera', key: cameraId },
      fields: { cameraId },
      sensitivity: (): WakeSensitivity => deps.sensitivity(cameraId),
      resting: (): boolean => deps.busy(cameraId),
      wake:
        heard === undefined
          ? null
          : (phrase, words, onSuperseded): void => {
              heard(cameraId, phrase, words, onSuperseded);
            },
      speech:
        speech === undefined
          ? null
          : (segment): void => {
              speech(cameraId, segment);
            },
    });
    await this.ear.open();
    await this.listen();
  }

  async close(): Promise<void> {
    this.closed = true;
    this.timer?.();
    this.release();
    await this.ear?.close();
  }

  private async listen(): Promise<void> {
    const speech = new OpusSpeech((pcm) => {
      this.ear?.hear(pcm);
    });
    this.speech = speech;
    this.flowing = false;
    this.watchedAt = Number.NEGATIVE_INFINITY;
    this.watchAudio();
    this.microphone = await this.deps.microphones
      .open(this.cameraId, {
        packet: (packet): void => {
          this.arrived();
          speech.packet(packet);
        },
        ended: (failure): void => {
          this.release();
          this.retry(failure ?? 'the camera audio stopped');
        },
      })
      .catch((cause: unknown) => {
        this.release();
        this.retry(messageOf(cause));
        return null;
      });
  }

  private arrived(): void {
    this.arrivedAt = this.now();
    if (!this.flowing) {
      this.flowing = true;
      this.failures = 0;
      this.deps.log.info('wake.audio', { cameraId: this.cameraId });
    }
    if (this.arrivedAt - this.watchedAt >= NO_AUDIO_MS / 2) {
      this.watchAudio();
    }
  }

  private watchAudio(): void {
    this.timer?.();
    this.watchedAt = this.now();
    this.timer = this.deps.clock.at(new Date(this.now() + NO_AUDIO_MS), () => {
      this.timer = null;
      if (this.closed) {
        return;
      }
      if (this.flowing && this.now() - this.arrivedAt < NO_AUDIO_MS) {
        this.watchAudio();
        return;
      }
      const reason = this.flowing ? 'the camera audio stalled' : 'no audio from the camera';
      this.release();
      this.retry(reason);
    });
  }

  private release(): void {
    this.microphone?.stop();
    this.microphone = null;
    this.speech?.free();
    this.speech = null;
  }

  private retry(reason: string): void {
    if (this.closed) {
      return;
    }
    const delay = REOPEN_AFTER_MS[Math.min(this.failures, REOPEN_AFTER_MS.length - 1)] ?? 0;
    this.failures += 1;
    this.deps.log.warn('wake.listen_failed', { cameraId: this.cameraId, reason, retryInMs: delay });
    this.timer?.();
    this.timer = this.deps.clock.at(new Date(this.now() + delay), () => {
      this.timer = null;
      background(this.listen(), 'camera_ear.listen_failed');
    });
  }

  private now(): number {
    return this.deps.clock.now().getTime();
  }
}
