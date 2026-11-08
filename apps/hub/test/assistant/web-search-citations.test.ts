import { describe, expect, it } from 'vitest';
import {
  groundedFetch,
  SearchCitations,
  withSearchCitations,
} from '../../src/assistant/web-search-citations';
import { OPENROUTER_WEB_SEARCH_TOOL } from '../../src/assistant/web-search';

function stream(): string {
  const cited = {
    choices: [
      {
        delta: {
          annotations: [
            {
              type: 'url_citation',
              url_citation: { url: 'https://example.com/a', title: 'Weather A' },
            },
            { type: 'file_citation' },
            { type: 'url_citation', url_citation: { url: 'https://example.com/b', title: null } },
          ],
        },
      },
    ],
  };
  return [{ choices: [{ delta: { content: 'Sunny.' } }] }, cited]
    .map((frame) => `data: ${JSON.stringify(frame)}\n\n`)
    .concat('data: not json\n\n', 'data: [DONE]\n\n')
    .join('');
}

function recorder(response: () => Response): {
  readonly fetch: typeof fetch;
  readonly bodies: unknown[];
} {
  const bodies: unknown[] = [];
  return {
    bodies,
    fetch: (_input, init): Promise<Response> => {
      bodies.push(typeof init?.body === 'string' ? JSON.parse(init.body) : undefined);
      return Promise.resolve(response());
    },
  };
}

const URL = 'https://openrouter.ai/api/v1/chat/completions';

describe('web search grounding', () => {
  it('adds the supplier web search tool to a search and collects the cited pages untouched', async () => {
    const supplier = recorder(() => new Response(stream()));
    const citations = new SearchCitations();

    const text = await withSearchCitations(citations, async () => {
      const response = await groundedFetch(supplier.fetch)(URL, {
        method: 'POST',
        body: JSON.stringify({ model: 'm', tools: [{ type: 'function' }] }),
      });
      return response.text();
    });

    expect(text).toBe(stream());
    expect(supplier.bodies).toEqual([
      { model: 'm', tools: [{ type: 'function' }, OPENROUTER_WEB_SEARCH_TOOL] },
    ]);
    expect(citations.sources()).toEqual([
      { url: 'https://example.com/a', title: 'Weather A' },
      { url: 'https://example.com/b', title: '' },
    ]);
  });

  it('leaves every other model request exactly as it was', async () => {
    const supplier = recorder(() => new Response(stream()));

    const response = await groundedFetch(supplier.fetch)(URL, {
      method: 'POST',
      body: JSON.stringify({ model: 'm' }),
    });

    expect(supplier.bodies).toEqual([{ model: 'm' }]);
    expect(await response.text()).toBe(stream());
  });

  it('passes a failed search response through without reading it', async () => {
    const supplier = recorder(() => new Response('busy', { status: 429 }));
    const citations = new SearchCitations();

    const response = await withSearchCitations(citations, () =>
      groundedFetch(supplier.fetch)(URL, { method: 'POST', body: '{}' }),
    );

    expect(response.status).toBe(429);
    expect(await response.text()).toBe('busy');
    expect(citations.sources()).toEqual([]);
  });

  it('refuses a search request that has no readable body', async () => {
    const supplier = recorder(() => new Response(stream()));

    await expect(
      withSearchCitations(new SearchCitations(), () => groundedFetch(supplier.fetch)(URL)),
    ).rejects.toMatchObject({ code: 'upstream_failed' });
    expect(supplier.bodies).toEqual([]);
  });
});
