import { describe, expect, it } from 'vitest';
import { recentStale, recentStateOf } from './recent-states';

const LIVE = { hasData: false, isPending: false, isError: false, live: true } as const;

describe('recentStateOf', () => {
  it('waits for the first page while the hub is live', () => {
    expect(recentStateOf({ ...LIVE, isPending: true })).toBe('loading');
  });

  it('says the hub is offline instead of loading forever when nothing was loaded', () => {
    expect(recentStateOf({ ...LIVE, isPending: true, live: false })).toBe('offline');
    expect(recentStateOf({ ...LIVE, isError: true, live: false })).toBe('offline');
  });

  it('shows the error while the hub is live and the page failed', () => {
    expect(recentStateOf({ ...LIVE, isError: true })).toBe('error');
  });

  it('shows the empty state when a loaded page has nothing', () => {
    expect(recentStateOf({ ...LIVE, hasData: true })).toBe('empty');
    expect(recentStateOf({ ...LIVE, hasData: true, live: false })).toBe('empty');
  });
});

describe('recentStale', () => {
  it('marks loaded files as stale only while the hub is not live', () => {
    expect(recentStale(true, false)).toBe(true);
    expect(recentStale(true, true)).toBe(false);
    expect(recentStale(false, false)).toBe(false);
  });
});
