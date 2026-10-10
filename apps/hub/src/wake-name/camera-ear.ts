import type { Model } from '@ricky0123/vad-web/dist/models/common.js';
import type { WakeSensitivity } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import type { CameraMicrophones, OpenMicrophone } from '../talk/camera-microphone';
import { OpusSpeech } from '../reach/voice-pacing';
import { Ear, type SpeechSegment } from './ear';
import type { KeywordSpotter } from './keyword-spotter';
import type { WakeClaims } from './wake-claims';

const NO_AUDIO_MS = 15_000;
const REOPEN_AFTER_MS = [5_000, 30_000, 120_000] as const;

export interface EarDeps {
  readonly claims: Pick<WakeClaims, 'request'>;
  readonly microphones: Pick<CameraMicrophones, 'open'>;
  readonly spotter: KeywordSpotter;
  readonly model: () => Promise<Model>;
  readonly names: () => readonly string[];
  readonly sensitivity: (cameraId: string) => WakeSensitivity;
  readonly busy: (cameraId: string) => boolean;
  readonly heard?: (cameraId: string, phrase: string, words: () => Int16Array) => void;
  readonly speech?: (cameraId: string, segment: SpeechSegment) => void;
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
          : (phrase, words): void => {
              heard(cameraId, phrase, words);
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
        this.retry(cause instanceof Error ? cause.message : 'the microphone did not open');
        return null;
      });
  }

  private arrived(): void {
    if (!this.flowing) {
      this.flowing = true;
      this.failures = 0;
      this.deps.log.info('wake.audio', { cameraId: this.cameraId });
    }
  }

  private watchAudio(): void {
    this.timer?.();
    this.timer = this.deps.clock.at(new Date(this.now() + NO_AUDIO_MS), () => {
      this.timer = null;
      if (!this.flowing && !this.closed) {
        this.release();
        this.retry('no audio from the camera');
      }
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
      void this.listen();
    });
  }

  private now(): number {
    return this.deps.clock.now().getTime();
  }
}
