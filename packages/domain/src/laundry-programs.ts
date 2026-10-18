import { z } from 'zod';

export const LAUNDRY_PROGRAM_GROUPS = ['Everyday', 'Fabric', 'Care', 'Drying', 'Machine'] as const;

export type LaundryProgramGroup = (typeof LAUNDRY_PROGRAM_GROUPS)[number];

export const LAUNDRY_PROGRAM_ICONS = [
  'leaf',
  'sparkle',
  'layers',
  'shirt',
  'bolt',
  'snowflake',
  'thermometer',
  'wind',
  'drop',
  'spin',
  'sun',
  'heart',
  'jacket',
  'shoe',
  'drum',
  'shield',
  'flower',
  'sliders',
] as const;

export type LaundryProgramIcon = (typeof LAUNDRY_PROGRAM_ICONS)[number];

export const LAUNDRY_OPTIONS = [
  'temperature',
  'spin',
  'rinses',
  'soak',
  'washMinutes',
  'dryMode',
  'dryMinutes',
  'dryTarget',
  'steam',
  'extraWater',
  'quiet',
  'antiCrease',
] as const;

export type LaundryOption = (typeof LAUNDRY_OPTIONS)[number];

export interface LaundryProgram {
  readonly id: number;
  readonly raw: string;
  readonly label: string;
  readonly group: LaundryProgramGroup;
  readonly icon: LaundryProgramIcon;
  readonly washes: boolean;
  readonly rinses: boolean;
  readonly spins: boolean;
  readonly dries: boolean;
}

type ProgramRow = readonly [
  id: number,
  raw: string,
  label: string,
  group: LaundryProgramGroup,
  icon: LaundryProgramIcon,
  flags: string,
];

function program([id, raw, label, group, icon, flags]: ProgramRow): LaundryProgram {
  return {
    id,
    raw,
    label,
    group,
    icon,
    washes: flags.includes('w'),
    rinses: flags.includes('r'),
    spins: flags.includes('s'),
    dries: flags.includes('d'),
  };
}

const PROGRAM_ROWS: readonly ProgramRow[] = [
  [71, 'ECO4060', 'Eco 40-60', 'Everyday', 'leaf', 'wrs'],
  [24, 'Smart', 'Smart', 'Everyday', 'sparkle', 'wrs'],
  [1, 'Mix', 'Mixed', 'Everyday', 'layers', 'wrs'],
  [18, 'Cotton', 'Cotton', 'Everyday', 'shirt', 'wrs'],
  [19, 'Synthetic', 'Synthetic', 'Everyday', 'shirt', 'wrs'],
  [3, 'Quick Wash', 'Quick', 'Everyday', 'bolt', 'wrs'],
  [73, '20 Degree', '20 °C', 'Everyday', 'snowflake', 'wrs'],
  [30, 'Cold Wash', 'Cold', 'Everyday', 'snowflake', 'wrs'],
  [11, 'Intensive', 'Intensive', 'Everyday', 'drop', 'wrs'],
  [5, 'Heavy Wash', 'Heavy', 'Everyday', 'drop', 'wrs'],
  [4, 'Delicate Wash', 'Delicate', 'Fabric', 'heart', 'wrs'],
  [15, 'Wool', 'Wool', 'Fabric', 'heart', 'wrs'],
  [28, 'Silk', 'Silk', 'Fabric', 'heart', 'wrs'],
  [29, 'Jeans', 'Jeans', 'Fabric', 'shirt', 'wrs'],
  [23, 'Shirt', 'Shirts', 'Fabric', 'shirt', 'wrs'],
  [25, 'Sportswear', 'Sportswear', 'Fabric', 'bolt', 'wrs'],
  [16, 'Down Coat', 'Down coat', 'Fabric', 'jacket', 'wrs'],
  [22, 'Jacket', 'Jacket', 'Fabric', 'jacket', 'wrs'],
  [20, 'Underwear', 'Underwear', 'Fabric', 'heart', 'wrs'],
  [12, 'Baby Care', 'Baby care', 'Fabric', 'heart', 'wrs'],
  [27, 'New-Clothes Wash', 'New clothes', 'Fabric', 'sparkle', 'wrs'],
  [70, 'Turban', 'Headwear', 'Fabric', 'shirt', 'wrs'],
  [72, 'Shoe', 'Shoes', 'Fabric', 'shoe', 'wrs'],
  [62, 'Bacteria Mite Removal', 'Hygiene (anti-allergen)', 'Care', 'shield', 'wrs'],
  [21, 'Boiling', 'Boil wash 90 °C', 'Care', 'thermometer', 'wrs'],
  [57, 'Aromatherapy Wash', 'Aromatherapy', 'Care', 'flower', 'wrs'],
  [17, 'Dry Air Wash', 'Air refresh', 'Care', 'wind', 'd'],
  [68, 'Wash Dry', 'Wash & dry', 'Drying', 'sun', 'wrsd'],
  [58, 'Pleased Wash Dry', 'Gentle wash & dry', 'Drying', 'sun', 'wrsd'],
  [8, 'Dry', 'Dry', 'Drying', 'sun', 'd'],
  [6, 'Rinse Spin', 'Rinse & spin', 'Machine', 'drop', 'rs'],
  [7, 'Spin', 'Spin', 'Machine', 'spin', 's'],
  [13, 'Drum Clean', 'Drum clean', 'Machine', 'drum', ''],
  [10, 'User Define', 'My program', 'Machine', 'sliders', 'wrsd'],
];

