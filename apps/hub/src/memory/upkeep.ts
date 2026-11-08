import { Logger, background } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import type { Store } from '../store/store';
import type { MemoryManager } from './manager';
import type { Principals } from './principals';
import type { MemoryReview } from './review';
import { localDay, purgeable } from './search';

const log = new Logger('hub.memory');

export const SWEEP_EVERY_MS = 24 * 3_600_000;

export interface UpkeepPorts {
  readonly store: Pick<Store, 'aiMemories'>;
  readonly manager: Pick<MemoryManager, 'expired'>;
  readonly review: Pick<MemoryReview, 'run'>;
  readonly principals: Pick<Principals, 'enabled' | 'of'>;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly zone: () => string;
}

export class MemoryUpkeep {
  private timer: Cancel | null = null;
  private stopped = false;
  private readonly cleaned = new Set<string>();

  constructor(private readonly ports: UpkeepPorts) {}

  start(): void {
    this.stopped = false;
    this.arm(0);
  }

  stop(): void {
    this.stopped = true;
    this.timer?.();
    this.timer = null;
  }

  async sweep(): Promise<void> {
    await this.step('memory.purge_failed', () => {
      this.purge();
      return Promise.resolve();
    });
    await this.step('memory.expiry_failed', () => this.expire());
    await this.step('memory.review_failed', () => this.ports.review.run());
  }

  purge(): number {
    const { aiMemories } = this.ports.store;
    const now = this.ports.clock.now();
    const gone = aiMemories
      .all()
      .filter(
        (memory) => purgeable(memory, now) && this.ports.principals.enabled(memory.profile_id),
      );
    aiMemories.purge(gone.map((memory) => memory.id));
    if (gone.length > 0) log.info('memory.purged', { count: gone.length });
    return gone.length;
  }

  async expire(): Promise<void> {
    const today = localDay(this.ports.clock.now(), this.ports.zone());
    for (const memory of this.ports.store.aiMemories.expired(today)) {
      if (this.cleaned.has(memory.id) || !this.ports.principals.enabled(memory.profile_id))
        continue;
      const standing = this.ports.principals.of(memory.profile_id);
      if (standing === null) continue;
      await this.ports.manager.expired(standing.who, standing.chatId, memory);
      if (
        this.ports.principals.enabled(memory.profile_id) &&
        this.ports.store.aiMemories.expired(today).some((left) => left.id === memory.id)
      ) {
        this.cleaned.add(memory.id);
        log.info('memory.expired_kept', { id: memory.id });
      }
    }
  }

  private async step(event: string, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (cause) {
      log.exception(event, cause);
    }
  }

  private arm(after: number): void {
    if (this.stopped) return;
    const { clock } = this.ports;
    this.timer = clock.at(new Date(clock.now().getTime() + after), () => {
      this.timer = null;
      background(
        this.sweep().finally(() => {
          this.arm(SWEEP_EVERY_MS);
        }),
        'memory.sweep_failed',
      );
    });
  }
}
