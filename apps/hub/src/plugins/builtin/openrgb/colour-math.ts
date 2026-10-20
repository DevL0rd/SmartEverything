import { hsvToRgbChannels, rgbChannelsToHsv } from '@smarteverything/domain';

export interface Rgb {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

export interface Look {
  readonly hue: number;
  readonly saturation: number;
  readonly brightness: number;
}

export const BLACK: Rgb = { red: 0, green: 0, blue: 0 };

export const DEFAULT_LOOK: Look = { hue: 0, saturation: 0, brightness: 100 };

const LOWEST_BRIGHTNESS = 1;

export function rgbOfLook(look: Look): Rgb {
  const { r, g, b } = hsvToRgbChannels({
    hue: look.hue,
    saturation: look.saturation,
    value: look.brightness,
  });
  return { red: r, green: g, blue: b };
}

export function isBlack(colour: Rgb): boolean {
  return colour.red === 0 && colour.green === 0 && colour.blue === 0;
}

export function lookOfRgb(colour: Rgb): Look {
  const { hue, saturation, value } = rgbChannelsToHsv({
    r: colour.red,
    g: colour.green,
    b: colour.blue,
  });
  return {
    hue: Math.round(hue),
    saturation: Math.round(saturation),
    brightness: Math.max(LOWEST_BRIGHTNESS, Math.round(value)),
  };
}

export function filled(colour: Rgb, count: number): readonly Rgb[] {
  return Array.from({ length: count }, () => colour);
}
