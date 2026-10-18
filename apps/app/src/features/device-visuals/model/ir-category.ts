export const IR_CATEGORIES = [
  'ac',
  'fan',
  'light',
  'speaker',
  'projector',
  'settop',
  'tv',
  'other',
] as const;

export type IrCategory = (typeof IR_CATEGORIES)[number];
