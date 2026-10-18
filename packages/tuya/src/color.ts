import { z } from 'zod';
import { hsvToPackedRgb, type HsvColor, type JsonValue } from '@smarteverything/domain';

export type ColorVersion = 'v1' | 'v2';

export type Transport = 'local' | 'cloud';

const COMPONENT_MAX: Readonly<Record<ColorVersion, number>> = { v1: 255, v2: 1000 };

const CLOUD_COLOR = z.object({
  h: z.number().min(0).max(360),
  s: z.number().min(0),
  v: z.number().min(0),
});

const HEX_V2 = /^[0-9a-f]{12}$/i;

const HEX_V1 = /^[0-9a-f]{14}$/i;

export class ColorValueError extends Error {
  override readonly name = 'ColorValueError';

  constructor(
    readonly version: ColorVersion,
    readonly received: unknown,
  ) {
    super(
      `Expected a Tuya ${version} colour as {h,s,v} or ${version === 'v1' ? '14' : '12'} hex digits. Received ${JSON.stringify(received)}.`,
    );
  }
}

function percent(component: number, max: number): number {
  return Math.round((component * 1000) / max) / 10;
}

function component(value: number, max: number): number {
  return Math.round((value / 100) * max);
}

interface Components {
  readonly h: number;
  readonly s: number;
  readonly v: number;
}

function hsv(version: ColorVersion, { h, s, v }: Components, raw: unknown): HsvColor {
  const max = COMPONENT_MAX[version];
  if (h > 360 || s > max || v > max) {
    throw new ColorValueError(version, raw);
  }
  return { hue: h, saturation: percent(s, max), value: percent(v, max) };
}

function hexField(text: string, start: number, end: number): number {
  return Number.parseInt(text.slice(start, end), 16);
}

function fromJsonText(version: ColorVersion, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new ColorValueError(version, `${text} (${String(cause)})`);
  }
}

function fromHex(version: ColorVersion, text: string): HsvColor {
  if (version === 'v2' && HEX_V2.test(text)) {
    return hsv(
      version,
      { h: hexField(text, 0, 4), s: hexField(text, 4, 8), v: hexField(text, 8, 12) },
      text,
    );
  }
  if (version === 'v1' && HEX_V1.test(text)) {
    return hsv(
      version,
      { h: hexField(text, 6, 10), s: hexField(text, 10, 12), v: hexField(text, 12, 14) },
      text,
    );
  }
  throw new ColorValueError(version, text);
}

export function decodeColor(version: ColorVersion, raw: unknown): HsvColor {
  const candidate =
    typeof raw === 'string' && raw.startsWith('{') ? fromJsonText(version, raw) : raw;
  if (typeof candidate === 'string') {
    return fromHex(version, candidate);
  }
  const parsed = CLOUD_COLOR.safeParse(candidate);
  if (!parsed.success) {
    throw new ColorValueError(version, raw);
  }
  return hsv(version, parsed.data, raw);
}

function hex(value: number, digits: number): string {
  return value.toString(16).padStart(digits, '0');
}

export function encodeColor(
  version: ColorVersion,
  color: HsvColor,
  transport: Transport,
): JsonValue {
  const max = COMPONENT_MAX[version];
  const h = Math.round(color.hue);
  const s = component(color.saturation, max);
  const v = component(color.value, max);
  if (transport === 'cloud') {
    return { h, s, v };
  }
  if (version === 'v2') {
    return `${hex(h, 4)}${hex(s, 4)}${hex(v, 4)}`;
  }
  return `${hex(hsvToPackedRgb(color), 6)}${hex(h, 4)}${hex(s, 2)}${hex(v, 2)}`;
}
