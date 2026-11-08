import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagerResult, MemoryManager } from '../../src/memory/manager';
import type { ManagerModel } from '../../src/memory/manager-model';
import { Principals } from '../../src/memory/principals';
import { MemoryReview, REVIEW_KEY } from '../../src/memory/review';
import { retentionDays } from '../../src/memory/search';
import { MemoryUpkeep, SWEEP_EVERY_MS } from '../../src/memory/upkeep';
import type { MemorySplit } from '../../src/memory/manager-schema';
import { MemoryWriter } from '../../src/memory/writer';
import type { StoredMemory } from '../../src/store/repositories/ai-memories';
import { TEST_ENGINE } from '../support/engine';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const DAY = 86_400_000;
const START = new Date('2026-01-01T00:00:00.000Z');

let opened: TestStore;
let clock: Date;
let profileId: string;
let scheduled: { at: Date; action: () => void; cancelled: boolean }[];
let expiredCalls: StoredMemory[];

const fakeClock = {
  now: (): Date => clock,
  at: (moment: Date, action: () => void): (() => void) => {
    const entry = { at: moment, action, cancelled: false };
    scheduled.push(entry);
    return (): void => {
      entry.cancelled = true;
    };
  },
};

function later(days: number, extra = 0): void {
  clock = new Date(START.getTime() + days * DAY + extra);
}

function seed(
  importance: number,
  kind: StoredMemory['kind'] = 'fact',
  text = `memory ${String(importance)} ${kind}`,
): StoredMemory {
  clock = START;
  return opened.store.aiMemories.add(profileId, {
    scope: 'person',
    text,
    sourceChatId: null,
    sourceMessageId: null,
    kind,
    importance,
  });
}

function survivors(): string[] {
  return opened.store.aiMemories
    .all()
    .map((memory) => memory.id)
    .toSorted();
}

const NO_REVIEW = { run: (): Promise<void> => Promise.resolve() };

function upkeep(review: Pick<MemoryReview, 'run'> = NO_REVIEW): MemoryUpkeep {
  const manager: Pick<MemoryManager, 'expired'> = {
    expired: (_who, _chat, memory): Promise<ManagerResult> => {
      expiredCalls.push(memory);
      return Promise.resolve({ applied: [] });
    },
  };
  return new MemoryUpkeep({
    store: opened.store,
    manager,
    review,
    principals: new Principals(opened.store, () => profileId),
    clock: fakeClock,
    zone: (): string => 'UTC',
  });
}

beforeEach(async () => {
  captureLogs();
  clock = START;
  scheduled = [];
  expiredCalls = [];
  opened = await testStore(() => clock);
  profileId = opened.store.profiles.first().id;
  opened.store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Chat',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: TEST_ENGINE,
    titleAuto: false,
  });
});

afterEach(async () => {
  vi.useRealTimers();
  await opened.close();
});

describe('the low-score purge', () => {
  it('grows the retention linearly from 7 days at 0 to 365 days at 39', () => {
    expect(retentionDays(0)).toBe(7);
    expect(retentionDays(4)).toBe(7);
    expect(retentionDays(5)).toBe(12);
    expect(retentionDays(20)).toBe(65);
    expect(retentionDays(39)).toBe(365);
  });

  it('deletes a score 0 memory only after more than 7 days', () => {
    seed(0);
    later(7);
    expect(upkeep().purge()).toBe(0);
    later(7, 1);
    expect(upkeep().purge()).toBe(1);
    expect(survivors()).toEqual([]);
  });

  it('deletes a score 39 memory only after more than 365 days', () => {
    seed(39);
    later(365);
    expect(upkeep().purge()).toBe(0);
    later(365, 1);
    expect(upkeep().purge()).toBe(1);
  });

  it('keeps the middle of the range until its own retention', () => {
    seed(20);
    later(65);
    expect(upkeep().purge()).toBe(0);
    later(65, 1);
    expect(upkeep().purge()).toBe(1);
  });

  it('never deletes 40 and above by age', () => {
    const kept = seed(40);
    const high = seed(95);
    later(10 * 365);
    expect(upkeep().purge()).toBe(0);
    expect(survivors()).toEqual([kept.id, high.id].toSorted());
  });

  it('exempts vocabulary', () => {
    const word = seed(0, 'vocabulary');
    later(2 * 365);
    expect(upkeep().purge()).toBe(0);
    expect(survivors()).toEqual([word.id]);
  });

  it('restarts the clock on a recall and on an edit', () => {
    const recalled = seed(0, 'fact', 'recalled one');
    const edited = seed(0, 'fact', 'edited one');
    const idle = seed(0, 'fact', 'idle one');
    later(5);
    opened.store.aiMemories.recalled([recalled.id], clock.toISOString());
    opened.store.aiMemories.change(edited.id, profileId, { text: 'edited again' });
    later(8);
    expect(upkeep().purge()).toBe(1);
    expect(survivors()).toEqual([recalled.id, edited.id].toSorted());
    expect(survivors()).not.toContain(idle.id);
    later(13, 1);
    expect(upkeep().purge()).toBe(2);
  });
});

