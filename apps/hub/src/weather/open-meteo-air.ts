import {
  AIR_DAYS,
  AIR_NOW,
  AIR_HOUR,
  WEATHER_HOURS,
  type AirDay,
  type AirHour,
  type Pollen,
  type WeatherAir,
} from '@smarteverything/domain';
import { z } from 'zod';
import { dayOf, instantOf, openMeteo, readAs, spotQuery, type WeatherSpot } from './open-meteo';
import type { ProviderRequest } from '../outbound/provider-json';

const BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality';

const VALUE = z.number().nullable();

const RAW_NOW = z.object({
  time: z.int(),
  us_aqi: VALUE,
  european_aqi: VALUE,
  pm2_5: VALUE,
  pm10: VALUE,
  ozone: VALUE,
  nitrogen_dioxide: VALUE,
  uv_index: VALUE,
  alder_pollen: VALUE,
  birch_pollen: VALUE,
  grass_pollen: VALUE,
  mugwort_pollen: VALUE,
  olive_pollen: VALUE,
  ragweed_pollen: VALUE,
});

const CURRENT = Object.keys(RAW_NOW.shape)
  .filter((key) => key !== 'time')
  .join(',');

const RAW_AIR = z.object({
  utc_offset_seconds: z.int(),
  current: RAW_NOW,
  hourly: z.object({
    time: z.array(z.int()),
    us_aqi: z.array(VALUE),
    pm2_5: z.array(VALUE),
  }),
});

type RawAir = z.infer<typeof RAW_AIR>;

function hoursOf(raw: RawAir): AirHour[] {
  const { hourly } = raw;
  return hourly.time.map((time, index) =>
    readAs(AIR_HOUR, 'air quality forecast', {
      at: instantOf(time),
      usAqi: hourly.us_aqi[index],
      pm25: hourly.pm2_5[index],
    }),
  );
}

function highest(values: readonly (number | null)[]): number | null {
  const known = values.filter((value) => value !== null);
  return known.length === 0 ? null : Math.max(...known);
}

function daysOf(raw: RawAir, hours: readonly AirHour[]): AirDay[] {
  const byDay = new Map<string, AirHour[]>();
  raw.hourly.time.forEach((time, index) => {
    const hour = hours[index];
    if (hour !== undefined) {
      const day = dayOf(time, raw.utc_offset_seconds);
      byDay.set(day, [...(byDay.get(day) ?? []), hour]);
    }
  });
  return [...byDay.entries()].map(([day, list]) => ({
    day,
    usAqiMax: highest(list.map((hour) => hour.usAqi)),
    pm25Max: highest(list.map((hour) => hour.pm25)),
  }));
}

function pollenOf(current: RawAir['current']): Pollen {
  return {
    alder: current.alder_pollen,
    birch: current.birch_pollen,
    grass: current.grass_pollen,
    mugwort: current.mugwort_pollen,
    olive: current.olive_pollen,
    ragweed: current.ragweed_pollen,
  };
}

export async function fetchAir(request: ProviderRequest, spot: WeatherSpot): Promise<WeatherAir> {
  const query = new URLSearchParams({
    ...spotQuery(spot),
    current: CURRENT,
    hourly: 'us_aqi,pm2_5',
    forecast_days: String(AIR_DAYS),
  });
  const raw = await openMeteo(request, `${BASE}?${query.toString()}`, RAW_AIR);
  const c = raw.current;
  const hours = hoursOf(raw);
  const hourStart = c.time * 1000 - ((c.time * 1000) % 3_600_000);
  return {
    now: readAs(AIR_NOW, 'air quality reading', {
      at: instantOf(c.time),
      usAqi: c.us_aqi,
      europeanAqi: c.european_aqi,
      pm25: c.pm2_5,
      pm10: c.pm10,
      ozone: c.ozone,
      nitrogenDioxide: c.nitrogen_dioxide,
      uvIndex: c.uv_index,
      pollen: pollenOf(c),
    }),
    hourly: hours.filter((hour) => Date.parse(hour.at) >= hourStart).slice(0, WEATHER_HOURS),
    daily: daysOf(raw, hours),
  };
}
