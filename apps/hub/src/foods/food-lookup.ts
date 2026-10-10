import { ApiError, FOOD_CANDIDATE, type FoodCandidate } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { FoodsRepository } from '../store/repositories/foods';
import { OFF_FIELDS, OFF_PRODUCT, candidateOf } from './open-food-facts';

const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v3/product/';
const SEARCH_URL = 'https://search.openfoodfacts.org/search';
const TIMEOUT_MS = 8000;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const SEARCH_SIZE = 25;

const FRESH = { product: 30 * DAY_MS, missing: DAY_MS, search: DAY_MS } as const;

const PRODUCT_ANSWER = z.object({ status: z.string(), product: OFF_PRODUCT.optional() });
const SEARCH_ANSWER = z.object({ hits: z.array(z.unknown()) });
const CACHED_SEARCH = z.array(FOOD_CANDIDATE);

class MinuteBudget {
  private readonly used: number[] = [];

  constructor(
    private readonly limit: number,
    private readonly what: string,
  ) {}

  take(now: number): void {
    while (this.used.length > 0 && now - (this.used[0] ?? now) >= MINUTE_MS) {
      this.used.shift();
    }
    if (this.used.length >= this.limit) {
      const wait = Math.ceil((MINUTE_MS - (now - (this.used[0] ?? now))) / 1000);
      throw new ApiError(
        'rate_limited',
        `Open Food Facts allows ${String(this.limit)} ${this.what} a minute. Try again in ${String(wait)} s.`,
      );
    }
    this.used.push(now);
  }
}

export interface FoodLookupOptions {
  readonly foods: FoodsRepository;
  readonly fetch: typeof fetch;
  readonly now: () => Date;
  readonly version: string;
  readonly log: Logger;
}

export class FoodLookup {
  private readonly products = new MinuteBudget(15, 'product lookups');
  private readonly searches = new MinuteBudget(10, 'searches');

  constructor(private readonly options: FoodLookupOptions) {}

  async byBarcode(barcode: string): Promise<FoodCandidate> {
    const key = `product:${barcode}`;
    const cached = this.fresh(key, (answer) => (answer === null ? FRESH.missing : FRESH.product));
    if (cached !== undefined) {
      return this.productFrom(barcode, cached === null ? null : FOOD_CANDIDATE.parse(cached));
    }
    this.products.take(this.options.now().getTime());
    const answer = PRODUCT_ANSWER.parse(
      await this.get(`${PRODUCT_URL}${barcode}?fields=${OFF_FIELDS}`, [200, 404]),
    );
    const candidate = answer.product === undefined ? null : candidateOf(answer.product);
    this.options.foods.remember(key, candidate);
    this.options.log.info('foods.looked_up', { found: candidate !== null });
    return this.productFrom(barcode, candidate);
  }

  async search(query: string): Promise<FoodCandidate[]> {
    const text = query.trim().toLowerCase();
    const key = `search:${text}`;
    const cached = this.fresh(key, () => FRESH.search);
    if (cached !== undefined) {
      return CACHED_SEARCH.parse(cached);
    }
    this.searches.take(this.options.now().getTime());
    const url = `${SEARCH_URL}?q=${encodeURIComponent(text)}&page_size=${String(SEARCH_SIZE)}&fields=${OFF_FIELDS}`;
    const answer = SEARCH_ANSWER.parse(await this.get(url, [200]));
    const candidates = answer.hits.flatMap((hit) => {
      const product = OFF_PRODUCT.safeParse(hit);
      const candidate = product.success ? candidateOf(product.data) : null;
      return candidate === null ? [] : [candidate];
    });
    this.options.foods.remember(key, candidates);
    return candidates;
  }

  private productFrom(barcode: string, candidate: FoodCandidate | null): FoodCandidate {
    if (candidate === null) {
      throw new ApiError('not_found', `Open Food Facts has no product with barcode ${barcode}.`);
    }
    return candidate;
  }

  private fresh(key: string, lifetime: (answer: unknown) => number): unknown {
    const cached = this.options.foods.cached(key);
    if (cached === undefined) {
      return undefined;
    }
    const age = this.options.now().getTime() - Date.parse(cached.fetchedAt);
    return age < lifetime(cached.answer) ? cached.answer : undefined;
  }

  private async get(url: string, accepted: readonly number[]): Promise<unknown> {
    let response: Response;
    try {
      response = await this.options.fetch(url, {
        headers: {
          'User-Agent': `SmartEverything/${this.options.version} (self-hosted smart home hub)`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (cause) {
      throw new ApiError(
        'upstream_failed',
        `Open Food Facts could not be reached: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
    if (response.status === 429) {
      throw new ApiError('rate_limited', 'Open Food Facts is busy. Try again in a minute.');
    }
    if (!accepted.includes(response.status)) {
      throw new ApiError('upstream_failed', `Open Food Facts answered ${String(response.status)}.`);
    }
    return z.unknown().parse(await response.json());
  }
}
