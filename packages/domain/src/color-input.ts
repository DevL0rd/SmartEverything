import { colord, extend } from 'colord';
import names from 'colord/plugins/names';
import { z } from 'zod';
import { rgbChannelsToHsv } from './color';
import { HSV_COLOR, type HsvColor } from './values';

extend([names]);

export const COLOR_INPUT_FORMS =
  'a colour name (red, orange, teal), hex (#ff0000), RGB 0 to 255 as {"r": 255, "g": 0, "b": 0} or "255,0,0", or {"hue": 0 to 360, "saturation": 0 to 100, "value": 0 to 100}';

const MIRED_PER_KELVIN = 1_000_000;
const NUMBER_TEXT = /^-?\d+(?:\.\d+)?$/u;
const KELVIN_TEXT = /^(\d+(?:\.\d+)?)\s*k(?:elvin)?$/iu;
const MIRED_TEXT = /^(\d+(?:\.\d+)?)\s*(?:mireds?|mired)$/iu;
const BARE_HEX = /^[0-9a-f]{6}$/iu;

const CHANNEL = z
  .union([z.number(), z.string().trim().regex(NUMBER_TEXT).transform(Number)])
  .pipe(z.number().int().min(0).max(255));

const LONG_RGB = z.object({ red: CHANNEL, green: CHANNEL, blue: CHANNEL });
const SHORT_RGB = z.object({ r: CHANNEL, g: CHANNEL, b: CHANNEL });
const RGB_LIST = z.tuple([CHANNEL, CHANNEL, CHANNEL]);

function fromRgb(red: number, green: number, blue: number): HsvColor {
  return rgbChannelsToHsv({ r: red, g: green, b: blue });
}

function fromChannels(input: unknown): HsvColor | null {
  const long = LONG_RGB.safeParse(input);
  if (long.success) return fromRgb(long.data.red, long.data.green, long.data.blue);
  const short = SHORT_RGB.safeParse(input);
  if (short.success) return fromRgb(short.data.r, short.data.g, short.data.b);
  const list = RGB_LIST.safeParse(input);
  return list.success ? fromRgb(...list.data) : null;
}

function fromName(text: string): HsvColor | null {
  const compact = text.toLowerCase().replace(/[\s_-]+/gu, '');
  const parsed = colord(BARE_HEX.test(compact) ? `#${compact}` : compact);
  if (!parsed.isValid()) return null;
  const { h, s, v } = parsed.toHsv();
  return { hue: h, saturation: s, value: v };
}

function fromText(text: string): HsvColor | null {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return fromJson(trimmed);
  }
  if (trimmed.includes(',') && !trimmed.includes('(')) {
    return fromChannels(trimmed.split(',').map((part) => part.trim()));
  }
  return fromName(trimmed);
}

function fromJson(text: string): HsvColor | null {
  try {
    return colorFromInput(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

export function colorFromInput(input: unknown): HsvColor | null {
  if (typeof input === 'string') return fromText(input);
  const hsv = HSV_COLOR.safeParse(input);
  return hsv.success ? hsv.data : fromChannels(input);
}

export function kelvinFromText(text: string): number | null {
  const trimmed = text.trim();
  if (NUMBER_TEXT.test(trimmed)) return Number(trimmed);
  const kelvin = KELVIN_TEXT.exec(trimmed)?.[1];
  if (kelvin !== undefined) return Math.round(Number(kelvin));
  const mired = MIRED_TEXT.exec(trimmed)?.[1];
  return mired === undefined || Number(mired) <= 0
    ? null
    : Math.round(MIRED_PER_KELVIN / Number(mired));
}
