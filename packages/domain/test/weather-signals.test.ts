import { describe, expect, it } from 'vitest';
import {
  SIGNAL_SOURCES,
  TRIGGER_PRESETS,
  WEATHER_BANDS,
  WEATHER_FORECAST,
  compileTriggerMatcher,
  signalMatchesMatcher as signalMatches,
  signalRateOf,
  signalRegistered,
  signalTriggerError,
  weatherSignalsBetween,
  type JsonValue,
  type SignalInput,
  type SignalMatcher,
  type WeatherForecast,
  type WeatherSignal,
} from '../src/index';

const NOW = '2026-10-19T12:00:00.000Z';
const HOUR_MS = 3_600_000;

interface Now {
  readonly temperatureC?: number;
  readonly precipitationMm?: number;
  readonly code?: number;
  readonly uvIndex?: number;
}

function hour(offset: number, chance: number): unknown {
  return {
    at: new Date(Date.parse(NOW) + offset * HOUR_MS).toISOString(),
    temperatureC: 15,
    feelsLikeC: 15,
    humidityPercent: 50,
    precipitationChance: chance,
    precipitationMm: 0,
    code: 3,
    windKmh: 5,
    uvIndex: null,
    isDay: true,
  };
}

function forecast(now: Now = {}, chances: readonly number[] = [0, 0, 0]): WeatherForecast {
  return WEATHER_FORECAST.parse({
    latitude: 52.5,
    longitude: 13.4,
    timeZone: 'UTC',
    now: {
      at: NOW,
      temperatureC: 15,
      feelsLikeC: 15,
      humidityPercent: 50,
      dewPointC: null,
      precipitationMm: 0,
      code: 3,
      isDay: true,
      cloudPercent: null,
      pressureHpa: null,
      windKmh: 10,
      windDirection: null,
      gustKmh: null,
      uvIndex: 1,
      visibilityM: null,
      ...now,
    },
    hourly: chances.map((chance, index) => hour(index + 1, chance)),
    daily: [
      {
        day: '2026-10-19',
        code: 3,
        nightCode: 3,
        minC: 8,
        maxC: 16,
        sunrise: null,
        sunset: null,
        daylightSeconds: null,
        uvMax: null,
        precipitationMm: 0,
        precipitationChance: null,
        windMaxKmh: 10,
        gustMaxKmh: null,
        windDirection: null,
      },
    ],
    air: null,
  });
}

function kinds(signals: readonly WeatherSignal[]): readonly string[] {
  return signals.map((signal) => `${signal.kind}:${signal.field ?? ''}`);
}

function asInput(signal: WeatherSignal): SignalInput {
  return {
    source: 'weather',
    subject: null,
    profileId: null,
    at: NOW,
    ...signal,
    data: { ...signal.data },
  };
}

