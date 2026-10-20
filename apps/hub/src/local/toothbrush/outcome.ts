import type { BrandItem } from './brand';
import type { MachineEvent } from './session-machine';

type Unreadable = Extract<BrandItem, { readonly kind: 'unreadable' }>;

export type Found = Extract<BrandItem, { readonly kind: 'record' }>;

export class BatchOutcome {
  readonly touched = new Set<string>();
  readonly events: MachineEvent[] = [];
  readonly records: Found[] = [];
  readonly ended: number[] = [];
  readonly unreadable: Unreadable[] = [];
  readonly refused: { readonly status: string; readonly at: string }[] = [];

  absorb(other: BatchOutcome): void {
    other.touched.forEach((name) => this.touched.add(name));
    this.events.push(...other.events);
  }
}
