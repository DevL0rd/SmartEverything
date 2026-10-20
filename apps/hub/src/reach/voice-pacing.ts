import { TALK_FRAME_MS } from '@smarteverything/domain';
import { opusCodec, toSpeech, type OpusCodec } from '../assistant-voice/audio';
import type { Cancel, Clock } from '../clock';
import { openLoopLagWindow, type LoopLag, type LoopLagWindow } from '../metrics/loop-delay';

export const OPUS_SILENCE = Uint8Array.of(0xf8, 0xff, 0xfe);

export const SPEAKER_LEAD_MS = 600;

export interface TurnStats extends LoopLag {
  readonly lateMs: number;
  readonly underrunMs: number;
}

export interface PacerOptions {
  readonly idle: Uint8Array | null;
  readonly spoke: (frames: number, stats: TurnStats) => void;
  readonly leadMs?: number;
}

const NO_LAG: LoopLag = { loopLagMaxMs: 0, loopLagP99Ms: 0 };
const NO_FILL: PacerOptions = { idle: null, spoke: () => undefined };
const RESYNC_AFTER_MS = 1000;

export class SpeakerPacer {
  private readonly queue: Uint8Array[] = [];
  private timer: Cancel | null = null;
  private readonly drained: (() => void)[] = [];
  private frames = 0;
  private active = false;
  private horizon = 0;
  private plannedAt = 0;
  private lateMs = 0;
  private underrunMs = 0;
  private loopLag: LoopLagWindow | null = null;
  private readonly leadMs: number;

  constructor(
    private readonly clock: Pick<Clock, 'now' | 'at'>,
    private readonly play: (packet: Uint8Array) => void,
    private readonly options: PacerOptions = NO_FILL,
  ) {
    this.leadMs = options.leadMs ?? SPEAKER_LEAD_MS;
    if (options.idle !== null) {
      this.start();
    }
  }

  push(packet: Uint8Array): void {
    this.queue.push(packet);
    if (this.active) {
      this.pump();
    } else {
      this.start();
    }
  }

  whenDrained(listener: () => void): void {
    if (this.queue.length === 0 && this.frames === 0) {
      listener();
    } else {
      this.drained.push(listener);
    }
  }

  cut(): void {
    this.queue.length = 0;
  }

  stop(): void {
    this.cut();
    this.loopLag?.abandon();
    this.loopLag = null;
    this.active = false;
    this.timer?.();
    this.timer = null;
  }

  private start(): void {
    this.active = true;
    this.horizon = this.clock.now().getTime();
    this.pump();
  }

  private pump(): void {
    const now = this.clock.now().getTime();
    this.timer?.();
    this.timer = null;
    if (this.queue.length > 0 && this.horizon < now && this.frames > 0) {
      this.underrunMs += now - this.horizon;
    }
    this.fill(now);
    if (this.queue.length === 0 && this.horizon <= now) {
      this.finishTurn();
      if (this.options.idle === null) {
        this.active = false;
        return;
      }
      this.idle(now);
    }
    this.schedule();
  }

  private fill(now: number): void {
    if (this.queue.length > 0) {
      this.horizon = Math.max(this.horizon, now);
    }
    while (this.queue.length > 0 && this.horizon - now < this.leadMs) {
      const packet = this.queue.shift();
      if (packet === undefined) {
        return;
      }
      this.loopLag ??= openLoopLagWindow();
      this.frames += 1;
      this.play(packet);
      this.horizon += TALK_FRAME_MS;
    }
  }

  private idle(now: number): void {
    const silence = this.options.idle;
    if (silence === null) {
      return;
    }
    if (now - this.horizon > RESYNC_AFTER_MS) {
      this.horizon = now;
    }
    while (this.horizon <= now) {
      this.play(silence);
      this.horizon += TALK_FRAME_MS;
    }
  }

  private schedule(): void {
    const wake = this.queue.length > 0 ? this.horizon - this.leadMs + TALK_FRAME_MS : this.horizon;
    this.plannedAt = wake;
    this.timer = this.clock.at(new Date(wake), () => {
      this.timer = null;
      this.lateMs = Math.max(this.lateMs, this.clock.now().getTime() - this.plannedAt);
      this.pump();
    });
  }

  private finishTurn(): void {
    if (this.frames > 0) {
      const lag = this.loopLag?.finish() ?? NO_LAG;
      this.loopLag = null;
      this.options.spoke(this.frames, {
        lateMs: this.lateMs,
        underrunMs: this.underrunMs,
        ...lag,
      });
      this.frames = 0;
      this.lateMs = 0;
      this.underrunMs = 0;
    }
    this.drained.splice(0).forEach((listener) => {
      listener();
    });
  }
}

export class OpusSpeech {
  private readonly codec: OpusCodec = opusCodec();

  constructor(private readonly hear: (pcm16k: Int16Array) => void) {}

  packet(packet: Uint8Array): void {
    this.hear(toSpeech(this.codec.decode(packet)));
  }

  free(): void {
    this.codec.free();
  }
}
