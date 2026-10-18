import type { HsvColor } from '@smarteverything/domain';
import { colourCss } from '../../../components/colour-picker-model';
import type { ColourStripSwatch } from '../../../components/colour-strip-model';
import type { LightMode } from './light-state-line';

export type StripKind = 'colour' | 'white';

export interface ColourPreset {
  readonly id: string;
  readonly label: string;
  readonly colour: HsvColor;
  readonly kelvin: number | null;
}

export type PresetAction =
  | { readonly part: 'temperature'; readonly kelvin: number }
  | { readonly part: 'colour'; readonly colour: HsvColor };

export interface PresetReading {
  readonly mode: LightMode;
  readonly kelvin: number | null;
  readonly colour: HsvColor | null;
}

const HUE_TOLERANCE = 8;
const SATURATION_TOLERANCE = 10;
const KELVIN_TOLERANCE = 150;

function hsv(hue: number, saturation: number, value = 100): HsvColor {
  return { hue, saturation, value };
}

function preset(id: string, label: string, colour: HsvColor, kelvin: number | null): ColourPreset {
  return { id, label, colour, kelvin };
}

export const COLOUR_PRESETS: readonly ColourPreset[] = [
  preset('amber', 'Amber', hsv(32, 58), null),
  preset('orange', 'Orange', hsv(16, 76), null),
  preset('warm-white', 'Warm white', hsv(38, 28), 2700),
  preset('ice', 'Ice', hsv(214, 22), 6000),
  preset('pink', 'Pink', hsv(340, 44), null),
  preset('violet', 'Violet', hsv(258, 36), null),
  preset('teal', 'Teal', hsv(174, 60, 83), null),
];

export const WHITE_PRESETS: readonly ColourPreset[] = [
  preset('warm', 'Warm', hsv(32, 56), 2700),
  preset('soft', 'Soft', hsv(36, 40), 3000),
  preset('neutral', 'Neutral', hsv(45, 16), 4000),
  preset('daylight', 'Daylight', hsv(205, 10), 5500),
  preset('cool', 'Cool', hsv(214, 30), 6500),
];

export function presetsOf(kind: StripKind): readonly ColourPreset[] {
  return kind === 'colour' ? COLOUR_PRESETS : WHITE_PRESETS;
}

function swatchOf(kind: StripKind, entry: ColourPreset): ColourStripSwatch {
  const colour = colourCss(entry.colour);
  if (kind === 'colour') {
    return { id: entry.id, label: entry.label, colour };
  }
  return {
    id: entry.id,
    label: `${entry.label} ${String(entry.kelvin)} K`,
    colour,
    caption: entry.label,
  };
}

export const STRIP_SWATCHES: Readonly<Record<StripKind, readonly ColourStripSwatch[]>> = {
  colour: COLOUR_PRESETS.map((entry) => swatchOf('colour', entry)),
  white: WHITE_PRESETS.map((entry) => swatchOf('white', entry)),
};

function nearColour(entry: ColourPreset, colour: HsvColor): boolean {
  return (
    Math.abs(entry.colour.hue - colour.hue) <= HUE_TOLERANCE &&
    Math.abs(entry.colour.saturation - colour.saturation) <= SATURATION_TOLERANCE
  );
}

function nearKelvin(entry: ColourPreset, kelvin: number): boolean {
  return entry.kelvin !== null && Math.abs(entry.kelvin - kelvin) <= KELVIN_TOLERANCE;
}

export function matchedPreset(kind: StripKind, reading: PresetReading): string | null {
  const { mode, kelvin, colour } = reading;
  const entries = presetsOf(kind);
  if (kind === 'white' || mode === 'white') {
    return kelvin === null
      ? null
      : (entries.find((entry) => nearKelvin(entry, kelvin))?.id ?? null);
  }
  return colour === null ? null : (entries.find((entry) => nearColour(entry, colour))?.id ?? null);
}

export function presetAction(entry: ColourPreset, hasTemperature: boolean): PresetAction {
  if (entry.kelvin !== null && hasTemperature) {
    return { part: 'temperature', kelvin: entry.kelvin };
  }
  return { part: 'colour', colour: entry.colour };
}

export function presetById(kind: StripKind, id: string): ColourPreset | undefined {
  return presetsOf(kind).find((entry) => entry.id === id);
}

export interface PresetPlan {
  readonly turnOn: boolean;
  readonly action: PresetAction;
}

export function presetPlan(
  kind: StripKind,
  id: string,
  hasTemperature: boolean,
  off: boolean,
): PresetPlan | null {
  const entry = presetById(kind, id);
  return entry === undefined ? null : { turnOn: off, action: presetAction(entry, hasTemperature) };
}
