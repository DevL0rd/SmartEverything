import { ACTION_RING, CONTEXT_BEFORE_MS } from './config';
import { StampRing } from './ring';

export class ActionLog {
  private readonly ring = new StampRing(ACTION_RING);
  private readonly kinds: string[] = new Array<string>(ACTION_RING).fill('');
  private readonly labels: string[] = new Array<string>(ACTION_RING).fill('');

  note(kind: string, label: string, at: number): void {
    const slot = this.ring.claim(at);
    this.kinds[slot] = kind;
    this.labels[slot] = label;
  }

  contextOf(start: number, end: number): string[] {
    const from = start - CONTEXT_BEFORE_MS;
    const found: string[] = [];
    for (let order = 0; order < this.ring.length; order += 1) {
      const slot = this.ring.slotOf(order);
      const at = this.ring.at[slot] ?? 0;
      if (at >= from && at <= end) {
        const label = this.labels[slot] ?? '';
        found.push(
          `${this.kinds[slot] ?? ''}${label === '' ? '' : `:${label}`}@${String(Math.round(at - start))}`,
        );
      }
    }
    return found.slice(-4);
  }
}
