import { z } from 'zod';
import { fit, readJson } from './json';

export const IR_CODE_FORMATS = ['pulses', 'head_key', 'library'] as const;

export type IrCodeFormat = (typeof IR_CODE_FORMATS)[number];

export const IR_CODE = z.object({ format: z.enum(IR_CODE_FORMATS), code: z.string().min(1) });

export type IrCode = z.output<typeof IR_CODE>;

export const HEAD_KEY = z.object({
  head: z.string().regex(/^(?:[0-9a-f]{2}){9,}$/i),
  key: z.string().regex(/^[0-9a-f]{2}.{2}/is),
});

export type HeadKey = z.output<typeof HEAD_KEY>;

export const LIBRARY_KEY = z.object({
  remoteId: z.string().min(1),
  categoryId: z.number().int(),
  keyId: z.number().int(),
  key: z.string().min(1),
});

export type LibraryKey = z.output<typeof LIBRARY_KEY>;

export const MAX_PULSE_MICROSECONDS = 0xffff;

const TIMING_SYMBOLS = '@#$%^&*()QWRLTXKVNM{}[]JUP<>|=HS~';

const LEADING_HEX = /^[0-9a-f]+/i;

const TYPE_1_TIMINGS = z.tuple([z.number(), z.number()]).rest(z.number());

const TYPE_2_TIMINGS = z.tuple([z.number(), z.number(), z.number()]).rest(z.number());

export class IrCodeError extends Error {
  override readonly name = 'IrCodeError';

  constructor(
    readonly format: IrCodeFormat,
    readonly reason: string,
  ) {
    super(`The ${format} IR code is not valid: ${reason}.`);
  }
}

function pulsesOfBytes(bytes: Uint8Array): readonly number[] {
  if (bytes.length === 0 || bytes.length % 2 !== 0) {
    throw new IrCodeError(
      'pulses',
      `it holds ${String(bytes.length)} bytes, not a whole number of pulses`,
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: bytes.length / 2 }, (_, index) => view.getUint16(index * 2, true));
}

function bytesOfPulses(pulses: readonly number[]): Uint8Array {
  const bad = pulses.find(
    (pulse) => !Number.isInteger(pulse) || pulse < 1 || pulse > MAX_PULSE_MICROSECONDS,
  );
  if (pulses.length === 0 || bad !== undefined) {
    throw new IrCodeError(
      'pulses',
      `pulse lengths must be 1 to ${String(MAX_PULSE_MICROSECONDS)} microseconds, received ${JSON.stringify(pulses)}`,
    );
  }
  const bytes = new Uint8Array(pulses.length * 2);
  const view = new DataView(bytes.buffer);
  pulses.forEach((pulse, index) => {
    view.setUint16(index * 2, pulse, true);
  });
  return bytes;
}

export function pulsesFromBase64(text: string): readonly number[] {
  const body = text.length % 4 === 1 && text.startsWith('1') ? text.slice(1) : text;
  try {
    return pulsesOfBytes(Uint8Array.fromBase64(body));
  } catch (error) {
    if (error instanceof IrCodeError) {
      throw error;
    }
    throw new IrCodeError('pulses', `it is not base64 (${String(error)})`);
  }
}

export function pulsesToBase64(pulses: readonly number[]): string {
  return bytesOfPulses(pulses).toBase64();
}

export function pulsesFromHex(text: string): readonly number[] {
  if (!/^(?:[0-9a-f]{4})+$/i.test(text)) {
    throw new IrCodeError('pulses', 'a hex pulse train is a non-empty run of 4-digit groups');
  }
  return pulsesOfBytes(Uint8Array.fromHex(text));
}

export function pulsesToHex(pulses: readonly number[]): string {
  return bytesOfPulses(pulses).toHex();
}

interface HeadTimings {
  readonly kind: 1 | 2;
  readonly symbols: ReadonlyMap<string, number>;
}

function headTimings(head: string): HeadTimings {
  const bytes = Uint8Array.fromHex(head);
  const view = new DataView(bytes.buffer);
  const kind = view.getUint8(0);
  const timescale = view.getUint16(1);
  const count = view.getUint16(7);
  if (kind !== 1 && kind !== 2) {
    throw new IrCodeError('head_key', `head type ${String(kind)} is neither 1 nor 2`);
  }
  if (timescale === 0 || count > TIMING_SYMBOLS.length || bytes.length !== 9 + count * 2) {
    throw new IrCodeError(
      'head_key',
      `the head does not hold ${String(count)} timings at a known rate`,
    );
  }
  const unit = 100000 / timescale;
  const symbols = new Map(
    Array.from({ length: count }, (_, index): [string, number] => [
      TIMING_SYMBOLS.charAt(index),
      Math.round(unit * view.getUint16(9 + index * 2)),
    ]),
  );
  return { kind, symbols };
}