export const LAUNDRY_PROGRAMS: readonly LaundryProgram[] = PROGRAM_ROWS.map(program);

const BY_ID: ReadonlyMap<number, LaundryProgram> = new Map(
  LAUNDRY_PROGRAMS.map((entry) => [entry.id, entry]),
);

const BY_RAW: ReadonlyMap<string, LaundryProgram> = new Map(
  LAUNDRY_PROGRAMS.map((entry) => [entry.raw, entry]),
);

export const DRUM_CLEAN_PROGRAM_ID = 13;

export const CUSTOM_PROGRAM_ID = 10;

export function laundryProgramById(id: number): LaundryProgram | undefined {
  return BY_ID.get(id);
}

export function laundryProgramByRaw(raw: string): LaundryProgram | undefined {
  return BY_RAW.get(raw);
}

export function laundryProgramOptions(entry: LaundryProgram): readonly LaundryOption[] {
  if (entry.id === DRUM_CLEAN_PROGRAM_ID) {
    return [];
  }
  const hasCycle = entry.washes || entry.dries;
  const options: readonly (readonly [boolean, readonly LaundryOption[]])[] = [
    [entry.washes, ['temperature', 'soak', 'steam', 'extraWater']],
    [entry.id === CUSTOM_PROGRAM_ID, ['washMinutes']],
    [entry.washes || entry.rinses, ['rinses']],
    [entry.spins, ['spin']],
    [entry.dries, ['dryMode', 'dryMinutes', 'dryTarget']],
    [true, ['quiet']],
    [hasCycle, ['antiCrease']],
  ];
  return options.flatMap(([shown, keys]) => (shown ? keys : []));
}

const DIAL_HEX = z
  .string()
  .regex(/^(?:[0-9a-f]{2})+$/i)
  .transform((hex) => Array.from(hex.matchAll(/../g), (pair) => Number.parseInt(pair[0], 16)));

const CHECKSUM_MODULUS = 256;

export function dialPrograms(hex: unknown): readonly LaundryProgram[] {
  const parsed = DIAL_HEX.safeParse(hex);
  if (!parsed.success) {
    return [];
  }
  const bytes = parsed.data;
  const count = bytes[0];
  const check = bytes.at(-1);
  if (count === undefined || check === undefined || bytes.length !== count + 2) {
    return [];
  }
  const body = bytes.slice(0, -1);
  const sum = body.reduce((total, byte) => total + byte, 0) % CHECKSUM_MODULUS;
  if (sum !== check) {
    return [];
  }
  const ids = body.slice(1);
  const entries = ids.flatMap((id) => BY_ID.get(id) ?? []);
  return entries.length === ids.length ? entries : [];
}
