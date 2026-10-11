export const GAP = 16;
export const SAME_PX = 0.5;

export function withHeight(
  heights: ReadonlyMap<number, number>,
  index: number,
  height: number,
  stretched: boolean,
): ReadonlyMap<number, number> {
  const known = heights.get(index);
  if (
    known !== undefined &&
    (Math.abs(known - height) < SAME_PX || (stretched && height > known))
  ) {
    return heights;
  }
  return new Map(heights).set(index, height);
}

export function fittingRows(
  heights: ReadonlyMap<number, number>,
  count: number,
  room: number,
): number {
  let used = 0;
  for (let index = 0; index < count; index += 1) {
    const height = heights.get(index);
    if (height === undefined) {
      return count;
    }
    used += height + (index === 0 ? 0 : GAP);
    if (used > room + 1 + index) {
      return Math.max(1, index);
    }
  }
  return count;
}