function leadingSymbols(key: string, symbols: ReadonlyMap<string, number>): readonly number[] {
  const pulses: number[] = [];
  for (const symbol of key) {
    const pulse = symbols.get(symbol);
    if (pulse === undefined) {
      return pulses;
    }
    pulses.push(pulse);
  }
  return pulses;
}

function leadingHex(key: string): string {
  return key.slice(0, key.length - key.replace(LEADING_HEX, '').length);
}

interface BitRun {
  readonly bits: string;
  readonly consumed: number;
}

function bitRun(key: string): BitRun {
  if (!/^[0-9a-f]{4}/i.test(key)) {
    throw new IrCodeError('head_key', `expected a 4-digit bit field header at "${key}"`);
  }
  const leading = Number.parseInt(key.slice(0, 2), 16);
  const rest = key.slice(4);
  const data =
    leading === 0
      ? rest.slice(0, Math.ceil(Number.parseInt(key.slice(2, 4), 16) / 8) * 2)
      : leadingHex(rest);
  const count = leading === 0 ? Number.parseInt(key.slice(2, 4), 16) : data.length * 4;
  if (!/^[0-9a-f]*$/i.test(data) || data.length * 4 < count) {
    throw new IrCodeError(
      'head_key',
      `the bit field "${data}" is shorter than ${String(count)} bits`,
    );
  }
  const padded = data.length % 2 === 0 ? data : `${data}0`;
  const bits = Array.from(Uint8Array.fromHex(padded), (byte) => byte.toString(2).padStart(8, '0'))
    .join('')
    .slice(0, count);
  return { bits, consumed: 4 + data.length };
}

interface BitPulses {
  readonly zero: readonly number[];
  readonly one: readonly number[];
}

function bitPulses(timings: HeadTimings): BitPulses {
  const values = Array.from(timings.symbols.values());
  const problem = `a type ${String(timings.kind)} head must define the timings its bits use`;
  if (timings.kind === 1) {
    const parsed = TYPE_1_TIMINGS.safeParse(values);
    if (!parsed.success) {
      throw new IrCodeError('head_key', problem);
    }
    const [start, second] = parsed.data;
    return { zero: [start, start], one: [start, second] };
  }
  const parsed = TYPE_2_TIMINGS.safeParse(values);
  if (!parsed.success) {
    throw new IrCodeError('head_key', problem);
  }
  const [start, second, third] = parsed.data;
  return { zero: [start, second], one: [start, third] };
}

function expandKey(key: string, timings: HeadTimings): readonly number[] {
  const bits = bitPulses(timings);
  let remaining = key;
  const pulses: number[] = [];
  while (remaining.length > 0) {
    const leading = leadingSymbols(remaining, timings.symbols);
    pulses.push(...leading);
    remaining = remaining.slice(leading.length);
    if (remaining.length > 0) {
      const run = bitRun(remaining);
      pulses.push(...Array.from(run.bits).flatMap((bit) => (bit === '1' ? bits.one : bits.zero)));
      remaining = remaining.slice(run.consumed);
    }
  }
  return pulses;
}

export function headKeyToPulses(code: HeadKey): readonly number[] {
  const pulses = expandKey(code.key.slice(2), headTimings(code.head));
  if (pulses.length === 0) {
    throw new IrCodeError('head_key', 'the key holds no pulses');
  }
  return pulses;
}

function parsedJson<S extends z.ZodType>(
  format: IrCodeFormat,
  schema: S,
  text: string,
): z.output<S> {
  const reject = (reason: string): IrCodeError => new IrCodeError(format, reason);
  return fit(schema, readJson(text, 'text', reject), 'text', reject);
}

export function parseHeadKey(text: string): HeadKey {
  return parsedJson('head_key', HEAD_KEY, text);
}

export function parseLibraryKey(text: string): LibraryKey {
  return parsedJson('library', LIBRARY_KEY, text);
}

export function canonicalIrCode(code: IrCode): IrCode {
  switch (code.format) {
    case 'pulses':
      return { format: 'pulses', code: pulsesToBase64(pulsesFromBase64(code.code)) };
    case 'head_key': {
      const headKey = parseHeadKey(code.code);
      headKeyToPulses(headKey);
      return { format: 'head_key', code: JSON.stringify({ head: headKey.head, key: headKey.key }) };
    }
    case 'library':
      return { format: 'library', code: JSON.stringify(parseLibraryKey(code.code)) };
  }
}

export function learnedCodeFromHex(hex: string): IrCode {
  return { format: 'pulses', code: pulsesToBase64(pulsesFromHex(hex)) };
}
