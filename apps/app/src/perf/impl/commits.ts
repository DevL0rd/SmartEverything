import { COMMIT_RING } from './config';
import { StampRing } from './ring';

export interface CommitSpan {
  readonly ms: number;
  readonly count: number;
  readonly top: string;
}

export class CommitLog {
  private readonly ring = new StampRing(COMMIT_RING);
  private readonly durations = new Float64Array(COMMIT_RING);
  private readonly tops: string[] = new Array<string>(COMMIT_RING).fill('');

  add(at: number, ms: number, top: string): void {
    const slot = this.ring.claim(at);
    this.durations[slot] = ms;
    this.tops[slot] = top;
  }

  span(from: number, to: number): CommitSpan {
    let ms = 0;
    let count = 0;
    let heaviest = -1;
    let top = '';
    for (let order = 0; order < this.ring.length; order += 1) {
      const slot = this.ring.slotOf(order);
      const at = this.ring.at[slot] ?? 0;
      if (at >= from && at <= to) {
        const duration = this.durations[slot] ?? 0;
        ms += duration;
        count += 1;
        if (duration > heaviest) {
          heaviest = duration;
          top = this.tops[slot] ?? '';
        }
      }
    }
    return { ms, count, top };
  }
}
