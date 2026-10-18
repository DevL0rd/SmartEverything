import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OpenRouterClient } from '../../src/openrouter/client';
import { OpenRouterImageCatalog } from '../../src/openrouter/image-catalog';
import { testStore, type TestStore } from '../support/store';
import { endpointsBody, fakeOpenRouter, imageRig, modelsBody, png, urlOf } from './image-fixture';

let test: TestStore;
beforeEach(async () => {
  test = await testStore();
});
afterEach(async () => {
  await test.close();
});

async function buffered(): Promise<Response> {
  const body = JSON.stringify({ data: [{ b64_json: (await png()).toString('base64') }] });
  return new Response(body);
}

describe('image endpoint catalogue', () => {
  it('starts after a restart without listing the endpoints again', async () => {
    const before = imageRig(test, fakeOpenRouter(['vendor/m1'], buffered));
    await before.catalog.list(true);
    const transport = fakeOpenRouter(['vendor/m1'], buffered);
    const after = imageRig(test, transport);
    const receipt = await after.settle((await after.start({})).id);
    expect(receipt.state).toBe('completed');
    expect(transport.requests.filter((request) => request.endsWith('/images/models'))).toEqual([]);
  });

  it('refreshes once when the selected endpoint is not known yet', async () => {
    const transport = fakeOpenRouter(['vendor/m1'], buffered);
    const rig = imageRig(test, transport);
    const receipt = await rig.settle((await rig.start({})).id);
    expect(receipt.state).toBe('completed');
    expect(transport.requests.filter((request) => request.endsWith('/images/models'))).toHaveLength(
      1,
    );
  });

  it('refuses an endpoint the provider does not list, after one refresh', async () => {
    const transport = fakeOpenRouter(['vendor/other'], buffered);
    const rig = imageRig(test, transport);
    await expect(rig.start({})).rejects.toMatchObject({
      message: 'Select a currently available image endpoint.',
    });
    expect(transport.requests.filter((request) => request.endsWith('/images/models'))).toHaveLength(
      1,
    );
  });

  it('keeps starting when the listed price changes between listing and starting', async () => {
    let pricing: readonly unknown[] = [];
    const transport: typeof fetch = (input) => {
      const url = urlOf(input);
      if (url.pathname === '/api/v1/images/models')
        return Promise.resolve(new Response(modelsBody(['vendor/m1'])));
      if (url.pathname.endsWith('/endpoints'))
        return Promise.resolve(new Response(endpointsBody(pricing)));
      return buffered();
    };
    const rig = imageRig(test, { fetch: transport, requests: [] });
    await rig.catalog.list(true);
    pricing = [{ billable: 'image', unit: 'each', cost_usd: 0.5 }];
    const receipt = await rig.settle((await rig.start({})).id);
    expect(receipt.state).toBe('completed');
  });

  it('reads a fifty model catalogue in parallel and skips a model whose endpoints are unreadable', async () => {
    const ids = Array.from({ length: 50 }, (_, index) => `Vendor-${String(index)}/Model:free`);
    let inFlight = 0;
    let peak = 0;
    const transport: typeof fetch = async (input): Promise<Response> => {
      const url = urlOf(input);
      if (url.pathname === '/api/v1/images/models') return new Response(modelsBody(ids));
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return url.pathname.includes('Vendor-7/')
        ? new Response('{"endpoints":"none"}')
        : new Response(endpointsBody());
    };
    const client = new OpenRouterClient({ fetch: transport, key: (): null => null });
    const now = (): Date => new Date('2026-10-08T10:00:00.000Z');
    const catalog = new OpenRouterImageCatalog({ client, store: test.store.aiModels, now });
    expect(await catalog.list(true)).toHaveLength(49);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(6);
    const restarted = new OpenRouterImageCatalog({ client, store: test.store.aiModels, now });
    expect(await restarted.list(false)).toHaveLength(49);
  });
});
