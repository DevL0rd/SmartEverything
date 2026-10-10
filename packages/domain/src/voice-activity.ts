export const SPEECH_DETECTION = {
  positiveSpeechThreshold: 0.5,
  negativeSpeechThreshold: 0.35,
  preSpeechPadMs: 320,
  redemptionMs: 640,
  minSpeechMs: 160,
  submitUserSpeechOnPause: false,
} as const;

export const BARGE_IN = { probability: 0.8, sustainMs: 256, echoTailMs: 300 } as const;

export const BARGE_IN_LEVEL = { echoCancelled: 0.04, raw: 0.125 } as const;

export const SPEECH_PREROLL_MS = 640;

export interface TalkGateEvents {
  readonly open: () => void;
  readonly close: () => void;
}

export interface HeardFrame {
  readonly probability: number;
  readonly level: number;
  readonly durationMs: number;
  readonly assistantAudible: boolean;
  readonly at: number;
}

export class TalkGate {
  private opened = false;
  private confirmed = false;
  private overEcho = false;
  private bargeMs = 0;
  private audibleAt = Number.NEGATIVE_INFINITY;
  private lastAt = 0;

  constructor(
    private readonly events: TalkGateEvents,
    private readonly bargeInLevel: number,
  ) {}

  get open(): boolean {
    return this.opened;
  }

  frame(frame: HeardFrame): void {
    this.lastAt = frame.at;
    if (frame.assistantAudible) {
      this.audibleAt = frame.at;
    }
    const confident = frame.probability >= BARGE_IN.probability && frame.level >= this.bargeInLevel;
    this.bargeMs = confident ? this.bargeMs + frame.durationMs : 0;
    this.consider();
  }

  speechConfirmed(): void {
    this.confirmed = true;
    this.overEcho = !this.quiet();
    this.consider();
  }

  speechEnded(): void {
    this.confirmed = false;
    this.overEcho = false;
    this.bargeMs = 0;
    if (this.opened) {
      this.opened = false;
      this.events.close();
    }
  }

  private consider(): void {
    if (this.opened || !this.confirmed) {
      return;
    }
    const clear = !this.overEcho && this.quiet();
    if (clear || this.bargeMs >= BARGE_IN.sustainMs) {
      this.opened = true;
      this.events.open();
    }
  }

  private quiet(): boolean {
    return this.lastAt - this.audibleAt > BARGE_IN.echoTailMs;
  }
}

export class Preroll<T> {
  private items: { readonly item: T; readonly ms: number }[] = [];
  private heldMs = 0;

  constructor(private readonly keepMs: number) {}

  push(item: T, ms: number): void {
    this.items.push({ item, ms });
    this.heldMs += ms;
    for (
      let first = this.items[0];
      first !== undefined && this.heldMs - first.ms >= this.keepMs;
      first = this.items[0]
    ) {
      this.items.shift();
      this.heldMs -= first.ms;
    }
  }

  take(): T[] {
    const taken = this.items.map((entry) => entry.item);
    this.items = [];
    this.heldMs = 0;
    return taken;
  }
}

export function levelOf(samples: Int16Array | Float32Array, fullScale: number): number {
  if (samples.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const sample of samples) {
    sum += (sample / fullScale) ** 2;
  }
  return Math.sqrt(sum / samples.length);
}
