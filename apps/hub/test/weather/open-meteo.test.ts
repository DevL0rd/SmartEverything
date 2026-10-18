import { describe, expect, it } from 'vitest';
import { fetchAir } from '../../src/weather/open-meteo-air';
import { fetchForecast } from '../../src/weather/open-meteo-forecast';
import { ProviderError, type ProviderRequest } from '../../src/outbound/provider-json';

const SPOT = { latitude: 59.9, longitude: 10.7, timeZone: 'Europe/Oslo' };
const OFFSET = 7200;
const HOUR = 3600;

function seconds(iso: string): number {
  return Date.parse(iso) / 1000;
}

function requestAnswering(body: unknown, status = 200): { request: ProviderRequest; urls: URL[] } {
  const urls: URL[] = [];
  return {
    urls,
    request: {
      fetch: (input): Promise<Response> => {
        urls.push(new URL(new Request(input).url));
        return Promise.resolve(Response.json(body, { status }));
      },
      version: 't',
    },
  };
}

function hours(from: string, count: number): number[] {
  const start = seconds(from);
  return Array.from({ length: count }, (_, index) => start + index * HOUR);
}

const HOURLY_TIMES = hours('2026-10-10T06:00:00Z', 8);

function currentNow(): Record<string, unknown> {
  return {
    time: seconds('2026-10-10T08:30:00Z'),
    temperature_2m: 11.5,
    apparent_temperature: 9.8,
    relative_humidity_2m: 80,
    dew_point_2m: 8,
    is_day: 1,
    precipitation: 0.2,
    weather_code: 3,
    cloud_cover: 90,
    pressure_msl: 1008,
    wind_speed_10m: 14,
    wind_direction_10m: 200,
    wind_gusts_10m: 30,
    uv_index: 1.5,
    visibility: 20_000,
  };
}

function hourlySeries(
  time: readonly number[],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const filled = <T>(value: T): T[] => time.map(() => value);
  return {
    time,
    temperature_2m: filled(10),
    apparent_temperature: filled(8),
    relative_humidity_2m: filled(75),
    precipitation_probability: filled(null),
    precipitation: filled(0),
    weather_code: filled(0),
    wind_speed_10m: filled(5),
    uv_index: filled(null),
    is_day: filled(1),
    ...overrides,
  };
}

function dailySeries(): Record<string, unknown> {
  return {
    time: [seconds('2026-10-10T00:00:00Z') - OFFSET, seconds('2026-10-11T00:00:00Z') - OFFSET],
    weather_code: [3, 61],
    temperature_2m_max: [12, 9],
    temperature_2m_min: [4, 3],
    sunrise: [seconds('2026-10-10T05:00:00Z'), seconds('2026-10-11T05:02:00Z')],
    sunset: [seconds('2026-10-10T15:30:00Z'), seconds('2026-10-11T15:28:00Z')],
    daylight_duration: [37_000, 36_800],
    uv_index_max: [2, null],
    precipitation_sum: [1, 6],
    precipitation_probability_max: [40, 90],
    wind_speed_10m_max: [20, 25],
    wind_gusts_10m_max: [40, null],
    wind_direction_10m_dominant: [210, 180],
  };
}

function forecast(parts: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    latitude: 59.91,
    longitude: 10.75,
    utc_offset_seconds: OFFSET,
    current: currentNow(),
    hourly: hourlySeries(HOURLY_TIMES),
    daily: dailySeries(),
    ...parts,
  };
}

