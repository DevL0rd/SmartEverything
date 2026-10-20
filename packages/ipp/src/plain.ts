import { isStringValue, type IppAttribute, type IppGroup, type IppValue } from './model';
import { RESOLUTION_UNITS } from './tags';

export type Plain =
  string | number | boolean | null | readonly Plain[] | { readonly [key: string]: Plain };

export type PlainObject = Readonly<Record<string, Plain>>;

const UTF8 = new TextDecoder('utf-8', { fatal: false });

function unitsName(units: number): string {
  return units === RESOLUTION_UNITS.dpcm ? 'dpcm' : 'dpi';
}

function plainValue(value: IppValue): Plain {
  if (isStringValue(value)) return value.value;
  if (value.kind === 'octets') return UTF8.decode(value.value);
  if (value.kind === 'resolution') {
    return { x: value.x, y: value.y, units: unitsName(value.units) };
  }
  if (value.kind === 'range') return { lower: value.lower, upper: value.upper };
  if (value.kind === 'collection') return plainObject(value.members);
  if (value.kind === 'outOfBand') return null;
  return value.value;
}

export function plainObject(attributes: readonly IppAttribute[]): PlainObject {
  return Object.fromEntries(
    attributes.map((attribute) => [
      attribute.name,
      attribute.values.length === 1 && attribute.values[0] !== undefined
        ? plainValue(attribute.values[0])
        : attribute.values.map(plainValue),
    ]),
  );
}

export function plainGroups(groups: readonly IppGroup[], tag: number): readonly PlainObject[] {
  return groups.filter((group) => group.tag === tag).map((group) => plainObject(group.attributes));
}
