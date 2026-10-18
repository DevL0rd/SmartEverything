export interface ColourStripSwatch {
  readonly id: string;
  readonly label: string;
  readonly colour: string;
  readonly caption?: string;
}

export type ColourStripDensity = 'full' | 'compact';

export const COMPACT_SWATCHES_MOST = 5;

export interface StripLayout {
  readonly presets: readonly ColourStripSwatch[];
  readonly pinnedCurrent: boolean;
}

function compactWindow(
  swatches: readonly ColourStripSwatch[],
  matchedAt: number,
): readonly ColourStripSwatch[] {
  const start = Math.max(0, matchedAt - (COMPACT_SWATCHES_MOST - 1));
  return swatches.slice(start, start + COMPACT_SWATCHES_MOST);
}

export function stripLayout(
  swatches: readonly ColourStripSwatch[],
  selectedId: string | null,
  hasCurrent: boolean,
  density: ColourStripDensity,
): StripLayout {
  const seen = new Set<string>();
  const unique = swatches.filter((swatch) => {
    if (seen.has(swatch.id)) {
      return false;
    }
    seen.add(swatch.id);
    return true;
  });
  const matchedAt = unique.findIndex((swatch) => swatch.id === selectedId);
  const presets = density === 'compact' ? compactWindow(unique, matchedAt) : unique;
  return {
    presets,
    pinnedCurrent: matchedAt < 0 && hasCurrent,
  };
}

export function stripKeyTarget(key: string, index: number, count: number): number | null {
  if (count === 0) {
    return null;
  }
  if (key === 'ArrowRight' || key === 'ArrowDown') {
    return Math.min(count - 1, index + 1);
  }
  if (key === 'ArrowLeft' || key === 'ArrowUp') {
    return Math.max(0, index - 1);
  }
  if (key === 'Home') {
    return 0;
  }
  return key === 'End' ? count - 1 : null;
}
