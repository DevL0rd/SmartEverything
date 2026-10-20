import type { OralbSettings } from '@smarteverything/domain';

import { median } from './stats';

type OralbForceBands = NonNullable<OralbSettings['forceBands']>;

const SESSIONS_KEPT = 3;

interface ForceSample {
  readonly light: number | null;
  readonly high: number | null;
}

function present(values: readonly (number | null)[]): number[] {
  return values.flatMap((value) => (value === null ? [] : [value]));
}

export class ForceBands {
  private readonly sessions: ForceSample[];
  private light: number | null = null;
  private high: number | null = null;
  private total: number;

  constructor(private bands: OralbForceBands | null) {
    this.sessions = bands === null ? [] : [{ light: bands.lightBelow, high: bands.highAbove }];
    this.total = bands?.samples ?? 0;
  }

  get current(): OralbForceBands | null {
    return this.bands;
  }

  note(pressure: 0 | 1 | 2, force: number): void {
    if (pressure === 0) {
      this.light = Math.max(this.light ?? force, force);
    } else if (pressure === 2) {
      this.high = Math.min(this.high ?? force, force);
    }
  }

  finish(): OralbForceBands | null {
    const sample: ForceSample = { light: this.light, high: this.high };
    this.light = null;
    this.high = null;
    if (sample.light === null && sample.high === null) {
      return null;
    }
    this.sessions.push(sample);
    this.sessions.splice(0, Math.max(0, this.sessions.length - SESSIONS_KEPT));
    this.total += 1;
    const lightBelow = median(present(this.sessions.map((entry) => entry.light)));
    const highAbove = median(present(this.sessions.map((entry) => entry.high)));
    if (lightBelow === null || highAbove === null || lightBelow >= highAbove) {
      return null;
    }
    this.bands = { lightBelow, highAbove, samples: this.total };
    return this.bands;
  }
}
