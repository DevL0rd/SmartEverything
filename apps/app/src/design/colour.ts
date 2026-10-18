import { use } from 'react';
import { MissingPaletteError, PaletteContext, colourVariable, type Palette } from './colour-roles';
import { isNative } from './platform';
import type { ColourRole } from './tokens';

class InvalidColourError extends Error {
  override readonly name = 'InvalidColourError';

  constructor(readonly written: string) {
    super(`Expected a #RRGGBB colour, received ${written}.`);
  }
}

export function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (match === null) {
    throw new InvalidColourError(hex);
  }
  const [, red = '', green = '', blue = ''] = match;
  return `rgba(${String(parseInt(red, 16))}, ${String(parseInt(green, 16))}, ${String(parseInt(blue, 16))}, ${String(alpha)})`;
}

function resolveColour(palette: Palette | null, role: ColourRole): string {
  if (!isNative()) {
    return `var(${colourVariable(role)})`;
  }
  if (palette === null) {
    throw new MissingPaletteError(role);
  }
  return palette[role];
}

export function useColour(role: ColourRole): string {
  return resolveColour(use(PaletteContext), role);
}

export function useColourResolver(): (role: ColourRole) => string {
  const palette = use(PaletteContext);
  return (role) => resolveColour(palette, role);
}
