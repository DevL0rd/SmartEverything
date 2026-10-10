import type { Logger } from '@smarteverything/logging';
import type { Model } from '@ricky0123/vad-web/dist/models/common.js';
import { BARGE_IN_LEVEL, levelOf } from '@smarteverything/domain';
import { SpeechGate } from '../assistant-voice/speech-gate';
import type { Cancel, Clock } from '../clock';
import type { CameraMicrophones, OpenMicrophone } from '../talk/camera-microphone';
import { OpusSpeech } from '../reach/voice-pacing';
import { KEYWORD_TUNING, type KeywordListening, type KeywordSpotter } from './keyword-spotter';
import { SegmentNotes } from './segment-notes';
import { WakeHandoff } from './wake-handoff';

export const WAKE_COOLDOWN_MS = 20_000;
export const NO_AUDIO_MS = 15_000;
const REOPEN_AFTER_MS = [5_000, 30_000, 120_000] as const;
const PCM_FULL_SCALE = 32_768;

export interface EarDeps {
  readonly microphones: Pick<CameraMicrophones, 'open'>;
  readonly spotter: KeywordSpotter;
  readonly model: () => Promise<Model>;
  readonly names: () => readonly string[];
  readonly busy: (cameraId: string) => boolean;
  readonly heard: (cameraId: string, phrase: string, words: () => Int16Array) => void;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
}

export class CameraEar {
  private microphone: OpenMicrophone | null = null;
  private speech: OpusSpeech | null = null;
  private gate: SpeechGate | null = null;
  private listening: KeywordListening | null = null;
  private readonly notes: SegmentNotes;
  private readonly handoff = new WakeHandoff();
  private quietUntil = 0;
  private failures = 0;
  private timer: Cancel | null = null;
  private flowing = false;
  private closed = false;

  constructor(
    readonly cameraId: string,
    private readonly deps: EarDeps,
  ) {
    this.notes = new SegmentNotes(cameraId, deps.log);
  }

  async open(): Promise<void> {
    this.gate ??= new SpeechGate(
      await this.deps.model(),
      {
        start: (): void => {
          this.notes.started(this.now());
          this.listening = this.deps.spotter.listen(this.deps.names());
        },
        audio: (pcm): void => {
          this.notes.level(levelOf(pcm, PCM_FULL_SCALE));
          this.found(this.listening?.hear(pcm) ?? null);
        },
        end: (): void => {
          this.stopListening();
        },
        failed: (reason): void => {
          this.deps.log.warn('wake.detection_failed', { cameraId: this.cameraId, reason });
        },
      },
      {
        bargeInLevel: BARGE_IN_LEVEL.raw,
        assistantAudible: (): boolean => false,
        now: (): number => this.now(),
      },
    );
    await this.listen();
  }

  async close(): Promise<void> {
    this.closed = true;
    this.timer?.();
    this.release();
    this.listening?.finish();
    this.listening = null;
    await this.gate?.release();
  }

  private async listen(): Promise<void> {
    const speech = new OpusSpeech((pcm) => {
      this.handoff.keep(pcm);
      if (!this.resting()) {
        this.gate?.hear(pcm);
      }
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

  private resting(): boolean {
    const resting = this.now() < this.quietUntil || this.deps.busy(this.cameraId);
    if (resting && this.listening !== null) {
      this.listening.finish();
      this.listening = null;
      this.gate?.reset();
    }
    return resting;
  }

  private stopListening(): void {
    const listening = this.listening;
    this.listening = null;
    if (listening === null) {
      return;
    }
    const result = listening.finish();
    this.notes.ended(this.now(), result.nearMiss, KEYWORD_TUNING.threshold);
    this.found(result.heard);
  }

  private found(phrase: string | null): void {
    if (phrase === null || this.now() < this.quietUntil) {
      return;
    }
    this.quietUntil = this.now() + WAKE_COOLDOWN_MS;
    this.deps.heard(this.cameraId, phrase, this.handoff.begin());
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
