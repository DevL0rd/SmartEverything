export type ColourRole =
  | 'bg'
  | 'surface-1'
  | 'surface-2'
  | 'surface-3'
  | 'surface-raised'
  | 'chrome'
  | 'on-surface'
  | 'on-surface-variant'
  | 'on-surface-faint'
  | 'outline'
  | 'outline-variant'
  | 'scrim'
  | 'primary'
  | 'on-primary'
  | 'primary-container'
  | 'on-primary-container'
  | 'positive'
  | 'warning'
  | 'critical'
  | 'info'
  | 'focus'
  | 'viz-1'
  | 'viz-2'
  | 'viz-3'
  | 'viz-4'
  | 'viz-5'
  | 'viz-6'
  | 'air-good'
  | 'air-fair'
  | 'air-moderate'
  | 'air-poor'
  | 'air-bad'
  | 'air-severe'
  | 'temp-warm'
  | 'temp-cool'
  | 'humidity'
  | 'move'
  | 'exercise'
  | 'stand'
  | 'heart'
  | 'sleep-deep'
  | 'sleep-core'
  | 'sleep-rem'
  | 'sleep-awake';

export type ThemeName = 'dark' | 'light';

export type AccentName = 'amber' | 'aqua' | 'rose' | 'violet' | 'lime' | 'ice';

interface AccentInk {
  readonly primary: string;
  readonly onPrimary: string;
}

export const ACCENTS: Readonly<Record<AccentName, Readonly<Record<ThemeName, AccentInk>>>> = {
  amber: {
    dark: { primary: '#F2B45E', onPrimary: '#1A1206' },
    light: { primary: '#A9620A', onPrimary: '#FFFFFF' },
  },
  aqua: {
    dark: { primary: '#5ED3CF', onPrimary: '#04201F' },
    light: { primary: '#00808A', onPrimary: '#FFFFFF' },
  },
  rose: {
    dark: { primary: '#F49A8E', onPrimary: '#2A0C08' },
    light: { primary: '#BF3F4E', onPrimary: '#FFFFFF' },
  },
  violet: {
    dark: { primary: '#A99BFF', onPrimary: '#140F33' },
    light: { primary: '#5B47D6', onPrimary: '#FFFFFF' },
  },
  lime: {
    dark: { primary: '#C2E070', onPrimary: '#172006' },
    light: { primary: '#4E7300', onPrimary: '#FFFFFF' },
  },
  ice: {
    dark: { primary: '#E6EAF0', onPrimary: '#0E1014' },
    light: { primary: '#3A4455', onPrimary: '#FFFFFF' },
  },
};

export const ACCENT_SWATCH: Readonly<Record<AccentName, string>> = {
  amber: 'bg-viz-2',
  aqua: 'bg-viz-1',
  rose: 'bg-viz-4',
  violet: 'bg-viz-3',
  lime: 'bg-viz-5',
  ice: 'bg-swatch-ice',
};

export const ACCENT_LABELS: Readonly<Record<AccentName, string>> = {
  amber: 'Amber',
  aqua: 'Aqua',
  rose: 'Rose',
  violet: 'Violet',
  lime: 'Lime',
  ice: 'Ice',
};

export const PRIMARY_CONTAINER_ALPHA: Readonly<Record<ThemeName, number>> = {
  dark: 0.16,
  light: 0.14,
};

export const SURFACE_1: Readonly<Record<ThemeName, string>> = {
  dark: '#141417',
  light: '#FFFFFF',
};

export const TRANSLUCENT_ALPHA = 0.72;

export type Idiom = 'touch' | 'pointer';

export type Density = 'comfortable' | 'compact';

export interface SemanticSizes {
  readonly touchMin: number;
  readonly controlH: number;
  readonly rowH: number;
  readonly rowH2: number;
  readonly gridGap: number;
  readonly sectionGap: number;
  readonly cardPad: number;
  readonly rowUnit: number;
  readonly gutterShrink: number;
}

export const SEMANTIC_SIZES: Readonly<Record<Idiom, Readonly<Record<Density, SemanticSizes>>>> = {
  touch: {
    comfortable: {
      touchMin: 48,
      controlH: 48,
      rowH: 56,
      rowH2: 72,
      gridGap: 12,
      sectionGap: 24,
      cardPad: 16,
      rowUnit: 80,
      gutterShrink: 0,
    },
    compact: {
      touchMin: 48,
      controlH: 44,
      rowH: 52,
      rowH2: 64,
      gridGap: 8,
      sectionGap: 20,
      cardPad: 12,
      rowUnit: 80,
      gutterShrink: 4,
    },
  },
  pointer: {
    comfortable: {
      touchMin: 32,
      controlH: 36,
      rowH: 40,
      rowH2: 52,
      gridGap: 16,
      sectionGap: 32,
      cardPad: 20,
      rowUnit: 72,
      gutterShrink: 0,
    },
    compact: {
      touchMin: 28,
      controlH: 32,
      rowH: 36,
      rowH2: 44,
      gridGap: 12,
      sectionGap: 24,
      cardPad: 16,
      rowUnit: 72,
      gutterShrink: 8,
    },
  },
};

export type WidthClass = 'compact' | 'medium' | 'expanded' | 'large' | 'xlarge';

export const GUTTER: Readonly<Record<WidthClass, number>> = {
  compact: 16,
  medium: 24,
  expanded: 24,
  large: 32,
  xlarge: 40,
};

export type TypeRole =
  | 'large-title'
  | 'title-1'
  | 'title-2'
  | 'title-3'
  | 'body'
  | 'callout'
  | 'footnote'
  | 'caption'
  | 'label'
  | 'figure-s'
  | 'figure-m'
  | 'figure-l'
  | 'figure-xl';

type TypeSize = readonly [size: number, line: number];

export const TYPE_SCALE: Readonly<Record<Idiom, Readonly<Record<TypeRole, TypeSize>>>> = {
  touch: {
    'large-title': [30, 36],
    'title-1': [24, 30],
    'title-2': [20, 26],
    'title-3': [17, 22],
    body: [16, 22],
    callout: [14, 20],
    footnote: [13, 18],
    caption: [12, 16],
    label: [14, 20],
    'figure-s': [20, 24],
    'figure-m': [28, 32],
    'figure-l': [40, 44],
    'figure-xl': [56, 60],
  },
  pointer: {
    'large-title': [28, 34],
    'title-1': [22, 28],
    'title-2': [18, 24],
    'title-3': [15, 20],
    body: [14, 20],
    callout: [13, 18],
    footnote: [12, 16],
    caption: [11, 14],
    label: [13, 18],
    'figure-s': [18, 22],
    'figure-m': [26, 30],
    'figure-l': [36, 40],
    'figure-xl': [52, 56],
  },
};

export type Corners = 'sharp' | 'soft' | 'round';

export const CORNER_SCALE: Readonly<Record<Corners, number>> = {
  sharp: 0.5,
  soft: 1,
  round: 1.5,
};

export const RADII = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 28 } as const;
