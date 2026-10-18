import type { HsvColor, Spread } from '@smarteverything/domain';
import { colourCss } from '../../../components/colour-picker-model';
import type { ColourStripSwatch } from '../../../components/colour-strip-model';
import { whiteColour } from '../white-colour';

export interface ColourPreset {
  readonly id: string;
  readonly label: string;
  readonly colour: HsvColor;
}

export interface WhitePreset {
  readonly id: string;
  readonly label: string;
  readonly kelvin: number;
}

export const COLOUR_PRESETS: readonly ColourPreset[] = [
  { id: 'amber', label: 'Amber', colour: { hue: 32, saturation: 58, value: 100 } },
  { id: 'orange', label: 'Orange', colour: { hue: 16, saturation: 76, value: 100 } },
  { id: 'white', label: 'White', colour: { hue: 36, saturation: 10, value: 100 } },
  { id: 'ice', label: 'Ice', colour: { hue: 214, saturation: 20, value: 100 } },
  { id: 'pink', label: 'Pink', colour: { hue: 340, saturation: 44, value: 100 } },
  { id: 'violet', label: 'Violet', colour: { hue: 258, saturation: 36, value: 100 } },
  { id: 'teal', label: 'Teal', colour: { hue: 174, saturation: 60, value: 83 } },
];

export const WHITE_PRESETS: readonly WhitePreset[] = [
  { id: 'warm', label: 'Warm', kelvin: 2700 },
  { id: 'soft', label: 'Soft', kelvin: 3000 },
  { id: 'neutral', label: 'Neutral', kelvin: 4000 },
  { id: 'daylight', label: 'Daylight', kelvin: 5500 },
  { id: 'cool', label: 'Cool', kelvin: 6500 },
];

const HUE_TOLERANCE = 8;
const SATURATION_TOLERANCE = 10;

export function colourMatch(colours: readonly HsvColor[]): string | null {
  const only = colours.length === 1 ? colours[0] : undefined;
  if (only === undefined) return null;
  return (
    COLOUR_PRESETS.find(
      (preset) =>
        Math.abs(preset.colour.hue - only.hue) <= HUE_TOLERANCE &&
        Math.abs(preset.colour.saturation - only.saturation) <= SATURATION_TOLERANCE,
    )?.id ?? null
  );
}

export function whiteMatch(spread: Spread | null): string | null {
  if (spread === null || spread.min !== spread.max) return null;
  return WHITE_PRESETS.find((preset) => preset.kelvin === spread.min)?.id ?? null;
}

export function stripSwatches(colour: boolean): readonly ColourStripSwatch[] {
  return colour
    ? COLOUR_PRESETS.map((preset) => ({
        id: preset.id,
        label: preset.label,
        colour: colourCss(preset.colour),
      }))
    : WHITE_PRESETS.map((preset) => ({
        id: preset.id,
        label: `${preset.label} ${String(preset.kelvin)} K`,
        colour: colourCss(whiteColour(preset.kelvin)),
        caption: preset.label,
      }));
}
