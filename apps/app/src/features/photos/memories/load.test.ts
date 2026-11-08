import { describe, expect, it } from 'vitest';

describe('the Memories modules', () => {
  it('load with the real kit', async () => {
    const page = await import('./index');
    const board = await import('./memories-board');
    const cards = await import('./memory-cards');
    const trips = await import('./trip-cards');
    const hero = await import('./hero');
    const year = await import('./year-review');
    const mark = await import('./photo-mark');
    expect(typeof page.MemoriesScreen).toBe('function');
    expect(typeof page.MemoryPlayer).toBe('function');
    expect(typeof board.MemoriesBoard).toBe('function');
    expect(typeof trips.TripList).toBe('function');
    expect(typeof cards.WeekRow).toBe('function');
    expect(typeof hero.MemoryHero).toBe('function');
    expect(typeof year.YearReview).toBe('function');
    expect(typeof mark.PhotoMark).toBe('function');
  });
});
