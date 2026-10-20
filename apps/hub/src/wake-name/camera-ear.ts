import type { WakeSensitivity } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { CameraOfflineError } from '../cameras/camera-service';
import type { Cancel, Clock } from '../clock';
import type { RemoteEar, RemoteEars } from '../listening/remote-ears-port';
import type { CameraMicrophones, OpenMicrophone } from '../talk/camera-microphone';
import type { SpeechSegment } from '../listening/speech-segment';
import type { OnSuperseded } from './wake-claims';
import { background, messageOf } from '@smarteverything/logging';

const NO_AUDIO_MS = 15_000;
const REOPEN_AFTER_MS = [5_000, 30_000, 120_000] as const;

export interface EarDeps {
  readonly ears: Pick<RemoteEars, 'open'>;
  readonly microphones: Pick<CameraMicrophones, 'open'>;
  readonly sensitivity: (cameraId: string) => WakeSensitivity;
  readonly busy: (cameraId: string) => boolean;
  readonly heard?: (
    cameraId: string,
    phrase: string,
    words: () => Int16Array,
    onSuperseded: OnSuperseded,
  ) => void;
  readonly speech?: (cameraId: string, segment: SpeechSegment) => void;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
}

export class CameraEar {
  private ear: RemoteEar | null = null;
  private microphone: OpenMicrophone | null = null;
  private failures = 0;
  private timer: Cancel | null = null;
  private flowing = false;
  private arrivedAt = 0;
  private watchedAt = Number.NEGATIVE_INFINITY;
  private closed = false;
  private waiting = false;

  constructor(
    readonly cameraId: string,
    private readonly deps: EarDeps,
  ) {}

  async open(): Promise<void> {
    const { deps, cameraId } = this;
    const { heard, speech } = deps;
    this.ear ??= await deps.ears.open({
      source: { kind: 'camera', key: cameraId },
      codec: 'opus_48k_mono',
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
    await this.listen();
  }

  async close(): Promise<void> {
    this.closed = true;
    this.timer?.();
    this.release();
    await this.ear?.close();
  }

  private async listen(): Promise<void> {
    this.flowing = false;
    this.watchedAt = Number.NEGATIVE_INFINITY;
    this.watchAudio();
    this.microphone = await this.deps.microphones
      .open(this.cameraId, {
        packet: (packet): void => {
          this.arrived();
          this.ear?.packet(packet);
        },
        ended: (failure): void => {
          this.release();
          this.retry(failure ?? 'the camera audio stopped');
        },
      })
      .catch((cause: unknown) => {
        this.release();
        if (cause instanceof CameraOfflineError) {
          this.waitForCamera(cause.message);
        } else {
          this.retry(messageOf(cause));
        }
        return null;
      });
  }

  resume(): void {
    if (!this.waiting || this.closed) {
      return;
    }
    this.waiting = false;
    this.failures = 0;
    this.deps.log.info('wake.resumed', { cameraId: this.cameraId });
    background(this.listen(), 'camera_ear.listen_failed');
  }

  private waitForCamera(reason: string): void {
    if (this.closed) {
      return;
    }
    this.timer?.();
    this.timer = null;
    this.waiting = true;
    this.deps.log.warn('wake.waiting_for_camera', { cameraId: this.cameraId, reason });
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