describe('expiry and the timers', () => {
  it('sends a memory whose valid_until has passed to a cleanup run once', async () => {
    const trip = seed(50, 'fact', 'Dan is in Japan');
    opened.store.aiMemories.change(trip.id, profileId, { valid_until: '2026-01-10' });
    const future = seed(50, 'fact', 'Dan is on call next week');
    opened.store.aiMemories.change(future.id, profileId, { valid_until: '2026-03-01' });
    later(20);
    const running = upkeep();
    await running.expire();
    await running.expire();
    expect(expiredCalls.map((memory) => memory.id)).toEqual([trip.id]);
  });

  it('arms at start, sweeps in the order purge, expiry, review and re-arms 24 hours later', async () => {
    const order: string[] = [];
    const running = upkeep({
      run: (): Promise<void> => {
        order.push('review');
        return Promise.resolve();
      },
    });
    seed(0);
    later(30);
    running.start();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.at).toEqual(clock);
    scheduled[0]?.action();
    await vi.waitFor(() => {
      expect(scheduled).toHaveLength(2);
    });
    expect(order).toEqual(['review']);
    expect(survivors()).toEqual([]);
    expect(scheduled[1]?.at.getTime()).toBe(clock.getTime() + SWEEP_EVERY_MS);
    running.stop();
    expect(scheduled[1]?.cancelled).toBe(true);
  });

  it('keeps sweeping when one step fails', async () => {
    const ran: string[] = [];
    const running = upkeep({
      run: (): Promise<void> => {
        ran.push('review');
        return Promise.resolve();
      },
    });
    const broken = vi.spyOn(opened.store.aiMemories, 'expired').mockImplementation(() => {
      throw new Error('storage');
    });
    await running.sweep();
    broken.mockRestore();
    expect(ran).toEqual(['review']);
  });

  it('preserves old and expired memories while the owner has memory switched off', async () => {
    const old = seed(0);
    const trip = seed(50, 'fact', 'Dan is in Japan');
    opened.store.aiMemories.change(trip.id, profileId, { valid_until: '2026-01-10' });
    later(20);
    opened.store.aiMemories.changeSettings(profileId, { enabled: false });
    const running = upkeep();
    await running.sweep();
    expect(expiredCalls).toEqual([]);
    expect(survivors()).toEqual([old.id, trip.id].toSorted());
    opened.store.aiMemories.changeSettings(profileId, { enabled: true });
    await running.sweep();
    expect(expiredCalls.map((memory) => memory.id)).toEqual([trip.id]);
    expect(survivors()).toEqual([trip.id]);
  });
});

