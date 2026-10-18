import { describe, expect, it } from 'vitest';
import type { WeatherForecast } from '@smarteverything/domain';
import type { MetricReading } from './comfort';
import { comparisonsOf, hintOf } from './outdoor';

function forecastOf(over: {
  readonly temperature?: number;
  readonly humidity?: number;
  readonly code?: number;
  readonly chance?: number | null;
  readonly pm25?: number | null;
}): WeatherForecast {
  const { temperature = 12, humidity = 60, code = 0, chance = 0, pm25 = null } = over;
  return {
    latitude: 0,
    longitude: 0,
    timeZone: 'UTC',
    now: {
      at: '2026-10-16T10:00:00Z',
      temperatureC: temperature,
      feelsLikeC: temperature,
      humidityPercent: humidity,
      dewPointC: null,
      precipitationMm: 0,
      code,
      isDay: true,
      cloudPercent: null,
      pressureHpa: null,
      windKmh: 0,
      windDirection: null,
      gustKmh: null,
      uvIndex: null,
      visibilityM: null,
    },
    hourly: [
      {
        at: '2026-10-16T10:00:00Z',
        temperatureC: temperature,
        feelsLikeC: temperature,
        humidityPercent: humidity,
        precipitationChance: chance,
        precipitationMm: 0,
        code: 0,
        windKmh: 0,
        uvIndex: null,
        isDay: true,
      },
    ],
    daily: [
      {
        day: '2026-10-16',
        code: 0,
        nightCode: 0,
        minC: 8,
        maxC: 19,
        sunrise: null,
        sunset: null,
        daylightSeconds: null,
        uvMax: null,
        precipitationMm: 0,
        precipitationChance: null,
        windMaxKmh: 0,
        gustMaxKmh: null,
        windDirection: null,
      },
    ],
    air:
      pm25 === null
        ? null
        : {
            now: {
              at: '2026-10-16T10:00:00Z',
              usAqi: null,
              europeanAqi: null,
              pm25,
              pm10: null,
              ozone: null,
              nitrogenDioxide: null,
              uvIndex: null,
              pollen: {
                alder: null,
                birch: null,
                grass: null,
                mugwort: null,
                olive: null,
                ragweed: null,
              },
            },
            hourly: [],
            daily: [],
          },
  };
}

function reading(
  metric: MetricReading['metric'],
  amount: number,
  stale = false,
  unit: string | null = null,
): MetricReading {
  return {
    metric,
    label: metric,
    amount,
    value: String(amount),
    unit,
    verdict: '',
    tone: 'positive',
    stale,
  };
}

describe('comparisonsOf', () => {
  it('sets inside beside outside with the difference outside minus inside', () => {
    const [temperature] = comparisonsOf([reading('temperature', 22)], forecastOf({}));
    expect(temperature).toMatchObject({
      key: 'temperature',
      insideText: '22.0°',
      outsideText: '12.0°',
      delta: '−10°',
    });
  });

  it('converts a Fahrenheit sensor to Celsius before setting it beside the forecast', () => {
    const [temperature] = comparisonsOf(
      [reading('temperature', 68, false, '°F')],
      forecastOf({ temperature: 10 }),
    );
    expect(temperature).toMatchObject({
      inside: 20,
      insideText: '20.0°',
      outsideText: '10.0°',
      delta: '−10°',
    });
  });

  it('shows a dash and no difference for a side that has no reading', () => {
    const rows = comparisonsOf([], forecastOf({}));
    expect(rows.map((row) => row.key)).toEqual(['temperature', 'humidity']);
    expect(rows[0]).toMatchObject({ insideText: '—', delta: null, inside: null });
  });

  it('ignores an inside reading that is stale', () => {
    const [temperature] = comparisonsOf([reading('temperature', 22, true)], forecastOf({}));
    expect(temperature?.inside).toBeNull();
  });

  it('adds the air row once the forecast has air quality', () => {
    const rows = comparisonsOf([reading('pm25', 5)], forecastOf({ pm25: 40 }));
    expect(rows.find((row) => row.key === 'pm25')).toMatchObject({
      insideText: '5',
      outsideText: '40',
      delta: '+35',
    });
  });
});

describe('hintOf', () => {
  it('warns to keep windows closed when outside air is dirty and worse than inside', () => {
    const hint = hintOf([reading('pm25', 5)], forecastOf({ pm25: 80 }));
    expect(hint?.tone).toBe('warning');
    expect(hint?.text).toMatch(/windows closed/);
  });

  it('does not warn when the room air is already worse than outside', () => {
    expect(hintOf([reading('pm25', 120)], forecastOf({ pm25: 80, temperature: 22 }))).toBeNull();
  });

  it('warns of rain when it rains now or the chance reaches sixty percent', () => {
    expect(hintOf([], forecastOf({ code: 63 }))?.tone).toBe('info');
    expect(hintOf([], forecastOf({ chance: 60 }))?.tone).toBe('info');
    expect(hintOf([], forecastOf({ chance: 59, temperature: 20 }))).toBeNull();
  });

  it('compares a Fahrenheit sensor in Celsius when deciding whether it is cooler outside', () => {
    const inside = [reading('temperature', 59, false, '°F')];
    expect(hintOf(inside, forecastOf({ temperature: 14 }))).toBeNull();
    expect(hintOf(inside, forecastOf({ temperature: 13 }))?.tone).toBe('positive');
  });

  it('suggests airing out when it is at least two degrees cooler outside', () => {
    const inside = [reading('temperature', 22)];
    expect(hintOf(inside, forecastOf({ temperature: 20 }))?.tone).toBe('positive');
    expect(hintOf(inside, forecastOf({ temperature: 21 }))).toBeNull();
  });
});
