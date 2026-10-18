import { ApiError } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FoodLookup } from '../../src/foods/food-lookup';
import { FakeClock } from '../support/fake-clock';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const CODE = '5000000000001';
const DAY = 86_400_000;

let held: TestStore;
let clock: FakeClock;
let requests: Request[];
let lookup: FoodLookup;
let answer: () => Promise<Response>;

function product(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { code: CODE, product_name: 'Oats', nutriments: { 'energy-kcal_100g': 370 }, ...extra };
}

function afterDays(days: number): void {
  clock.advanceTo(new Date(clock.now().getTime() + days * DAY).toISOString());
}

async function failure(task: Promise<unknown>): Promise<ApiError> {
  const cause = await task.then(
    () => null,
    (error: unknown) => error,
  );
  if (!(cause instanceof ApiError)) {
    throw new Error('the lookup did not fail with an ApiError');
  }
  return cause;
}

beforeEach(async () => {
  clock = new FakeClock('2026-10-10T09:00:00.000Z');
  held = await testStore(clock.now);
  requests = [];
  answer = (): Promise<Response> =>
    Promise.resolve(Response.json({ status: 'success', product: product() }));
  lookup = new FoodLookup({
    foods: held.store.foods,
    fetch: (input, init): Promise<Response> => {
      requests.push(new Request(input, init));
      return answer();
    },
    now: clock.now,
    version: '9.9',
    log: testLogger('foods'),
  });
});

afterEach(async () => {
  await held.close();
});

describe('looking up a barcode', () => {
  it('asks Open Food Facts for the product with an identifying user agent', async () => {
    const food = await lookup.byBarcode(CODE);
    expect(food).toMatchObject({ name: 'Oats', barcode: CODE, kcal: 370 });
    expect(requests[0]?.url).toContain(`/api/v3/product/${CODE}?fields=code,product_name`);
    expect(requests[0]?.headers.get('user-agent')).toBe(
      'SmartEverything/9.9 (self-hosted smart home hub)',
    );
  });

  it('serves a found product from the cache for 30 days, then asks again', async () => {
    await lookup.byBarcode(CODE);
    afterDays(29);
    await lookup.byBarcode(CODE);
    expect(requests).toHaveLength(1);
    afterDays(2);
    await lookup.byBarcode(CODE);
    expect(requests).toHaveLength(2);
  });

  it('says not found for an unknown product and remembers that for a day', async () => {
    answer = (): Promise<Response> =>
      Promise.resolve(Response.json({ status: 'failure' }, { status: 404 }));
    const first = await failure(lookup.byBarcode(CODE));
    expect(first.code).toBe('not_found');
    expect(first.message).toContain(CODE);
    await failure(lookup.byBarcode(CODE));
    expect(requests).toHaveLength(1);
    afterDays(1.5);
    await failure(lookup.byBarcode(CODE));
    expect(requests).toHaveLength(2);
  });

  it('says not found for a product that cannot be turned into a food', async () => {
    answer = (): Promise<Response> =>
      Promise.resolve(Response.json({ status: 'success', product: { code: CODE } }));
    expect((await failure(lookup.byBarcode(CODE))).code).toBe('not_found');
  });

  it('reports other answers and an unreachable service without caching them', async () => {
    answer = (): Promise<Response> => Promise.resolve(new Response('{}', { status: 500 }));
    const broken = await failure(lookup.byBarcode(CODE));
    expect(broken).toMatchObject({ code: 'upstream_failed' });
    expect(broken.message).toContain('500');
    answer = (): Promise<Response> => Promise.reject(new Error('offline'));
    const offline = await failure(lookup.byBarcode(CODE));
    expect(offline.message).toContain('could not be reached: offline');
    answer = (): Promise<Response> =>
      Promise.resolve(Response.json({ status: 'success', product: product() }));
    await expect(lookup.byBarcode(CODE)).resolves.toMatchObject({ name: 'Oats' });
  });
});

describe('searching', () => {
  const hits = {
    hits: [
      product({ code: '5000000000001', product_name: 'Oats' }),
      { code: 'bad', product_name: 'No barcode' },
      { nonsense: true },
      product({ code: '5000000000002', product_name: 'Muesli' }),
    ],
  };

  it('returns the hits that are usable foods, in order, and asks for 25', async () => {
    answer = (): Promise<Response> => Promise.resolve(Response.json(hits));
    const foods = await lookup.search('  Oat Milk ');
    expect(foods.map((food) => food.name)).toEqual(['Oats', 'Muesli']);
    expect(requests[0]?.url).toContain('q=oat%20milk&page_size=25');
  });

  it('caches by lowercase query for a day', async () => {
    answer = (): Promise<Response> => Promise.resolve(Response.json(hits));
    await lookup.search('Oats');
    expect(await lookup.search(' oats ')).toHaveLength(2);
    expect(requests).toHaveLength(1);
    afterDays(1.1);
    await lookup.search('oats');
    expect(requests).toHaveLength(2);
  });

  it('says the provider is busy when it answers 429', async () => {
    answer = (): Promise<Response> => Promise.resolve(new Response('{}', { status: 429 }));
    expect(await failure(lookup.search('oats'))).toMatchObject({ code: 'rate_limited' });
    expect(await failure(lookup.byBarcode(CODE))).toMatchObject({ code: 'rate_limited' });
  });
});
