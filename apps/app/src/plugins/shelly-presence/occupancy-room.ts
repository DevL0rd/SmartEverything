export const TIMELINE_HEIGHT = 14;
export const PANEL_TIMELINE_HEIGHT = 22;
const CAPTION_PX = 16;
const GAP_PX = 4;

export function occupancyPx(wide: boolean, captionsPx: number): number {
  return wide
    ? PANEL_TIMELINE_HEIGHT + captionsPx + GAP_PX + CAPTION_PX
    : TIMELINE_HEIGHT + GAP_PX + CAPTION_PX;
}

export function occupancyFits(room: number, wide: boolean, captionsPx: number): boolean {
  return room >= occupancyPx(wide, captionsPx);
}
