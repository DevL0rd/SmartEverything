export type TrashLayout = 'table' | 'list' | 'compact';

export const TABLE_COLUMNS = {
  wasIn: 'w-36',
  deletedBy: 'w-28',
  size: 'w-21',
  leaves: 'w-28',
  actions: 'w-touch-min',
} as const;

const TABLE_FIXED_PX = 144 + 112 + 84 + 112 + 48;
const ROW_CHROME_PX = 16 + 12 + 20 + 28 + 6 * 12;
const NAME_MIN_PX = 200;

export const TABLE_MIN_WIDTH = TABLE_FIXED_PX + ROW_CHROME_PX + NAME_MIN_PX;

export const SUMMARY_SIDE_BY_SIDE_MIN = 640;

export function trashSnap(listWidth: number): number {
  if (listWidth >= TABLE_MIN_WIDTH) return TABLE_MIN_WIDTH;
  return listWidth >= SUMMARY_SIDE_BY_SIDE_MIN ? SUMMARY_SIDE_BY_SIDE_MIN : 0;
}

export function trashLayoutOf(compact: boolean, listWidth: number): TrashLayout {
  if (compact) return 'compact';
  return listWidth >= TABLE_MIN_WIDTH ? 'table' : 'list';
}

export function summaryWideOf(layout: TrashLayout, listWidth: number): boolean {
  return layout !== 'compact' && listWidth >= SUMMARY_SIDE_BY_SIDE_MIN;
}
