export const IMAGE_MAX = 360;

const ROW_ASPECT = 3;

const ROW_SIZES = [2, 3] as const;

const TIE = 1e-9;

interface Sized {
  readonly width: number | null;
  readonly height: number | null;
}

export interface GridCell {
  readonly index: number;
  readonly aspect: number;
  readonly shape: { readonly flex: number };
}

export interface GridRow {
  readonly cells: readonly GridCell[];
  readonly aspect: number;
  readonly shape: { readonly aspectRatio: number };
}

export interface ImageGrid {
  readonly rows: readonly GridRow[];
  readonly width: number;
  readonly shape: { readonly width: number };
}

interface Plan {
  readonly cost: number;
  readonly sizes: readonly number[];
}

export function aspectOf(image: Sized): number {
  return image.width === null || image.height === null ? 1 : image.width / image.height;
}

function sumOf(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function rowCost(aspects: readonly number[], start: number, size: number): number {
  return Math.log(ROW_ASPECT / sumOf(aspects.slice(start, start + size))) ** 2;
}

function earlierSmaller(left: readonly number[], right: readonly number[]): boolean {
  const index = left.findIndex((size, at) => size !== right[at]);
  return (left[index] ?? 0) < (right[index] ?? 0);
}

function better(candidate: Plan, best: Plan | null): boolean {
  if (best === null) return true;
  if (Math.abs(candidate.cost - best.cost) > TIE) return candidate.cost < best.cost;
  if (candidate.sizes.length !== best.sizes.length) {
    return candidate.sizes.length < best.sizes.length;
  }
  return earlierSmaller(candidate.sizes, best.sizes);
}

function bestEnding(
  aspects: readonly number[],
  plans: readonly (Plan | null)[],
  end: number,
): Plan | null {
  let best: Plan | null = null;
  for (const size of ROW_SIZES) {
    const before = plans[end - size] ?? null;
    if (before === null) continue;
    const candidate = {
      cost: before.cost + rowCost(aspects, end - size, size),
      sizes: [...before.sizes, size],
    };
    if (better(candidate, best)) best = candidate;
  }
  return best;
}

export function rowSizesOf(aspects: readonly number[]): readonly number[] {
  if (aspects.length < 2) return aspects.length === 0 ? [] : [1];
  const plans: (Plan | null)[] = [{ cost: 0, sizes: [] }, null];
  for (let end = 2; end <= aspects.length; end += 1) {
    plans.push(bestEnding(aspects, plans, end));
  }
  return plans[aspects.length]?.sizes ?? [];
}

export function gridOf(images: readonly Sized[]): ImageGrid {
  const aspects = images.map(aspectOf);
  let start = 0;
  const rows = rowSizesOf(aspects).map((size) => {
    const cells = aspects
      .slice(start, start + size)
      .map((aspect, offset) => ({ index: start + offset, aspect, shape: { flex: aspect } }));
    start += size;
    const aspect = sumOf(cells.map((cell) => cell.aspect));
    return { cells, aspect, shape: { aspectRatio: aspect } };
  });
  const gridAspect = 1 / sumOf(rows.map((row) => 1 / row.aspect));
  const scale = images.length === 1 ? gridAspect : Math.max(1, gridAspect);
  const width = Math.round(IMAGE_MAX * scale);
  return { rows, width, shape: { width } };
}
