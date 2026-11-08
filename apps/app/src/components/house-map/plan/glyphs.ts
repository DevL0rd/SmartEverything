const CATEGORY_GLYPHS: Readonly<Record<string, string>> = {
  bedroom: 'M-9 -7h18v14h-18zM-9 -2h18M-6 -7v-3h12v3',
  living: 'M-9 -2h18v7h-18zM-9 -2v-5h18v5M-9 5v2M9 5v2',
  dining: 'M-6 -5h12v10h-12zM-9 -2v4M9 -2v4M-2 -8h4M-2 8h4',
  office: 'M-9 -4h18v4h-18zM-7 0v7M7 0v7M-3 3h6v5h-6z',
  storage: 'M-8 -8h16v16h-16zM-8 0h16M-2 -4h4M-2 4h4',
  kitchen: 'M-8 -8h16v16h-16zM-3 -3a2 2 0 1 0 0.1 0M3 3a2 2 0 1 0 0.1 0',
  bathroom: 'M-9 -3h18v4a6 6 0 0 1 -6 6h-6a6 6 0 0 1 -6 -6zM-6 -3v-5h3',
  plants: 'M0 8v-9M0 -1c-6 0 -8 -4 -8 -8c5 0 8 3 8 8M0 -1c6 0 8 -4 8 -8c-5 0 -8 3 -8 8',
};

const DEFAULT_GLYPH = 'M-7 -7h14v14h-14zM-7 -7l14 14M7 -7l-14 14';

const DEVICE_GLYPHS: Readonly<Record<string, string>> = {
  light: 'M0 -7a5 5 0 0 1 3 9v2h-6v-2a5 5 0 0 1 3 -9zM-2 7h4',
  camera: 'M-7 -4h10v8h-10zM3 -1l4 -3v8l-4 -3',
  sensor: 'M-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M-5 -5a7 7 0 0 0 0 10M5 -5a7 7 0 0 1 0 10',
  vacuum: 'M-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0M-3 -3h6',
  speaker: 'M-5 -7h10v14h-10zM-2 3a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
  tv: 'M-8 -5h16v10h-16zM-3 7h6',
};

const DEFAULT_DEVICE_GLYPH = 'M-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0';

export const glyphPathOf = (category: string): string => CATEGORY_GLYPHS[category] ?? DEFAULT_GLYPH;

export const deviceGlyphPathOf = (kind: string | null): string =>
  (kind === null ? undefined : DEVICE_GLYPHS[kind]) ?? DEFAULT_DEVICE_GLYPH;
