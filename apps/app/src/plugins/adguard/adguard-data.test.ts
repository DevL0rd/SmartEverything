import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const readPluginTool = vi.fn();
vi.mock(import('../use-plugin-tool'), async (importOriginal) => ({
  ...(await importOriginal()),
  readPluginTool,
  usePluginTool: vi.fn(),
}));

const { LOADED_PAGES, hasOlderLookups, queryLogOptions } = await import('./adguard-data');

const cursor = (served: number): string =>
  new Date(Date.UTC(2026, 9, 16, 10, 0, 0) - served * 60_000).toISOString();

const entry = (n: number): Record<string, unknown> => ({
  time: cursor(n),
  domain: `site-${String(n)}.test`,
  type: 'A',
  client: '192.168.1.5',
  clientName: null,
  outcome: 'allowed',
  reason: '',
  rule: null,
  elapsedMs: 3,
  upstream: null,
  cached: false,
});

beforeEach(() => {
  readPluginTool.mockReset();
  let served = 0;
  readPluginTool.mockImplementation(() => {
    const entries = Array.from({ length: 50 }, (_, index) => entry(served * 50 + index));
    served += 1;
    return Promise.resolve({ page: { entries, olderThan: cursor(served) } });
  });
});

describe('queryLogOptions', () => {
  it('offers older lookups until the cap of loaded pages is reached', async () => {
    const client = new QueryClient();
    const data = await client.infiniteQuery({ ...queryLogOptions('', 'all'), pages: LOADED_PAGES });
    const last = data.pages.at(-1);
    expect(readPluginTool).toHaveBeenCalledTimes(LOADED_PAGES);
    expect(data.pages[0]?.entries[0]?.domain).toBe('site-0.test');
    expect(last?.olderThan).not.toBeNull();
    expect(hasOlderLookups(last?.olderThan !== null, LOADED_PAGES - 1)).toBe(true);
    expect(hasOlderLookups(last?.olderThan !== null, LOADED_PAGES)).toBe(false);
    expect(hasOlderLookups(false, 1)).toBe(false);
  });

  it('asks for the next page with the cursor of the last one', async () => {
    const client = new QueryClient();
    await client.infiniteQuery({ ...queryLogOptions('ads', 'blocked'), pages: 2 });
    expect(readPluginTool.mock.calls[1]?.[2]).toEqual({
      search: 'ads',
      filter: 'blocked',
      olderThan: cursor(1),
      limit: 50,
    });
  });
});
