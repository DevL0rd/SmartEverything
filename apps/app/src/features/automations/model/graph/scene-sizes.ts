import type { Size } from '@smarteverything/flow/graph/metrics';

export function sceneSizes(
  base: ReadonlyMap<string, Size>,
  measured: ReadonlyMap<string, Size> | undefined,
): ReadonlyMap<string, Size> {
  if (measured === undefined || measured.size === 0) return base;
  return new Map([...base].map(([id, size]) => [id, measured.get(id) ?? size]));
}

export function mergeMeasured(
  known: ReadonlyMap<string, Size>,
  next: readonly (Size & { readonly id: string })[],
): ReadonlyMap<string, Size> {
  const changed = next.filter((entry) => {
    const held = known.get(entry.id);
    return held?.w !== entry.w || held.h !== entry.h;
  });
  if (changed.length === 0) return known;
  const merged = new Map(known);
  for (const { id, w, h } of changed) merged.set(id, { w, h });
  return merged;
}
