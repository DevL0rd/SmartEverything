export const TRIGGER_SIZE = { w: 248, h: 76 } as const;

export const OUTPUT_PIN_H = 18;

export const OUTPUT_PIN_PAD = 8;

export function triggerHeight(outputs: number, base: number): number {
  return Math.max(base, OUTPUT_PIN_PAD * 2 + outputs * OUTPUT_PIN_H);
}

export const STEP_W = 248;

export const STEP_MIN_H = 68;

export const PORT_ROW_H = 26;

export const STEP_BASE_H = 42;

export const SLOT_SIZE = { w: 248, h: 40 } as const;

export const VALUE_SIZE = { w: 212, h: 60 } as const;

export const ADMIT_H = 36;

export const ADMIT_MAX_W = 520;

export const BAR_H = 64;

export const GAP_Y = 44;

export const GAP_X_VALUE = 48;

export const GAP_VALUE_Y = 12;

export const LANE_GUTTER = 24;

export const FRAME_PAD = 16;

export const HEADER_H = 56;

export const LANE_TITLE_H = 40;

export const TAIL_H = 36;

export const FAILURE_GAP = 64;

export const TRIGGER_GAP = 24;

export const COMPACT = {
  gutter: 16,
  rail: 22,
  stepH: 68,
  triggerH: 76,
  valueH: 58,
  valueIndent: 44,
  valueGap: 8,
  gapY: 40,
  laneTitleH: 42,
  groupTitleH: 40,
  pad: 10,
  admitH: 36,
  slotH: 40,
  nestingLimit: 4,
} as const;

export const MIN_CANVAS_WIDTH = COMPACT.gutter * 2 + 160;
