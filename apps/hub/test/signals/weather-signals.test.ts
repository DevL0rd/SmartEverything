import {
  signalMatchesMatcher,
  type RowChange,
  type SignalInput,
  type WeatherForecast,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compileTriggers, signalFire } from '../../src/automations/triggers-v3/armers';
import { SignalBus } from '../../src/signals/bus';
import { feedSignals } from '../../src/signals/sources/feed';
import { feedContextOf } from '../../src/signals/sources/feed-context';
import { node } from '../automations-v3/triggers/support';
import { forecastOf } from '../automations-v3/world/forecast';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let heard: SignalInput[];
let tick = 0;

beforeEach(async () => {
  opened = await testStore(() => new Date(Date.parse('2026-10-19T10:00:00.000Z') + (tick += 1000)));
  heard = [];
  const bus = new SignalBus({ log: testLogger('signals') });
  bus.subscribe((signal) => {
    if (signal.source === 'weather') heard.push(signal);
  });
  opened.store.feed.subscribe((change: RowChange) => {
    const context = feedContextOf(
      new Date('2026-10-19T10:00:00.000Z'),
      () => 'UTC',
      () => null,
    );
    feedSignals(change, context).forEach(bus.emit);
  });
});

afterEach(async () => {
  await opened.close();
});

function fetched(forecast: WeatherForecast): void {
  opened.store.weather.fetched({
    forecast,
    airError: null,
    nextFetchAt: '2026-10-19T10:16:00.000Z',
  });
}

function dry(): WeatherForecast {
  const rainy = forecastOf();
  return { ...rainy, now: { ...rainy.now, precipitationMm: 0, code: 3 } };
}

function kindsHeard(): readonly string[] {
  return heard.map((signal) => `${signal.kind}:${signal.field ?? ''}`);
}

describe('weather signals from the feed', () => {
  it('sends only the forecast pulse for the first forecast', () => {
    fetched(dry());
    expect(kindsHeard()).toEqual(['forecast:']);
  });

  it('sends rain started the moment a fetch brings rain, and rain stopped when it ends', () => {
    fetched(dry());
    heard = [];
    fetched(forecastOf());
    expect(kindsHeard()).toEqual([
      'forecast:',
      'rain_started:',
      'condition:',
      'band:precipitation',
      'changed:precipitation',
    ]);
    expect(heard[1]).toMatchObject({ value: true, data: { kind: 'rain' } });
    heard = [];
    fetched(dry());
    expect(kindsHeard()).toContain('rain_stopped:');
  });

  it('sends no change signals when a new fetch brings the same weather', () => {
    fetched(dry());
    heard = [];
    fetched(dry());
    expect(kindsHeard()).toEqual(['forecast:']);
  });

  it('starts a rain started and a rain stopped trigger from the fetch that brings the change', () => {
    const starts = node('trigger.weather', { event: 'rain_started' });
    const stops = node('trigger.weather', { event: 'rain_stopped' });
    const compiled = compileTriggers('rainy', [starts, stops]);
    const fired = (): readonly string[] =>
      heard.flatMap((signal) =>
        compiled.signals
          .filter((entry) => signalMatchesMatcher(entry.matcher, signal))
          .map((entry) => entry.triggerId),
      );
    fetched(dry());
    heard = [];
    fetched(forecastOf());
    expect(fired()).toEqual([starts.id]);
    const rain = heard.find((signal) => signal.kind === 'rain_started');
    if (rain === undefined) throw new Error('no rain started signal');
    expect(signalFire(compiled, rain, starts.id)?.payload).toMatchObject({
      event: 'rain_started',
      value: true,
      data: { kind: 'rain' },
    });
    heard = [];
    fetched(dry());
    expect(fired()).toEqual([stops.id]);
  });
});
