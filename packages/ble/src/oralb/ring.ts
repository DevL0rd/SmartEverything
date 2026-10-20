export type OralbRgb = readonly [number, number, number];

export const ORALB_WHITE_DRIVE: OralbRgb = [0x44, 0xcf, 0x63];

export const ORALB_NAMED_COLOURS = {
  white: [0x44, 0xcf, 0x63],
  yellow: [0x80, 0xff, 0x00],
  orange: [0xfc, 0x70, 0x00],
  blue: [0x0f, 0x5b, 0xcc],
  turquoise: [0x00, 0xff, 0x3d],
  pink: [0xb2, 0x09, 0x1a],
} as const satisfies Record<string, OralbRgb>;

export type OralbColourName = keyof typeof ORALB_NAMED_COLOURS;

const COLOUR_NAMES: readonly OralbColourName[] = [
  'white',
  'yellow',
  'orange',
  'blue',
  'turquoise',
  'pink',
];

export const ORALB_COLOUR_TOLERANCE = 12;

export interface OralbRingColour {
  readonly name: OralbColourName | 'custom';
  readonly drive: OralbRgb;
  readonly display: OralbRgb;
  readonly hex: string;
}

function channel(value: number, white: number): number {
  return Math.min(255, Math.round((value * 255) / white));
}

export function displayOfDrive(drive: OralbRgb): OralbRgb {
  const [red, green, blue] = drive;
  const [whiteRed, whiteGreen, whiteBlue] = ORALB_WHITE_DRIVE;
  return [channel(red, whiteRed), channel(green, whiteGreen), channel(blue, whiteBlue)];
}

function distance(a: OralbRgb, b: OralbRgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function hexOf(display: OralbRgb): string {
  return `#${display.map((value) => value.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function ringColourOf(
  drive: OralbRgb,
  tolerance: number = ORALB_COLOUR_TOLERANCE,
): OralbRingColour {
  const display = displayOfDrive(drive);
  const nearest = COLOUR_NAMES.map((name) => ({
    name,
    gap: distance(drive, ORALB_NAMED_COLOURS[name]),
  })).reduce((best, entry) => (entry.gap < best.gap ? entry : best));
  return {
    name: nearest.gap <= tolerance ? nearest.name : 'custom',
    drive,
    display,
    hex: hexOf(display),
  };
}
