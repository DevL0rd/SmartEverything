export type TrashLayout = 'table' | 'list' | 'compact';

export const TABLE_COLUMNS = {
  wasIn: 'w-52',
  deletedBy: 'w-36',
  size: 'w-21',
  leaves: 'w-32',
  restore: 'w-28',
} as const;

const TABLE_FIXED_PX = 208 + 144 + 84 + 128 + 112;
const ROW_CHROME_PX = 16 + 12 + 20 + 28 + 6 * 12;
const NAME_MIN_PX = 240;

export const TABLE_MIN_WIDTH = TABLE_FIXED_PX + ROW_CHROME_PX + NAME_MIN_PX;

export function tableSnap(listWidth: number): number {
  return listWidth >= TABLE_MIN_WIDTH ? TABLE_MIN_WIDTH : 0;
}

export function trashLayoutOf(compact: boolean, listWidth: number): TrashLayout {
  if (compact) return 'compact';
  return listWidth >= TABLE_MIN_WIDTH ? 'table' : 'list';
}
