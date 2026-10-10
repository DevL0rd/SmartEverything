import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExchangeRateService, nextDailySlot } from '../../src/exchange-rates/exchange-rate-service';
import { FRANKFURTER_URL, fetchRates } from '../../src/exchange-rates/frankfurter';
import { reportOf } from '../../src/exchange-rates/report';
import { FakeClock } from '../support/fake-clock';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const RECORDED = readFileSync(join(import.meta.dirname, 'frankfurter-usd.json'), 'utf8');

interface Call {
  readonly url: string;
}

function answering(status: number, body: string, calls: Call[]): typeof fetch {
  return (input): Promise<Response> => {
    calls.push({ url: new Request(input).url });
    return Promise.resolve(new Response(body, { status }));
  };
}

function failing(calls: Call[]): typeof fetch {
  return (input): Promise<Response> => {
    calls.push({ url: new Request(input).url });
    return Promise.reject(new TypeError('network down'));
  };
}

describe('Frankfurter fetcher', () => {
  it('reads the recorded answer into rates keyed by currency, with the dollar at 1', async () => {
    const calls: Call[] = [];
    const fetched = await fetchRates({ fetch: answering(200, RECORDED, calls), version: 't' });
    expect(calls).toStrictEqual([{ url: FRANKFURTER_URL }]);
    expect(fetched.rateDate).toBe('2026-10-09');
    expect(fetched.rates['JPY']).toBe(158.25);
    expect(fetched.rates['EUR']).toBe(0.89238);
    expect(fetched.rates['USD']).toBe(1);
    expect(Object.keys(fetched.rates)).toHaveLength(30);
  });

  it('refuses an answer for another base currency', async () => {
    const body = JSON.stringify({ base: 'EUR', date: '2026-10-09', rates: { USD: 1.1 } });
    await expect(fetchRates({ fetch: answering(200, body, []), version: 't' })).rejects.toThrow(
      /Frankfurter sent a answer this app can’t read/,
    );
  });

  it('names the status when the service answers an error', async () => {
    await expect(fetchRates({ fetch: answering(503, '{}', []), version: 't' })).rejects.toThrow(
      'Frankfurter answered HTTP 503.',
    );
  });
});

describe('daily slot', () => {
  it('is 17:30 UTC the same day when that is still ahead', () => {
    expect(nextDailySlot(new Date('2026-10-10T09:00:00.000Z')).toISOString()).toBe(
      '2026-10-10T17:30:00.000Z',
    );
  });

  it('is 17:30 UTC the next day once it has passed', () => {
    expect(nextDailySlot(new Date('2026-10-10T17:30:00.000Z')).toISOString()).toBe(
      '2026-10-11T17:30:00.000Z',
    );
  });
});

describe('ExchangeRateService', () => {
  let held: TestStore;
  let clock: FakeClock;

  beforeEach(async () => {
    clock = new FakeClock('2026-10-10T09:00:00.000Z');
    held = await testStore(clock.now);
  });

  afterEach(async () => {
    await held.close();
  });

  function serviceWith(fetcher: typeof fetch): ExchangeRateService {
    return new ExchangeRateService({
      store: held.store,
      request: { fetch: fetcher, version: 't' },
      clock,
      log: testLogger('exchange-rates'),
    });
  }

  it('fetches on start when nothing is cached, stores the date and schedules the next slot', async () => {
    const calls: Call[] = [];
    const service = serviceWith(answering(200, RECORDED, calls));
    service.start();
    await service.settled();
    const row = held.store.exchangeRates.read();
    expect(calls).toHaveLength(1);
    expect(row.rate_date).toBe('2026-10-09');
    expect(row.rates?.['GBP']).toBe(0.75641);
    expect(row.error).toBeNull();
    expect(clock.pending()).toStrictEqual(['2026-10-10T17:30:00.000Z']);
  });

  it('does not fetch on start while the cached rates are under 24 hours old', async () => {
    const calls: Call[] = [];
    const first = serviceWith(answering(200, RECORDED, calls));
    first.start();
    await first.settled();
    first.stop();
    clock.advanceTo('2026-10-10T12:00:00.000Z');
    const second = serviceWith(answering(200, RECORDED, calls));
    second.start();
    expect(calls).toHaveLength(1);
    expect(clock.pending()).toStrictEqual(['2026-10-10T17:30:00.000Z']);
  });

  it('fetches again on start when the cached rates are older than 24 hours', async () => {
    const calls: Call[] = [];
    const first = serviceWith(answering(200, RECORDED, calls));
    first.start();
    await first.settled();
    first.stop();
    clock.advanceTo('2026-10-11T09:00:01.000Z');
    const second = serviceWith(answering(200, RECORDED, calls));
    second.start();
    await second.settled();
    expect(calls).toHaveLength(2);
  });

  it('keeps the old rates, records the failure and logs it once when a fetch fails', async () => {
    const logs = captureLogs();
    const calls: Call[] = [];
    const good = serviceWith(answering(200, RECORDED, calls));
    good.start();
    await good.settled();
    good.stop();
    const bad = new ExchangeRateService({
      store: held.store,
      request: { fetch: failing(calls), version: 't' },
      clock,
      log: testLogger('exchange-rates'),
    });
    clock.advanceTo('2026-10-10T09:05:00.000Z');
    const row = await bad.refresh();
    expect(row.rates?.['JPY']).toBe(158.25);
    expect(row.error).toBe('Couldn’t reach Frankfurter (network down).');
    expect(row.failed_at).not.toBeNull();
    expect(logs.events().filter((event) => event === 'exchange_rates.fetch_failed')).toHaveLength(
      1,
    );
    bad.stop();
  });

  it('reports no rates as an error until a fetch succeeds', async () => {
    const service = serviceWith(failing([]));
    const row = await service.refresh();
    expect(() => reportOf(row, clock.now())).toThrow(
      'The exchange rates aren’t available: Couldn’t reach Frankfurter (network down).',
    );
    service.stop();
  });

  it('reports fetched rates with their date and the stale flag', async () => {
    const service = serviceWith(answering(200, RECORDED, []));
    const row = await service.refresh();
    const fresh = reportOf(row, clock.now());
    expect(fresh).toMatchObject({ base: 'USD', rateDate: '2026-10-09', stale: false, error: null });
    const old = reportOf(row, new Date('2026-10-14T09:00:00.000Z'));
    expect(old.stale).toBe(true);
    service.stop();
  });
});
