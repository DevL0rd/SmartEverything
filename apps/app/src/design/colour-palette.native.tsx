import type { ReactNode } from 'react';
import { useState } from 'react';
import { useCSSVariable } from 'uniwind';
import {
  COLOUR_ROLES,
  COLOUR_VARIABLE,
  COLOUR_VARIABLES,
  MissingTokenError,
  PaletteContext,
  colourVariable,
  type Palette,
} from './colour-roles';
import type { ColourRole } from './tokens';

function paletteFrom(values: readonly (string | number | undefined)[]): Palette {
  const palette: Record<ColourRole, string> = { ...COLOUR_VARIABLE };
  COLOUR_ROLES.forEach((role, index) => {
    const value = values[index];
    if (typeof value !== 'string') {
      throw new MissingTokenError(colourVariable(role));
    }
    palette[role] = value;
  });
  return palette;
}

function samePalette(a: Palette, b: Palette): boolean {
  return COLOUR_ROLES.every((role) => a[role] === b[role]);
}

export function ColourPalette({ children }: { readonly children: ReactNode }): ReactNode {
  const next = paletteFrom(useCSSVariable(COLOUR_VARIABLES));
  const [palette, setPalette] = useState(next);
  if (!samePalette(palette, next)) {
    setPalette(next);
  }
  return <PaletteContext value={palette}>{children}</PaletteContext>;
}
