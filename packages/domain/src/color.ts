import type { HsvColor } from './values';

const CHANNEL_MAX = 255;
const SECTOR_DEGREES = 60;
const PERCENT = 100;

function channels(rgb: number): readonly [number, number, number] {
  return [(rgb >> 16) & CHANNEL_MAX, (rgb >> 8) & CHANNEL_MAX, rgb & CHANNEL_MAX];
}

function hueOf(
  [red, green, blue]: readonly [number, number, number],
  max: number,
  delta: number,
): number {
  if (delta === 0) {
    return 0;
  }
  if (max === red) {
    return (SECTOR_DEGREES * ((green - blue) / delta) + 360) % 360;
  }
  if (max === green) {
    return SECTOR_DEGREES * ((blue - red) / delta + 2);
  }
  return SECTOR_DEGREES * ((red - green) / delta + 4);
}

export function packedRgbToHsv(rgb: number): HsvColor {
  const [red, green, blue] = channels(rgb);
  const max = Math.max(red, green, blue);
  const delta = max - Math.min(red, green, blue);
  return {
    hue: Math.round(hueOf([red, green, blue], max, delta)),
    saturation: max === 0 ? 0 : Math.round((delta / max) * PERCENT),
    value: Math.round((max / CHANNEL_MAX) * PERCENT),
  };
}

function channel(color: HsvColor, offset: number): number {
  const sector = (offset + color.hue / SECTOR_DEGREES) % 6;
  const weight = Math.max(0, Math.min(sector, 4 - sector, 1));
  const value = color.value / PERCENT;
  const saturation = color.saturation / PERCENT;
  return Math.round((value - value * saturation * weight) * CHANNEL_MAX);
}

export function hsvToPackedRgb(color: HsvColor): number {
  return (channel(color, 5) << 16) | (channel(color, 3) << 8) | channel(color, 1);
}
