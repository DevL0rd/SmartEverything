import { ApiError } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { Clock } from '../clock';
import type { StoredMemory } from '../store/repositories/ai-memories';
import type { Store } from '../store/store';
import type { ManagerModel } from './manager-model';
import type { MemorySplit } from './manager-schema';
import type { Principals, Standing } from './principals';
import { localDay } from './search';
import type { MemoryWriter } from './writer';

const log = new Logger('hub.memory');

export const REVIEW_KEY = 'memory.review';

export const REVIEW_BATCH = 50;

export const HOME_GROUP = 'home';

const REVIEWED = z.strictObject({ days: z.record(z.string(), z.string()) });

export interface ReviewPorts {
  readonly store: Pick<Store, 'aiMemories' | 'settingsKv'>;
  readonly model: Pick<ManagerModel, 'review'>;
  readonly writer: Pick<MemoryWriter, 'split'>;
  readonly principals: Pick<Principals, 'enabled' | 'of'>;
  readonly clock: Pick<Clock, 'now'>;
  readonly zone: () => string;
}

function groupOf(memory: StoredMemory): string {
  return memory.profile_id ?? HOME_GROUP;
}

export class MemoryReview {
  constructor(private readonly ports: ReviewPorts) {}

  async run(): Promise<void> {
    const day = localDay(this.ports.clock.now(), this.ports.zone());
    const reviewed = this.reviewed();
    for (const group of new Set(this.ports.store.aiMemories.all().map(groupOf))) {
      if (reviewed[group] === day) continue;
      const profileId = group === HOME_GROUP ? null : group;
      const permitted = (): boolean => this.ports.principals.enabled(profileId);
      if (!permitted()) continue;
      const standing = this.ports.principals.of(profileId);
      if (standing === null) {
        log.warn('memory.review_skipped', { group, reason: 'no_chat' });
        continue;
      }
      try {
        if (!(await this.reviewGroup(standing, group, permitted))) continue;
        reviewed[group] = day;
        this.ports.store.settingsKv.save(REVIEW_KEY, { days: reviewed });
      } catch (cause) {
        log.exception('memory.review_failed', cause, { group });
      }
    }
  }

  private reviewed(): Record<string, string> {
    const saved = REVIEWED.safeParse(this.ports.store.settingsKv.read(REVIEW_KEY));
    return saved.success ? { ...saved.data.days } : {};
  }

  private members(group: string): StoredMemory[] {
    return this.ports.store.aiMemories.all().filter((memory) => groupOf(memory) === group);
  }

  private async reviewGroup(
    standing: Standing,
    group: string,
    permitted: () => boolean,
  ): Promise<boolean> {
    const rows = this.members(group);
    const spread = { total: rows.length, high: rows.filter((m) => m.importance >= 85).length };
    for (let from = 0; from < rows.length; from += REVIEW_BATCH) {
      const batch = rows.slice(from, from + REVIEW_BATCH);
      if (!permitted()) return false;
      const answer = await this.ports.model.review(standing.chatId, spread, batch, permitted);
      if (!permitted()) return false;
      const current = new Map(batch.map((memory) => [memory.id, memory.importance]));
      const split = new Set(answer.splits.map((entry) => entry.id));
      this.ports.store.aiMemories.rate(
        answer.ratings
          .filter(
            (rating) =>
              !split.has(rating.id) &&
              current.has(rating.id) &&
              current.get(rating.id) !== rating.significance,
          )
          .map((rating) => ({ id: rating.id, importance: rating.significance })),
      );
      for (const entry of answer.splits) this.splitOne(standing, group, current, entry);
    }
    return permitted();
  }

  private splitOne(
    standing: Standing,
    group: string,
    batch: ReadonlyMap<string, number>,
    entry: MemorySplit,
  ): void {
    if (!batch.has(entry.id)) {
      log.warn('memory.split_ignored', { group, reason: 'unknown_id' });
      return;
    }
    try {
      const parts = this.ports.writer.split(standing.who, entry.id, entry.parts);
      log.info('memory.split', { group, parts: parts.length });
    } catch (cause) {
      if (!(cause instanceof ApiError)) throw cause;
      log.warn('memory.split_rejected', { group, reason: cause.message });
    }
  }
}
