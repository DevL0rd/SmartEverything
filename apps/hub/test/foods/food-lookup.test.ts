import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FoodLookup } from '../../src/foods/food-lookup';
import { FakeClock } from '../support/fake-clock';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const LOOKUPS = 60;

function productOf(code: string): Record<string, unknown> {
  return {
    code,
    product_name: `Oats ${code}`,
    nutriments: {
      'energy-kcal_100g': 370,
      proteins_100g: 13,
      carbohydrates_100g: 60,
      fat_100g: 7,
    },
  };
}

function product(code: string): string {
  return JSON.stringify({ status: 'success', product: productOf(code) });
}

function barcodeOf(index: number): string {
  return String(5_000_000_000_000 + index);
}

describe('FoodLookup', () => {
  let held: TestStore;
  let clock: FakeClock;
  let requests: string[];

  beforeEach(async () => {
    clock = new FakeClock('2026-10-10T09:00:00.000Z');
    held = await testStore(clock.now);
    requests = [];
  });

  afterEach(async () => {
    await held.close();
  });

  function lookupAnswering(status: number, body: (url: string) => string): FoodLookup {
    return new FoodLookup({
      foods: held.store.foods,
      fetch: (input): Promise<Response> => {
        const url = new Request(input).url;
        requests.push(url);
        return Promise.resolve(new Response(body(url), { status }));
      },
      now: clock.now,
      version: 't',
      log: testLogger('foods'),
    });
  }

  it('answers every barcode scanned in one minute, well past the old per-minute limits', async () => {
    const lookup = lookupAnswering(200, (url) => product(/product\/(\d+)/.exec(url)?.[1] ?? ''));
    const names = [];
    for (let index = 0; index < LOOKUPS; index += 1) {
      names.push((await lookup.byBarcode(barcodeOf(index))).name);
    }
    expect(names).toHaveLength(LOOKUPS);
    expect(names[LOOKUPS - 1]).toBe(`Oats ${barcodeOf(LOOKUPS - 1)}`);
    expect(requests).toHaveLength(LOOKUPS);
  });

  it('keeps answering after the minute has passed and serves repeats from the cache', async () => {
    const lookup = lookupAnswering(200, (url) => product(/product\/(\d+)/.exec(url)?.[1] ?? ''));
    for (let index = 0; index < LOOKUPS; index += 1) {
      await lookup.byBarcode(barcodeOf(index));
    }
    clock.advanceTo('2026-10-10T09:01:30.000Z');
    await lookup.byBarcode(barcodeOf(LOOKUPS));
    await lookup.byBarcode(barcodeOf(0));
    expect(requests).toHaveLength(LOOKUPS + 1);
  });

  it('searches as often as asked and caches each query', async () => {
    const lookup = lookupAnswering(200, () => JSON.stringify({ hits: [productOf(barcodeOf(1))] }));
    for (let index = 0; index < 25; index += 1) {
      expect(await lookup.search(`oats ${String(index)}`)).toHaveLength(1);
    }
    await lookup.search('oats 0');
    expect(requests).toHaveLength(25);
  });

  it('reports the provider answering busy instead of imposing its own limit', async () => {
    const lookup = lookupAnswering(429, () => '{}');
    await expect(lookup.byBarcode(barcodeOf(0))).rejects.toThrow('Open Food Facts is busy');
  });
});
