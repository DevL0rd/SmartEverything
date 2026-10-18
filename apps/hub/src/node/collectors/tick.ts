import type { SAMPLE_TOPICS } from '@smarteverything/domain';

export type SampleTopic = (typeof SAMPLE_TOPICS)[number];

export interface Tick {
  readonly at: number;
  readonly key: boolean;
}

export type ReadFailed = (source: string, cause: unknown) => void;

export class PerTick<T> {
  private last: { readonly tick: Tick; readonly value: T } | null = null;

  get(tick: Tick, compute: () => T): T {
    if (this.last?.tick === tick) {
      return this.last.value;
    }
    const value = compute();
    this.last = { tick, value };
    return value;
  }
}
