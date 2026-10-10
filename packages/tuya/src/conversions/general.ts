import { z } from 'zod';
import {
  ConversionError,
  base64Bytes,
  decimal,
  textOf,
  type ConversionConfig,
  type Converter,
} from './primitives';

function byteAt(name: string, bytes: Uint8Array, index: number): number {
  const value = bytes[index];
  if (value === undefined) {
    throw new ConversionError(name, `the timer record ends before byte ${String(index)}`);
  }
  return value;
}

function weekDays(mask: number): readonly number[] {
  const days: number[] = [];
  for (let bit = 0; 2 ** bit <= mask; bit += 1) {
    if (Math.floor(mask / 2 ** bit) % 2 === 1) {
      days.push(bit);
    }
  }
  return days;
}

function clock(high: number, low: number): string {
  const minutes = high * 256 + low;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function timerRecord(name: string, bytes: Uint8Array, at: number, long: boolean): object {
  const byte = (offset: number): number => byteAt(name, bytes, at + offset);
  const record = {
    timer_switch: byte(0) > 0,
    week_day: weekDays(byte(1)),
    start_time: clock(byte(2), byte(3)),
    end_time: clock(byte(4), byte(5)),
  };
  return long
    ? { ...record, open_time: clock(byte(6), byte(7)), close_time: clock(byte(8), byte(9)) }
    : record;
}

function timers(name: string, long: boolean): Converter {
  const width = long ? 10 : 6;
  return (raw) => {
    const bytes = base64Bytes(name, raw);
    const records: object[] = [];
    for (let at = 0; at < bytes.length; at += width) {
      records.push(timerRecord(name, bytes, at, long));
    }
    return JSON.stringify(records);
  };
}

const unlockMethods: Converter = (raw) => {
  if (raw === '') {
    return [];
  }
  const indexes = new Set<number>();
  try {
    const bytes = base64Bytes('ms_dp_syn_alg', raw);
    for (let index = 0; index < bytes.length; index += 2) {
      const partition = byteAt('ms_dp_syn_alg', bytes, index) & 0x7f;
      const value = byteAt('ms_dp_syn_alg', bytes, index + 1);
      for (let bit = 0; bit < 8; bit += 1) {
        if ((value & (1 << bit)) !== 0) {
          indexes.add((partition - 1) * 8 + bit);
        }
      }
    }
  } catch (cause) {
    if (!(cause instanceof ConversionError)) {
      throw cause;
    }
    return [];
  }
  return [...indexes].sort((left, right) => left - right);
};

function cleanRecord(text: string): object {
  const number = (start: number, end: number): number =>
    decimal('sd_clean_record', text.slice(start, end));
  switch (text.length) {
    case 6:
      return { record_time: '', clean_time: number(0, 3), clean_area: number(3, 6), map_id: '' };
    case 11:
      return {
        record_time: '',
        clean_time: number(0, 3),
        clean_area: number(3, 6),
        map_id: text.slice(6, 11),
      };
    case 18:
      return {
        record_time: text.slice(0, 12),
        clean_time: number(12, 15),
        clean_area: number(15, 18),
        map_id: '',
      };
    default:
      return {
        record_time: text.slice(0, 12),
        clean_time: number(12, 15),
        clean_area: number(15, 18),
        map_id: text.slice(18, 23),
      };
  }
}

const cleaning: Converter = (raw) => JSON.stringify(cleanRecord(textOf('sd_clean_record', raw)));

const VALUE_DESCRIPTION = z.object({
  min: z.unknown().optional(),
  range: z.array(z.unknown()).optional(),
});

function capitalised(text: string): string {
  return `${text.slice(0, 1).toUpperCase()}${text.slice(1).toLowerCase()}`;
}

function description(config: ConversionConfig): z.output<typeof VALUE_DESCRIPTION> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(config.valueDesc);
  } catch (cause) {
    throw new ConversionError('default', `valueDesc is not JSON (${String(cause)})`);
  }
  const read = VALUE_DESCRIPTION.safeParse(parsed);
  if (!read.success) {
    throw new ConversionError('default', 'valueDesc is not an object');
  }
  return read.data;
}

function emptyValue(config: ConversionConfig): unknown {
  switch (capitalised(config.valueType)) {
    case 'Boolean':
      return false;
    case 'Integer':
      return description(config).min ?? null;
    case 'Enum': {
      const range = description(config).range;
      if (range === undefined || range.length === 0) {
        throw new ConversionError('default', 'valueDesc has no enum range');
      }
      return range[0];
    }
    default:
      return '';
  }
}

const identity: Converter = (raw, config) =>
  raw !== null && raw !== undefined && raw !== '' ? raw : emptyValue(config);

function pythonText(raw: unknown): string {
  if (raw === null || raw === undefined) {
    return 'None';
  }
  if (typeof raw === 'boolean') {
    return raw ? 'True' : 'False';
  }
  return typeof raw === 'string' ? raw : JSON.stringify(raw);
}

function mappedValue(
  mappings: NonNullable<ConversionConfig['enumMappings']>,
  key: string,
): { readonly value: unknown } | null {
  const mapping = Object.hasOwn(mappings, key) ? mappings[key] : undefined;
  return mapping !== undefined && Object.hasOwn(mapping, 'value') ? { value: mapping.value } : null;
}

const enumeration: Converter = (raw, config) => {
  const mappings = config.enumMappings;
  if (mappings === null) {
    throw new ConversionError('enum', 'Tuya published no enum mapping for the data point');
  }
  const key = pythonText(raw);
  const mapped = mappedValue(mappings, key) ?? mappedValue(mappings, key.toLowerCase());
  return mapped === null ? emptyValue(config) : mapped.value;
};

export const NULL_PRESERVING_GENERAL: Readonly<Record<string, Converter>> = {
  cz_timer1_alg: timers('cz_timer1_alg', false),
  cz_timer2_alg: timers('cz_timer2_alg', true),
  ms_dp_syn_alg: unlockMethods,
  sd_clean_record: cleaning,
};

export const NULL_HANDLING_GENERAL: Readonly<Record<string, Converter>> = {
  default: identity,
  enum: enumeration,
};
