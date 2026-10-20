import { z } from 'zod';
import type { PlainObject } from './plain';
import {
  keyValues,
  maybeSet,
  numberOf,
  percentOf,
  readSource,
  type DropReporter,
} from './schema-kit';

export interface Tray {
  readonly name: string;
  readonly type: string | null;
  readonly level: number | null;
  readonly partial: boolean;
  readonly capacity: number | null;
  readonly ok: boolean;
  readonly mediaName: string | null;
  readonly mediaType: string | null;
}

const PARTIAL_LEVEL = -3;
const TRAYS = z.object({
  'printer-input-tray': maybeSet(z.string()),
  'printer-output-tray': maybeSet(z.string()),
});

function lookup(pairs: ReadonlyMap<string, string>, key: string): string | null {
  const value = pairs.get(key);
  return value === undefined || value === '' ? null : value;
}

function trayOf(entry: string, levelKey: 'level' | 'remaining', index: number): Tray {
  const pairs = keyValues(entry);
  const raw = numberOf(pairs, levelKey);
  const capacity = numberOf(pairs, 'maxcapacity');
  return {
    name: lookup(pairs, 'name') ?? `tray ${String(index + 1)}`,
    type: lookup(pairs, 'type'),
    level: percentOf(raw, capacity),
    partial: raw === PARTIAL_LEVEL,
    capacity: capacity !== null && capacity > 0 ? capacity : null,
    ok: (numberOf(pairs, 'status') ?? 0) === 0,
    mediaName: lookup(pairs, 'medianame'),
    mediaType: lookup(pairs, 'mediatype'),
  };
}

export function readTrays(
  plain: PlainObject,
  report?: DropReporter,
): {
  readonly input: readonly Tray[];
  readonly output: readonly Tray[];
} {
  const source = readSource(TRAYS, plain, report);
  return {
    input: source['printer-input-tray'].map((entry, index) => trayOf(entry, 'level', index)),
    output: source['printer-output-tray'].map((entry, index) => trayOf(entry, 'remaining', index)),
  };
}
