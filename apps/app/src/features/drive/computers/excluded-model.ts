export type CheckState = boolean | 'mixed';

export function isUnder(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

export function normalisedExcluded(excluded: readonly string[]): readonly string[] {
  const unique = [...new Set(excluded)];
  return unique
    .filter((path) => !unique.some((other) => other !== path && isUnder(path, other)))
    .sort();
}

export function checkStateOf(path: string, excluded: readonly string[]): CheckState {
  if (excluded.some((folder) => isUnder(path, folder))) return false;
  return excluded.some((folder) => isUnder(folder, path)) ? 'mixed' : true;
}

export function insideExcluded(path: string, excluded: readonly string[]): boolean {
  return excluded.some((folder) => folder !== path && isUnder(path, folder));
}

export function toggledExcluded(
  excluded: readonly string[],
  path: string,
  keep: boolean,
): readonly string[] {
  const outside = excluded.filter((folder) => !isUnder(folder, path));
  return normalisedExcluded(keep ? outside : [...outside, path]);
}

export function wirePathOf(basePath: string | null, drivePath: string): string {
  return basePath === null ? drivePath : drivePath.slice(basePath.length + 1);
}

export function drivePathOfWire(basePath: string | null, wirePath: string): string {
  return basePath === null ? wirePath : `${basePath}/${wirePath}`;
}

export function sameExcluded(left: readonly string[], right: readonly string[]): boolean {
  const a = normalisedExcluded(left);
  const b = normalisedExcluded(right);
  return a.length === b.length && a.every((path, index) => path === b[index]);
}

export interface KeptSplit {
  readonly kept: number;
  readonly excluded: number;
}

export function keptSplitOf(
  total: number,
  excluded: readonly string[],
  sizes: ReadonlyMap<string, number>,
): KeptSplit | null {
  let away = 0;
  for (const path of excluded) {
    const size = sizes.get(path);
    if (size === undefined) return null;
    away += size;
  }
  return { kept: Math.max(0, total - away), excluded: away };
}
