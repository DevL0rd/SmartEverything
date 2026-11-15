import { minuteOfClock, type PlannerSunrise } from '@smarteverything/domain';
import { plural } from '../../../format/text';
import { clockOfMinutes } from '../../../format/time';

export const FIRST_SUNRISE_MINUTES = 20;

export interface SunriseLight {
  readonly id: string;
  readonly name: string;
}

export function firstSunriseOf(lights: readonly SunriseLight[]): PlannerSunrise | null {
  const first = lights[0];
  return first === undefined
    ? null
    : { lights: [first.id], minutes: FIRST_SUNRISE_MINUTES, colour: true };
}

export function toggledSunriseLight(
  sunrise: PlannerSunrise,
  lightId: string,
): PlannerSunrise | null {
  const lights = sunrise.lights.includes(lightId)
    ? sunrise.lights.filter((id) => id !== lightId)
    : [...sunrise.lights, lightId];
  return lights.length === 0 ? null : { ...sunrise, lights };
}

export function sunriseStartOf(sunrise: Pick<PlannerSunrise, 'minutes'>, time: string): string {
  return clockOfMinutes(minuteOfClock(time) - sunrise.minutes);
}

export function sunriseTextOf(sunrise: PlannerSunrise): string {
  return `Sunrise ${String(sunrise.minutes)} min`;
}

export function sunriseSummaryOf(sunrise: PlannerSunrise, time: string): string {
  const lights = plural(sunrise.lights.length, 'light');
  const colour = sunrise.colour ? ', warm to daylight' : '';
  const verb = sunrise.lights.length === 1 ? 'brightens' : 'brighten';
  return `${lights} ${verb} from ${sunriseStartOf(sunrise, time)} to full at ${time}${colour}.`;
}

export function sunriseGradientOf(colour: boolean): string {
  return colour
    ? 'bg-linear-to-r from-bg via-temp-warm to-temp-neutral'
    : 'bg-linear-to-r from-bg to-temp-warm';
}

export function missingLightsOf(
  sunrise: PlannerSunrise,
  lights: readonly SunriseLight[],
): readonly string[] {
  return sunrise.lights.filter((id) => !lights.some((light) => light.id === id));
}
