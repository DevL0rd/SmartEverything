import { ACTION_RING, CONTEXT_BEFORE_MS } from './config';
import { Ring, type Stamped } from './ring';

export interface Action extends Stamped {
  readonly kind: string;
  readonly label: string;
}

export class ActionLog {
  private readonly ring = new Ring<Action>(ACTION_RING);

  note(kind: string, label: string, at: number): void {
    this.ring.push({ at, kind, label });
  }

  contextOf(start: number, end: number): string[] {
    return this.ring
      .between(start - CONTEXT_BEFORE_MS, end)
      .slice(-4)
      .map((action) => {
        const label = action.label === '' ? '' : `:${action.label}`;
        return `${action.kind}${label}@${String(Math.round(action.at - start))}`;
      });
  }

  lastOf(kind: string, since: number): Action | null {
    const found = this.ring.between(since, Number.POSITIVE_INFINITY).filter((a) => a.kind === kind);
    return found[found.length - 1] ?? null;
  }
}
