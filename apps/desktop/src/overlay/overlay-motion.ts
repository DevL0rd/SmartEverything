import { overlayLevel, type OverlayHostView } from '@smarteverything/domain/voice-overlay';

export const RIBBON_WEIGHTS = [0.3, 0.5, 0.7, 0.88, 1, 0.88, 0.7, 0.5, 0.3] as const;
export const METER_WEIGHTS = [0.5, 0.8, 1, 0.8, 0.5] as const;
const METER_STEPS = 5;
export const CALM_INTERVAL_MS = 100;
export const RIBBON_OWN = 0.62;
export const RIBBON_NEIGHBOUR = 0.19;
export const VOICED_ENTER = 0.12;
export const VOICED_EXIT = 0.06;

const ORB_GAIN: Readonly<Record<OverlayHostView['orb'], number>> = {
  idle: 0,
  thinking: 0,
  listening: 0.12,
  speaking: 0.22,
};

export interface MotionSink {
  ribbon(positions: readonly number[]): void;
  meter(step: number): void;
  orb(scale: number, aura: { readonly opacity: number; readonly scale: number }): void;
  glow(level: number): void;
  rest(on: boolean): void;
}

export interface MotionPorts {
  after(ms: number, run: () => void): () => void;
}

export interface MotionPlan {
  readonly source: 'input' | 'output' | null;
  readonly calm: boolean;
  readonly gain: number;
  readonly restMs: number;
}

export function motionPlan(view: OverlayHostView, restMs: number): MotionPlan {
  return {
    source: view.level,
    calm: view.mode !== 'full' || view.reducedMotion,
    gain: ORB_GAIN[view.orb],
    restMs,
  };
}

export function shapedLevel(sample: number): number {
  return overlayLevel(0, sample, Number.POSITIVE_INFINITY);
}

export function voicedAfter(voiced: boolean, sample: number): boolean {
  return shapedLevel(sample) >= (voiced ? VOICED_EXIT : VOICED_ENTER);
}

export function meterStep(shaped: number): number {
  return Math.round(shaped * METER_STEPS);
}

function ribbonTargets(level: number, seconds: number): readonly number[] {
  const count = RIBBON_WEIGHTS.length;
  return RIBBON_WEIGHTS.map((weight, index) => {
    if (level <= 0.02) {
      return 0;
    }
    const wobble = 0.85 + 0.15 * Math.sin(seconds * (5 + (index * 4) / (count - 1)) + index * 1.3);
    return Math.min(1, weight * level * wobble * 1.05);
  });
}

export function ribbonPositions(level: number, seconds: number): readonly number[] {
  const target = ribbonTargets(level, seconds);
  return target.map((here, index) => {
    const before = target[index - 1] ?? here;
    const after = target[index + 1] ?? here;
    return RIBBON_OWN * here + RIBBON_NEIGHBOUR * (before + after);
  });
}

export function orbScale(level: number, gain: number): number {
  return 1 + Math.min(1, level) * gain;
}

export function orbAura(level: number): { readonly opacity: number; readonly scale: number } {
  return { opacity: 0.2 + 0.5 * level, scale: 0.9 + 0.35 * level };
}

const IDLE_PLAN: MotionPlan = { source: null, calm: true, gain: 0, restMs: 8000 };

export class Motion {
  #plan: MotionPlan = IDLE_PLAN;
  #sample = 0;
  #voiced = false;
  #at = 0;
  #painted = 0;
  #step = -1;
  #cancelRest: (() => void) | null = null;
  #cancelCalm: (() => void) | null = null;
  #lastCalmAt = Number.NEGATIVE_INFINITY;
  #rested = false;

  constructor(
    private readonly ports: MotionPorts,
    private readonly sink: MotionSink,
  ) {}

  plan(plan: MotionPlan): void {
    if (plan.source !== this.#plan.source) {
      this.#sample = 0;
      this.#voiced = false;
    }
    this.#plan = plan;
    this.#cancelCalm?.();
    this.#cancelCalm = null;
    this.#cancelRest?.();
    this.#cancelRest = null;
    this.#wake();
    this.#step = -1;
    this.#paintFull(0);
    this.#paintCalm(this.#heard());
    this.#armRest();
    if (!plan.calm && this.#voiced) {
      this.#paintFull(this.#heard());
    }
  }

  level(levels: { readonly in: number; readonly out: number; readonly at: number }): void {
    const { source } = this.#plan;
    this.#sample = source === null ? 0 : source === 'input' ? levels.in : levels.out;
    this.#voiced = voicedAfter(this.#voiced, this.#sample);
    this.#at = levels.at;
    this.#armRest();
    if (this.#plan.calm) {
      this.#calm(levels.at);
    } else if (this.#voiced || this.#painted > 0) {
      this.#paintFull(this.#heard());
    }
  }

  stop(): void {
    this.#cancelRest?.();
    this.#cancelRest = null;
    this.#cancelCalm?.();
    this.#cancelCalm = null;
    this.#wake();
    this.#sample = 0;
    this.#voiced = false;
  }

  #heard(): number {
    return this.#voiced ? shapedLevel(this.#sample) : 0;
  }

  #wake(): void {
    if (this.#rested) {
      this.#rested = false;
      this.sink.rest(false);
    }
  }

  #calm(at: number): void {
    const wait = CALM_INTERVAL_MS - (at - this.#lastCalmAt);
    this.#cancelCalm?.();
    this.#cancelCalm = null;
    if (wait <= 0) {
      this.#lastCalmAt = at;
      this.#paintCalm(this.#heard());
      return;
    }
    this.#cancelCalm = this.ports.after(wait, () => {
      this.#cancelCalm = null;
      this.#lastCalmAt = at;
      this.#paintCalm(this.#heard());
    });
  }

  #paintCalm(shaped: number): void {
    const step = meterStep(shaped);
    if (step === this.#step) {
      return;
    }
    this.#step = step;
    const quantised = step / METER_STEPS;
    this.sink.meter(step);
    this.sink.ribbon(RIBBON_WEIGHTS.map((weight) => weight * quantised));
  }

  #paintFull(level: number): void {
    this.#painted = level;
    this.sink.ribbon(ribbonPositions(level, this.#at / 1000));
    this.sink.orb(orbScale(level, this.#plan.gain), orbAura(level));
    this.sink.glow(level);
  }

  #armRest(): void {
    if (this.#voiced) {
      this.#cancelRest?.();
      this.#cancelRest = null;
      this.#wake();
      return;
    }
    if (this.#cancelRest !== null || this.#rested) {
      return;
    }
    this.#cancelRest = this.ports.after(this.#plan.restMs, () => {
      this.#cancelRest = null;
      this.#rested = true;
      this.sink.rest(true);
    });
  }
}
