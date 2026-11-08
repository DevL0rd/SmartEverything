import type { CapabilityKey } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';

export interface WriteConfirmationsOptions {
  readonly did: string;
  readonly windowMs: number;
  readonly now: () => number;
  readonly log: Logger;
}

interface Waiting {
  readonly timer: NodeJS.Timeout;
  readonly sentAt: number;
}

export class WriteConfirmations {
  private readonly waiting = new Map<CapabilityKey, Waiting>();

  constructor(private readonly options: WriteConfirmationsOptions) {}

  expect(key: CapabilityKey): void {
    this.arrived(key);
    const { did, windowMs, now, log } = this.options;
    const sentAt = now();
    const timer = setTimeout(() => {
      this.waiting.delete(key);
      log.warn('xiaomi.write_not_confirmed', {
        did,
        property: key,
        elapsedMs: now() - sentAt,
      });
    }, windowMs);
    this.waiting.set(key, { timer, sentAt });
  }

  arrived(key: CapabilityKey): void {
    const waiting = this.waiting.get(key);
    if (waiting !== undefined) {
      clearTimeout(waiting.timer);
      this.waiting.delete(key);
    }
  }

  close(): void {
    for (const { timer } of this.waiting.values()) {
      clearTimeout(timer);
    }
    this.waiting.clear();
  }
}