describe('weather signals', () => {
  it('emits nothing when nothing changed', () => {
    expect(weatherSignalsBetween(forecast(), forecast())).toEqual([]);
  });

  it('emits rain started with the kind, the condition and the precipitation change', () => {
    const signals = weatherSignalsBetween(forecast(), forecast({ precipitationMm: 0.6, code: 61 }));
    expect(kinds(signals)).toEqual([
      'rain_started:',
      'condition:',
      'band:precipitation',
      'changed:precipitation',
    ]);
    expect(signals[0]).toEqual({
      kind: 'rain_started',
      field: null,
      value: true,
      previous: false,
      data: { kind: 'rain', precipitationMm: 0.6 },
    });
    expect(signals[1]?.data).toEqual({ to: 'rain', from: 'cloudy', code: 61, label: 'Light rain' });
    expect(signals[2]).toMatchObject({ value: 'light', previous: 'none' });
  });

  it('emits rain stopped when the rain ends', () => {
    const signals = weatherSignalsBetween(forecast({ precipitationMm: 1, code: 63 }), forecast());
    expect(signals[0]).toMatchObject({ kind: 'rain_stopped', value: false, previous: true });
  });

  it('emits a value change and a band change when the temperature crosses a band', () => {
    const signals = weatherSignalsBetween(forecast(), forecast({ temperatureC: 31 }));
    expect(signals).toContainEqual({
      kind: 'changed',
      field: 'temperature',
      value: 31,
      previous: 15,
      data: {},
    });
    expect(signals).toContainEqual({
      kind: 'band',
      field: 'temperature',
      value: 'hot',
      previous: 'cool',
      data: { to: 'hot', from: 'cool' },
    });
  });

  it('emits rain expected once for each horizon that newly holds', () => {
    const signals = weatherSignalsBetween(forecast(), forecast({}, [0, 80, 0]));
    expect(signals.filter((signal) => signal.kind === 'rain_expected')).toEqual(
      ['1h', '2h', '3h', '6h'].map((within) => ({
        kind: 'rain_expected',
        field: null,
        value: 60,
        previous: null,
        data: { within, inMinutes: 60 },
      })),
    );
    const again = weatherSignalsBetween(forecast({}, [0, 80, 0]), forecast({}, [0, 80, 0]));
    expect(again).toEqual([]);
  });

  it('expects no rain while it already rains', () => {
    const signals = weatherSignalsBetween(
      forecast({ precipitationMm: 1, code: 63 }),
      forecast({ precipitationMm: 1, code: 63 }, [90, 90, 90]),
    );
    expect(signals.filter((signal) => signal.kind === 'rain_expected')).toEqual([]);
  });

  it('registers every emitted signal and gives each field its own rate key', () => {
    const signals = weatherSignalsBetween(
      forecast(),
      forecast({ precipitationMm: 9, code: 65, temperatureC: -2, uvIndex: 9 }, [80, 80, 80]),
    );
    expect(signals.length).toBeGreaterThan(5);
    for (const signal of signals) {
      expect(signalRegistered(SIGNAL_SOURCES, { source: 'weather', ...signal })).toBe(true);
    }
    expect(signalRateOf('weather', 'changed')?.per).toEqual(['kind', 'subject', 'field']);
  });
});

describe('the Weather changes trigger', () => {
  const rain = weatherSignalsBetween(forecast(), forecast({ precipitationMm: 0.6, code: 61 }));

  function compiled(ports: Readonly<Record<string, JsonValue>>): SignalMatcher {
    const result = compileTriggerMatcher('trigger.weather', ports);
    if (!result.ok) throw new Error(result.error);
    return result.matcher;
  }

  it('matches rain started and not rain stopped', () => {
    const started = compiled({ event: 'rain_started' });
    const stopped = compiled({ event: 'rain_stopped' });
    const signal = rain[0];
    if (signal === undefined) throw new Error('no signal');
    expect(signalMatches(started, asInput(signal))).toBe(true);
    expect(signalMatches(stopped, asInput(signal))).toBe(false);
    expect(
      signalMatches(compiled({ event: 'rain_started', falling: 'snow' }), asInput(signal)),
    ).toBe(false);
  });

  it('matches a temperature change by metric with a test and rearm', () => {
    const matcher = compiled({
      event: 'changed',
      metric: 'temperature',
      test: { is: 'gt', to: 25 },
      rearm: 24,
    });
    expect(matcher).toMatchObject({
      source: 'weather',
      kind: 'changed',
      field: 'temperature',
      test: { is: 'gt', to: 25 },
      rearm: 24,
    });
  });

  it('turns a band and a rain horizon into match keys', () => {
    expect(compiled({ event: 'band', metric: 'uv_index', to: 'high' })).toMatchObject({
      kind: 'band',
      field: 'uv_index',
      match: { to: 'high' },
    });
    expect(compiled({ event: 'rain_expected', within: '30m' })).toMatchObject({
      kind: 'rain_expected',
      match: { within: '30m' },
    });
  });

  it('offers band presets for wind, UV, humidity and air quality that name a real band', () => {
    const bands = TRIGGER_PRESETS.filter((preset) => preset.ports['event'] === 'band');
    expect(bands.map((preset) => preset.ports['metric'])).toEqual(
      expect.arrayContaining(['wind_speed', 'uv_index', 'humidity', 'aqi']),
    );
    for (const preset of bands) {
      const metric = preset.ports['metric'];
      const known = Object.entries(WEATHER_BANDS).find(([name]) => name === metric)?.[1].bands;
      expect(known).toContain(preset.ports['to']);
    }
  });

  it('offers presets that compile and pass the signal catalogue', () => {
    for (const preset of TRIGGER_PRESETS) {
      const matcher = compiled(preset.ports);
      expect(
        signalTriggerError(SIGNAL_SOURCES, { ...matcher, match: matcher.match ?? {} }),
      ).toBeNull();
    }
  });
});
