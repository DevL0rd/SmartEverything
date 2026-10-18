import { colord } from 'colord';
import {
  HSV_COLOR,
  readPresentedColor,
  type JsonValue,
  type PresentedCapability,
} from '@smarteverything/domain';

const MIN_LIGHTNESS = 55;
const MIN_KELVIN = 1000;
const MAX_KELVIN = 12_000;
const HECTO = 100;
const RGB_MAX = 255;
const PACKED_HEX_DIGITS = 6;

export function hsvCss(value: JsonValue): string | null {
  const parsed = HSV_COLOR.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  const { h, s, l } = colord({ h: parsed.data.hue, s: parsed.data.saturation, v: HECTO }).toHsl();
  return `hsl(${String(h)}, ${String(s)}%, ${String(Math.max(l, MIN_LIGHTNESS))}%)`;
}

export function presentedColourCss(
  presented: PresentedCapability,
  value: JsonValue | undefined,
): string | null {
  const colour = readPresentedColor(presented, value);
  if (colour === null) {
    return null;
  }
  if (presented.colorEncoding === 'packed_rgb' && typeof value === 'number') {
    return `#${value.toString(16).padStart(PACKED_HEX_DIGITS, '0')}`;
  }
  return hsvCss(colour);
}

function warmGreen(temperature: number): number {
  return temperature <= 66
    ? 99.47 * Math.log(temperature) - 161.12
    : 288.12 * (temperature - 60) ** -0.0755;
}

function warmBlue(temperature: number): number {
  if (temperature >= 66) {
    return RGB_MAX;
  }
  return temperature <= 19 ? 0 : 138.52 * Math.log(temperature - 10) - 305.04;
}

function coolRed(temperature: number): number {
  return 329.7 * (temperature - 60) ** -0.1332;
}

export function kelvinCss(kelvin: number): string | null {
  if (!Number.isFinite(kelvin) || kelvin < MIN_KELVIN) {
    return null;
  }
  const temperature = Math.min(kelvin, MAX_KELVIN) / HECTO;
  return colord({
    r: temperature <= 66 ? RGB_MAX : coolRed(temperature),
    g: warmGreen(temperature),
    b: warmBlue(temperature),
  }).toHex();
}
