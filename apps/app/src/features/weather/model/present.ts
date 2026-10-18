import {
  UV_BAND_LABELS,
  usAqiVerdict,
  uvBandOf,
  weatherKindOf,
  weatherLabelOf,
  type WeatherKind,
  type WeatherDay,
  type WeatherForecast,
  type WeatherHour,
} from '@smarteverything/domain';
import { US_AQI_BAND_TONE } from '../../../components/air-look';
import type { IconName } from '../../../components/icon';
import type { StatusTone } from '../../../components/tone';
import { AIR_BAND_COLOUR } from '../../../design/data-colours';
import type { ColourRole } from '../../../design/tokens';
import { decimal } from '../../../format/number';
import { HOUR_MS, localDayKey, shortClock } from '../../../format/time';

export function degrees(celsius: number): string {
  return `${decimal(celsius)}°`;
}

export function highLow(day: WeatherDay): string {
  return `High ${degrees(day.maxC)} · Low ${degrees(day.minC)}`;
}

export function conditionOf(code: number): string {
  return weatherLabelOf(code);
}

const KIND_ICONS: Readonly<Record<WeatherKind, readonly [IconName, IconName]>> = {
  clear: ['sun', 'moon'],
  partly_cloudy: ['weather', 'cloudMoon'],
  cloudy: ['cloud', 'cloud'],
  fog: ['cloudFog', 'cloudFog'],
  drizzle: ['cloudDrizzle', 'cloudDrizzle'],
  rain: ['cloudRain', 'cloudRain'],
  snow: ['cloudSnow', 'cloudSnow'],
  storm: ['cloudLightning', 'cloudLightning'],
};

export function conditionIcon(code: number, day: boolean): IconName {
  const [sun, moon] = KIND_ICONS[weatherKindOf(code)];
  return day ? sun : moon;
}

export function conditionColour(code: number, day: boolean): ColourRole {
  const kind = weatherKindOf(code);
  if (kind === 'clear' || kind === 'partly_cloudy') {
    return day ? 'temp-warm' : 'on-surface-variant';
  }
  return kind === 'cloudy' || kind === 'fog' ? 'on-surface-variant' : 'humidity';
}

export function todayOf(forecast: WeatherForecast, now: number): WeatherDay | null {
  const today = localDayKey(now, forecast.timeZone);
  return forecast.daily.find((day) => day.day === today) ?? null;
}

export interface SunDay {
  readonly sunrise: string;
  readonly sunset: string;
  readonly daylightSeconds: number | null;
}

export function sunOf(day: WeatherDay | null): SunDay | null {
  if (day === null) {
    return null;
  }
  const { sunrise, sunset } = day;
  if (sunrise === null || sunset === null) {
    return null;
  }
  return { sunrise, sunset, daylightSeconds: day.daylightSeconds };
}

export function upcomingHours(
  forecast: WeatherForecast,
  now: number,
  count: number,
): readonly WeatherHour[] {
  const start = now - (now % HOUR_MS);
  return forecast.hourly.filter((hour) => Date.parse(hour.at) >= start).slice(0, count);
}

export function hourName(hour: WeatherHour, index: number, timeZone: string): string {
  return index === 0 ? 'Now' : shortClock(hour.at, timeZone);
}

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' });

export function weekdayOf(day: string): string {
  return WEEKDAY.format(new Date(`${day}T12:00:00Z`));
}

export function dayName(day: WeatherDay, today: string): string {
  return day.day === today ? 'Today' : weekdayOf(day.day);
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export function windText(kmh: number, direction: number | null): string {
  const speed = `${decimal(kmh)} km/h`;
  if (direction === null) {
    return speed;
  }
  return `${speed} ${COMPASS[Math.round(direction / 45) % COMPASS.length] ?? ''}`.trim();
}

export function chanceText(chance: number | null): string | null {
  return chance === null || chance < 10 ? null : `${decimal(chance)}%`;
}

export function uvText(index: number): string {
  return `${decimal(index)} · ${UV_BAND_LABELS[uvBandOf(index)]}`;
}

export interface AqiLook {
  readonly value: string;
  readonly label: string;
  readonly tone: StatusTone;
  readonly role: ColourRole;
}

export function aqiLook(aqi: number): AqiLook {
  const verdict = usAqiVerdict(aqi);
  return {
    value: decimal(aqi),
    label: verdict.label,
    tone: US_AQI_BAND_TONE[verdict.band],
    role: AIR_BAND_COLOUR[verdict.band],
  };
}
