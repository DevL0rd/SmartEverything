import { colord } from 'colord';
import type { HsvColor } from './values';

const CHANNEL_MASK = 0xff;
const GREEN_SHIFT = 8;
const RED_SHIFT = 16;

export interface RgbChannels {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export function rgbChannelsToHsv({ r, g, b }: RgbChannels): HsvColor {
  const { h, s, v } = colord({ r, g, b }).toHsv();
  return { hue: h, saturation: s, value: v };
}

export function hsvToRgbChannels(color: HsvColor): RgbChannels {
  const { r, g, b } = colord({ h: color.hue, s: color.saturation, v: color.value }).toRgb();
  return { r, g, b };
}

export function packedRgbToHsv(rgb: number): HsvColor {
  return rgbChannelsToHsv({
    r: (rgb >> RED_SHIFT) & CHANNEL_MASK,
    g: (rgb >> GREEN_SHIFT) & CHANNEL_MASK,
    b: rgb & CHANNEL_MASK,
  });
}

export function hsvToPackedRgb(color: HsvColor): number {
  const { r, g, b } = hsvToRgbChannels(color);
  return (r << RED_SHIFT) | (g << GREEN_SHIFT) | b;
}
