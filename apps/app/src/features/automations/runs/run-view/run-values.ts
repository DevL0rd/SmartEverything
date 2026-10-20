import type { Activation, Preview } from './run-activation';

const DECIMALS = 100;
const CUT = '…';

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

export function valueText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(Math.round(value * DECIMALS) / DECIMALS);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return plural(value.length, 'item', 'items');
  if (typeof value === 'object') return plural(Object.keys(value).length, 'field', 'fields');
  return undefined;
}

function headline(preview: Preview): unknown {
  if ('value' in preview) return preview['value'];
  return Object.values(preview)[0];
}

export function previewText(activation: Activation): string | undefined {
  if (activation.preview === null) return undefined;
  const text = valueText(headline(activation.preview));
  if (text === undefined) return undefined;
  return activation.truncated ? `${text}${CUT}` : text;
}

export interface MemoryLine {
  readonly label: string;
  readonly value: string;
}

export function memoryLines(activation: Activation | null): readonly MemoryLine[] {
  const memory = activation?.preview?.['memory'];
  if (memory === undefined || memory === null) return [];
  if (typeof memory !== 'object' || Array.isArray(memory)) {
    const value = valueText(memory);
    return value === undefined ? [] : [{ label: 'Holds', value }];
  }
  return Object.entries(memory).flatMap(([label, value]) => {
    const text = valueText(value);
    return text === undefined ? [] : [{ label, value: text }];
  });
}
