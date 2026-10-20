import {
  PRESSURE_STRIP_MAX,
  type BrushPressure,
  type SessionPressure,
} from '@smarteverything/domain';
import type { Tick } from './session-machine';

const PRESSURE_CODES: Readonly<Record<BrushPressure, 0 | 1 | 2>> = {
  no_contact: 0,
  optimal: 1,
  too_high: 2,
};

type Code = 0 | 1 | 2;

function entries(strip: readonly Code[], code: Code): number {
  return strip.filter((value, index) => value === code && index > 0 && strip[index - 1] !== code)
    .length;
}

export class OpenSession {
  startedAt: string;
  caught: boolean;
  lastElapsedS: number;
  maxElapsedS: number;
  paused: boolean;
  readonly strip: Code[] = [];
  private sawPressure = false;
  private elapsedSeen: boolean;
  private forceSum = 0;
  private forceCount = 0;
  private forceMax = 0;
  zoneSeconds: readonly number[] = [];
  face: number | null = null;

  constructor(
    first: Tick,
    private readonly catchLimitS: number,
  ) {
    const { elapsedS, activity } = first.snapshot;
    this.caught = elapsedS > catchLimitS;
    this.startedAt = startOf(first);
    this.lastElapsedS = this.caught ? elapsedS : 0;
    this.maxElapsedS = elapsedS;
    this.paused = activity === 'paused';
    this.elapsedSeen = first.elapsedChanged;
  }

  private firstElapsed(tick: Tick): void {
    this.elapsedSeen = true;
    this.caught = tick.snapshot.elapsedS > this.catchLimitS;
    this.startedAt = startOf(tick);
    this.lastElapsedS = this.caught ? tick.snapshot.elapsedS : 0;
  }

  track(tick: Tick): void {
    const { elapsedS, force } = tick.snapshot;
    if (!this.elapsedSeen && tick.elapsedChanged) {
      this.firstElapsed(tick);
    }
    this.maxElapsedS = Math.max(this.maxElapsedS, elapsedS);
    this.sawPressure = this.sawPressure || tick.pressure !== null || force !== null;
    this.note(tick);
    if (tick.elapsedChanged && elapsedS > this.lastElapsedS) {
      this.advance(elapsedS, PRESSURE_CODES[tick.pressure ?? 'no_contact']);
    }
  }

  private note(tick: Tick): void {
    const { force, face, zoneSeconds } = tick.snapshot;
    this.face = face ?? this.face;
    this.zoneSeconds = zoneSeconds.length > 0 ? [...zoneSeconds] : this.zoneSeconds;
    if (force !== null) {
      this.forceSum += force;
      this.forceCount += 1;
      this.forceMax = Math.max(this.forceMax, force);
    }
  }

  private advance(elapsedS: number, code: Code): void {
    for (let second = this.lastElapsedS; second < elapsedS; second += 1) {
      if (!this.caught && this.strip.length < PRESSURE_STRIP_MAX) {
        this.strip.push(code);
      }
    }
    this.lastElapsedS = elapsedS;
  }

  setPaused(paused: boolean): boolean {
    const changed = paused !== this.paused;
    this.paused = paused;
    return changed;
  }

  pressure(detailed: boolean): SessionPressure | null {
    if (this.caught || !this.sawPressure) {
      return null;
    }
    const base = {
      excessS: this.strip.filter((code) => code === 2).length,
      optimalS: this.strip.filter((code) => code === 1).length,
      strip: this.strip,
    };
    return detailed ? { ...base, ...this.detail() } : base;
  }

  private detail(): Partial<SessionPressure> {
    return {
      lowS: this.strip.filter((code) => code === 0).length,
      highEvents: entries(this.strip, 2),
      lowEvents: entries(this.strip, 0),
      ...(this.forceCount === 0
        ? {}
        : { forceAvgN: this.forceSum / this.forceCount, forceMaxN: this.forceMax }),
    };
  }
}

export function startOf(tick: Tick): string {
  return new Date(Date.parse(tick.at) - tick.snapshot.elapsedS * 1000).toISOString();
}
