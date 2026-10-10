import { COMMIT_RING } from './config';
import { Ring, type Stamped } from './ring';

export interface CommitEntry extends Stamped {
  readonly ms: number;
  readonly top: string;
}

export interface CommitSpan {
  readonly ms: number;
  readonly count: number;
  readonly top: string;
}

export class CommitLog {
  private readonly ring = new Ring<CommitEntry>(COMMIT_RING);

  add(at: number, ms: number, top: string): void {
    this.ring.push({ at, ms, top });
  }

  span(from: number, to: number): CommitSpan {
    const inside = this.ring.between(from, to);
    const heaviest = inside.reduce<CommitEntry | null>(
      (best, entry) => (best === null || entry.ms > best.ms ? entry : best),
      null,
    );
    return {
      ms: inside.reduce((sum, entry) => sum + entry.ms, 0),
      count: inside.length,
      top: heaviest?.top ?? '',
    };
  }

  lastAt(): number {
    return this.ring.last()?.at ?? 0;
  }
}
