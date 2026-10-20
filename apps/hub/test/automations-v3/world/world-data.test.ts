import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AUTOMATION_VALUE_CONTENT,
  WEATHER_METRICS,
  weatherMetricValue,
} from '@smarteverything/domain';
import { weatherOutputName } from '../../../src/automations/world-v3/weather';
import { forecastOf } from './forecast';
import { persistentFromOwned } from '../../../src/automations/world-v3/variables';
import { NOW, SCOPE, furnish, type Home } from './support';

const RAIN = '3a000000-0000-4000-8000-0000000000b1';
const SUN = '3a000000-0000-4000-8000-0000000000b2';

let home: Home;

beforeEach(async () => {
  home = await furnish();
});

afterEach(async () => {
  await home.test.close();
});

function storeForecast(): void {
  home.test.store.weather.fetched({
    forecast: forecastOf(),
    airError: null,
    nextFetchAt: '2026-10-18T13:00:00.000Z',
  });
}

describe('weather.read', () => {
  it('reads every metric of the forecast and the kind of weather', () => {
    storeForecast();
    const { outputs } = home.read('weather.read');
    expect(outputs).toMatchObject({
      temperature: 21.5,
      feelsLike: 20,
      humidity: 55,
      windSpeed: 12,
      precipitation: 0.4,
      rainChance: 70,
      aqi: 42,
      pm25: 8.5,
      uvIndex: 3,
      kind: 'rain',
    });
  });

  it('gives the same numbers as the metric reader of the V2 conditions', () => {
    storeForecast();
    const { forecast } = home.test.store.weather.read();
    const { outputs } = home.read('weather.read');
    expect(forecast).not.toBeNull();
    for (const metric of WEATHER_METRICS) {
      const expected = forecast === null ? null : weatherMetricValue(forecast, metric);
      expect(outputs[weatherOutputName(metric)] ?? null).toBe(expected);
    }
  });

  it('gives nothing before a forecast has been fetched', () => {
    expect(home.read('weather.read').outputs).toEqual({});
  });
});

describe('presence', () => {
  beforeEach(() => {
    home.people.push(
      {
        id: 'ann',
        name: 'Ann',
        guest: false,
        home: true,
        place: 'home',
        since: '2026-10-18T08:00:00.000Z',
      },
      { id: 'bo', name: 'Bo', guest: false, home: false, place: 'work', since: null },
      { id: 'cy', name: 'Cy', guest: true, home: true, place: null, since: null },
    );
  });

  it('reads one person', () => {
    expect(home.read('presence.person', { person: { person: 'ann' } }).outputs).toEqual({
      isHome: true,
      place: 'home',
      since: '2026-10-18T08:00:00.000Z',
    });
    expect(home.read('presence.person', { person: { person: 'bo' } }).outputs).toEqual({
      isHome: false,
      place: 'work',
    });
  });

  it('lists who is home with and without guests', () => {
    expect(home.read('presence.who_home').outputs).toEqual({
      people: [{ person: 'ann' }],
      count: 1,
      anyone: true,
    });
    expect(home.read('presence.who_home', { includeGuests: true }).outputs).toMatchObject({
      count: 2,
    });
  });

  it('says nobody is home when nobody is', () => {
    home.people.length = 0;
    expect(home.read('presence.who_home').outputs).toEqual({ people: [], count: 0, anyone: false });
  });

  it('fails with NotFound for a person nobody knows', () => {
    expect(() => home.read('presence.person', { person: { person: 'zed' } })).toThrow(
      expect.objectContaining({ errorClass: 'NotFound' }),
    );
  });
});

describe('var.get', () => {
  const choice = (): string =>
    home.test.store.automationValues.create(
      AUTOMATION_VALUE_CONTENT.parse({
        kind: 'choice',
        name: 'Mode',
        value: RAIN,
        choices: [
          { id: RAIN, label: 'Rain mode' },
          { id: SUN, label: 'Sun mode' },
        ],
        overflow: 'clamp',
      }),
    ).id;

  it('reads a home Value with its revision', () => {
    const id = home.test.store.automationValues.create(
      AUTOMATION_VALUE_CONTENT.parse({
        kind: 'number',
        name: 'Level',
        value: 3,
        bounds: { overflow: 'clamp' },
      }),
    ).id;
    expect(home.read('var.get', { source: 'home', value: { value: id } }).outputs).toEqual({
      value: 3,
      revision: 1,
    });
  });

  it('gives the id of a choice Value, or its label on request', () => {
    const id = choice();
    expect(home.read('var.get', { source: 'home', value: { value: id } }).outputs['value']).toBe(
      RAIN,
    );
    expect(
      home.read('var.get', { source: 'home', value: { value: id }, asLabel: true }).outputs[
        'value'
      ],
    ).toBe('Rain mode');
  });

  it('reads an automation variable of the running automation', () => {
    home.persistent.set(`${SCOPE.automationId}:level`, { value: 7, revision: 4 });
    expect(home.read('var.get', { source: 'automation', name: 'level' }).outputs).toEqual({
      value: 7,
      revision: 4,
    });
    expect(() => home.read('var.get', { source: 'automation', name: 'other' })).toThrow(
      expect.objectContaining({ errorClass: 'NotFound' }),
    );
  });

  it('reads the automation variables out of the owned Values', () => {
    const owned = persistentFromOwned({
      list: (automationId) =>
        automationId === SCOPE.automationId
          ? [
              {
                id: SUN,
                owner_automation_id: automationId,
                content: { kind: 'text', name: 'greeting', value: 'hello' },
                revision: 2,
                created_at: NOW,
                updated_at: NOW,
              },
            ]
          : [],
    });
    expect(owned.read(SCOPE.automationId, 'greeting')).toEqual({ value: 'hello', revision: 2 });
    expect(owned.read(SCOPE.automationId, 'other')).toBeUndefined();
    expect(owned.read(RAIN, 'greeting')).toBeUndefined();
  });

  it('leaves run variables to the run', () => {
    expect(() => home.read('var.get', { source: 'run', name: 'x' })).toThrow(
      expect.objectContaining({ errorClass: 'Invalid' }),
    );
  });

  it('fails with NotFound for a Value that is gone', () => {
    expect(() => home.read('var.get', { source: 'home', value: { value: 'gone' } })).toThrow(
      expect.objectContaining({ errorClass: 'NotFound' }),
    );
  });
});
