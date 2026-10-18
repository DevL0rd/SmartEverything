interface Ordered {
  readonly order?: number;
}

interface Replacing {
  readonly replacesReadings?: boolean;
}

export function inOrder<Item extends Ordered>(items: readonly Item[]): readonly Item[] {
  return [...items].sort(
    (left, right) =>
      (left.order ?? Number.POSITIVE_INFINITY) - (right.order ?? Number.POSITIVE_INFINITY),
  );
}

export function arrangeSections<Item extends { readonly key: string }>(
  builtin: readonly Item[],
  plugin: readonly Item[],
): readonly Item[] {
  return [
    ...builtin.filter((section) => section.key === 'overview'),
    ...plugin,
    ...builtin.filter((section) => section.key !== 'overview'),
  ];
}

export function showsGenericReadings(overviews: readonly Replacing[]): boolean {
  return !overviews.some((overview) => overview.replacesReadings === true);
}
