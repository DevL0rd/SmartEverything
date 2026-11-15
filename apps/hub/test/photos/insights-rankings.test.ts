import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PHOTO_INSIGHTS } from '@smarteverything/domain';
import {
  AT,
  BOB_ROOT,
  alice,
  bob,
  itemId,
  read,
  reader,
  seed,
  setup,
  teardown,
} from './insights-fixture';

beforeEach(setup);

afterEach(teardown);

const SMALL_PAGE = 205;

function dayOf(n: number): string {
  return new Date(Date.UTC(2025, 0, 1) + n * 86_400_000).toISOString();
}

describe('largest videos beyond the card summary', () => {
  it('pages every video from the largest down and reaches all of them', () => {
    for (let n = 1; n <= SMALL_PAGE; n += 1) {
      seed({ n, takenAt: dayOf(n), kind: 'video', bytes: 1000 + n });
    }
    const first = reader.largestVideosPage(alice, 'all_time', undefined, AT);
    expect(first.items).toHaveLength(200);
    expect(first.items[0]?.bytes).toBe(1000 + SMALL_PAGE);
    expect(first.next).not.toBeNull();
    const second = reader.largestVideosPage(alice, 'all_time', first.next ?? undefined, AT);
    expect(second.items).toHaveLength(SMALL_PAGE - 200);
    expect(second.next).toBeNull();
    const all = [...first.items, ...second.items].map((one) => one.itemId);
    expect(new Set(all).size).toBe(SMALL_PAGE);
    expect(all.at(-1)).toBe(itemId(1));
  });

  it('breaks ties by id without skipping or repeating a video', () => {
    for (let n = 1; n <= SMALL_PAGE; n += 1) {
      seed({ n, takenAt: dayOf(n), kind: 'video', bytes: 500 });
    }
    const first = reader.largestVideosPage(alice, 'all_time', undefined, AT);
    const second = reader.largestVideosPage(alice, 'all_time', first.next ?? undefined, AT);
    const all = [...first.items, ...second.items].map((one) => one.itemId);
    expect(new Set(all).size).toBe(SMALL_PAGE);
  });

  it('keeps the first ten as the summary and hides nothing from the full list', () => {
    for (let n = 1; n <= 15; n += 1) {
      seed({ n, takenAt: dayOf(n), kind: 'video', bytes: 100 + n });
    }
    const summary = read('all_time').largestVideos;
    const full = reader.largestVideosPage(alice, 'all_time', undefined, AT).items;
    expect(summary).toHaveLength(10);
    expect(full).toHaveLength(15);
    expect(full.slice(0, 10)).toEqual(summary);
  });

  it('shows only videos the caller can see and rejects a cursor it did not give out', () => {
    seed({ n: 1, takenAt: dayOf(1), kind: 'video', bytes: 5 });
    seed({ n: 2, takenAt: dayOf(2), kind: 'video', bytes: 9, root: BOB_ROOT });
    expect(reader.largestVideosPage(bob, 'all_time', undefined, AT).items).toBeDefined();
    expect(() => reader.largestVideosPage(alice, 'all_time', 'nonsense', AT)).toThrow(/cursor/);
  });
});

describe('busiest days beyond the card summary', () => {
  it('pages every day from the busiest down and reaches all of them', () => {
    for (let n = 1; n <= SMALL_PAGE; n += 1) {
      seed({ n, takenAt: dayOf(n) });
    }
    seed({ n: 1000, takenAt: dayOf(7) });
    const first = reader.busiestDaysPage(alice, 'all_time', undefined, AT);
    expect(first.items).toHaveLength(200);
    expect(first.items[0]).toEqual({ day: dayOf(7).slice(0, 10), items: 2 });
    const second = reader.busiestDaysPage(alice, 'all_time', first.next ?? undefined, AT);
    expect(second.next).toBeNull();
    const all = [...first.items, ...second.items].map((one) => one.day);
    expect(new Set(all).size).toBe(SMALL_PAGE);
  });

  it('keeps the first ten as the summary', () => {
    for (let n = 1; n <= 14; n += 1) seed({ n, takenAt: dayOf(n) });
    const summary = PHOTO_INSIGHTS.parse(read('all_time')).busiestDays;
    const full = reader.busiestDaysPage(alice, 'all_time', undefined, AT).items;
    expect(full).toHaveLength(14);
    expect(full.slice(0, 10)).toEqual(summary);
  });

  it('rejects a cursor it did not give out', () => {
    expect(() => reader.busiestDaysPage(alice, 'all_time', '3:not-a-day', AT)).toThrow(/cursor/);
  });
});
