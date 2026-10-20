import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WeatherService } from '../../src/weather/weather-service';
import { skyFetch } from '../automations/support/weather';
import { SimulatedClock as TestClock } from '../../src/clock/simulated';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

describe('WeatherService', () => {
  let held: TestStore;
  let clock: TestClock;
  let requests: number;

  beforeEach(async () => {
    clock = new TestClock('2026-10-10T09:00:00.000Z');
    held = await testStore(clock.now);
    requests = 0;
  });

  afterEach(async () => {
    await held.close();
  });

  function serviceWith(failForecast = false): WeatherService {
    const sky = { temperature: 12, humidity: 60, code: 3 };
    return new WeatherService({
      store: held.store,
      request: {
        fetch: (input, init): Promise<Response> => {
          requests += 1;
          return failForecast
            ? Promise.resolve(new Response('down', { status: 503 }))
            : skyFetch(sky, clock, () => Promise.reject(new Error('unexpected request')))(
                input,
                init,
              );
        },
        version: 't',
      },
      clock,
      log: testLogger('weather'),
    });
  }

  function locate(): void {
    held.store.settings.updateHome({ latitude: 52.52, longitude: 13.405 });
  }

  it('does nothing until the home has a location', () => {
    const service = serviceWith();
    service.start();
    expect(requests).toBe(0);
    expect(clock.pending()).toStrictEqual([]);
    service.stop();
  });

  it('retries after 15 s, then 5 min, while the air quality is unavailable', async () => {
    locate();
    const service = serviceWith();
    service.start();
    await service.settled();
    expect(held.store.weather.read().air_error).not.toBeNull();
    expect(clock.pending()).toStrictEqual(['2026-10-10T09:00:15.000Z']);
    clock.advanceTo('2026-10-10T09:00:15.000Z');
    await service.settled();
    expect(clock.pending()).toStrictEqual(['2026-10-10T09:05:15.000Z']);
    service.stop();
  });

  it('keeps retrying with growing delays when the forecast itself fails', async () => {
    locate();
    const service = serviceWith(true);
    service.start();
    await service.settled();
    expect(held.store.weather.read().error).not.toBeNull();
    expect(clock.pending()).toStrictEqual(['2026-10-10T09:00:15.000Z']);
    clock.advanceTo('2026-10-10T09:00:15.000Z');
    await service.settled();
    expect(clock.pending()).toStrictEqual(['2026-10-10T09:05:15.000Z']);
    service.stop();
  });

  it('runs one fetch, forecast and air together, for refreshes made together', async () => {
    locate();
    const service = serviceWith();
    service.start();
    await service.settled();
    const before = requests;
    await Promise.all([service.refresh(), service.refresh()]);
    expect(requests - before).toBe(2);
    service.stop();
  });
});