describe('the daily review', () => {
  const review = vi.fn<ManagerModel['review']>();

  function reviewer(): MemoryReview {
    const model: Pick<ManagerModel, 'review'> = { review };
    const embedder = {
      model: 'fake-embedder',
      embed: (texts: readonly string[]): Promise<Float32Array[]> =>
        Promise.resolve(texts.map(() => Float32Array.from([1, 0]))),
    };
    return new MemoryReview({
      store: opened.store,
      model,
      writer: new MemoryWriter(opened.store.aiMemories, opened.store.aiChats, embedder, null),
      principals: new Principals(opened.store, () => profileId),
      clock: fakeClock,
      zone: (): string => 'UTC',
    });
  }

  function answer(
    ratings: { id: string; significance: number }[],
    splits: MemorySplit[] = [],
  ): Awaited<ReturnType<ManagerModel['review']>> {
    return { ratings, splits };
  }

  beforeEach(() => {
    review.mockReset().mockResolvedValue(answer([]));
  });

  it('skips disabled notes and discards a review when memory is disabled during the request', async () => {
    const saved = seed(50);
    later(1);
    opened.store.aiMemories.changeSettings(profileId, { enabled: false });
    await reviewer().run();
    expect(review).not.toHaveBeenCalled();

    opened.store.aiMemories.changeSettings(profileId, { enabled: true });
    review.mockImplementationOnce(() => {
      opened.store.aiMemories.changeSettings(profileId, { enabled: false });
      return Promise.resolve(answer([{ id: saved.id, significance: 85 }]));
    });
    await reviewer().run();
    expect(review).toHaveBeenCalledTimes(1);
    expect(opened.store.aiMemories.all()[0]?.importance).toBe(50);
    expect(opened.store.settingsKv.read(REVIEW_KEY)).toBeNull();
  });

  it('re-rates without touching the age and gives the model the spread', async () => {
    const high = seed(90, 'fact', 'high one');
    const low = seed(30, 'fact', 'low one');
    review.mockResolvedValue(
      answer([
        { id: high.id, significance: 70 },
        { id: low.id, significance: 30 },
      ]),
    );
    later(1);
    await reviewer().run();
    expect(review.mock.calls[0]?.[1]).toEqual({ total: 2, high: 1 });
    const stored = opened.store.aiMemories.all();
    expect(stored.find((memory) => memory.id === high.id)?.importance).toBe(70);
    expect(stored.find((memory) => memory.id === high.id)?.updated_at).toBe(high.updated_at);
  });

  it('runs at most once a day per owner', async () => {
    seed(50);
    later(1);
    await reviewer().run();
    await reviewer().run();
    expect(review).toHaveBeenCalledTimes(1);
    later(2);
    await reviewer().run();
    expect(review).toHaveBeenCalledTimes(2);
    expect(opened.store.settingsKv.read(REVIEW_KEY)).toEqual({
      days: { [profileId]: '2026-01-03' },
    });
  });

  it('tries again later when the model fails and does not record the day', async () => {
    seed(50);
    review.mockRejectedValueOnce(new Error('down'));
    later(1);
    await reviewer().run();
    expect(opened.store.settingsKv.read(REVIEW_KEY)).toBeNull();
    await reviewer().run();
    expect(review).toHaveBeenCalledTimes(2);
  });

  it('splits a compound memory into single facts rated on their own and never merges', async () => {
    const compound = seed(60, 'preference', 'Dan loves gaming and plays piano.');
    const trip = seed(50, 'episode', 'Dan went to Chiang Mai; Dan rode an elephant there.');
    const single = seed(50, 'fact', 'Dan has a cat named Pixel.');
    opened.store.aiMemories.change(trip.id, profileId, { happened_on: '2025-12-20' });
    opened.store.aiMemories.recalled([compound.id], '2026-01-01T00:00:00.000Z');
    review.mockResolvedValue(
      answer(
        [
          { id: compound.id, significance: 10 },
          { id: single.id, significance: 55 },
        ],
        [
          {
            id: compound.id,
            parts: [
              {
                text: 'Dan loves gaming.',
                kind: 'preference',
                significance: 60,
                happened_on: null,
                valid_until: null,
              },
              {
                text: 'Dan plays piano.',
                kind: 'fact',
                significance: 45,
                happened_on: null,
                valid_until: null,
              },
            ],
          },
          {
            id: trip.id,
            parts: [
              {
                text: 'Dan went to Chiang Mai.',
                kind: 'episode',
                significance: 50,
                happened_on: '2025-12-20',
                valid_until: null,
              },
              {
                text: 'Dan rode an elephant in Chiang Mai.',
                kind: 'episode',
                significance: 65,
                happened_on: '2025-12-20',
                valid_until: null,
              },
            ],
          },
        ],
      ),
    );
    later(1);
    await reviewer().run();
    const all = opened.store.aiMemories.all();
    expect(all.map((memory) => memory.id)).not.toContain(compound.id);
    expect(all.map((memory) => memory.id)).not.toContain(trip.id);
    expect(all.find((memory) => memory.id === single.id)?.importance).toBe(55);
    const byText = new Map(all.map((memory) => [memory.text, memory]));
    expect(byText.get('Dan loves gaming.')).toMatchObject({
      kind: 'preference',
      importance: 60,
      scope: 'person',
      profile_id: profileId,
      recall_count: 1,
      created_at: compound.created_at,
    });
    expect(byText.get('Dan plays piano.')).toMatchObject({ kind: 'fact', importance: 45 });
    expect(byText.get('Dan rode an elephant in Chiang Mai.')).toMatchObject({
      kind: 'episode',
      importance: 65,
      happened_on: '2025-12-20',
    });
    expect(all).toHaveLength(5);
  });

  it('ignores a split of a memory outside the reviewed batch', async () => {
    const kept = seed(50, 'fact', 'Dan has a cat named Pixel.');
    review.mockResolvedValue(
      answer(
        [],
        [
          {
            id: crypto.randomUUID(),
            parts: [
              { text: 'a', kind: 'fact', significance: 50, happened_on: null, valid_until: null },
              { text: 'b', kind: 'fact', significance: 50, happened_on: null, valid_until: null },
            ],
          },
        ],
      ),
    );
    later(1);
    await reviewer().run();
    expect(survivors()).toEqual([kept.id]);
  });
});
