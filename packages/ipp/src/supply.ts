import { z } from 'zod';
import {
  keyValues,
  maybeSet,
  numberOf,
  percentOf,
  readSource,
  type DropReporter,
} from './schema-kit';
import type { PlainObject } from './plain';

export type SupplyKind =
  'toner' | 'ink' | 'waste' | 'drum' | 'developer' | 'fuser' | 'transfer' | 'cleaner' | 'other';

export interface Supply {
  readonly name: string;
  readonly kind: SupplyKind;
  readonly consumed: boolean;
  readonly colorant: string | null;
  readonly colour: string | null;
  readonly level: number | null;
  readonly partial: boolean;
  readonly lowLevel: number | null;
}

const PARTIAL_LEVEL = -3;
const COLORANT_WORDS: readonly (readonly [string, string])[] = [
  ['light cyan', 'light-cyan'],
  ['light magenta', 'light-magenta'],
  ['light black', 'light-black'],
  ['light gray', 'light-gray'],
  ['light grey', 'light-gray'],
  ['dark gray', 'dark-gray'],
  ['dark grey', 'dark-gray'],
  ['photo black', 'black'],
  ['matte black', 'black'],
  ['black', 'black'],
  ['cyan', 'cyan'],
  ['magenta', 'magenta'],
  ['yellow', 'yellow'],
  ['gray', 'gray'],
  ['grey', 'gray'],
  ['red', 'red'],
  ['green', 'green'],
  ['blue', 'blue'],
  ['orange', 'orange'],
  ['gold', 'gold'],
  ['silver', 'silver'],
  ['white', 'white'],
];
const SUPPLY_KINDS: readonly (readonly [RegExp, SupplyKind])[] = [
  [/waste/u, 'waste'],
  [/receptacle/u, 'waste'],
  [/toner/u, 'toner'],
  [/ink/u, 'ink'],
  [/opc|drum|imaging/u, 'drum'],
  [/developer/u, 'developer'],
  [/fuser/u, 'fuser'],
  [/transfer/u, 'transfer'],
  [/clean/u, 'cleaner'],
];

export function colorantOf(words: string): string | null {
  const lower = words.toLowerCase().replace(/[-_]+/gu, ' ');
  return COLORANT_WORDS.find(([word]) => lower.includes(word))?.[1] ?? null;
}

export function supplyKindOf(type: string): SupplyKind {
  const lower = type.toLowerCase().replaceAll('-', '').replaceAll('_', '');
  return SUPPLY_KINDS.find(([pattern]) => pattern.test(lower))?.[1] ?? 'other';
}

function colourOf(value: string | undefined): string | null {
  return value !== undefined && /^#[0-9a-f]{6}$/iu.test(value) ? value.toLowerCase() : null;
}

function lookup(pairs: ReadonlyMap<string, string>, key: string): string | null {
  const value = pairs.get(key);
  return value === undefined || value === '' || value === 'unknown' ? null : value;
}

function levelOf(pairs: ReadonlyMap<string, string>): { level: number | null; partial: boolean } {
  const raw = numberOf(pairs, 'level');
  return {
    level: percentOf(raw, numberOf(pairs, 'maxcapacity')),
    partial: raw === PARTIAL_LEVEL,
  };
}

function fromDescription(entry: string, description: string): Supply | null {
  const pairs = keyValues(entry);
  if (!pairs.has('level') && !pairs.has('type')) return null;
  const type = lookup(pairs, 'type') ?? 'other';
  const consumed = (lookup(pairs, 'class') ?? 'supplyThatIsConsumed') !== 'receptacleThatIsFilled';
  const colorantName = lookup(pairs, 'colorantname');
  const name = description === '' ? (colorantName ?? type) : description;
  return {
    name,
    kind: supplyKindOf(type),
    consumed,
    colorant:
      colorantName === null ? colorantOf(name) : (colorantOf(colorantName) ?? colorantOf(name)),
    colour: null,
    ...levelOf(pairs),
    lowLevel: null,
  };
}

export const SUPPLY_SOURCE = z.object({
  'printer-supply': maybeSet(z.string()),
  'printer-supply-description': maybeSet(z.string()),
  'marker-names': maybeSet(z.string()),
  'marker-types': maybeSet(z.string()),
  'marker-levels': maybeSet(z.number()),
  'marker-colors': maybeSet(z.string()),
  'marker-low-levels': maybeSet(z.number()),
  'marker-high-levels': maybeSet(z.number()),
});

function fromMarkers(source: z.output<typeof SUPPLY_SOURCE>): readonly Supply[] {
  return source['marker-names'].map((name, index) => {
    const type = source['marker-types'][index] ?? 'other';
    const kind = supplyKindOf(type);
    const raw = source['marker-levels'][index] ?? -2;
    const high = source['marker-high-levels'][index] ?? 100;
    return {
      name,
      kind,
      consumed: kind !== 'waste',
      colorant: colorantOf(name),
      colour: colourOf(source['marker-colors'][index]),
      level: percentOf(raw, high === 0 ? null : high),
      partial: raw === PARTIAL_LEVEL,
      lowLevel: source['marker-low-levels'][index] ?? null,
    };
  });
}

export function readSupplies(plain: PlainObject, report?: DropReporter): readonly Supply[] {
  const source = readSource(SUPPLY_SOURCE, plain, report);
  const described = source['printer-supply']
    .map((entry, index) =>
      fromDescription(entry, source['printer-supply-description'][index] ?? ''),
    )
    .filter((supply): supply is Supply => supply !== null);
  if (described.length > 0) return withMarkerDetail(described, fromMarkers(source));
  return fromMarkers(source);
}

function withMarkerDetail(
  supplies: readonly Supply[],
  markers: readonly Supply[],
): readonly Supply[] {
  const aligned = markers.length === supplies.length;
  return supplies.map((supply, index) => {
    const marker = aligned ? markers[index] : undefined;
    return marker === undefined
      ? supply
      : {
          ...supply,
          colour: marker.colour,
          lowLevel: marker.lowLevel,
          level: supply.level ?? marker.level,
        };
  });
}
