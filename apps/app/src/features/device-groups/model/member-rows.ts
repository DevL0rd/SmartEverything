export const VIRTUAL_MEMBERS_FROM = 30;
export const MIN_ROW_WIDTH = 340;
export const MAX_COLUMNS = 3;
export const ROW_GAP = 8;

export interface RowGroup<T> {
  readonly key: string;
  readonly members: readonly T[];
}

export function isVirtual(count: number): boolean {
  return count > VIRTUAL_MEMBERS_FROM;
}

export function columnsFor(content: number): number {
  const fits = Math.floor((content + ROW_GAP) / (MIN_ROW_WIDTH + ROW_GAP));
  return Math.max(1, Math.min(MAX_COLUMNS, fits));
}

export function rowGroups<T extends { readonly id: string }>(
  members: readonly T[],
  columns: number,
): readonly RowGroup<T>[] {
  const groups: RowGroup<T>[] = [];
  for (let start = 0; start < members.length; start += columns) {
    const slice = members.slice(start, start + columns);
    const first = slice[0];
    if (first !== undefined) groups.push({ key: first.id, members: slice });
  }
  return groups;
}

export function groupKeyOf<T extends { readonly id: string }>(
  groups: readonly RowGroup<T>[],
  memberId: string,
): string | null {
  return (
    groups.find((group) => group.members.some((member) => member.id === memberId))?.key ?? null
  );
}

export function sameGroup<T>(left: RowGroup<T>, right: RowGroup<T>): boolean {
  return (
    left.key === right.key &&
    left.members.length === right.members.length &&
    left.members.every((member, index) => member === right.members[index])
  );
}
