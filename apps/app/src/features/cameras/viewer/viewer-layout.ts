import type { ViewStyle } from 'react-native';
import { cn } from '../../../design/cn';
import { DETAIL_MIN_WIDTH } from '../../../design/size-class';

export const CAMERA_INSPECTOR_WIDTH = 420;

const SUPPORTING_PANEL_MIN_WIDTH = 300;

export interface ViewerLayout {
  readonly wide: boolean;
  readonly columns: boolean;
}

export interface ViewerClasses {
  readonly row: string;
  readonly main: string;
  readonly side: string;
  readonly panels: string;
  readonly recent: string;
  readonly width: 'dashboard' | 'detail' | 'full';
}

const GAP = 'gap-section-gap';

export function viewerLayoutFor(width: number, gap: number): ViewerLayout {
  return {
    wide: width >= DETAIL_MIN_WIDTH + CAMERA_INSPECTOR_WIDTH + gap,
    columns: width >= 2 * SUPPORTING_PANEL_MIN_WIDTH + gap,
  };
}

export function viewerUsesFullWidth(width: number, gap: number): boolean {
  return width >= DETAIL_MIN_WIDTH + 2 * CAMERA_INSPECTOR_WIDTH + 2 * gap;
}

export function viewerClasses({ wide, columns }: ViewerLayout, full = false): ViewerClasses {
  const split = columns && !wide;
  if (full) {
    return {
      row: `flex-row items-start ${GAP}`,
      main: `min-w-0 flex-1 ${GAP}`,
      side: `flex-row items-start ${GAP}`,
      panels: `w-inspector ${GAP}`,
      recent: 'w-inspector',
      width: 'full',
    };
  }
  const recent = split ? 'min-w-0 flex-1' : '';
  return {
    row: wide ? `flex-row items-start ${GAP}` : GAP,
    main: wide ? `min-w-0 flex-1 ${GAP}` : GAP,
    side: wide ? `w-inspector ${GAP}` : split ? `flex-row items-start ${GAP}` : GAP,
    panels: cn(recent, GAP),
    recent,
    width: wide ? 'dashboard' : 'detail',
  };
}

const VIDEO_ASPECT = 16 / 9;

interface PlayerSlotInput {
  readonly height: number;
  readonly headerHeight: number;
  readonly gap: number;
  readonly gutter: number;
  readonly width: number;
  readonly full: boolean;
  readonly compact: boolean;
}

interface PlayerSlot {
  readonly position: Pick<ViewStyle, 'left' | 'top' | 'width'> | undefined;
  readonly fitted: Pick<ViewStyle, 'maxWidth'> | undefined;
}

export function playerSlot({
  height,
  headerHeight,
  gap,
  gutter,
  width,
  full,
  compact,
}: PlayerSlotInput): PlayerSlot {
  if (compact) return { position: undefined, fitted: undefined };
  const top = headerHeight + gap;
  return {
    position: { left: gutter, top, width },
    fitted: full && height > top ? { maxWidth: (height - top) * VIDEO_ASPECT } : undefined,
  };
}
