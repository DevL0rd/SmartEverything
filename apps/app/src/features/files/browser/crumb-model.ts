import type { FileCrumb } from '../source/types';

export type CrumbPart<C extends FileCrumb = FileCrumb> =
  | { readonly kind: 'crumb'; readonly crumb: C; readonly current: boolean }
  | { readonly kind: 'more'; readonly hidden: readonly C[] };

export const CRUMB_CHAR_WIDTH = 8;

export const CRUMB_PADDING = 8;

export const CRUMB_SEPARATOR = 20;

export const MORE_WIDTH = 44;

export const CRUMB_LEADING = 24;

export function crumbWidthOf(crumb: FileCrumb): number {
  const leading = crumb.leading === undefined ? 0 : CRUMB_LEADING;
  return crumb.label.length * CRUMB_CHAR_WIDTH + CRUMB_PADDING + leading;
}

function widthOf<C extends FileCrumb>(crumbs: readonly C[], measure: (crumb: C) => number): number {
  return crumbs.reduce(
    (sum, crumb, index) => sum + measure(crumb) + (index === 0 ? 0 : CRUMB_SEPARATOR),
    0,
  );
}

function partsOf<C extends FileCrumb>(
  crumbs: readonly C[],
  hidden: readonly C[],
): readonly CrumbPart<C>[] {
  const last = crumbs.at(-1);
  const shown = (crumb: C): CrumbPart<C> => ({
    kind: 'crumb',
    crumb,
    current: crumb === last,
  });
  if (hidden.length === 0) return crumbs.map(shown);
  const [first, ...rest] = crumbs;
  if (first === undefined) return [];
  const kept = rest.filter((crumb) => !hidden.includes(crumb));
  return [shown(first), { kind: 'more', hidden }, ...kept.map(shown)];
}

export function collapsedCrumbsOf<C extends FileCrumb>(
  crumbs: readonly C[],
  width: number,
  measure: (crumb: C) => number = crumbWidthOf,
): readonly CrumbPart<C>[] {
  if (crumbs.length <= 2 || widthOf(crumbs, measure) <= width) return partsOf(crumbs, []);
  const [first, ...rest] = crumbs;
  const last = rest.at(-1);
  if (first === undefined || last === undefined) return partsOf(crumbs, []);
  const fixed = measure(first) + measure(last) + MORE_WIDTH + 2 * CRUMB_SEPARATOR;
  const middle = rest.slice(0, -1);
  let room = width - fixed;
  let keep = 0;
  for (const crumb of [...middle].reverse()) {
    const need = measure(crumb) + CRUMB_SEPARATOR;
    if (need > room) break;
    room -= need;
    keep += 1;
  }
  return partsOf(crumbs, middle.slice(0, middle.length - keep));
}
