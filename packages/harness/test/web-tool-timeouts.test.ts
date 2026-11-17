import { afterEach, describe, expect, it } from 'vitest';
import type { Context } from '@deepseek-ai/cordis';
import { WEB_FETCH_TIMEOUT_MS, WEB_SEARCH_TIMEOUT_MS } from '../src/composition/web';
import { bootRuntime } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

async function context(): Promise<Context> {
  let captured: Context | undefined;
  fixture = await bootRuntime({
    mount: (ctx) => {
      captured = ctx;
    },
  });
  if (captured === undefined) throw new Error('The runtime never mounted the test route.');
  return captured;
}

describe('web tool time budgets', () => {
  it('gives the model-backed search a longer budget than a page fetch', async () => {
    const ctx = await context();

    expect(ctx.tools.get('web_search')?.timeoutMs).toBe(WEB_SEARCH_TIMEOUT_MS);
    expect(ctx.tools.get('web_fetch')?.timeoutMs).toBe(WEB_FETCH_TIMEOUT_MS);
    expect(WEB_SEARCH_TIMEOUT_MS).toBeGreaterThan(WEB_FETCH_TIMEOUT_MS);
  });
});
