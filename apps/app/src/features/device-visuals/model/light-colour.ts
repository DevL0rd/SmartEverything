import { HSV_COLOR, type JsonValue } from '@smarteverything/domain';

function channel(value: number): string {
  return Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, '0');
}

export function hsvCss(value: JsonValue): string | null {
  const parsed = HSV_COLOR.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  const { hue, saturation } = parsed.data;
  const share = saturation / 100;
  const lightness = 1 - share / 2;
  const hslSaturation =
    lightness === 0 || lightness === 1 ? 0 : share / 2 / Math.min(lightness, 1 - lightness);
  return `hsl(${String(Math.round(hue))}, ${String(Math.round(hslSaturation * 100))}%, ${String(Math.round(Math.max(lightness, 0.55) * 100))}%)`;
}

function warmRed(): number {
  return 255;
}

function warmGreen(temperature: number): number {
  return temperature <= 66
    ? 99.47 * Math.log(temperature) - 161.12
    : 288.12 * (temperature - 60) ** -0.0755;
}

function warmBlue(temperature: number): number {
  if (temperature >= 66) {
    return 255;
  }
  return temperature <= 19 ? 0 : 138.52 * Math.log(temperature - 10) - 305.04;
}

function coolRed(temperature: number): number {
  return 329.7 * (temperature - 60) ** -0.1332;
}

export function kelvinCss(kelvin: number): string | null {
  if (!Number.isFinite(kelvin) || kelvin < 1000) {
    return null;
  }
  const temperature = Math.min(kelvin, 12_000) / 100;
  const red = temperature <= 66 ? warmRed() : coolRed(temperature);
  return `#${channel(red)}${channel(warmGreen(temperature))}${channel(warmBlue(temperature))}`;
}
