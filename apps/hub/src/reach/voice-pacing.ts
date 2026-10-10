import { TALK_FRAME_MS } from '@smarteverything/domain';
import { opusCodec, toSpeech, type OpusCodec } from '../assistant-voice/audio';
import type { Cancel, Clock } from '../clock';

export const OPUS_SILENCE = Uint8Array.of(0xf8, 0xff, 0xfe);

export interface PacerOptions {
  readonly idle: Uint8Array | null;
  readonly spoke: (frames: number) => void;
}

const NO_FILL: PacerOptions = { idle: null, spoke: () => undefined };

export class SpeakerPacer {
  private readonly queue: Uint8Array[] = [];
  private timer: Cancel | null = null;
  private readonly drained: (() => void)[] = [];
  private frames = 0;

  constructor(
    private readonly clock: Pick<Clock, 'now' | 'at'>,
    private readonly play: (packet: Uint8Array) => void,
    private readonly options: PacerOptions = NO_FILL,
  ) {
    if (options.idle !== null) {
      this.next();
    }
  }

  push(packet: Uint8Array): void {
    this.queue.push(packet);
    if (this.timer === null) {
      this.next();
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
    this.timer?.();
    this.timer = null;
  }

  private next(): void {
    const packet = this.queue.shift();
    if (packet === undefined) {
      this.finishTurn();
      if (this.options.idle === null) {
        this.timer = null;
        return;
      }
      this.play(this.options.idle);
    } else {
      this.frames += 1;
      this.play(packet);
    }
    const due = new Date(this.clock.now().getTime() + TALK_FRAME_MS);
    this.timer = this.clock.at(due, () => {
      this.next();
    });
  }

  private finishTurn(): void {
    if (this.frames > 0) {
      this.options.spoke(this.frames);
      this.frames = 0;
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
