export const LOD_LEVELS = ['full', 'small', 'mid', 'far'] as const;

export type LodLevel = (typeof LOD_LEVELS)[number];

export const LOD_THRESHOLDS = { full: 0.85, small: 0.69, mid: 0.34 } as const;

export const MIN_TEXT_PX = 11;

export const MID_TITLE_PX = 12;

export const MID_TITLE_FLOOR_PX = 16;

export interface LodParts {
  readonly title: boolean;
  readonly subtitle: boolean;
  readonly overline: boolean;
  readonly exitRows: boolean;
  readonly portLabels: boolean;
  readonly chips: boolean;
  readonly pills: boolean;
  readonly ports: boolean;
  readonly status: boolean;
  readonly laneTitles: boolean;
  readonly largeTitleOnly: boolean;
}

export function levelForZoom(zoom: number): LodLevel {
  if (zoom >= LOD_THRESHOLDS.full) return 'full';
  if (zoom >= LOD_THRESHOLDS.small) return 'small';
  if (zoom >= LOD_THRESHOLDS.mid) return 'mid';
  return 'far';
}

const PARTS: Readonly<Record<LodLevel, LodParts>> = {
  full: {
    title: true,
    subtitle: true,
    overline: true,
    exitRows: true,
    portLabels: true,
    chips: true,
    pills: true,
    ports: true,
    status: true,
    laneTitles: true,
    largeTitleOnly: false,
  },
  small: {
    title: true,
    subtitle: false,
    overline: false,
    exitRows: false,
    portLabels: true,
    chips: true,
    pills: true,
    ports: true,
    status: true,
    laneTitles: true,
    largeTitleOnly: false,
  },
  mid: {
    title: true,
    subtitle: false,
    overline: false,
    exitRows: false,
    portLabels: false,
    chips: false,
    pills: false,
    ports: false,
    status: false,
    laneTitles: true,
    largeTitleOnly: false,
  },
  far: {
    title: true,
    subtitle: false,
    overline: false,
    exitRows: false,
    portLabels: false,
    chips: false,
    pills: false,
    ports: false,
    status: false,
    laneTitles: false,
    largeTitleOnly: true,
  },
};

export function lodParts(level: LodLevel): LodParts {
  return PARTS[level];
}

export function titleFontSize(zoom: number, base: number): number {
  const level = levelForZoom(zoom);
  if (level === 'full' || level === 'small') return base;
  return Math.max(MID_TITLE_FLOOR_PX, MID_TITLE_PX / zoom);
}

export function renderedPx(fontSize: number, zoom: number): number {
  return fontSize * zoom;
}
