import type { RenderRoomFloor } from '../render-scene';
import type { Rgb } from './mesh';

export type StructureTheme = 'light' | 'dark';

export const FLOOR_PATTERNS = [
  'plain',
  'planks',
  'herringbone',
  'tiles',
  'hex',
  'cobble',
  'weave',
  'speckle',
] as const;

export type FloorPattern = (typeof FLOOR_PATTERNS)[number];

export interface FloorLook {
  readonly pattern: FloorPattern;
  readonly scaleMetres: number;
  readonly base: Rgb;
  readonly joint: Rgb;
}

interface LookEntry {
  readonly pattern: FloorPattern;
  readonly scaleMetres: number;
  readonly base: number;
}

const RED_STEP = 65_536;

const CHANNEL_RANGE = 256;

const CHANNEL_MAX = 255;

const HEX_COLOUR = /^#([0-9a-f]{6})$/iu;

const HEX_RADIX = 16;

const JOINT_SHADE = 0.82;

const DARK_SHADE = 0.42;

export function hexRgb(hex: number): Rgb {
  return [
    (Math.floor(hex / RED_STEP) % CHANNEL_RANGE) / CHANNEL_MAX,
    (Math.floor(hex / CHANNEL_RANGE) % CHANNEL_RANGE) / CHANNEL_MAX,
    (hex % CHANNEL_RANGE) / CHANNEL_MAX,
  ];
}

export function parseHexColour(text: string | null): Rgb | null {
  const match = text === null ? null : HEX_COLOUR.exec(text.trim());
  const digits = match?.[1];
  return digits === undefined ? null : hexRgb(Number.parseInt(digits, HEX_RADIX));
}

export const shadeRgb = (colour: Rgb, factor: number): Rgb => [
  colour[0] * factor,
  colour[1] * factor,
  colour[2] * factor,
];

const LOOKS: Readonly<Record<string, LookEntry>> = {
  wood: { pattern: 'planks', scaleMetres: 0.18, base: 0xc69c6d },
  'wood:light': { pattern: 'planks', scaleMetres: 0.18, base: 0xdcc09a },
  'wood:medium': { pattern: 'planks', scaleMetres: 0.18, base: 0xb3824f },
  'wood:dark': { pattern: 'planks', scaleMetres: 0.18, base: 0x6f4a2e },
  'wood:herringbone': { pattern: 'herringbone', scaleMetres: 0.1, base: 0xc08f5c },
  'wood:horizontal': { pattern: 'planks', scaleMetres: 0.18, base: 0xc69c6d },
  laminate: { pattern: 'planks', scaleMetres: 0.19, base: 0xcfae86 },
  tile: { pattern: 'tiles', scaleMetres: 0.3, base: 0xe3e0da },
  'tile:small': { pattern: 'tiles', scaleMetres: 0.15, base: 0xe6e3dd },
  'tile:large': { pattern: 'tiles', scaleMetres: 0.6, base: 0xdedad2 },
  'tile:hex': { pattern: 'hex', scaleMetres: 0.2, base: 0xe4e1db },
  marble: { pattern: 'tiles', scaleMetres: 0.6, base: 0xeeece8 },
  stone: { pattern: 'cobble', scaleMetres: 0.25, base: 0xb9b3a8 },
  'stone:cobblestone': { pattern: 'cobble', scaleMetres: 0.15, base: 0xa9a297 },
  concrete: { pattern: 'speckle', scaleMetres: 1, base: 0xbdbcb8 },
  terrazzo: { pattern: 'speckle', scaleMetres: 0.05, base: 0xe2ddd4 },
  vinyl: { pattern: 'plain', scaleMetres: 1, base: 0xd9d4ca },
  carpet: { pattern: 'weave', scaleMetres: 0.02, base: 0xb8ab98 },
  rubber: { pattern: 'speckle', scaleMetres: 0.03, base: 0x5f6266 },
  deck: { pattern: 'planks', scaleMetres: 0.14, base: 0x9c7552 },
  grass: { pattern: 'speckle', scaleMetres: 0.02, base: 0x84ad62 },
  gravel: { pattern: 'speckle', scaleMetres: 0.03, base: 0xb4ab9b },
};

function entryOf(floor: RenderRoomFloor): LookEntry | null {
  if (floor.status !== 'material') return null;
  const variant = floor.variant === null ? null : LOOKS[`${floor.kind}:${floor.variant}`];
  return variant ?? LOOKS[floor.kind] ?? null;
}

export type FloorTone = 'room' | 'material';

function materialColour(floor: RenderRoomFloor, entry: LookEntry | null): Rgb | null {
  const tint = floor.status === 'material' ? parseHexColour(floor.tint) : null;
  return tint ?? (entry === null ? null : hexRgb(entry.base));
}

function baseOf(
  material: Rgb | null,
  roomColour: Rgb,
  look: { readonly tone: FloorTone; readonly theme: StructureTheme },
): Rgb {
  if (look.tone === 'room' || material === null) return roomColour;
  return look.theme === 'dark' ? shadeRgb(material, DARK_SHADE) : material;
}

export function floorLookOf(
  floor: RenderRoomFloor,
  roomColour: Rgb,
  look: { readonly tone: FloorTone; readonly theme: StructureTheme },
): FloorLook {
  const entry = entryOf(floor);
  const base = baseOf(materialColour(floor, entry), roomColour, look);
  return {
    pattern: entry?.pattern ?? 'plain',
    scaleMetres: entry?.scaleMetres ?? 1,
    base,
    joint: shadeRgb(base, JOINT_SHADE),
  };
}
