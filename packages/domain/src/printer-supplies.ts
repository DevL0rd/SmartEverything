import { z } from 'zod';

export const PRINTER_SUPPLY_SLOTS = [
  'black',
  'cyan',
  'magenta',
  'yellow',
  'light-cyan',
  'light-magenta',
  'light-black',
  'gray',
  'light-gray',
  'dark-gray',
  'red',
  'green',
  'blue',
  'orange',
  'gold',
  'silver',
  'white',
  'multi-color',
  'waste',
  'drum',
  'fuser',
  'transfer',
  'developer',
  'cleaner',
  'other',
] as const;

export type PrinterSupplySlot = (typeof PRINTER_SUPPLY_SLOTS)[number];

export const PRINTER_SUPPLY_SLOT = z.enum(PRINTER_SUPPLY_SLOTS);

export const PRINTER_SUPPLY_KINDS = [
  'toner',
  'ink',
  'waste',
  'drum',
  'developer',
  'fuser',
  'transfer',
  'cleaner',
  'other',
] as const;

export type PrinterSupplyKind = (typeof PRINTER_SUPPLY_KINDS)[number];

const SLOT_LABELS: Readonly<Record<PrinterSupplySlot, string>> = {
  black: 'Black',
  cyan: 'Cyan',
  magenta: 'Magenta',
  yellow: 'Yellow',
  'light-cyan': 'Light cyan',
  'light-magenta': 'Light magenta',
  'light-black': 'Light black',
  gray: 'Gray',
  'light-gray': 'Light gray',
  'dark-gray': 'Dark gray',
  red: 'Red',
  green: 'Green',
  blue: 'Blue',
  orange: 'Orange',
  gold: 'Gold',
  silver: 'Silver',
  white: 'White',
  'multi-color': 'Colour',
  waste: 'Waste tank',
  drum: 'Drum',
  fuser: 'Fuser',
  transfer: 'Transfer unit',
  developer: 'Developer',
  cleaner: 'Cleaner',
  other: 'Supply',
};

const SLOT_CODES: Readonly<Record<PrinterSupplySlot, string>> = {
  black: 'K',
  cyan: 'C',
  magenta: 'M',
  yellow: 'Y',
  'light-cyan': 'LC',
  'light-magenta': 'LM',
  'light-black': 'LK',
  gray: 'Gy',
  'light-gray': 'LG',
  'dark-gray': 'DG',
  red: 'R',
  green: 'G',
  blue: 'B',
  orange: 'O',
  gold: 'Au',
  silver: 'Ag',
  white: 'W',
  'multi-color': 'CMY',
  waste: 'W',
  drum: 'Dr',
  fuser: 'Fu',
  transfer: 'Tr',
  developer: 'Dv',
  cleaner: 'Cl',
  other: '?',
};

export const SLOT_COLOURS: Readonly<Record<PrinterSupplySlot, string>> = {
  black: '#000000',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  yellow: '#ffff00',
  'light-cyan': '#e0ffff',
  'light-magenta': '#ff77ff',
  'light-black': '#808080',
  gray: '#808080',
  'light-gray': '#d3d3d3',
  'dark-gray': '#404040',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  orange: '#ffa500',
  gold: '#ffd700',
  silver: '#c0c0c0',
  white: '#ffffff',
  'multi-color': '#8e6bd8',
  waste: '#7a7468',
  drum: '#5b6270',
  fuser: '#c0702c',
  transfer: '#5b6270',
  developer: '#5b6270',
  cleaner: '#5b6270',
  other: '#5b6270',
};

export const TANK_BODY = { light: '#e4e7ec', dark: '#5d667b' } as const;

export type TankTheme = keyof typeof TANK_BODY;

export const TANK_EDGE_CONTRAST = 3;

export function slotLabel(slot: PrinterSupplySlot): string {
  return SLOT_LABELS[slot];
}

export function slotCode(slot: PrinterSupplySlot): string {
  return SLOT_CODES[slot];
}

function slotNamed(name: string | null): PrinterSupplySlot | null {
  return PRINTER_SUPPLY_SLOTS.find((candidate) => candidate === name) ?? null;
}

export function slotOf(supply: {
  readonly colorant: string | null;
  readonly kind: PrinterSupplyKind;
}): PrinterSupplySlot {
  if (supply.kind === 'ink') return slotNamed(supply.colorant) ?? 'multi-color';
  if (supply.kind === 'toner') return slotNamed(supply.colorant) ?? 'black';
  return supply.kind;
}

function baseOf(key: string): string {
  return key.replace(/-\d+$/u, '');
}

export function slotKeys(
  slots: readonly PrinterSupplySlot[],
  remembered: readonly string[],
): readonly string[] {
  const taken = new Set<string>();
  return slots.map((slot) => {
    const reused = remembered.find((key) => !taken.has(key) && baseOf(key) === slot);
    if (reused !== undefined) {
      taken.add(reused);
      return reused;
    }
    let count = 1;
    let key: string = slot;
    while (taken.has(key) || remembered.includes(key)) {
      count += 1;
      key = `${slot}-${String(count)}`;
    }
    taken.add(key);
    return key;
  });
}

export function supplyCapabilityKey(key: string): `raw:printer.supply.${string}` {
  return `raw:printer.supply.${key}`;
}

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function rgbOf(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

export function luminanceOf(hex: string): number {
  const [red, green, blue] = rgbOf(hex);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

export function contrastBetween(first: string, second: string): number {
  const one = luminanceOf(first);
  const other = luminanceOf(second);
  return (Math.max(one, other) + 0.05) / (Math.min(one, other) + 0.05);
}

function blend(from: number, to: number, amount: number): string {
  return Math.round(from + (to - from) * amount)
    .toString(16)
    .padStart(2, '0');
}

function mix(hex: string, toward: string, amount: number): string {
  const [fromRed, fromGreen, fromBlue] = rgbOf(hex);
  const [toRed, toGreen, toBlue] = rgbOf(toward);
  return `#${blend(fromRed, toRed, amount)}${blend(fromGreen, toGreen, amount)}${blend(fromBlue, toBlue, amount)}`;
}

const EDGE_STEPS = 20;

export function tankEdge(colour: string, theme: TankTheme): string {
  const body = TANK_BODY[theme];
  const towards = luminanceOf(body) > 0.5 ? '#000000' : '#ffffff';
  let amount = 0;
  let edge = colour;
  while (contrastBetween(edge, body) < TANK_EDGE_CONTRAST) {
    amount += 1 / EDGE_STEPS;
    edge = mix(colour, towards, Math.min(amount, 1));
  }
  return edge;
}
