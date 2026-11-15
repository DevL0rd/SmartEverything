import { describe, expect, it, vi } from 'vitest';
import type { MonthFeed } from './library-model';

vi.mock('../data', () => ({ usePhotoBuckets: vi.fn(), usePhotoMonth: vi.fn() }));
vi.mock('./phone-merge', () => ({ useLocalMerge: vi.fn() }));

const { monthsReady } = await import('./use-library-feed');

function feed(more: boolean, loading = false): MonthFeed {
  return { tiles: [], more, loading, failed: false };
}

describe('month focus', () => {
  const shown = ['2026-11', '2026-10', '2026-09'];

  it('waits until every month above the target is fully loaded', () => {
    const feeds = new Map([
      ['2026-11', feed(true)],
      ['2026-10', feed(false)],
      ['2026-09', feed(true)],
    ]);
    expect(monthsReady(shown, 2, feeds)).toBe(false);
    feeds.set('2026-11', feed(false));
    expect(monthsReady(shown, 2, feeds)).toBe(true);
  });

  it('waits for the target month itself to load its first page', () => {
    const feeds = new Map([
      ['2026-11', feed(false)],
      ['2026-10', feed(false)],
    ]);
    expect(monthsReady(shown, 2, feeds)).toBe(false);
    feeds.set('2026-09', feed(true, true));
    expect(monthsReady(shown, 2, feeds)).toBe(false);
  });
});
