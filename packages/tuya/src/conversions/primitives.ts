export class ConversionError extends Error {
  override readonly name = 'ConversionError';

  constructor(
    readonly conversion: string,
    readonly reason: string,
  ) {
    super(`The Tuya value conversion "${conversion}" could not read the data point: ${reason}.`);
  }
}

export interface ConversionConfig {
  readonly code: string;
  readonly valueType: string;
  readonly valueDesc: string;
  readonly enumMappings: Readonly<Record<string, { readonly value?: unknown }>> | null;
}

export type Converter = (raw: unknown, config: ConversionConfig) => unknown;

const HEX = /^[0-9a-f]+$/i;

const DECIMAL = /^[+-]?\d+$/;

export function textOf(conversion: string, raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new ConversionError(conversion, `expected text, received ${JSON.stringify(raw)}`);
  }
  return raw;
}

export function strictHex(conversion: string, hex: string): number {
  if (!HEX.test(hex)) {
    throw new ConversionError(conversion, `"${hex}" is not hexadecimal`);
  }
  return Number.parseInt(hex, 16);
}

export function lenientHex(conversion: string, hex: string): number {
  const trimmed = hex.replace(/^0+/, '');
  return trimmed === '' ? 0 : strictHex(conversion, trimmed);
}

export function decimal(conversion: string, text: string): number {
  if (!DECIMAL.test(text.trim())) {
    throw new ConversionError(conversion, `"${text}" is not a whole number`);
  }
  return Number.parseInt(text, 10);
}

export function base64Bytes(conversion: string, raw: unknown): Uint8Array {
  try {
    return Uint8Array.fromBase64(textOf(conversion, raw));
  } catch (cause) {
    if (cause instanceof ConversionError) {
      throw cause;
    }
    throw new ConversionError(conversion, `the value is not base64 (${String(cause)})`);
  }
}

export function base64Hex(conversion: string, raw: unknown): string {
  return base64Bytes(conversion, raw).toHex();
}

export function chunks(text: string, width: number): readonly string[] {
  const parts: string[] = [];
  for (let start = 0; start < text.length; start += width) {
    parts.push(text.slice(start, start + width));
  }
  return parts;
}

export function pythonRound(value: number, digits: number): number {
  const factor = 10 ** digits;
  const scaled = value * factor;
  const floor = Math.floor(scaled);
  if (scaled - floor === 0.5) {
    return (floor % 2 === 0 ? floor : floor + 1) / factor;
  }
  return Number(value.toFixed(digits));
}

function pythonModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

export type Triple = readonly [number, number, number];

export function rgbToHsv(red: number, green: number, blue: number): Triple {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  if (max === min) {
    return [0, 0, max];
  }
  const range = max - min;
  const rc = (max - red) / range;
  const gc = (max - green) / range;
  const bc = (max - blue) / range;
  let hue: number;
  if (red === max) {
    hue = bc - gc;
  } else if (green === max) {
    hue = 2 + rc - bc;
  } else {
    hue = 4 + gc - rc;
  }
  return [pythonModulo(hue / 6, 1), range / max, max];
}

export function hsvToRgb(hue: number, saturation: number, value: number): Triple {
  if (saturation === 0) {
    return [value, value, value];
  }
  const sector = Math.trunc(hue * 6);
  const fraction = hue * 6 - sector;
  const p = value * (1 - saturation);
  const q = value * (1 - saturation * fraction);
  const t = value * (1 - saturation * (1 - fraction));
  switch (pythonModulo(sector, 6)) {
    case 0:
      return [value, t, p];
    case 1:
      return [q, value, p];
    case 2:
      return [p, value, t];
    case 3:
      return [p, q, value];
    case 4:
      return [t, p, value];
    default:
      return [value, p, q];
  }
}
