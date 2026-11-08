import type { VacuumSlot } from '@smarteverything/domain';
import type { MapTarget } from './map-fetch';

export class SlotQueue {
  private running: Promise<void> | null = null;
  private pending: MapTarget | null = null;
  private noted: MapTarget | null = null;
  private published: number | null = null;

  note(target: MapTarget): void {
    this.noted = target;
  }

  lastNoted(): MapTarget | null {
    return this.noted;
  }

  claimPublication(index: number): boolean {
    if (this.published === index) return false;
    this.published = index;
    return true;
  }

  submit(target: MapTarget, settle: (target: MapTarget) => Promise<void>): Promise<void> {
    this.noted = target;
    if (this.running !== null) {
      this.pending = target;
      return this.running;
    }
    this.running = this.drain(target, settle).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async drain(
    first: MapTarget,
    settle: (target: MapTarget) => Promise<void>,
  ): Promise<void> {
    let next: MapTarget | null = first;
    while (next !== null) {
      this.pending = null;
      await settle(next);
      next = this.pending;
    }
  }
}

export function keyOf(deviceId: string, slot: VacuumSlot): string {
  return `${deviceId}\u0000${slot}`;
}