describe('fetchForecast', () => {
  it('asks Open-Meteo for the spot with unix times in its zone and ten days', async () => {
    const { request, urls } = requestAnswering(forecast());
    await fetchForecast(request, SPOT);
    expect(urls[0]?.origin).toBe('https://api.open-meteo.com');
    expect(urls[0]?.searchParams.get('latitude')).toBe('59.9');
    expect(urls[0]?.searchParams.get('timezone')).toBe('Europe/Oslo');
    expect(urls[0]?.searchParams.get('timeformat')).toBe('unixtime');
    expect(urls[0]?.searchParams.get('forecast_days')).toBe('10');
  });

  it('maps the current conditions, turning the day flag into a boolean', async () => {
    const { request } = requestAnswering(forecast());
    const parts = await fetchForecast(request, SPOT);
    expect(parts).toMatchObject({ latitude: 59.91, longitude: 10.75 });
    expect(parts.now).toEqual({
      at: '2026-10-10T08:30:00.000Z',
      temperatureC: 11.5,
      feelsLikeC: 9.8,
      humidityPercent: 80,
      dewPointC: 8,
      precipitationMm: 0.2,
      code: 3,
      isDay: true,
      cloudPercent: 90,
      pressureHpa: 1008,
      windKmh: 14,
      windDirection: 200,
      gustKmh: 30,
      uvIndex: 1.5,
      visibilityM: 20_000,
    });
  });

  it('starts the hourly list at the hour that now falls in and keeps missing values as null', async () => {
    const { request } = requestAnswering(forecast());
    const parts = await fetchForecast(request, SPOT);
    expect(parts.hourly.map((hour) => hour.at)).toEqual([
      '2026-10-10T08:00:00.000Z',
      '2026-10-10T09:00:00.000Z',
      '2026-10-10T10:00:00.000Z',
      '2026-10-10T11:00:00.000Z',
      '2026-10-10T12:00:00.000Z',
      '2026-10-10T13:00:00.000Z',
    ]);
    expect(parts.hourly[0]).toMatchObject({
      temperatureC: 10,
      precipitationChance: null,
      uvIndex: null,
      isDay: true,
    });
  });

  it('names each day in the local zone and carries the daily figures', async () => {
    const { request } = requestAnswering(forecast());
    const parts = await fetchForecast(request, SPOT);
    expect(parts.daily.map((day) => day.day)).toEqual(['2026-10-10', '2026-10-11']);
    expect(parts.daily[0]).toMatchObject({
      code: 3,
      minC: 4,
      maxC: 12,
      sunrise: '2026-10-10T05:00:00.000Z',
      sunset: '2026-10-10T15:30:00.000Z',
      daylightSeconds: 37_000,
      uvMax: 2,
      precipitationChance: 40,
      gustMaxKmh: 40,
    });
    expect(parts.daily[1]).toMatchObject({ uvMax: null, gustMaxKmh: null });
  });

  it('takes the night code from the worst hour between sunset and the next sunrise, else the day code', async () => {
    const time = hours('2026-10-10T15:00:00Z', 6);
    const withNight = forecast({
      hourly: hourlySeries(time, {
        precipitation_probability: time.map(() => 50),
        is_day: [1, 0, 0, 0, 0, 0],
        weather_code: [3, 0, 63, 3, 0, 0],
      }),
    });
    const night = await fetchForecast(requestAnswering(withNight).request, SPOT);
    expect(night.daily[0]?.nightCode).toBe(63);
    const quiet = await fetchForecast(requestAnswering(forecast()).request, SPOT);
    expect(quiet.daily[0]?.nightCode).toBe(3);
  });

  it('refuses an answer that is missing parts or has impossible values, naming Open-Meteo', async () => {
    const failure = fetchForecast(requestAnswering(forecast({ current: undefined })).request, SPOT);
    await expect(failure).rejects.toThrow(ProviderError);
    await expect(failure).rejects.toThrow('Open-Meteo');
    await expect(
      fetchForecast(
        requestAnswering(forecast({ current: { ...currentNow(), temperature_2m: -300 } })).request,
        SPOT,
      ),
    ).rejects.toThrow('current weather');
  });

  it('reports an HTTP error from the provider', async () => {
    await expect(fetchForecast(requestAnswering({}, 503).request, SPOT)).rejects.toThrow(
      'Open-Meteo answered HTTP 503',
    );
  });
});

const AIR_TIMES = hours('2026-10-10T06:00:00Z', 30);

function airSeries(
  usAqi: (index: number) => number | null,
  pm25: (index: number) => number | null,
): Record<string, unknown> {
  return {
    time: AIR_TIMES,
    us_aqi: AIR_TIMES.map((_, index) => usAqi(index)),
    pm2_5: AIR_TIMES.map((_, index) => pm25(index)),
  };
}

function air(
  hourly: Record<string, unknown> = airSeries(
    (index) => (index === 5 ? 120 : 40),
    (index) => (index < 10 ? null : 7),
  ),
): Record<string, unknown> {
  return {
    utc_offset_seconds: OFFSET,
    current: {
      time: seconds('2026-10-10T08:30:00Z'),
      us_aqi: 42,
      european_aqi: 30,
      pm2_5: 8.5,
      pm10: 12,
      ozone: 60,
      nitrogen_dioxide: 11,
      uv_index: 1,
      alder_pollen: null,
      birch_pollen: 12,
      grass_pollen: 0,
      mugwort_pollen: null,
      olive_pollen: null,
      ragweed_pollen: null,
    },
    hourly,
  };
}

describe('fetchAir', () => {
  it('asks the air quality service for the spot and five days', async () => {
    const { request, urls } = requestAnswering(air());
    await fetchAir(request, SPOT);
    expect(urls[0]?.origin).toBe('https://air-quality-api.open-meteo.com');
    expect(urls[0]?.searchParams.get('forecast_days')).toBe('5');
    expect(urls[0]?.searchParams.get('hourly')).toBe('us_aqi,pm2_5');
  });

  it('maps the reading now, with every pollen kind and gaps kept as null', async () => {
    const result = await fetchAir(requestAnswering(air()).request, SPOT);
    expect(result.now).toEqual({
      at: '2026-10-10T08:30:00.000Z',
      usAqi: 42,
      europeanAqi: 30,
      pm25: 8.5,
      pm10: 12,
      ozone: 60,
      nitrogenDioxide: 11,
      uvIndex: 1,
      pollen: {
        alder: null,
        birch: 12,
        grass: 0,
        mugwort: null,
        olive: null,
        ragweed: null,
      },
    });
  });

  it('lists the hours from the current hour on', async () => {
    const result = await fetchAir(requestAnswering(air()).request, SPOT);
    expect(result.hourly[0]).toEqual({ at: '2026-10-10T08:00:00.000Z', usAqi: 40, pm25: null });
    expect(result.hourly).toHaveLength(28);
  });

  it('gives each local day its highest index and particle level, null when nothing was known', async () => {
    const result = await fetchAir(requestAnswering(air()).request, SPOT);
    expect(result.daily).toEqual([
      { day: '2026-10-10', usAqiMax: 120, pm25Max: 7 },
      { day: '2026-10-11', usAqiMax: 40, pm25Max: 7 },
    ]);
    const none = await fetchAir(
      requestAnswering(
        air(
          airSeries(
            () => null,
            () => null,
          ),
        ),
      ).request,
      SPOT,
    );
    expect(none.daily.every((day) => day.usAqiMax === null && day.pm25Max === null)).toBe(true);
  });

  it('refuses an answer it cannot read', async () => {
    await expect(fetchAir(requestAnswering({ current: {} }).request, SPOT)).rejects.toThrow(
      ProviderError,
    );
  });
});
