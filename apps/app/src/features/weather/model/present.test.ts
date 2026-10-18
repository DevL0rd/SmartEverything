import { describe, expect, it } from 'vitest';
import type { WeatherDay, WeatherForecast, WeatherHour } from '@smarteverything/domain';
import {
  aqiLook,
  chanceText,
  conditionColour,
  conditionIcon,
  dayName,
  degrees,
  highLow,
  hourName,
  sunOf,
  todayOf,
  upcomingHours,
  uvText,
  windText,
} from './present';

function dayOf(day: string, over: Partial<WeatherDay> = {}): WeatherDay {
  return {
    day,
    code: 0,
    nightCode: 0,
    minC: 8,
    maxC: 19,
    sunrise: `${day}T06:00:00Z`,
    sunset: `${day}T18:00:00Z`,
    daylightSeconds: 43_200,
    uvMax: 5,
    precipitationMm: 0,
    precipitationChance: 10,
    windMaxKmh: 12,
    gustMaxKmh: null,
    windDirection: null,
    ...over,
  };
}

function hourOf(at: string): WeatherHour {
  return {
    at,
    temperatureC: 12,
    feelsLikeC: 11,
    humidityPercent: 50,
    precipitationChance: 20,
    precipitationMm: 0,
    code: 0,
    windKmh: 5,
    uvIndex: null,
    isDay: true,
  };
}

function forecastOf(over: Partial<WeatherForecast>): WeatherForecast {
  return {
    latitude: 0,
    longitude: 0,
    timeZone: 'UTC',
    now: {
      at: '2026-10-16T10:00:00Z',
      temperatureC: 12,
      feelsLikeC: 11,
      humidityPercent: 60,
      dewPointC: null,
      precipitationMm: 0,
      code: 0,
      isDay: true,
      cloudPercent: null,
      pressureHpa: null,
      windKmh: 10,
      windDirection: null,
      gustKmh: null,
      uvIndex: null,
      visibilityM: null,
    },
    hourly: [],
    daily: [dayOf('2026-10-16')],
    air: null,
    ...over,
  };
}

describe('text helpers', () => {
  it('writes degrees and a high and low', () => {
    expect(degrees(18.6)).toBe('19°');
    expect(highLow(dayOf('2026-10-16'))).toBe('High 19° · Low 8°');
  });

  it('adds the compass point to a wind speed only when there is a direction', () => {
    expect(windText(12, null)).toBe('12 km/h');
    expect(windText(12, 0)).toBe('12 km/h N');
    expect(windText(12, 90)).toBe('12 km/h E');
    expect(windText(12, 350)).toBe('12 km/h N');
    expect(windText(12, 225)).toBe('12 km/h SW');
  });

  it('hides a rain chance under ten percent', () => {
    expect(chanceText(null)).toBeNull();
    expect(chanceText(9)).toBeNull();
    expect(chanceText(10)).toBe('10%');
  });

  it('names the UV band beside the index', () => {
    expect(uvText(1)).toBe('1 · Low');
    expect(uvText(7)).toBe('7 · High');
  });
});

describe('condition look', () => {
  it('shows the sun by day and the moon by night for clear weather', () => {
    expect(conditionIcon(0, true)).toBe('sun');
    expect(conditionIcon(0, false)).toBe('moon');
    expect(conditionIcon(63, false)).toBe('cloudRain');
  });

  it('colours clear skies warm by day only and rain as water', () => {
    expect(conditionColour(0, true)).toBe('temp-warm');
    expect(conditionColour(0, false)).toBe('on-surface-variant');
    expect(conditionColour(3, true)).toBe('on-surface-variant');
    expect(conditionColour(63, true)).toBe('humidity');
  });
});

describe('aqiLook', () => {
  it('labels the US index and maps its band to a tone and colour', () => {
    expect(aqiLook(40)).toEqual({
      value: '40',
      label: 'Good',
      tone: 'positive',
      role: 'air-good',
    });
    expect(aqiLook(64)).toMatchObject({ label: 'Moderate', tone: 'warning', role: 'air-fair' });
    expect(aqiLook(120)).toMatchObject({
      label: 'Unhealthy for sensitive groups',
      tone: 'warning',
    });
    expect(aqiLook(160)).toMatchObject({ label: 'Unhealthy', tone: 'critical', role: 'air-poor' });
    expect(aqiLook(400)).toMatchObject({ label: 'Hazardous', role: 'air-severe' });
  });
});

describe('day and hours', () => {
  it('finds today in the time zone of the forecast, not of the device', () => {
    const forecast = forecastOf({
      timeZone: 'Pacific/Auckland',
      daily: [dayOf('2026-10-16'), dayOf('2026-10-17')],
    });
    const now = Date.parse('2026-10-16T20:00:00Z');
    expect(todayOf(forecast, now)?.day).toBe('2026-10-17');
  });

  it('has no today when the forecast starts later', () => {
    const forecast = forecastOf({ daily: [dayOf('2026-10-20')] });
    expect(todayOf(forecast, Date.parse('2026-10-16T10:00:00Z'))).toBeNull();
  });

  it('has sun times only when both are known', () => {
    expect(sunOf(null)).toBeNull();
    expect(sunOf(dayOf('2026-10-16', { sunset: null }))).toBeNull();
    expect(sunOf(dayOf('2026-10-16'))).toEqual({
      sunrise: '2026-10-16T06:00:00Z',
      sunset: '2026-10-16T18:00:00Z',
      daylightSeconds: 43_200,
    });
  });

  it('starts the upcoming hours at the current hour and stops at the count', () => {
    const forecast = forecastOf({
      hourly: [
        '2026-10-16T08:00:00Z',
        '2026-10-16T09:00:00Z',
        '2026-10-16T10:00:00Z',
        '2026-10-16T11:00:00Z',
        '2026-10-16T12:00:00Z',
      ].map(hourOf),
    });
    const hours = upcomingHours(forecast, Date.parse('2026-10-16T10:40:00Z'), 2);
    expect(hours.map((hour) => hour.at)).toEqual(['2026-10-16T10:00:00Z', '2026-10-16T11:00:00Z']);
  });

  it('calls the first hour Now and the others by their clock', () => {
    const hour = hourOf('2026-10-16T15:00:00Z');
    expect(hourName(hour, 0, 'UTC')).toBe('Now');
    expect(hourName(hour, 1, 'UTC')).toMatch(/3|15/);
  });

  it('calls today Today and any other day by its weekday', () => {
    expect(dayName(dayOf('2026-10-16'), '2026-10-16')).toBe('Today');
    expect(dayName(dayOf('2026-10-17'), '2026-10-16')).not.toBe('Today');
    expect(dayName(dayOf('2026-10-17'), '2026-10-16')).toMatch(/Sat/);
  });
});
