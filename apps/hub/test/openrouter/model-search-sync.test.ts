import { describe, expect, it } from 'vitest';
import { OpenRouterClient } from '../../src/openrouter/client';
import { EMPTY_MODEL_SEARCH_STATE } from '../../src/openrouter/model-search-state';
import { syncModelSearch } from '../../src/openrouter/model-search-sync';
import { testLogger } from '../support/logs';
import { urlOf } from './image-fixture';

function pagedClient(pages: readonly unknown[]): OpenRouterClient {
  return new OpenRouterClient({
    key: () => null,
    fetch: (input): Promise<Response> => {
      const second = urlOf(input).searchParams.get('page') === '2';
      return Promise.resolve(new Response(JSON.stringify(pages[second ? 1 : 0])));
    },
  });
}

describe('model order sync', () => {
  it('follows the next link and ranks every model of every page', async () => {
    const client = pagedClient([
      {
        data: [{ id: 'a/x' }, { id: 'b/y' }],
        total_count: 3,
        links: { next: 'https://openrouter.ai/api/v1/models?page=2' },
      },
      { data: [{ id: 'c/z' }], total_count: 3, links: { next: null } },
    ]);
    const state = await syncModelSearch(
      { client, log: testLogger(), at: '2026-10-08T10:00:00.000Z' },
      EMPTY_MODEL_SEARCH_STATE,
    );
    expect(state.intelligence.ranks).toEqual({ 'a/x': 0, 'b/y': 1, 'c/z': 2 });
    expect(state.intelligence.source).toMatchObject({ status: 'available', total: 3 });
  });

  it('accepts an order that lists fewer models than the reported total', async () => {
    const client = pagedClient([
      { data: [{ id: 'a/x' }, { id: 'b/y' }], total_count: 5, links: { next: null } },
    ]);
    const state = await syncModelSearch(
      { client, log: testLogger(), at: '2026-10-08T10:00:00.000Z' },
      EMPTY_MODEL_SEARCH_STATE,
    );
    expect(state.latency.ranks).toEqual({ 'a/x': 0, 'b/y': 1 });
    expect(state.latency.source.status).toBe('available');
  });
});
