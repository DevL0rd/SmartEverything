import type { SignalInput } from '@smarteverything/domain';
import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { SignalBus } from '../../src/signals/bus';
import { FakeClock } from '../support/fake-clock';
import { captureLogs, testLogger } from '../support/logs';

const START = '2026-10-18T10:00:00.000Z';
const LAMP = '11111111-1111-4111-8111-111111111111';
const REFILL_MS = 2000;
const BURST = 10;

let clock: FakeClock;
let bus: SignalBus;
let heard: SignalInput[];

function build(): void {
  clock = new FakeClock(START);
  bus = new SignalBus({ log: testLogger('signals'), now: clock.now, at: clock.at });
  heard = [];
  bus.subscribe((signal) => {
    heard.push(signal);
  });
}

beforeEach(() => {
  captureLogs();
  build();
});

function reading(value: number, field = 'brightness'): SignalInput {
  return {
    source: 'device',
    kind: 'state',
    subject: LAMP,
    field,
    value,
    previous: null,
    at: clock.now().toISOString(),
    profileId: null,
    data: {},
  };
}

function later(milliseconds: number): void {
  clock.advanceTo(new Date(clock.now().getTime() + milliseconds).toISOString());
}

function valuesOf(): unknown[] {
  return heard.filter((signal) => signal.source === 'device').map((signal) => signal.value);
}

function fillBurst(): void {
  for (let value = 1; value <= BURST; value += 1) bus.emit(reading(value));
}

describe('state signals over the rate cap', () => {
  it('announce the last value once a token is back, with the last announced one as previous', () => {
    fillBurst();
    bus.emit(reading(11));
    bus.emit(reading(12));
    bus.emit(reading(13));
    expect(valuesOf()).toHaveLength(BURST);
    later(REFILL_MS);
    expect(valuesOf()).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13]);
    expect(heard.at(-1)?.previous).toBe(10);
  });

  it('forget a held value when the state comes back to the announced one', () => {
    fillBurst();
    bus.emit(reading(11));
    bus.emit(reading(10));
    later(10 * REFILL_MS);
    expect(valuesOf()).toHaveLength(BURST);
    expect(clock.pending()).toStrictEqual([]);
  });

  it('forget a held value when a newer one is admitted before its timer runs', () => {
    let moment = Date.parse(START);
    bus = new SignalBus({
      log: testLogger('signals'),
      now: (): Date => new Date(moment),
      at: clock.at,
    });
    bus.subscribe((signal) => {
      heard.push(signal);
    });
    fillBurst();
    bus.emit(reading(11));
    moment += REFILL_MS;
    bus.emit(reading(12));
    expect(valuesOf().at(-1)).toBe(12);
    expect(clock.pending()).toStrictEqual([]);
    later(10 * REFILL_MS);
    expect(valuesOf().at(-1)).toBe(12);
  });

  it('announce a later real return to the old value instead of swallowing it', () => {
    fillBurst();
    bus.emit(reading(11));
    bus.emit(reading(12));
    later(REFILL_MS);
    later(REFILL_MS);
    bus.emit(reading(10));
    expect(valuesOf().at(-1)).toBe(10);
  });

  it('keep one timer per waiting key and one for each other key', () => {
    fillBurst();
    for (let value = 11; value <= 30; value += 1) bus.emit(reading(value));
    expect(clock.pending()).toHaveLength(1);
    for (let value = 1; value <= BURST; value += 1) bus.emit(reading(value, 'other'));
    bus.emit(reading(50, 'other'));
    expect(clock.pending()).toHaveLength(2);
  });

  it('are not announced after the bus is closed', () => {
    fillBurst();
    bus.emit(reading(11));
    bus.close();
    later(10 * REFILL_MS);
    expect(valuesOf()).toHaveLength(BURST);
    expect(clock.pending()).toStrictEqual([]);
  });

  it('end on the last value offered for any stream of readings', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 0, max: 3 }), fc.integer({ min: 0, max: 1500 })), {
          minLength: 1,
          maxLength: 80,
        }),
        (offers) => {
          build();
          for (const [value, gap] of offers) {
            later(gap);
            bus.emit(reading(value));
          }
          later(60 * REFILL_MS);
          const announced = valuesOf();
          expect(announced.at(-1)).toBe(offers.at(-1)?.[0]);
          announced.slice(1).forEach((value, index) => {
            expect(value).not.toBe(announced[index]);
          });
          expect(clock.pending()).toStrictEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('pulse signals over the rate cap', () => {
  it('are dropped and never held back', () => {
    for (let index = 0; index < 40; index += 1) {
      bus.emit({ ...reading(1), source: 'event', kind: 'motion', field: null, value: true });
    }
    expect(clock.pending()).toStrictEqual([]);
    later(10 * REFILL_MS);
    expect(heard.filter((signal) => signal.source === 'event')).toHaveLength(BURST);
  });
});
