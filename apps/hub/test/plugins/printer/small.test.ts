import { describe, expect, it } from 'vitest';
import type { PrinterDay } from '@smarteverything/domain';
import { monthSpend, perPageCost } from '../../../src/plugins/builtin/printer/cost';
import { jobView } from '../../../src/plugins/builtin/printer/access';
import type { JobRecord } from '../../../src/plugins/builtin/printer/records';
import { RateGuard } from '../../../src/plugins/builtin/printer/rate-guard';
import { testLogger } from '../../support/logs';

function day(date: string, mono: number, color: number): PrinterDay {
  return {
    day: date,
    jobs: 1,
    canceled: 0,
    failed: 0,
    pages: mono + color,
    sheets: 1,
    mono,
    color,
    duplexPages: 0,
    activeSeconds: 0,
    onlineSeconds: 0,
    offlineSeconds: 0,
    restarts: 0,
    errors: 0,
    jams: 0,
    hours: Array.from({ length: 24 }, () => 0),
    counterPages: null,
    estimatedPages: null,
    gaps: [],
  };
}

const SUPPLIES = [
  { key: 'black', slot: 'black', consumed: true, kind: 'ink' },
  { key: 'cyan', slot: 'cyan', consumed: true, kind: 'ink' },
  { key: 'waste', slot: 'waste', consumed: false, kind: 'waste' },
  { key: 'drum', slot: 'other', consumed: true, kind: 'drum' },
] as const;

describe('cost per page', () => {
  it('adds every priced cartridge for colour and only black for mono', () => {
    const cost = perPageCost(SUPPLIES, {
      prices: {
        black: { price: 20, yieldPages: 400 },
        cyan: { price: 10, yieldPages: 200 },
        waste: { price: 5, yieldPages: 10 },
        drum: { price: 80, yieldPages: 100 },
      },
    });
    expect(cost.mono).toBeCloseTo(0.05);
    expect(cost.colour).toBeCloseTo(0.1);
  });

  it('falls back to the colour figure for mono when there is no black price and says nothing without prices', () => {
    const only = perPageCost(SUPPLIES, { prices: { cyan: { price: 10, yieldPages: 100 } } });
    expect(only.mono).toBeCloseTo(0.1);
    expect(perPageCost(SUPPLIES, { prices: {} })).toStrictEqual({ mono: null, colour: null });
  });

  it('adds up one month of pages at those prices', () => {
    const days = [day('2026-10-01', 10, 2), day('2026-10-02', 0, 4), day('2026-09-30', 100, 100)];
    expect(monthSpend(days, '2026-10', { mono: 0.05, colour: 0.1 })).toBe(1.1);
    expect(monthSpend(days, '2026-10', { mono: null, colour: 0.1 })).toBe(0.6);
    expect(monthSpend(days, '2026-10', { mono: null, colour: null })).toBeNull();
  });
});

describe('rate guard', () => {
  it('lets a burst through, refills over time and logs a storm once a minute', () => {
    let now = 0;
    const guard = new RateGuard(testLogger('printer'), () => now);
    const results = Array.from({ length: 4 }, () => guard.allow('pairing', 'a'));
    expect(results).toStrictEqual([true, false, false, false]);
    expect(guard.allow('pairing', 'b')).toBe(true);
    now += 30_000;
    expect(guard.allow('pairing', 'a')).toBe(true);
    now += 90_000;
    expect(guard.allow('pairing', 'a')).toBe(true);
  });
});

describe('the cause of a stuck job', () => {
  const record: JobRecord = {
    key: 'k',
    jobId: 4,
    epoch: 0,
    origin: 'hub',
    person: 'anna',
    name: 'Report',
    state: 'stopped',
    reasons: [],
    printerReasons: ['media-jam-error'],
    message: null,
    format: null,
    copies: null,
    colorMode: null,
    sides: null,
    pages: 3,
    sheets: null,
    color: null,
    mono: null,
    kOctets: null,
    createdAt: null,
    startedAt: null,
    completedAt: null,
    counted: false,
  };
  const caller = {
    profileId: 'anna',
    role: 'member',
    chatId: null,
    via: 'app',
    clientId: null,
  } as const;

  it('names the printer problem behind a stopped job', () => {
    expect(jobView(record, caller).cause).toBe('Paper jam');
  });

  it('has no cause when the printer gave no reason', () => {
    expect(jobView({ ...record, printerReasons: [] }, caller).cause).toBeNull();
  });
});
